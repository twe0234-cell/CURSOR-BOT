package com.btbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Foreground service that:
 *  1. Receives a BluetoothDevice from BtReceiver (or MainActivity)
 *  2. Connects via OBEX PBAP and fetches the phonebook
 *  3. Writes contacts to ContactsContract
 *  4. Broadcasts result to MainActivity
 */
class ContactSyncService : Service() {

    companion object {
        const val EXTRA_DEVICE = "device"
        const val ACTION_SYNC_DONE = "com.btbridge.SYNC_DONE"
        const val EXTRA_COUNT     = "count"
        const val EXTRA_ERROR     = "error"
        const val CHANNEL_ID      = "btbridge_sync"

        private const val TAG = "ContactSyncService"
        private const val NOTIF_ID = 1

        fun startSync(context: Context, device: BluetoothDevice) {
            val intent = Intent(context, ContactSyncService::class.java)
                .putExtra(EXTRA_DEVICE, device)
            context.startForegroundService(intent)
        }
    }

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val device = intent?.getParcelableExtra<BluetoothDevice>(EXTRA_DEVICE)
        if (device == null) {
            Log.w(TAG, "No device in intent, stopping")
            stopSelf(startId)
            return START_NOT_STICKY
        }

        startForeground(NOTIF_ID, buildNotification("מסנכרן אנשי קשר מ-${device.name ?: "Bluetooth"}…"))

        scope.launch {
            try {
                doSync(device)
            } finally {
                stopSelf(startId)
            }
        }

        return START_NOT_STICKY
    }

    private fun doSync(device: BluetoothDevice) {
        Log.i(TAG, "Starting PBAP sync from ${device.name} (${device.address})")

        val contacts = OBEXPbapClient(device).fetchContacts()

        if (contacts.isEmpty()) {
            Log.w(TAG, "No contacts returned from PBAP — trying BT contacts from ContactsContract")
            broadcastResult(0, "לא נמצאו אנשי קשר. ודא שהטלפון מחובר ואישר גישה לאנשי קשר.")
            return
        }

        val written = ContactsWriter.writeContacts(this, contacts)
        Log.i(TAG, "Sync complete: $written contacts written")

        // Persist last sync info
        getSharedPreferences("prefs", Context.MODE_PRIVATE).edit()
            .putInt("last_count", written)
            .putLong("last_sync", System.currentTimeMillis())
            .putString("last_device", device.name ?: device.address)
            .apply()

        broadcastResult(written, null)
        updateNotification("סונכרנו $written אנשי קשר")
    }

    private fun broadcastResult(count: Int, error: String?) {
        val intent = Intent(ACTION_SYNC_DONE)
            .putExtra(EXTRA_COUNT, count)
            .putExtra(EXTRA_ERROR, error)
        sendBroadcast(intent)
    }

    private fun buildNotification(text: String) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("גשר אנשי קשר BT")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()

    private fun updateNotification(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "סנכרון אנשי קשר",
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "מסנכרן אנשי קשר מהטלפון הכשר" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        job.cancel()
        super.onDestroy()
    }
}
