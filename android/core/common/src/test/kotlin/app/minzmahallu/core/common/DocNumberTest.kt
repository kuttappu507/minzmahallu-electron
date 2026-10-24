package app.minzmahallu.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The expectations here are copied verbatim from
 * `electron/services/doc-number.service.test.ts`, so this file is a direct
 * proof that the Kotlin port and the shipped TypeScript behave identically.
 */
class DocNumberTest {

    @Test
    fun `sanitizes prefixes to 1-5 capital letters`() {
        assertThat(DocNumber.sanitizePrefix("mmh 2!", "RC")).isEqualTo("MMH")
        assertThat(DocNumber.sanitizePrefix("KMJ", "RC")).isEqualTo("KMJ")
        assertThat(DocNumber.sanitizePrefix("ABCDEFGH", "RC")).isEqualTo("ABCDE")
        assertThat(DocNumber.sanitizePrefix("മിൻസ്", "RC")).isEqualTo("RC")
        assertThat(DocNumber.sanitizePrefix("", "RC")).isEqualTo("RC")
        assertThat(DocNumber.sanitizePrefix(null, "RC")).isEqualTo("RC")
    }

    @Test
    fun `derives the mahallu letters from the name`() {
        // Initial of every word, up to four letters.
        assertThat(DocNumber.mahalluInitials("Minz Mahallu Juma Masjid")).isEqualTo("MMJM")
        assertThat(DocNumber.mahalluInitials("Minz Mahallu Jamath")).isEqualTo("MMJ")
        assertThat(DocNumber.mahalluInitials("Kunnoth P O")).isEqualTo("KPO")
        // Fewer than three initials → the first three letters of the name.
        assertThat(DocNumber.mahalluInitials("Minz Mahallu")).isEqualTo("MIN")
        assertThat(DocNumber.mahalluInitials("Noor")).isEqualTo("NOO")
        // Names with no Latin letters yield "" (caller falls back generically).
        assertThat(DocNumber.mahalluInitials("മിൻസ് മഹല്ല്")).isEmpty()
        assertThat(DocNumber.mahalluInitials("")).isEmpty()
    }

    @Test
    fun `splits a stored date into a 2-digit year and month`() {
        assertThat(DocNumber.yearMonthOf("2026-09-15")).isEqualTo(YearMonthParts("26", "09"))
        assertThat(DocNumber.yearMonthOf("1999-01-01T00:00:00")).isEqualTo(YearMonthParts("99", "01"))
        // Unparseable values fall back to today (IST) — still 2 digits.
        assertThat(DocNumber.yearMonthOf("").month).matches(Regex("^\\d{2}$"))
        assertThat(DocNumber.yearMonthOf(null).year).matches(Regex("^\\d{2}$"))
    }

    @Test
    fun `formats PREFIX-yy-MM-NNN with 3-digit padding that grows past 999`() {
        assertThat(DocNumber.formatDocNumber("MMH", "26", "02", 1)).isEqualTo("MMH/26/02/001")
        assertThat(DocNumber.formatDocNumber("MMH", "26", "02", 42)).isEqualTo("MMH/26/02/042")
        assertThat(DocNumber.formatDocNumber("DT", "26", "09", 1000)).isEqualTo("DT/26/09/1000")
        // A four-digit year still prints as two digits — the format owns the shape.
        assertThat(DocNumber.formatDocNumber("MMJM", "2026", "09", 1)).isEqualTo("MMJM/26/09/001")
    }

    @Test
    fun `finds the highest used sequence ignoring legacy formats and other months`() {
        val used = listOf(
            "MMH/26/02/001",
            "MMH/26/02/012",
            "MMH/26/02/007",
            "MMH/26/03/001", // different month
            "MMH/25/02/999", // different year
            "MMH/2026-02-001", // old four-digit-year scheme — never matches
            "MMH/DT/26/02/005", // certificate series — never matches receipts
            "DON-003",
            "RCP-0001",
            "",
            null,
        )
        assertThat(DocNumber.maxSeriesUsed(used, "MMH", "26", "02")).isEqualTo(12)
        assertThat(DocNumber.maxSeriesUsed(used, "MMH", "26", "03")).isEqualTo(1)
        assertThat(DocNumber.maxSeriesUsed(used, "MMH", "26", "01")).isEqualTo(0)
        // A four-digit year argument finds the two-digit numbers just the same.
        assertThat(DocNumber.maxSeriesUsed(used, "MMH", "2026", "02")).isEqualTo(12)
    }

    @Test
    fun `receipt numbers keep the two money books apart`() {
        val prefix = DocNumber.mahalluPrefix("RCP", "Minz Mahallu Juma Masjid")
        assertThat(prefix).isEqualTo("MMJM")

        val donation = DocNumber.nextReceiptNumber(
            dateStr = "2026-09-15",
            kind = ReceiptKind.Donation,
            mahalluPrefix = prefix,
            existingNumbers = listOf("MMJM/DN/26/09/004"),
        )
        val subscription = DocNumber.nextReceiptNumber(
            dateStr = "2026-09-15",
            kind = ReceiptKind.Subscription,
            mahalluPrefix = prefix,
            existingNumbers = listOf("MMJM/DN/26/09/004"),
        )
        assertThat(donation).isEqualTo("MMJM/DN/26/09/005")
        assertThat(subscription).isEqualTo("MMJM/SB/26/09/001")
        assertThat(donation).isNotEqualTo(subscription)
    }

    @Test
    fun `a blank or legacy prefix falls back to the mahallu letters then to RC`() {
        assertThat(DocNumber.mahalluPrefix("", "Minz Mahallu Juma Masjid")).isEqualTo("MMJM")
        assertThat(DocNumber.mahalluPrefix("RCP", "Noor Masjid")).isEqualTo("NOO")
        assertThat(DocNumber.mahalluPrefix("RCP", "മിൻസ് മഹല്ല്")).isEqualTo("RC")
        // An explicit choice wins.
        assertThat(DocNumber.mahalluPrefix("kmj", "Minz Mahallu Juma Masjid")).isEqualTo("KMJ")
    }

    @Test
    fun `certificate numbers carry the type code after the mahallu prefix`() {
        val number = DocNumber.nextCertificateNumber(
            type = CertificateType.Death,
            dateStr = "2026-09-02",
            mahalluPrefix = "MMJM",
            existingNumbers = listOf("MMJM/DT/26/09/002", "MMJM/MB/26/09/009"),
        )
        assertThat(number).isEqualTo("MMJM/DT/26/09/003")
    }

    @Test
    fun `file names are made safe for the share sheet`() {
        assertThat(DocNumber.fileNameSafe("MMJM/26/09/001")).isEqualTo("MMJM-26-09-001")
    }

    @Test
    fun `the manual ledger counter never collides with a typed high number`() {
        assertThat(DocNumber.nextLedgerNumber(listOf("TXN-0001", "TXN-0002"))).isEqualTo("TXN-0003")
        assertThat(DocNumber.nextLedgerNumber(listOf("TXN-0001", "TXN-0900"))).isEqualTo("TXN-0901")
        assertThat(DocNumber.nextLedgerNumber(emptyList())).isEqualTo("TXN-0001")
    }
}
