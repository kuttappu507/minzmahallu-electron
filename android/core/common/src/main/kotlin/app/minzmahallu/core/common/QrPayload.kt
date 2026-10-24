package app.minzmahallu.core.common

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Anti-forgery QR payloads — a direct port of `electron/services/qr-code.ts`.
 *
 * ```
 * MMS|CERT|<certificate_number>|<verification_code>|<device_fingerprint>|<issued_date>[|<hmac>]
 * MMS|RCP |<receipt_number>    |<verification_code>|<device_fingerprint>|<issued_date>[|<hmac>]
 * ```
 *
 * The payload binds a print to the machine that issued it (fingerprint) and to
 * the register (verification code). With a signing key, an HMAC-SHA256 tag over
 * the first six fields is appended as a seventh: an outsider can clone an
 * existing QR but cannot *alter* a field or *mint* a new valid one. Six-field
 * payloads printed by earlier builds still parse — they are reported as
 * unsigned/legacy.
 */
object QrPayload {

    const val VERSION = "MMS"
    const val KIND_CERT = "CERT"
    const val KIND_RECEIPT = "RCP"

    /** HMAC-SHA256(key, first-six-fields) → 16 hex chars (64 bits of tag). */
    fun sign(sixPartPayload: String, key: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val digest = mac.doFinal(sixPartPayload.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }.take(16).uppercase()
    }

    fun buildCert(fields: QrFields, key: String? = null): String =
        build(KIND_CERT, fields, key)

    fun buildReceipt(fields: QrFields, key: String? = null): String =
        build(KIND_RECEIPT, fields, key)

    private fun build(kind: String, fields: QrFields, key: String?): String {
        val base = listOf(
            VERSION, kind, fields.number, fields.verificationCode,
            fields.fingerprint, fields.issuedDate,
        ).joinToString("|")
        return if (key.isNullOrBlank()) base else "$base|${sign(base, key)}"
    }

    /** Parse a scanned/entered payload; null when malformed. */
    fun parse(payload: String?): ParsedQr? {
        val parts = payload?.trim()?.split("|") ?: return null
        if (parts.size != 6 && parts.size != 7) return null
        if (parts[0] != VERSION) return null
        if (parts[1] != KIND_CERT && parts[1] != KIND_RECEIPT) return null
        return ParsedQr(
            version = parts[0],
            kind = parts[1],
            number = parts[2],
            verificationCode = parts[3],
            fingerprint = parts[4],
            issuedDate = parts[5],
            signature = parts.getOrNull(6)?.takeIf { it.isNotBlank() },
        )
    }

    /**
     * Verify a payload's tag. An unsigned (legacy) payload returns
     * [QrSignature.Legacy]; a tampered one returns [QrSignature.Invalid].
     */
    fun verify(payload: String?, key: String?): QrVerification {
        val parsed = parse(payload) ?: return QrVerification(QrSignature.Invalid, null)
        if (parsed.signature == null) return QrVerification(QrSignature.Legacy, parsed)
        if (key.isNullOrBlank()) return QrVerification(QrSignature.Unverified, parsed)
        val base = listOf(
            parsed.version, parsed.kind, parsed.number, parsed.verificationCode,
            parsed.fingerprint, parsed.issuedDate,
        ).joinToString("|")
        val expected = sign(base, key)
        val ok = constantTimeEquals(expected, parsed.signature.uppercase())
        return QrVerification(if (ok) QrSignature.Valid else QrSignature.Invalid, parsed)
    }

    /** A phone can read the code without the app — keep the text human-usable. */
    fun extractScannedText(raw: String?): String? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return null
        // Some scanners append a URL wrapper; keep the MMS payload if present.
        val start = text.indexOf(VERSION + "|")
        return if (start >= 0) text.substring(start) else text
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }
}

data class QrFields(
    val number: String,
    val verificationCode: String,
    val fingerprint: String,
    val issuedDate: String,
)

data class ParsedQr(
    val version: String,
    val kind: String,
    val number: String,
    val verificationCode: String,
    val fingerprint: String,
    val issuedDate: String,
    val signature: String?,
) {
    val isCertificate: Boolean get() = kind == QrPayload.KIND_CERT
    val isReceipt: Boolean get() = kind == QrPayload.KIND_RECEIPT
}

enum class QrSignature { Valid, Invalid, Legacy, Unverified }

data class QrVerification(val signature: QrSignature, val payload: ParsedQr?)
