package com.btbridge

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Manifest-declared BroadcastReceiver.
 *
 * Handles:
 *  - BluetoothDevice.ACTION_ACL_CONNECTED → start ContactSyncService (if auto-sync on)
 *  - Intent.ACTION_BOOT_COMPLETED         → no-op; re-arms the receiver after reboot
 */
@SuppressLint("MissingPermission")
class BtReceiver : BroadcastReceiver() {

    companion object {
        const val PREF_AUTO_SYNC = "auto_sync"
        private const val TAG = "BtReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> onDeviceConnected(context, intent)
            Intent.ACTION_BOOT_COMPLETED         -> Log.d(TAG, "Boot complete — receiver armed")
        }
    }

    private fun onDeviceConnected(context: Context, intent: Intent) {
        // API-safe getParcelableExtra
        val device: BluetoothDevice = (
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
        ) ?: return

        val autoSync = context
            .getSharedPreferences("prefs", Context.MODE_PRIVATE)
            .getBoolean(PREF_AUTO_SYNC, true)

        if (!autoSync) {
            Log.i(TAG, "Auto-sync disabled, skipping ${device.address}")
            return
        }

        val deviceName = runCatching { device.name }.getOrNull() ?: device.address
        Log.i(TAG, "BT connected: $deviceName — triggering sync")
        ContactSyncService.startSync(context, device)
    }
}
