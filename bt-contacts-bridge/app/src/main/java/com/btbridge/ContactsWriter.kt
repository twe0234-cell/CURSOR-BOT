package com.btbridge

import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.provider.ContactsContract
import android.util.Log

/**
 * Writes contacts to Android's ContactsContract under a dedicated account
 * ("טלפון כשר") so Google Assistant / Gemini can find and dial them.
 *
 * Strategy:
 *  1. Ensure the account exists in AccountManager.
 *  2. Delete all existing raw contacts for this account (full refresh).
 *  3. Batch-insert the new contacts.
 */
object ContactsWriter {

    const val ACCOUNT_TYPE = "com.btbridge.kosher"
    const val ACCOUNT_NAME = "טלפון כשר (BT)"

    private val TAG = "ContactsWriter"

    fun writeContacts(context: Context, contacts: List<VCardParser.Contact>): Int {
        if (contacts.isEmpty()) {
            Log.w(TAG, "No contacts to write")
            return 0
        }

        ensureAccount(context)
        val account = Account(ACCOUNT_NAME, ACCOUNT_TYPE)
        val resolver = context.contentResolver

        // Step 1: Delete all existing contacts for this account
        deleteAllForAccount(resolver, account)

        // Step 2: Batch insert
        val ops = ArrayList<ContentProviderOperation>()
        var written = 0

        for (contact in contacts) {
            if (contact.displayName.isBlank() || contact.phones.isEmpty()) continue

            val rawContactIdx = ops.size

            // Insert RawContact
            ops.add(
                ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, ACCOUNT_TYPE)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, ACCOUNT_NAME)
                    .build()
            )

            // Insert display name
            ops.add(
                ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactIdx)
                    .withValue(
                        ContactsContract.Data.MIMETYPE,
                        ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
                    )
                    .withValue(
                        ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME,
                        contact.displayName
                    )
                    .build()
            )

            // Insert phone numbers
            for (phone in contact.phones) {
                ops.add(
                    ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
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
                        .build()
                )
            }

            written++

            // Apply in batches of 100 to avoid TransactionTooLargeException
            if (ops.size >= 300) {
                applyBatch(resolver, ops)
                ops.clear()
            }
        }

        if (ops.isNotEmpty()) {
            applyBatch(resolver, ops)
        }

        Log.i(TAG, "Wrote $written contacts for account '$ACCOUNT_NAME'")
        return written
    }

    fun countContacts(context: Context): Int {
        val cursor = context.contentResolver.query(
            ContactsContract.RawContacts.CONTENT_URI,
            arrayOf(ContactsContract.RawContacts._ID),
            "${ContactsContract.RawContacts.ACCOUNT_TYPE} = ? AND ${ContactsContract.RawContacts.ACCOUNT_NAME} = ?",
            arrayOf(ACCOUNT_TYPE, ACCOUNT_NAME),
            null
        ) ?: return 0
        val count = cursor.count
        cursor.close()
        return count
    }

    private fun ensureAccount(context: Context) {
        val am = AccountManager.get(context)
        val account = Account(ACCOUNT_NAME, ACCOUNT_TYPE)
        val existing = am.getAccountsByType(ACCOUNT_TYPE)
        if (existing.none { it.name == ACCOUNT_NAME }) {
            am.addAccountExplicitly(account, null, null)
            Log.i(TAG, "Created account '$ACCOUNT_NAME'")
        }
    }

    private fun deleteAllForAccount(resolver: ContentResolver, account: Account) {
        val deleted = resolver.delete(
            ContactsContract.RawContacts.CONTENT_URI,
            "${ContactsContract.RawContacts.ACCOUNT_TYPE} = ? AND ${ContactsContract.RawContacts.ACCOUNT_NAME} = ?",
            arrayOf(account.type, account.name)
        )
        Log.i(TAG, "Deleted $deleted existing contacts for '${account.name}'")
    }

    private fun applyBatch(
        resolver: ContentResolver,
        ops: ArrayList<ContentProviderOperation>
    ) {
        try {
            resolver.applyBatch(ContactsContract.AUTHORITY, ops)
        } catch (e: Exception) {
            Log.e(TAG, "applyBatch error: ${e.message}")
        }
    }
}
