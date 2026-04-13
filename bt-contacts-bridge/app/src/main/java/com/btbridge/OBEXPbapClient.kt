package com.btbridge

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/**
 * Direct OBEX PBAP client — connects via RFCOMM to the Phone Book Access Profile
 * server on the remote device and fetches the full phonebook as vCard data.
 *
 * Protocol: OBEX over RFCOMM
 *   1. CONNECT  (with Target = PBAP UUID)
 *   2. SETPATH  "telecom"
 *   3. SETPATH  "pb"
 *   4. GET      "pb.vcf" / "x-bt/phonebook"
 *   5. DISCONNECT
 */
class OBEXPbapClient(private val device: BluetoothDevice) {

    companion object {
        // PBAP PSE (Phone Book Server Equipment) UUID
        val PBAP_PSE_UUID: UUID = UUID.fromString("0000112F-0000-1000-8000-00805F9B34FB")

        // OBEX PBAP target UUID in binary
        val PBAP_TARGET_UUID = byteArrayOf(
            0x79.toByte(), 0x61.toByte(), 0x35.toByte(), 0xF0.toByte(),
            0xF0.toByte(), 0xC5.toByte(), 0x11.toByte(), 0xD8.toByte(),
            0x09.toByte(), 0x66.toByte(), 0x08.toByte(), 0x00.toByte(),
            0x20.toByte(), 0x0C.toByte(), 0x9A.toByte(), 0x66.toByte()
        )

        // OBEX opcodes
        private const val OP_CONNECT    = 0x80
        private const val OP_DISCONNECT = 0x81
        private const val OP_GET_FINAL  = 0x83
        private const val OP_SETPATH   = 0x85

        // OBEX response codes
        private const val RSP_OK       = 0xA0
        private const val RSP_CONTINUE = 0x90

        // OBEX header IDs
        private const val HDR_NAME      = 0x01  // Unicode
        private const val HDR_TYPE      = 0x42  // Byte sequence (ASCII + null)
        private const val HDR_TARGET    = 0x46  // Byte sequence
        private const val HDR_BODY      = 0x48  // Byte sequence
        private const val HDR_END_BODY  = 0x49  // Byte sequence

        private const val MAX_PACKET = 0x2000  // 8192 bytes
        private const val TAG = "OBEXPbap"
    }

    /** Fetch all phonebook entries as a list of parsed contacts. */
    fun fetchContacts(): List<VCardParser.Contact> {
        var socket: BluetoothSocket? = null
        return try {
            socket = device.createRfcommSocketToServiceRecord(PBAP_PSE_UUID)
            socket.connect()
            Log.i(TAG, "RFCOMM connected to ${device.name}")

            val input = socket.inputStream
            val output = socket.outputStream

            if (!sendConnect(input, output)) {
                Log.e(TAG, "OBEX CONNECT failed")
                return emptyList()
            }

            if (!sendSetPath(input, output, "telecom")) {
                Log.e(TAG, "SETPATH telecom failed")
                return emptyList()
            }

            if (!sendSetPath(input, output, "pb")) {
                Log.e(TAG, "SETPATH pb failed")
                return emptyList()
            }

            val vcardData = fetchPhonebook(input, output)
            if (vcardData.isBlank()) {
                Log.w(TAG, "Empty phonebook response")
                return emptyList()
            }

            sendDisconnect(output)
            Log.i(TAG, "Fetched ${vcardData.length} bytes of vCard data")
            VCardParser.parse(vcardData)

        } catch (e: IOException) {
            Log.e(TAG, "Connection error: ${e.message}")
            emptyList()
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    // ─── OBEX CONNECT ────────────────────────────────────────────────────────

    private fun sendConnect(input: InputStream, output: OutputStream): Boolean {
        // Headers: Target = PBAP UUID
        val targetHeader = buildByteSequenceHeader(HDR_TARGET, PBAP_TARGET_UUID)

        // Connect packet body: OBEX version (0x10), flags (0x00), max packet size
        val body = byteArrayOf(
            0x10.toByte(), 0x00.toByte(),
            ((MAX_PACKET shr 8) and 0xFF).toByte(),
            (MAX_PACKET and 0xFF).toByte()
        ) + targetHeader

        val totalLen = 3 + body.size
        val packet = ByteArray(totalLen)
        packet[0] = OP_CONNECT.toByte()
        packet[1] = ((totalLen shr 8) and 0xFF).toByte()
        packet[2] = (totalLen and 0xFF).toByte()
        body.copyInto(packet, 3)

        output.write(packet)
        output.flush()

        val response = readPacket(input) ?: return false
        return (response[0].toInt() and 0xFF) == RSP_OK
    }

    // ─── OBEX SETPATH ─────────────────────────────────────────────────────────

    private fun sendSetPath(input: InputStream, output: OutputStream, folder: String): Boolean {
        val nameHeader = buildUnicodeHeader(HDR_NAME, folder)

        // SETPATH body: flags (0x02 = don't create), constants (0x00)
        val body = byteArrayOf(0x02, 0x00) + nameHeader

        val totalLen = 3 + body.size
        val packet = ByteArray(totalLen)
        packet[0] = OP_SETPATH.toByte()
        packet[1] = ((totalLen shr 8) and 0xFF).toByte()
        packet[2] = (totalLen and 0xFF).toByte()
        body.copyInto(packet, 3)

        output.write(packet)
        output.flush()

        val response = readPacket(input) ?: return false
        val rsp = response[0].toInt() and 0xFF
        return rsp == RSP_OK
    }

    // ─── OBEX GET (phonebook) ─────────────────────────────────────────────────

    private fun fetchPhonebook(input: InputStream, output: OutputStream): String {
        val nameHeader  = buildUnicodeHeader(HDR_NAME, "pb.vcf")
        val typeBytes   = "x-bt/phonebook\u0000".toByteArray(Charsets.US_ASCII)
        val typeHeader  = buildByteSequenceHeader(HDR_TYPE, typeBytes)

        val headers = nameHeader + typeHeader
        val totalLen = 3 + headers.size
        val packet = ByteArray(totalLen)
        packet[0] = OP_GET_FINAL.toByte()
        packet[1] = ((totalLen shr 8) and 0xFF).toByte()
        packet[2] = (totalLen and 0xFF).toByte()
        headers.copyInto(packet, 3)

        output.write(packet)
        output.flush()

        // Read chunks until RSP_OK (may come as multiple RSP_CONTINUE)
        val sb = StringBuilder()
        while (true) {
            val response = readPacket(input) ?: break
            val code = response[0].toInt() and 0xFF
            extractBody(response)?.let { sb.append(String(it, Charsets.UTF_8)) }

            when (code) {
                RSP_OK -> break
                RSP_CONTINUE -> {
                    // Send empty GET to continue
                    val cont = byteArrayOf(
                        OP_GET_FINAL.toByte(), 0x00, 0x03
                    )
                    output.write(cont)
                    output.flush()
                }
                else -> {
                    Log.w(TAG, "Unexpected response code: 0x${code.toString(16)}")
                    break
                }
            }
        }
        return sb.toString()
    }

    private fun sendDisconnect(output: OutputStream) {
        try {
            output.write(byteArrayOf(OP_DISCONNECT.toByte(), 0x00, 0x03))
            output.flush()
        } catch (_: Exception) {}
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Read one complete OBEX packet.
     * First 3 bytes: opcode/response code + 2-byte total length.
     */
    private fun readPacket(input: InputStream): ByteArray? {
        return try {
            val header = ByteArray(3)
            var read = 0
            while (read < 3) {
                val n = input.read(header, read, 3 - read)
                if (n < 0) return null
                read += n
            }
            val totalLen = ((header[1].toInt() and 0xFF) shl 8) or (header[2].toInt() and 0xFF)
            val body = ByteArray(totalLen - 3)
            var bodyRead = 0
            while (bodyRead < body.size) {
                val n = input.read(body, bodyRead, body.size - bodyRead)
                if (n < 0) break
                bodyRead += n
            }
            header + body
        } catch (e: IOException) {
            Log.e(TAG, "readPacket error: ${e.message}")
            null
        }
    }

    /** Extract BODY or END-OF-BODY data from a response packet (bytes after first 3). */
    private fun extractBody(packet: ByteArray): ByteArray? {
        var i = 3
        while (i < packet.size) {
            val headerId = packet[i].toInt() and 0xFF
            if (i + 2 >= packet.size) break
            val hLen = ((packet[i + 1].toInt() and 0xFF) shl 8) or (packet[i + 2].toInt() and 0xFF)
            if (headerId == HDR_BODY || headerId == HDR_END_BODY) {
                val dataStart = i + 3
                val dataLen = hLen - 3
                if (dataStart + dataLen <= packet.size) {
                    return packet.copyOfRange(dataStart, dataStart + dataLen)
                }
            }
            i += hLen
        }
        return null
    }

    /** Build a Unicode (UTF-16BE + null terminator) header. */
    private fun buildUnicodeHeader(headerId: Int, text: String): ByteArray {
        val encoded = text.toByteArray(Charsets.UTF_16BE) + byteArrayOf(0x00, 0x00)
        val len = 3 + encoded.size
        val header = ByteArray(len)
        header[0] = headerId.toByte()
        header[1] = ((len shr 8) and 0xFF).toByte()
        header[2] = (len and 0xFF).toByte()
        encoded.copyInto(header, 3)
        return header
    }

    /** Build a byte-sequence header. */
    private fun buildByteSequenceHeader(headerId: Int, data: ByteArray): ByteArray {
        val len = 3 + data.size
        val header = ByteArray(len)
        header[0] = headerId.toByte()
        header[1] = ((len shr 8) and 0xFF).toByte()
        header[2] = (len and 0xFF).toByte()
        data.copyInto(header, 3)
        return header
    }
}
