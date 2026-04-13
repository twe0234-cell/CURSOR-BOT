package com.btbridge

/**
 * Minimal vCard 2.1 / 3.0 parser.
 * Handles FN, N, TEL fields with optional encodings (QUOTED-PRINTABLE, UTF-8).
 */
object VCardParser {

    data class Contact(
        val displayName: String,
        val phones: List<String>
    )

    fun parse(vcardText: String): List<Contact> {
        val contacts = mutableListOf<Contact>()
        val lines = unfoldLines(vcardText)

        var inCard = false
        var name = ""
        val phones = mutableListOf<String>()

        for (rawLine in lines) {
            val line = rawLine.trim()
            when {
                line.equals("BEGIN:VCARD", ignoreCase = true) -> {
                    inCard = true
                    name = ""
                    phones.clear()
                }
                line.equals("END:VCARD", ignoreCase = true) -> {
                    if (inCard && name.isNotBlank()) {
                        contacts.add(Contact(name, phones.toList()))
                    }
                    inCard = false
                }
                inCard -> {
                    val (prop, value) = splitProperty(line) ?: continue
                    val propUpper = prop.uppercase()
                    when {
                        propUpper == "FN" || propUpper.startsWith("FN;") -> {
                            name = decodeValue(prop, value).trim()
                        }
                        propUpper.startsWith("N;") || propUpper == "N" -> {
                            // Only use N if FN not found yet
                            if (name.isBlank()) {
                                name = buildNameFromN(decodeValue(prop, value))
                            }
                        }
                        propUpper.startsWith("TEL") -> {
                            val phone = cleanPhone(value)
                            if (phone.isNotBlank()) phones.add(phone)
                        }
                    }
                }
            }
        }
        return contacts
    }

    /** Unfold multi-line vCard values (RFC 2426 folding: CRLF + whitespace) */
    private fun unfoldLines(text: String): List<String> {
        val unfolded = text.replace("\r\n ", "").replace("\r\n\t", "")
            .replace("\n ", "").replace("\n\t", "")
        return unfolded.lines()
    }

    /** Split "PROP;PARAM=X:value" into ("PROP;PARAM=X", "value") */
    private fun splitProperty(line: String): Pair<String, String>? {
        val colonIdx = line.indexOf(':')
        if (colonIdx < 0) return null
        return line.substring(0, colonIdx) to line.substring(colonIdx + 1)
    }

    /**
     * Decode QUOTED-PRINTABLE or plain value.
     * The prop string may contain ";ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8"
     */
    private fun decodeValue(prop: String, value: String): String {
        val propUpper = prop.uppercase()
        return if (propUpper.contains("QUOTED-PRINTABLE")) {
            decodeQuotedPrintable(value)
        } else {
            value.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";")
        }
    }

    private fun decodeQuotedPrintable(input: String): String {
        val bytes = mutableListOf<Byte>()
        var i = 0
        while (i < input.length) {
            if (input[i] == '=' && i + 2 < input.length) {
                val hex = input.substring(i + 1, i + 3)
                try {
                    bytes.add(hex.toInt(16).toByte())
                    i += 3
                } catch (e: NumberFormatException) {
                    bytes.add(input[i].code.toByte())
                    i++
                }
            } else {
                bytes.add(input[i].code.toByte())
                i++
            }
        }
        return bytes.toByteArray().toString(Charsets.UTF_8)
    }

    /** Convert "Last;First;Middle;Prefix;Suffix" → "First Last" */
    private fun buildNameFromN(value: String): String {
        val parts = value.split(";")
        val last = parts.getOrNull(0)?.trim() ?: ""
        val first = parts.getOrNull(1)?.trim() ?: ""
        return when {
            first.isNotBlank() && last.isNotBlank() -> "$first $last"
            last.isNotBlank() -> last
            else -> first
        }
    }

    /** Strip non-digit characters except leading + */
    private fun cleanPhone(raw: String): String {
        val stripped = raw.trim()
        val hasPlus = stripped.startsWith("+")
        val digits = stripped.filter { it.isDigit() }
        return if (hasPlus) "+$digits" else digits
    }
}
