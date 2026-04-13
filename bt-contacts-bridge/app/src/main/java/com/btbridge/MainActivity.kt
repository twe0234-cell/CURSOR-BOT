package com.btbridge

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.btbridge.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val TAG = "MainActivity"

    private val requiredPermissions = buildList {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(Manifest.permission.BLUETOOTH_SCAN)
        } else {
            add(Manifest.permission.BLUETOOTH)
            add(Manifest.permission.BLUETOOTH_ADMIN)
        }
        add(Manifest.permission.READ_CONTACTS)
        add(Manifest.permission.WRITE_CONTACTS)
        add(Manifest.permission.GET_ACCOUNTS)
    }

    // Receive sync results from ContactSyncService
    private val syncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val count = intent.getIntExtra(ContactSyncService.EXTRA_COUNT, 0)
            val error = intent.getStringExtra(ContactSyncService.EXTRA_ERROR)
            runOnUiThread {
                binding.progressBar.visibility = View.GONE
                binding.btnSync.isEnabled = true
                if (error != null) {
                    showStatus(error, isError = true)
                } else {
                    showStatus("סונכרנו $count אנשי קשר בהצלחה", isError = false)
                    refreshContactCount()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnSync.setOnClickListener { onSyncClicked() }
        binding.switchAutoSync.setOnCheckedChangeListener { _, checked ->
            getSharedPreferences("prefs", Context.MODE_PRIVATE)
                .edit().putBoolean(BtReceiver.PREF_AUTO_SYNC, checked).apply()
            Toast.makeText(
                this,
                if (checked) "סנכרון אוטומטי מופעל" else "סנכרון אוטומטי כבוי",
                Toast.LENGTH_SHORT
            ).show()
        }

        checkPermissions()
        loadPrefs()
        refreshContactCount()
        refreshBtStatus()
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(
            syncReceiver,
            IntentFilter(ContactSyncService.ACTION_SYNC_DONE),
            RECEIVER_NOT_EXPORTED
        )
        refreshBtStatus()
        refreshContactCount()
    }

    override fun onPause() {
        super.onPause()
        unregisterReceiver(syncReceiver)
    }

    // ─── Sync button ──────────────────────────────────────────────────────────

    private fun onSyncClicked() {
        if (!hasAllPermissions()) {
            checkPermissions()
            return
        }

        val device = getConnectedDevice()
        if (device == null) {
            showStatus("לא נמצא מכשיר Bluetooth מחובר. חבר את הטלפון הכשר.", isError = true)
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnSync.isEnabled = false
        showStatus("מסנכרן מ-${device.name ?: device.address}…", isError = false)
        ContactSyncService.startSync(this, device)
    }

    // ─── UI helpers ──────────────────────────────────────────────────────────

    private fun refreshBtStatus() {
        val device = getConnectedDevice()
        binding.tvBtStatus.text = if (device != null) {
            "Bluetooth: מחובר — ${device.name ?: device.address}"
        } else {
            "Bluetooth: לא מחובר"
        }
    }

    private fun refreshContactCount() {
        val count = ContactsWriter.countContacts(this)
        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)
        val lastSync = prefs.getLong("last_sync", 0L)
        val lastDevice = prefs.getString("last_device", "") ?: ""

        binding.tvContactCount.text = "אנשי קשר מסונכרנים: $count"
        binding.tvLastSync.text = if (lastSync > 0L) {
            val fmt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
            "סנכרון אחרון: ${fmt.format(Date(lastSync))} מ-$lastDevice"
        } else {
            "טרם בוצע סנכרון"
        }
    }

    private fun showStatus(msg: String, isError: Boolean) {
        binding.tvStatus.text = msg
        binding.tvStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (isError) android.R.color.holo_red_light else android.R.color.holo_green_dark
            )
        )
        binding.tvStatus.visibility = View.VISIBLE
    }

    private fun loadPrefs() {
        val autoSync = getSharedPreferences("prefs", Context.MODE_PRIVATE)
            .getBoolean(BtReceiver.PREF_AUTO_SYNC, true)
        binding.switchAutoSync.isChecked = autoSync
    }

    // ─── Bluetooth ───────────────────────────────────────────────────────────

    private fun getConnectedDevice(): BluetoothDevice? {
        if (!hasAllPermissions()) return null
        val bm = getSystemService(BluetoothManager::class.java) ?: return null
        val adapter = bm.adapter ?: return null
        return try {
            adapter.bondedDevices?.firstOrNull { device ->
                // Pick first bonded device that looks like a phone (class: 0x200)
                // Or simply return first bonded device if only one is connected
                val deviceClass = device.bluetoothClass?.deviceClass ?: 0
                deviceClass == 0x0200 || deviceClass == 0x020C
            } ?: adapter.bondedDevices?.firstOrNull()
        } catch (e: SecurityException) {
            Log.e(TAG, "BT permission denied: ${e.message}")
            null
        }
    }

    // ─── Permissions ─────────────────────────────────────────────────────────

    private fun hasAllPermissions() = requiredPermissions.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun checkPermissions() {
        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 100)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100) {
            val denied = permissions.zip(grantResults.toList())
                .filter { it.second != PackageManager.PERMISSION_GRANTED }
                .map { it.first }
            if (denied.isNotEmpty()) {
                showStatus("חסרות הרשאות: ${denied.joinToString()}", isError = true)
            } else {
                showStatus("כל ההרשאות אושרו", isError = false)
                refreshBtStatus()
                refreshContactCount()
            }
        }
    }
}
