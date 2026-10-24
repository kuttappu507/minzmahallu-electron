package app.minzmahallu.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QrPayloadTest {

    private val fields = QrFields(
        number = "MMJM/DT/26/09/001",
        verificationCode = "K7QM-4XDP-9RTH",
        fingerprint = "8F2A41C0",
        issuedDate = "2026-09-15",
    )

    @Test
    fun `a certificate payload carries the seven documented fields`() {
        val payload = QrPayload.buildCert(fields, key = "mahallu-secret")
        val parts = payload.split("|")
        assertThat(parts).hasSize(7)
        assertThat(parts[0]).isEqualTo("MMS")
        assertThat(parts[1]).isEqualTo("CERT")
        assertThat(parts[2]).isEqualTo("MMJM/DT/26/09/001")
        assertThat(parts[3]).isEqualTo("K7QM-4XDP-9RTH")
        assertThat(parts[4]).isEqualTo("8F2A41C0")
        assertThat(parts[5]).isEqualTo("2026-09-15")
        assertThat(parts[6]).hasLength(16)
    }

    @Test
    fun `receipts use the RCP kind`() {
        val payload = QrPayload.buildReceipt(fields, key = null)
        assertThat(QrPayload.parse(payload)?.isReceipt).isTrue()
        // No key → the legacy six-field form, still valid to print.
        assertThat(payload.split("|")).hasSize(6)
    }

    @Test
    fun `a signed payload verifies against its key`() {
        val payload = QrPayload.buildCert(fields, key = "mahallu-secret")
        assertThat(QrPayload.verify(payload, "mahallu-secret").signature).isEqualTo(QrSignature.Valid)
    }

    @Test
    fun `the wrong key fails`() {
        val payload = QrPayload.buildCert(fields, key = "mahallu-secret")
        assertThat(QrPayload.verify(payload, "other-key").signature).isEqualTo(QrSignature.Invalid)
    }

    @Test
    fun `an altered field breaks the tag`() {
        val payload = QrPayload.buildCert(fields, key = "mahallu-secret")
        val tampered = payload.replace("MMJM/DT/26/09/001", "MMJM/DT/26/09/002")
        assertThat(QrPayload.verify(tampered, "mahallu-secret").signature).isEqualTo(QrSignature.Invalid)
    }

    @Test
    fun `a legacy six-field payload parses and reports itself unsigned`() {
        val legacy = QrPayload.buildCert(fields, key = null)
        val result = QrPayload.verify(legacy, "mahallu-secret")
        assertThat(result.signature).isEqualTo(QrSignature.Legacy)
        assertThat(result.payload?.verificationCode).isEqualTo("K7QM-4XDP-9RTH")
    }

    @Test
    fun `malformed payloads are rejected`() {
        assertThat(QrPayload.parse(null)).isNull()
        assertThat(QrPayload.parse("")).isNull()
        assertThat(QrPayload.parse("HELLO|CERT|a|b|c|d")).isNull() // wrong version
        assertThat(QrPayload.parse("MMS|OTHER|a|b|c|d")).isNull() // unknown kind
        assertThat(QrPayload.parse("MMS|CERT|a|b|c")).isNull() // too few fields
        assertThat(QrPayload.verify("garbage", "key").signature).isEqualTo(QrSignature.Invalid)
    }

    @Test
    fun `a scanned wrapper is trimmed down to the payload`() {
        val payload = QrPayload.buildCert(fields, key = "k")
        assertThat(QrPayload.extractScannedText("https://example.com?d=$payload"))
            .isEqualTo(payload)
        assertThat(QrPayload.extractScannedText("  $payload  ")).isEqualTo(payload)
    }

    @Test
    fun `the tag is a stable 64-bit hex digest`() {
        val a = QrPayload.sign("MMS|CERT|1|2|3|4", "key")
        val b = QrPayload.sign("MMS|CERT|1|2|3|4", "key")
        assertThat(a).isEqualTo(b)
        assertThat(a).matches(Regex("^[0-9A-F]{16}$"))
    }
}
