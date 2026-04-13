package com.btbridge

import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.provider.ContactsContract
import android.util.Log

/**
 * Writes vCard contacts to Android's ContactsContract under a dedicated
 * account so Google Assistant / Gemini can find and dial them.
 *
 * Critical: All URI operations include CALLER_IS_SYNCADAPTER=true so the
 * system allows a third-party app to write / delete contacts without requiring
 * a system-level permission.
 */
object ContactsWriter {

    const val ACCOUNT_TYPE = "com.btbridge.kosher"
    const val ACCOUNT_NAME = "טלפון כשר (BT)"

    private const val TAG = "ContactsWriter"

    // ─── URI helpers (CALLER_IS_SYNCADAPTER required) ─────────────────────────

    private fun rawContactsUri(account: Account) =
        ContactsContract.RawContacts.CONTENT_URI.buildUpon()
            .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(ContactsContract.RawContacts.ACCOUNT_NAME, account.name)
            .appendQueryParameter(ContactsContract.RawContacts.ACCOUNT_TYPE, account.type)
            .build()

    private val dataUri =
        ContactsContract.Data.CONTENT_URI.buildUpon()
            .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
            .build()

    private val deleteUri =
        ContactsContract.RawContacts.CONTENT_URI.buildUpon()
            .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
            .build()

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Full-refresh sync:
     *  1. Ensure account exists in AccountManager
     *  2. Delete all existing contacts for this account
     *  3. Batch-insert new contacts
     *
     * Returns number of contacts written.
     */
    fun writeContacts(context: Context, contacts: List<VCardParser.Contact>): Int {
        val account = Account(ACCOUNT_NAME, ACCOUNT_TYPE)
        ensureAccount(context, account)

        val resolver = context.contentResolver
        deleteAll(resolver)

        if (contacts.isEmpty()) {
            Log.w(TAG, "No contacts to write")
            return 0
        }

        var written = 0
        val ops = ArrayList<ContentProviderOperation>()

        for (contact in contacts) {
            val name = contact.displayName.trim()
            // Filter contacts with no name or no valid phone numbers after cleaning
            val phones = contact.phones.map { cleanPhone(it) }.filter { it.isNotBlank() }
            if (name.isBlank() || phones.isEmpty()) continue

            val rawContactIdx = ops.size

            // 1. RawContact row
            ops.add(
                ContentProviderOperation.newInsert(rawContactsUri(account))
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, ACCOUNT_TYPE)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, ACCOUNT_NAME)
                    .withValue(ContactsContract.RawContacts.DIRTY, 0)
                    .build()
            )

            // 2. StructuredName
            ops.add(
                ContentProviderOperation.newInsert(dataUri)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactIdx)
                    .withValue(
                        ContactsContract.Data.MIMETYPE,
                        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
                    )
                    .withValue(
                        ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME,
                        name
                    )
                    .build()
            )

            // 3. Phone numbers
            phones.forEachIndexed { idx, phone ->
                ops.add(
                    ContentProviderOperation.newInsert(dataUri)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactIdx)
                        .withValue(
                            ContactsContract.Data.MIMETYPE,
                            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE
                        )
                        .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phone)
                        .withValue(
                            ContactsContract.CommonDataKinds.Phone.TYPE,
                            ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                        )
                        .withValue(
                            ContactsContract.Data.IS_PRIMARY,
                            if (idx == 0) 1 else 0
                        )
                        .build()
                )
            }

            written++

            // Apply in batches of 100 contacts (300 ops max) to avoid TransactionTooLargeException
            if (ops.size >= 300) {
                applyBatch(resolver, ops)
                ops.clear()
            }
        }

        if (ops.isNotEmpty()) applyBatch(resolver, ops)

        Log.i(TAG, "Wrote $written contacts to '$ACCOUNT_NAME'")
        return written
    }

    /** Returns number of contacts currently synced under our account. */
    fun countContacts(context: Context): Int =
        context.contentResolver.query(
            ContactsContract.RawContacts.CONTENT_URI,
            arrayOf(ContactsContract.RawContacts._ID),
            "${ContactsContract.RawContacts.ACCOUNT_TYPE} = ? AND " +
                    "${ContactsContract.RawContacts.ACCOUNT_NAME} = ?",
            arrayOf(ACCOUNT_TYPE, ACCOUNT_NAME),
            null
        )?.use { it.count } ?: 0

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun ensureAccount(context: Context, account: Account) {
        val am = AccountManager.get(context)
        if (am.getAccountsByType(ACCOUNT_TYPE).none { it.name == account.name }) {
            am.addAccountExplicitly(account, null, null)
            Log.i(TAG, "Created account '$ACCOUNT_NAME'")
        }
    }

    private fun deleteAll(resolver: ContentResolver) {
        val deleted = resolver.delete(
            deleteUri,
            "${ContactsContract.RawContacts.ACCOUNT_TYPE} = ? AND " +
                    "${ContactsContract.RawContacts.ACCOUNT_NAME} = ?",
            arrayOf(ACCOUNT_TYPE, ACCOUNT_NAME)
        )
        Log.i(TAG, "Deleted $deleted stale contacts")
    }

    private fun applyBatch(resolver: ContentResolver, ops: ArrayList<ContentProviderOperation>) {
        try {
            resolver.applyBatch(ContactsContract.AUTHORITY, ops)
        } catch (e: Exception) {
            Log.e(TAG, "applyBatch failed: ${e.message}")
        }
    }

    /** Strip non-digit chars, preserve leading '+'. */
    private fun cleanPhone(raw: String): String {
        val s = raw.trim()
        val plus = if (s.startsWith("+")) "+" else ""
        val digits = s.filter { it.isDigit() }
        return if (digits.isEmpty()) "" else "$plus$digits"
    }
}
