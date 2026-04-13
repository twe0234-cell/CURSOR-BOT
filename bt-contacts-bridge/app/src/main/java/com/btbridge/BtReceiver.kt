package com.btbridge

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Listens for:
 *  - BluetoothDevice.ACTION_ACL_CONNECTED  → triggers sync when any BT device connects
 *  - Intent.ACTION_BOOT_COMPLETED          → re-register after reboot (manifest handles this)
 *
 * On connection: immediately starts ContactSyncService.
 * Auto-sync can be disabled via SharedPreferences.
 */
class BtReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BtReceiver"
        const val PREF_AUTO_SYNC = "auto_sync"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> {
                val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
                    ?: return

                val autoSync = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)
                    .getBoolean(PREF_AUTO_SYNC, true)

                if (!autoSync) {
                    Log.i(TAG, "Auto-sync disabled, skipping ${device.name}")
                    return
                }

                Log.i(TAG, "BT device connected: ${device.name} — starting sync")
                ContactSyncService.startSync(context, device)
            }

            Intent.ACTION_BOOT_COMPLETED -> {
                Log.i(TAG, "Boot completed — receiver ready")
                // Nothing to do; service starts on next BT connection
            }
        }
    }
}
