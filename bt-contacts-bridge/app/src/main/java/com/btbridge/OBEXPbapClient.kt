package com.btbridge

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/**
 * OBEX PBAP client over Bluetooth RFCOMM.
 *
 * Protocol flow:
 *  1. CONNECT  (Target = PBAP UUID, capture Connection-ID from response)
 *  2. SETPATH  "telecom"
 *  3. SETPATH  "pb"
 *  4. GET      pb.vcf  (with Connection-ID + APP_PARAMETERS: MaxListCount, Format)
 *  5. Accumulate CONTINUE responses → full vCard payload
 *  6. DISCONNECT
 */
@SuppressLint("MissingPermission")
class OBEXPbapClient(
    private val device: BluetoothDevice,
    private val onProgress: ((String) -> Unit)? = null
) {

    companion object {
        /** PBAP PSE (Phone Book Server Equipment) service record UUID */
        val PBAP_PSE_UUID: UUID = UUID.fromString("0000112F-0000-1000-8000-00805F9B34FB")

        /** OBEX PBAP target UUID (binary) */
        private val PBAP_TARGET = byteArrayOf(
            0x79, 0x61, 0x35, 0xF0.toByte(),
            0xF0.toByte(), 0xC5.toByte(), 0x11, 0xD8.toByte(),
            0x09, 0x66, 0x08, 0x00,
            0x20, 0x0C, 0x9A.toByte(), 0x66
        )

        // ── OBEX opcodes ──────────────────────────────────────────────────────
        private const val OP_CONNECT    = 0x80
        private const val OP_DISCONNECT = 0x81
        private const val OP_GET_FINAL  = 0x83
        private const val OP_SETPATH   = 0x85

        // ── OBEX response codes ───────────────────────────────────────────────
        private const val RSP_OK       = 0xA0
        private const val RSP_CONTINUE = 0x90

        // ── OBEX header IDs ───────────────────────────────────────────────────
        // High 2 bits: 00/01 = variable length (unicode/byte-seq), 10 = 1-byte, 11 = 4-byte
        private const val HDR_NAME       = 0x01  // 00 → unicode, variable
        private const val HDR_TYPE       = 0x42  // 01 → byte seq, variable
        private const val HDR_TARGET     = 0x46  // 01 → byte seq, variable
        private const val HDR_APP_PARAMS = 0x4C  // 01 → byte seq, variable
        private const val HDR_BODY       = 0x48  // 01 → byte seq, variable
        private const val HDR_END_BODY   = 0x49  // 01 → byte seq, variable
        private const val HDR_CONN_ID    = 0xCB  // 11 → 4-byte int, fixed 5 bytes total

        // ── Limits ────────────────────────────────────────────────────────────
        private const val MAX_PACKET_SIZE   = 0x2000  // 8192 bytes
        private const val SOCKET_TIMEOUT_MS = 20_000  // 20 s read timeout
        private const val MAX_CONTINUATIONS = 2000    // guard against infinite loops

        private const val TAG = "OBEXPbap"
    }

    /**
     * Connection-ID sent by the server in the CONNECT response.
     * Must be included in every subsequent request header.
     */
    private var connectionId = -1

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Establish RFCOMM + OBEX session, fetch full phonebook, parse vCards.
     * Returns empty list on any failure (errors sent via onProgress).
     */
    fun fetchContacts(): List<VCardParser.Contact> {
        var socket: BluetoothSocket? = null
        return try {
            socket = openSocket()
            socket.connect()
            socket.soTimeout = SOCKET_TIMEOUT_MS
            Log.i(TAG, "RFCOMM connected to ${device.name ?: device.address}")
            onProgress?.invoke("מחובר — מנהל handshake OBEX…")

            val ins = socket.inputStream
            val out = socket.outputStream

            if (!obexConnect(ins, out)) return emptyList()
            onProgress?.invoke("OBEX מאושר — מנווט לספר טלפונים…")

            if (!setPath(ins, out, "telecom")) {
                onProgress?.invoke("שגיאה: לא נמצאה ספרייה 'telecom'")
                return emptyList()
            }
            if (!setPath(ins, out, "pb")) {
                onProgress?.invoke("שגיאה: לא נמצאה ספרייה 'pb'")
                return emptyList()
            }

            onProgress?.invoke("מוריד אנשי קשר…")
            val vcardData = getPhonebook(ins, out)
            obexDisconnect(out)

            if (vcardData.isBlank()) {
                onProgress?.invoke("הטלפון החזיר ספר טלפונים ריק")
                return emptyList()
            }

            Log.i(TAG, "vCard payload: ${vcardData.length} chars")
            val contacts = VCardParser.parse(vcardData)
            onProgress?.invoke("נמצאו ${contacts.size} אנשי קשר")
            contacts

        } catch (e: IOException) {
            val msg = "שגיאת חיבור BT: ${e.message}"
            Log.e(TAG, msg, e)
            onProgress?.invoke(msg)
            emptyList()
        } catch (e: SecurityException) {
            val msg = "חסרת הרשאה: BLUETOOTH_CONNECT"
            Log.e(TAG, msg)
            onProgress?.invoke(msg)
            emptyList()
        } finally {
            runCatching { socket?.close() }
        }
    }

    // ─── RFCOMM socket ────────────────────────────────────────────────────────

    private fun openSocket(): BluetoothSocket =
        runCatching { device.createRfcommSocketToServiceRecord(PBAP_PSE_UUID) }
            .getOrElse {
                Log.w(TAG, "Secure RFCOMM failed, trying insecure: ${it.message}")
                device.createInsecureRfcommSocketToServiceRecord(PBAP_PSE_UUID)
            }

    // ─── OBEX CONNECT ─────────────────────────────────────────────────────────

    private fun obexConnect(ins: InputStream, out: OutputStream): Boolean {
        val targetHdr = byteSeqHeader(HDR_TARGET, PBAP_TARGET)

        // CONNECT body: [OBEX version][flags][max packet MSB][max packet LSB][headers…]
        val body = byteArrayOf(
            0x10, 0x00,
            (MAX_PACKET_SIZE shr 8).toByte(), MAX_PACKET_SIZE.toByte()
        ) + targetHdr

        writePacket(out, OP_CONNECT, body)

        val rsp = readPacket(ins) ?: return false
        val code = rsp[0].toInt() and 0xFF
        if (code != RSP_OK) {
            Log.e(TAG, "CONNECT rejected: 0x${code.toString(16)}")
            onProgress?.invoke("הטלפון דחה את חיבור OBEX (0x${code.toString(16)})")
            return false
        }
        // Extract Connection-ID from response headers (start at byte 7)
        connectionId = extractConnectionId(rsp, startOffset = 7)
        Log.d(TAG, "OBEX connected, connectionId=$connectionId")
        return true
    }

    // ─── OBEX SETPATH ─────────────────────────────────────────────────────────

    private fun setPath(ins: InputStream, out: OutputStream, folder: String): Boolean {
        // SETPATH body: [flags=0x00 (descend, create if needed)][constants=0x00][headers…]
        val body = byteArrayOf(0x00, 0x00) + connIdHeader() + unicodeHeader(HDR_NAME, folder)
        writePacket(out, OP_SETPATH, body)

        val rsp = readPacket(ins) ?: return false
        return ((rsp[0].toInt() and 0xFF) == RSP_OK).also {
            if (!it) Log.w(TAG, "SETPATH '$folder' failed: 0x${(rsp[0].toInt() and 0xFF).toString(16)}")
        }
    }

    // ─── OBEX GET phonebook ───────────────────────────────────────────────────

    private fun getPhonebook(ins: InputStream, out: OutputStream): String {
        val headers = connIdHeader() +
                unicodeHeader(HDR_NAME, "pb.vcf") +
                byteSeqHeader(HDR_TYPE, "x-bt/phonebook\u0000".toByteArray(Charsets.US_ASCII)) +
                appParamsHeader()

        writePacket(out, OP_GET_FINAL, headers)

        val sb = StringBuilder()
        var iterations = 0

        while (iterations++ < MAX_CONTINUATIONS) {
            val rsp = readPacket(ins) ?: break
            val code = rsp[0].toInt() and 0xFF

            extractBody(rsp)?.let { sb.append(it.toString(Charsets.UTF_8)) }

            when (code) {
                RSP_OK       -> break
                RSP_CONTINUE -> writePacket(out, OP_GET_FINAL, connIdHeader())
                else         -> {
                    Log.w(TAG, "Unexpected GET response: 0x${code.toString(16)}")
                    break
                }
            }
        }

        if (iterations >= MAX_CONTINUATIONS) Log.w(TAG, "Max CONTINUE iterations reached")
        return sb.toString()
    }

    private fun obexDisconnect(out: OutputStream) {
        runCatching { writePacket(out, OP_DISCONNECT, connIdHeader()) }
    }

    // ─── Packet I/O ───────────────────────────────────────────────────────────

    /** Write: [opcode 1B][total_length 2B][body…] */
    private fun writePacket(out: OutputStream, opcode: Int, body: ByteArray) {
        val total = 3 + body.size
        val pkt = ByteArray(total)
        pkt[0] = opcode.toByte()
        pkt[1] = (total shr 8).toByte()
        pkt[2] = total.toByte()
        body.copyInto(pkt, 3)
        out.write(pkt)
        out.flush()
    }

    /** Read one complete OBEX packet (opcode + 2-byte length prefix). */
    private fun readPacket(ins: InputStream): ByteArray? {
        val hdr = readFully(ins, 3) ?: return null
        val total = ((hdr[1].toInt() and 0xFF) shl 8) or (hdr[2].toInt() and 0xFF)
        val bodyLen = (total - 3).coerceAtLeast(0)
        val body = readFully(ins, bodyLen) ?: return null
        return hdr + body
    }

    private fun readFully(ins: InputStream, count: Int): ByteArray? {
        if (count <= 0) return ByteArray(0)
        val buf = ByteArray(count)
        var off = 0
        while (off < count) {
            val n = ins.read(buf, off, count - off)
            if (n < 0) { Log.w(TAG, "Stream ended early at $off/$count"); return null }
            off += n
        }
        return buf
    }

    // ─── Header parsing ───────────────────────────────────────────────────────

    /**
     * Scan headers starting at [startOffset] looking for HDR_CONN_ID (0xCB).
     * OBEX header encoding determined by header ID high 2 bits:
     *   00/01 → variable length (3-byte prefix: ID + 2-byte length)
     *   10    → 1-byte value  (2 bytes total: ID + value)
     *   11    → 4-byte value  (5 bytes total: ID + 4-byte value)
     */
    private fun extractConnectionId(pkt: ByteArray, startOffset: Int): Int {
        var i = startOffset
        while (i < pkt.size) {
            val hId = pkt[i].toInt() and 0xFF
            when {
                hId == HDR_CONN_ID -> {
                    if (i + 4 >= pkt.size) return -1
                    return ((pkt[i+1].toInt() and 0xFF) shl 24) or
                           ((pkt[i+2].toInt() and 0xFF) shl 16) or
                           ((pkt[i+3].toInt() and 0xFF) shl 8)  or
                            (pkt[i+4].toInt() and 0xFF)
                }
                (hId ushr 6) == 0b11 -> i += 5  // 4-byte int header
                (hId ushr 6) == 0b10 -> i += 2  // 1-byte int header
                else -> {                         // variable-length header
                    if (i + 2 >= pkt.size) break
                    val len = ((pkt[i+1].toInt() and 0xFF) shl 8) or (pkt[i+2].toInt() and 0xFF)
                    if (len < 3) break
                    i += len
                }
            }
        }
        return -1
    }

    /** Extract BODY / END-OF-BODY data from response packet. */
    private fun extractBody(pkt: ByteArray): ByteArray? {
        var i = 3  // skip opcode + length
        while (i + 2 < pkt.size) {
            val hId = pkt[i].toInt() and 0xFF
            when {
                hId == HDR_BODY || hId == HDR_END_BODY -> {
                    val hLen = ((pkt[i+1].toInt() and 0xFF) shl 8) or (pkt[i+2].toInt() and 0xFF)
                    val dataLen = hLen - 3
                    if (dataLen > 0 && i + hLen <= pkt.size)
                        return pkt.copyOfRange(i + 3, i + hLen)
                    i += hLen.coerceAtLeast(3)
                }
                (hId ushr 6) == 0b11 -> i += 5
                (hId ushr 6) == 0b10 -> i += 2
                else -> {
                    val hLen = ((pkt[i+1].toInt() and 0xFF) shl 8) or (pkt[i+2].toInt() and 0xFF)
                    if (hLen < 3) break
                    i += hLen
                }
            }
        }
        return null
    }

    // ─── Header builders ─────────────────────────────────────────────────────

    /** Connection-ID header (5 bytes: 0xCB + 4-byte int) or empty if not yet established. */
    private fun connIdHeader(): ByteArray {
        if (connectionId < 0) return ByteArray(0)
        return byteArrayOf(
            HDR_CONN_ID.toByte(),
            (connectionId ushr 24).toByte(),
            (connectionId ushr 16).toByte(),
            (connectionId ushr 8).toByte(),
            connectionId.toByte()
        )
    }

    /**
     * APP_PARAMETERS TLV payload:
     *   Tag 0x04 (MaxListCount)  = 0xFFFF  → return all entries
     *   Tag 0x07 (Format)        = 0x00    → vCard 2.1
     */
    private fun appParamsHeader(): ByteArray {
        val tlv = byteArrayOf(
            0x04, 0x02, 0xFF.toByte(), 0xFF.toByte(),  // MaxListCount = 65535
            0x07, 0x01, 0x00                            // Format = vCard 2.1
        )
        return byteSeqHeader(HDR_APP_PARAMS, tlv)
    }

    /** Variable-length byte-sequence header: [ID][len MSB][len LSB][data…] */
    private fun byteSeqHeader(id: Int, data: ByteArray): ByteArray {
        val len = 3 + data.size
        val h = ByteArray(len)
        h[0] = id.toByte()
        h[1] = (len shr 8).toByte()
        h[2] = len.toByte()
        data.copyInto(h, 3)
        return h
    }

    /** Unicode (UTF-16BE + null terminator) text header */
    private fun unicodeHeader(id: Int, text: String): ByteArray {
        val utf16 = text.toByteArray(Charsets.UTF_16BE) + byteArrayOf(0, 0)
        return byteSeqHeader(id, utf16)
    }
}
