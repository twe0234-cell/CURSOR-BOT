package com.btbridge

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Foreground service that drives the full BT → ContactsContract sync:
 *  1. Receives a BluetoothDevice (from BtReceiver or MainActivity)
 *  2. Fetches vCards via OBEX PBAP
 *  3. Writes to ContactsContract
 *  4. Sends a package-local broadcast with the result
 */
@SuppressLint("MissingPermission")
class ContactSyncService : Service() {

    companion object {
        const val EXTRA_DEVICE   = "device"
        /** Package-local action — only our app can receive it */
        const val ACTION_SYNC_DONE = "com.btbridge.SYNC_DONE"
        const val EXTRA_COUNT    = "count"
        const val EXTRA_ERROR    = "error"
        const val EXTRA_DEVICE_ADDRESS = "device_address"

        private const val CHANNEL_ID = "btbridge_sync"
        private const val NOTIF_ID   = 1
        private const val TAG        = "ContactSyncService"

        fun startSync(context: Context, device: BluetoothDevice) {
            val intent = Intent(context, ContactSyncService::class.java)
                .putExtra(EXTRA_DEVICE, device)
            context.startForegroundService(intent)
        }
    }

    private val job   = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Fix deprecated getParcelableExtra — use typed overload on API 33+
        val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra(EXTRA_DEVICE)
        }

        if (device == null) {
            Log.w(TAG, "No device in intent")
            stopSelf(startId)
            return START_NOT_STICKY
        }

        val deviceName = device.name ?: device.address
        startForeground(NOTIF_ID, buildNotification("מסנכרן מ-$deviceName…"))

        scope.launch {
            runSync(device, startId)
        }
        return START_NOT_STICKY
    }

    private fun runSync(device: BluetoothDevice, startId: Int) {
        val deviceName = device.name ?: device.address
        Log.i(TAG, "Sync start: $deviceName (${device.address})")

        val contacts = OBEXPbapClient(device) { msg ->
            // Relay progress to notification
            updateNotification(msg)
        }.fetchContacts()

        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)

        if (contacts.isEmpty()) {
            val err = "לא נמצאו אנשי קשר מ-$deviceName. ודא שהטלפון מחובר ואישר גישה."
            broadcast(0, err, device.address)
            prefs.edit()
                .putString("last_error_${device.address}", err)
                .apply()
        } else {
            val written = ContactsWriter.writeContacts(this, contacts)
            Log.i(TAG, "Sync done: $written contacts from $deviceName")

            prefs.edit()
                .putInt("count_${device.address}", written)
                .putLong("sync_time_${device.address}", System.currentTimeMillis())
                .putString("sync_device_name", deviceName)
                .putInt("last_count", written)
                .putLong("last_sync", System.currentTimeMillis())
                .remove("last_error_${device.address}")
                .apply()

            broadcast(written, null, device.address)
            updateNotification("סונכרנו $written אנשי קשר מ-$deviceName")
        }

        stopSelf(startId)
    }

    // ─── Broadcast (package-restricted) ──────────────────────────────────────

    private fun broadcast(count: Int, error: String?, deviceAddress: String) {
        sendBroadcast(
            Intent(ACTION_SYNC_DONE)
                .setPackage(packageName)          // Only our app receives this
                .putExtra(EXTRA_COUNT, count)
                .putExtra(EXTRA_ERROR, error)
                .putExtra(EXTRA_DEVICE_ADDRESS, deviceAddress)
        )
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(text: String) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("גשר אנשי קשר BT")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(text))
    }

    private fun createChannel() {
        NotificationChannel(
            CHANNEL_ID,
            "סנכרון אנשי קשר",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "הודעת רקע בזמן סנכרון"
            setShowBadge(false)
        }.also {
            getSystemService(NotificationManager::class.java).createNotificationChannel(it)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        job.cancel()
        super.onDestroy()
    }
}
