package com.btbridge

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log

/**
 * Detects incoming / answered / ended calls from the kosher phone via BT HFP.
 *
 * Android fires ACTION_PHONE_STATE_CHANGED when a call arrives through the
 * Bluetooth Hands-Free Profile (HFP) connection — even for a "dumb" kosher phone.
 *
 * Permissions required: READ_PHONE_STATE + READ_CALL_LOG
 */
@SuppressLint("MissingPermission")
class PhoneCallReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "PhoneCallReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val state  = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: ""

        Log.d(TAG, "Phone state: $state  number: $number")

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                // Incoming call — look up contact name from our synced contacts
                val name = lookupName(context, number)
                Log.i(TAG, "Incoming call from: $name ($number)")
                CallerService.showCaller(context, name, number)
            }

            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // Call answered — keep overlay but change state
                CallerService.callAnswered(context)
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                // Call ended
                CallerService.hideCaller(context)
            }
        }
    }

    /**
     * Look up display name in ContactsContract.
     * Our app synced the kosher phone's contacts there, so this works.
     */
    private fun lookupName(context: Context, number: String): String {
        if (number.isBlank()) return "מספר לא ידוע"

        return try {
            val uri = android.net.Uri.withAppendedPath(
                android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                android.net.Uri.encode(number)
            )
            context.contentResolver.query(
                uri,
                arrayOf(android.provider.ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst())
                    cursor.getString(0)
                else
                    null
            } ?: number
        } catch (e: Exception) {
            Log.w(TAG, "Contact lookup failed: ${e.message}")
            number
        }
    }
}
