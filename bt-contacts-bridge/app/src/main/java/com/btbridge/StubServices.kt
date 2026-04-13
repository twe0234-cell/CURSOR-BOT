package com.btbridge

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.app.Service
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderClient
import android.content.Context
import android.content.Intent
import android.content.SyncResult
import android.os.Bundle
import android.os.IBinder

/**
 * Stub AccountAuthenticator + SyncAdapter — required by Android to write
 * contacts to ContactsContract under a custom account type.
 * These do nothing; actual syncing is done by ContactSyncService via OBEX.
 */

// ─── Authenticator ────────────────────────────────────────────────────────────

class AccountAuthenticator(context: Context) : AbstractAccountAuthenticator(context) {
    override fun editProperties(r: AccountAuthenticatorResponse, t: String) = null
    override fun addAccount(r: AccountAuthenticatorResponse, t: String, a: String, f: Array<String>?, o: Bundle?) = null
    override fun confirmCredentials(r: AccountAuthenticatorResponse, a: Account, o: Bundle?) = null
    override fun getAuthToken(r: AccountAuthenticatorResponse, a: Account, t: String, o: Bundle?) = null
    override fun getAuthTokenLabel(t: String) = null
    override fun updateCredentials(r: AccountAuthenticatorResponse, a: Account, t: String, o: Bundle?) = null
    override fun hasFeatures(r: AccountAuthenticatorResponse, a: Account, f: Array<String>) = null
}

class AuthenticatorService : Service() {
    private lateinit var authenticator: AccountAuthenticator
    override fun onCreate() { authenticator = AccountAuthenticator(this) }
    override fun onBind(intent: Intent): IBinder = authenticator.iBinder
}

// ─── Sync Adapter ─────────────────────────────────────────────────────────────

class SyncAdapter(context: Context) : AbstractThreadedSyncAdapter(context, true) {
    override fun onPerformSync(
        account: Account, extras: Bundle, authority: String,
        provider: ContentProviderClient, syncResult: SyncResult
    ) {
        // Intentionally empty — syncing is manual via OBEX
    }
}

class SyncAdapterService : Service() {
    private lateinit var syncAdapter: SyncAdapter
    override fun onCreate() { syncAdapter = SyncAdapter(this) }
    override fun onBind(intent: Intent): IBinder = syncAdapter.syncAdapterBinder
}
