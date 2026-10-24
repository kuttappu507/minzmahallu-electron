package app.minzmahallu.core.common

/**
 * Unified document numbering — a direct port of `electron/services/doc-number.service.ts`.
 *
 * ```
 * Receipt:      PREFIX/SERIES/yy/MM/NNN       MMJM/DN/26/09/001
 * Certificate:  PREFIX/CODE  /yy/MM/NNN       MMJM/DT/26/09/001
 * ```
 *
 * * **PREFIX** — capital letters identifying *the mahallu*, read from Settings
 *   ("Numbering Prefix"). Blank, or the legacy placeholder `RCP`, derives the
 *   letters from the mahallu's name. Because the mahallu's letters lead every
 *   number, two mahallus running this app can never issue the same number to
 *   two different people.
 * * **SERIES / CODE** — donations (`DN`) and subscriptions (`SB`) are
 *   *different money books* and can never share a number; certificates get
 *   `DT` / `MB` / `RS` / `MR` / `NOC`.
 * * **yy/MM** — the document's own date in IST, so a backdated receipt is
 *   numbered inside its own month.
 * * **NNN** — zero-padded 3-digit sequence restarting each month; it simply
 *   grows past 999 without renumbering anything.
 *
 * Numbers are allocated by scanning the live rows (no counter table), so a
 * deleted row never causes a duplicate and a restored backup keeps working.
 */
object DocNumber {

    /** Certificate type → number code. */
    val CERT_TYPE_CODES: Map<CertificateType, String> = mapOf(
        CertificateType.Death to "DT",
        CertificateType.Membership to "MB",
        CertificateType.Residence to "RS",
        CertificateType.Marriage to "MR",
        CertificateType.MarriageNoc to "NOC",
        CertificateType.Character to "CH",
        CertificateType.Income to "IN",
    )

    /** Receipt series codes — the two money books are kept apart. */
    val RECEIPT_SERIES: Map<ReceiptKind, String> = mapOf(
        ReceiptKind.Donation to "DN",
        ReceiptKind.Subscription to "SB",
    )

    private val LEGACY_PLACEHOLDER = "RCP"

    /** A–Z only, at most 5 letters. Non-Latin input yields [fallback]. */
    fun sanitizePrefix(raw: String?, fallback: String): String {
        val letters = (raw.orEmpty()).uppercase().filter { it in 'A'..'Z' }
        return if (letters.isNotEmpty()) letters.take(5) else fallback
    }

    /**
     * The name's letters — the initial of every word (up to four:
     * "Minz Mahallu Juma Masjid" → `MMJM`), or the first three letters when the
     * name yields fewer than three initials ("Noor" → `NOO`). A name with no
     * Latin letters yields `""` so the caller can fall back.
     */
    fun mahalluInitials(name: String?): String {
        val upper = (name.orEmpty()).uppercase()
        val words = upper.filter { it in 'A'..'Z' || it.isWhitespace() }
            .split(WHITESPACE)
            .filter { it.isNotBlank() }
        if (words.isEmpty()) return ""
        val initials = words.take(4).joinToString("") { it.substring(0, 1) }
        return if (initials.length >= 3) {
            initials
        } else {
            upper.filter { it in 'A'..'Z' }.take(3)
        }
    }

    /** The mahallu's own letters, resolving the setting then the name. */
    fun mahalluPrefix(storedPrefix: String?, mahalluName: String?): String {
        val stored = (storedPrefix.orEmpty()).trim().uppercase()
        if (stored.isNotEmpty() && stored != LEGACY_PLACEHOLDER) return sanitizePrefix(stored, "RC")
        val initials = sanitizePrefix(mahalluInitials(mahalluName), "")
        return initials.ifEmpty { "RC" }
    }

    /** 2-digit year + month of a stored date; falls back to today in IST. */
    fun yearMonthOf(dateStr: String?): YearMonthParts {
        val raw = dateStr.orEmpty()
        val match = DATE_HEAD.find(raw)
        if (match != null) return YearMonthParts(match.groupValues[1].takeLast(2), match.groupValues[2])
        val today = IstDate.today()
        return YearMonthParts(today.substring(2, 4), today.substring(5, 7))
    }

    /** Highest sequence already used under `prefix/yy/mm/` in [numbers]. */
    fun maxSeriesUsed(numbers: List<String?>, prefix: String, year: String, month: String): Int {
        val head = "$prefix/${yy(year)}/$month/"
        var max = 0
        for (raw in numbers) {
            val n = raw.orEmpty()
            if (!n.startsWith(head)) continue
            val tail = n.substring(head.length).toIntOrNull() ?: continue
            if (tail > max) max = tail
        }
        return max
    }

    fun formatDocNumber(prefix: String, year: String, month: String, n: Int): String =
        "$prefix/${yy(year)}/$month/${n.toString().padStart(3, '0')}"

    /** `MMJM/26/09/001` → `MMJM-26-09-001` for file names and share sheets. */
    fun fileNameSafe(value: String): String =
        value.map { if (it.isLetterOrDigit() || it == '.' || it == '_' || it == '-') it else '-' }.joinToString("")

    // ------------------------------------------------------------- allocation

    /**
     * Next receipt number for a document dated [dateStr].
     *
     * @param existingNumbers every non-blank receipt number already stored for
     *   the *same* series' tables (donations for [ReceiptKind.Donation];
     *   subscription_payments + subscriptions for [ReceiptKind.Subscription]).
     */
    fun nextReceiptNumber(
        dateStr: String?,
        kind: ReceiptKind,
        mahalluPrefix: String,
        existingNumbers: List<String?>,
    ): String {
        val (y, m) = yearMonthOf(dateStr)
        val prefix = "$mahalluPrefix/${RECEIPT_SERIES.getValue(kind)}"
        return formatDocNumber(prefix, y, m, maxSeriesUsed(existingNumbers, prefix, y, m) + 1)
    }

    /** Next certificate number — `MAHALLU/CODE/yy/MM/NNN`. */
    fun nextCertificateNumber(
        type: CertificateType,
        dateStr: String?,
        mahalluPrefix: String,
        existingNumbers: List<String?>,
    ): String {
        val (y, m) = yearMonthOf(dateStr)
        val prefix = "$mahalluPrefix/${CERT_TYPE_CODES[type] ?: "CRT"}"
        return formatDocNumber(prefix, y, m, maxSeriesUsed(existingNumbers, prefix, y, m) + 1)
    }

    /**
     * Next manual-ledger number (`TXN-0001`). Unlike the register series this
     * one is a plain running counter, matching the Electron accounting module —
     * it takes the highest trailing integer over *all* receipt numbers so an
     * operator who types a high manual number can never be collided with.
     */
    fun nextLedgerNumber(existingNumbers: List<String?>): String {
        var max = 0
        for (raw in existingNumbers) {
            val digits = TRAILING_DIGITS.find(raw.orEmpty())?.value ?: continue
            val n = digits.toIntOrNull() ?: continue
            if (n > max) max = n
        }
        return "TXN-${(max + 1).toString().padStart(4, '0')}"
    }

    /** `VOU-2026-0001` — the voucher reference auto-filled on every entry. */
    fun nextVoucherNumber(year: Int, nextId: Int): String =
        "VOU-$year-${nextId.toString().padStart(4, '0')}"

    private fun yy(year: String) = year.takeLast(2)

    private val DATE_HEAD = Regex("""^(\d{4})-(\d{2})""")
    private val TRAILING_DIGITS = Regex("""(\d+)\s*$""")
    private val WHITESPACE = Regex("""\s+""")
}

data class YearMonthParts(val year: String, val month: String)

/** Which money book a receipt belongs to. */
enum class ReceiptKind { Donation, Subscription }
