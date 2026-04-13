package com.btbridge

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.btbridge.databinding.ActivityMainBinding
import com.btbridge.databinding.ItemDeviceBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@SuppressLint("MissingPermission")
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    // ─── File picker for manual VCF import ────────────────────────────────────
    private val pickVcf = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { importVcfFromUri(it) }
    }

    // ─── Sync result receiver (package-restricted) ────────────────────────────
    private val syncReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val count   = intent.getIntExtra(ContactSyncService.EXTRA_COUNT, 0)
            val error   = intent.getStringExtra(ContactSyncService.EXTRA_ERROR)
            val address = intent.getStringExtra(ContactSyncService.EXTRA_DEVICE_ADDRESS) ?: ""
            onSyncResult(count, error, address)
        }
    }

    // ─── Permissions ──────────────────────────────────────────────────────────
    private val neededPermissions = buildList {
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
        add(Manifest.permission.READ_PHONE_STATE)
        add(Manifest.permission.READ_CALL_LOG)
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.switchAutoSync.isChecked =
            getSharedPreferences("prefs", Context.MODE_PRIVATE).getBoolean(BtReceiver.PREF_AUTO_SYNC, true)

        binding.switchAutoSync.setOnCheckedChangeListener { _, checked ->
            getSharedPreferences("prefs", Context.MODE_PRIVATE)
                .edit().putBoolean(BtReceiver.PREF_AUTO_SYNC, checked).apply()
            toast(if (checked) "סנכרון אוטומטי מופעל" else "סנכרון אוטומטי כבוי")
        }

        binding.btnImportVcf.setOnClickListener {
            pickVcf.launch("*/*")   // wide filter — some devices don't register text/x-vcard
        }

        setupCallerDisplaySettings()
        requestMissingPermissions()
    }

    // ─── Caller display settings ──────────────────────────────────────────────

    private fun setupCallerDisplaySettings() {
        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)

        // Overlay toggle
        binding.switchCallerOverlay.isChecked =
            prefs.getBoolean(CallerService.PREF_SHOW_OVERLAY, true)
        binding.switchCallerOverlay.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean(CallerService.PREF_SHOW_OVERLAY, checked).apply()
        }

        // Grant overlay permission button — opens system settings
        binding.btnGrantOverlay.setOnClickListener {
            if (Settings.canDrawOverlays(this)) {
                toast("הרשאת חלון כבר ניתנה ✓")
            } else {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            }
        }

        // UDP toggle — show/hide IP+port fields
        val udpEnabled = prefs.getBoolean(CallerService.PREF_SEND_UDP, false)
        binding.switchSendUdp.isChecked = udpEnabled
        setUdpFieldsVisible(udpEnabled)

        binding.switchSendUdp.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean(CallerService.PREF_SEND_UDP, checked).apply()
            setUdpFieldsVisible(checked)
        }

        // Pre-fill saved UDP values
        binding.etUdpHost.setText(prefs.getString(CallerService.PREF_UDP_HOST, ""))
        val savedPort = prefs.getInt(CallerService.PREF_UDP_PORT, CallerService.DEFAULT_UDP_PORT)
        binding.etUdpPort.setText(savedPort.toString())

        // Save on focus-lost
        binding.etUdpHost.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                prefs.edit()
                    .putString(CallerService.PREF_UDP_HOST, binding.etUdpHost.text.toString().trim())
                    .apply()
            }
        }
        binding.etUdpPort.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                val port = binding.etUdpPort.text.toString().toIntOrNull()
                    ?: CallerService.DEFAULT_UDP_PORT
                prefs.edit().putInt(CallerService.PREF_UDP_PORT, port).apply()
            }
        }
    }

    private fun setUdpFieldsVisible(visible: Boolean) {
        val v = if (visible) View.VISIBLE else View.GONE
        binding.tilUdpHost.visibility = v
        binding.tilUdpPort.visibility = v
    }

    override fun onResume() {
        super.onResume()

        // Register receiver — package-restricted, no export
        val filter = IntentFilter(ContactSyncService.ACTION_SYNC_DONE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(syncReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(syncReceiver, filter)
        }

        refreshAll()
    }

    override fun onPause() {
        super.onPause()
        unregisterReceiver(syncReceiver)
    }

    // ─── UI refresh ───────────────────────────────────────────────────────────

    private fun refreshAll() {
        refreshStatsCard()
        refreshDeviceList()
    }

    private fun refreshStatsCard() {
        val count = ContactsWriter.countContacts(this)
        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)
        val lastSync = prefs.getLong("last_sync", 0L)
        val deviceName = prefs.getString("sync_device_name", "") ?: ""

        binding.tvTotalContacts.text = "אנשי קשר מסונכרנים: $count"
        binding.tvLastSync.text = if (lastSync > 0L) {
            val fmt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
            "סנכרון אחרון: ${fmt.format(Date(lastSync))}  •  $deviceName"
        } else {
            "טרם בוצע סנכרון"
        }
    }

    // ─── Device list ─────────────────────────────────────────────────────────

    private fun refreshDeviceList() {
        binding.llDeviceContainer.removeAllViews()

        if (!hasAllPermissions()) {
            addInfoRow("יש לאשר הרשאות BT ואנשי קשר")
            return
        }

        val devices = getBondedDevices()
        if (devices.isEmpty()) {
            addInfoRow("לא נמצאו מכשירים מזווגים. זווג את הטלפון הכשר ב-Bluetooth.")
            return
        }

        devices.forEach { device -> addDeviceCard(device) }
    }

    /** Inflate item_device.xml, wire up the Sync button, add to container. */
    private fun addDeviceCard(device: BluetoothDevice) {
        val cardBinding = ItemDeviceBinding.inflate(
            LayoutInflater.from(this),
            binding.llDeviceContainer,
            true
        )

        val prefs     = getSharedPreferences("prefs", Context.MODE_PRIVATE)
        val lastCount = prefs.getInt("count_${device.address}", -1)
        val lastTime  = prefs.getLong("sync_time_${device.address}", 0L)
        val lastError = prefs.getString("last_error_${device.address}", null)

        cardBinding.tvDeviceName.text = device.name ?: "מכשיר לא ידוע"
        cardBinding.tvDeviceMac.text  = device.address

        cardBinding.tvDeviceLastSync.text = when {
            lastError != null -> "שגיאה אחרונה: $lastError"
            lastTime > 0L -> {
                val fmt = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault())
                "סונכרן: ${fmt.format(Date(lastTime))}  •  $lastCount אנשי קשר"
            }
            else -> "טרם סונכרן"
        }

        cardBinding.btnSyncDevice.setOnClickListener {
            cardBinding.progressDevice.visibility = View.VISIBLE
            cardBinding.btnSyncDevice.isEnabled   = false
            cardBinding.tvDeviceLastSync.text     = "מסנכרן…"
            ContactSyncService.startSync(this, device)
        }
    }

    private fun addInfoRow(msg: String) {
        val tv = android.widget.TextView(this).apply {
            text = msg
            setPadding(8, 24, 8, 24)
            textSize = 14f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_secondary))
        }
        binding.llDeviceContainer.addView(tv)
    }

    // ─── Sync result callback ─────────────────────────────────────────────────

    private fun onSyncResult(count: Int, error: String?, deviceAddress: String) {
        // Reset all device cards (we don't track which card maps to which address easily
        // since we inflate dynamically — safest is to re-render the full list)
        refreshAll()

        if (error != null) {
            toast(error)
        } else {
            toast("סונכרנו $count אנשי קשר בהצלחה")
        }
    }

    // ─── VCF file import ─────────────────────────────────────────────────────

    private fun importVcfFromUri(uri: Uri) {
        binding.progressImport.visibility = View.VISIBLE
        binding.btnImportVcf.isEnabled = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val content = contentResolver.openInputStream(uri)
                    ?.bufferedReader(Charsets.UTF_8)
                    ?.readText()
                    ?: throw IllegalStateException("לא ניתן לקרוא קובץ")

                val contacts = VCardParser.parse(content)
                val written  = ContactsWriter.writeContacts(this@MainActivity, contacts)

                withContext(Dispatchers.Main) {
                    binding.progressImport.visibility = View.GONE
                    binding.btnImportVcf.isEnabled = true
                    toast("יובאו $written אנשי קשר מקובץ VCF")
                    refreshAll()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressImport.visibility = View.GONE
                    binding.btnImportVcf.isEnabled = true
                    toast("שגיאה בייבוא: ${e.message}")
                }
            }
        }
    }

    // ─── Bluetooth helpers ────────────────────────────────────────────────────

    private fun getBondedDevices(): List<BluetoothDevice> {
        if (!hasAllPermissions()) return emptyList()
        val bm = getSystemService(BluetoothManager::class.java) ?: return emptyList()
        return bm.adapter?.bondedDevices?.toList() ?: emptyList()
    }

    // ─── Permissions ─────────────────────────────────────────────────────────

    private fun hasAllPermissions() = neededPermissions.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestMissingPermissions() {
        val missing = neededPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_PERM)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERM) {
            val denied = permissions.zip(grantResults.toList())
                .filter { it.second != PackageManager.PERMISSION_GRANTED }
            if (denied.isEmpty()) refreshAll()
            else toast("חסרות הרשאות — הגדרות → הרשאות → גשר אנשי קשר")
        }
    }

    // ─── Misc ─────────────────────────────────────────────────────────────────

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    companion object {
        private const val REQ_PERM = 100
    }
}
