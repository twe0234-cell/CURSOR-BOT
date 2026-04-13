package com.btbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * Foreground service that:
 *  1. Shows a system-overlay banner with caller name (on Topway screen)
 *  2. Sends caller info to "יחידה 17" via UDP (configurable IP:port)
 *
 * UDP message format (JSON):
 *   { "type":"call", "name":"דוד כהן", "number":"050-1234567", "state":"ringing" }
 *
 * For unit 17: configure its IP and port in the app Settings screen.
 * When its exact protocol is known, replace the udpSend() call with that protocol.
 */
class CallerService : Service() {

    companion object {
        const val EXTRA_NAME    = "caller_name"
        const val EXTRA_NUMBER  = "caller_number"
        const val EXTRA_STATE   = "call_state"

        const val STATE_RINGING  = "ringing"
        const val STATE_ANSWERED = "answered"
        const val STATE_IDLE     = "idle"

        private const val CHANNEL_ID  = "caller_display"
        private const val NOTIF_ID    = 42
        private const val TAG         = "CallerService"

        // Prefs keys (shared with MainActivity)
        const val PREF_SHOW_OVERLAY  = "caller_overlay"
        const val PREF_SEND_UDP      = "caller_udp"
        const val PREF_UDP_HOST      = "udp_host"
        const val PREF_UDP_PORT      = "udp_port"
        const val DEFAULT_UDP_PORT   = 49152   // common aftermarket cluster port

        fun showCaller(context: Context, name: String, number: String) =
            context.startForegroundService(
                Intent(context, CallerService::class.java)
                    .putExtra(EXTRA_NAME, name)
                    .putExtra(EXTRA_NUMBER, number)
                    .putExtra(EXTRA_STATE, STATE_RINGING)
            )

        fun callAnswered(context: Context) =
            context.startForegroundService(
                Intent(context, CallerService::class.java)
                    .putExtra(EXTRA_STATE, STATE_ANSWERED)
            )

        fun hideCaller(context: Context) =
            context.startForegroundService(
                Intent(context, CallerService::class.java)
                    .putExtra(EXTRA_STATE, STATE_IDLE)
            )
    }

    private val job   = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    private var overlayView: View? = null
    private var wm: WindowManager? = null

    private var currentName   = ""
    private var currentNumber = ""

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WindowManager::class.java)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val state  = intent?.getStringExtra(EXTRA_STATE) ?: STATE_IDLE
        val name   = intent?.getStringExtra(EXTRA_NAME)   ?: currentName
        val number = intent?.getStringExtra(EXTRA_NUMBER) ?: currentNumber

        if (name.isNotBlank())   currentName   = name
        if (number.isNotBlank()) currentNumber = number

        startForeground(NOTIF_ID, buildNotification(state))

        when (state) {
            STATE_RINGING  -> onRinging(name, number)
            STATE_ANSWERED -> onAnswered()
            STATE_IDLE     -> onIdle(startId)
        }
        return START_NOT_STICKY
    }

    // ─── Call state handlers ──────────────────────────────────────────────────

    private fun onRinging(name: String, number: String) {
        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)

        // 1. System overlay banner
        if (prefs.getBoolean(PREF_SHOW_OVERLAY, true)) {
            showOverlay(name, number)
        }

        // 2. UDP broadcast to unit 17
        if (prefs.getBoolean(PREF_SEND_UDP, false)) {
            val host = prefs.getString(PREF_UDP_HOST, "") ?: ""
            val port = prefs.getInt(PREF_UDP_PORT, DEFAULT_UDP_PORT)
            if (host.isNotBlank()) {
                scope.launch { udpSend(host, port, name, number, STATE_RINGING) }
            }
        }

        // Update notification
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(STATE_RINGING))
    }

    private fun onAnswered() {
        overlayView?.let { view ->
            view.findViewById<TextView>(R.id.tvCallerStatus)?.text = "בשיחה…"
            view.setBackgroundColor(Color.parseColor("#1A237E")) // deep blue = in call
        }
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(STATE_ANSWERED))
    }

    private fun onIdle(startId: Int) {
        removeOverlay()
        val prefs = getSharedPreferences("prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean(PREF_SEND_UDP, false)) {
            val host = prefs.getString(PREF_UDP_HOST, "") ?: ""
            val port = prefs.getInt(PREF_UDP_PORT, DEFAULT_UDP_PORT)
            if (host.isNotBlank()) {
                scope.launch { udpSend(host, port, "", "", STATE_IDLE) }
            }
        }
        stopSelf(startId)
    }

    // ─── System overlay ───────────────────────────────────────────────────────

    private fun showOverlay(name: String, number: String) {
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted — skipping overlay")
            return
        }
        removeOverlay() // safety: clear any existing overlay

        val view = LayoutInflater.from(this).inflate(R.layout.overlay_caller, null)
        view.findViewById<TextView>(R.id.tvCallerName)?.text   = name
        view.findViewById<TextView>(R.id.tvCallerNumber)?.text = number
        view.findViewById<TextView>(R.id.tvCallerStatus)?.text = "מתקשר…"

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }

        try {
            wm?.addView(view, params)
            overlayView = view
        } catch (e: Exception) {
            Log.e(TAG, "Overlay failed: ${e.message}")
        }
    }

    private fun removeOverlay() {
        overlayView?.let { v ->
            try { wm?.removeView(v) } catch (_: Exception) {}
            overlayView = null
        }
    }

    // ─── UDP send to unit 17 ──────────────────────────────────────────────────

    /**
     * Sends caller info as JSON over UDP to "יחידה 17".
     *
     * Many aftermarket car cluster/dashboard displays (including Chinese head-unit
     * companion screens) accept JSON or plain-text UDP on a local network port.
     *
     * If unit 17 uses a different protocol (serial, proprietary, etc.),
     * replace this function body with the correct implementation.
     *
     * UDP JSON format:
     * { "type":"call", "name":"דוד כהן", "number":"0501234567", "state":"ringing" }
     */
    private fun udpSend(host: String, port: Int, name: String, number: String, state: String) {
        try {
            val json = JSONObject().apply {
                put("type",   "call")
                put("name",   name)
                put("number", number)
                put("state",  state)
            }.toString()

            val bytes  = json.toByteArray(Charsets.UTF_8)
            val addr   = InetAddress.getByName(host)
            val packet = DatagramPacket(bytes, bytes.size, addr, port)

            DatagramSocket().use { socket ->
                socket.soTimeout = 3000
                socket.send(packet)
                Log.d(TAG, "UDP sent to $host:$port → $json")
            }
        } catch (e: Exception) {
            Log.w(TAG, "UDP send failed: ${e.message}")
        }
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(state: String): android.app.Notification {
        val text = when (state) {
            STATE_RINGING  -> "מתקשר: $currentName"
            STATE_ANSWERED -> "בשיחה עם: $currentName"
            else           -> "שיחה הסתיימה"
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("מתקשר")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(state != STATE_IDLE)
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()
    }

    private fun createChannel() {
        NotificationChannel(
            CHANNEL_ID, "שיחות נכנסות",
            NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "הצגת שם מתקשר" }
            .also { getSystemService(NotificationManager::class.java).createNotificationChannel(it) }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        removeOverlay()
        job.cancel()
        super.onDestroy()
    }
}
