package app.minzmahallu.core.common

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Indian Standard Time calendar helpers — a direct port of the Electron app's
 * `electron/services/ist-date.ts`.
 *
 * The mahallu runs in India only, so **every** calendar date is fixed to
 * Asia/Kolkata regardless of the device timezone. The desktop app made this an
 * explicit rule because `toISOString()` (UTC) and machine-local time both shift
 * a date by one day for a machine sitting between 00:00 and 05:30 IST. Android
 * devices travel, and a traveller's phone set to Europe/Berlin would otherwise
 * number receipts into the wrong month — so the rule is kept exactly.
 *
 * The stored format is `yyyy-MM-dd` everywhere in the database; `dd-MM-yyyy` is
 * a *display* convention only ([fmtDdMmYyyy]).
 */
object IstDate {

    /** The one and only zone the mahallu's calendar runs in. */
    val ZONE: ZoneId = ZoneId.of("Asia/Kolkata")

    private val ISO_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private val DISPLAY_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("dd-MM-yyyy")
    private val MONTH_KEY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")

    private val MONTH_NAMES = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )

    private val MONTH_NAMES_ML = listOf(
        "ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ",
        "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്‌ടോബർ", "നവംബർ", "ഡിസംബർ",
    )

    /** "Now" in IST. Every `today()` call in the app funnels through here. */
    fun now(): ZonedDateTime = ZonedDateTime.now(ZONE)

    /** Today's date (`yyyy-MM-dd`) in Indian Standard Time. */
    fun today(): String = now().toLocalDate().format(ISO_DATE)

    /** Any instant expressed as `yyyy-MM-dd` in IST. */
    fun dateStr(at: ZonedDateTime): String = at.withZoneSameInstant(ZONE).toLocalDate().format(ISO_DATE)

    /** Current `yyyy-MM` in IST — the key used by every monthly aggregate. */
    fun month(): String = today().substring(0, 7)

    /** [today] plus [days] — pure calendar arithmetic, no timezone involved. */
    fun plusDays(days: Int): String = LocalDate.parse(today(), ISO_DATE).plusDays(days.toLong()).format(ISO_DATE)

    /** Full timestamp `yyyy-MM-dd HH:mm` in IST (the audit-log format). */
    fun dateTimeStr(at: ZonedDateTime = now()): String =
        at.withZoneSameInstant(ZONE).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))

    /** Parse a stored `yyyy-MM-dd` value; returns null when absent/unparseable. */
    fun parseDate(value: String?): LocalDate? = runCatching {
        val raw = value?.trim().orEmpty()
        if (raw.length < 10) return@runCatching null
        LocalDate.parse(raw.substring(0, 10), ISO_DATE)
    }.getOrNull()

    /**
     * The billing period the mahallu is currently in.
     *
     * Ported from `subscriptions.service.ts`: `Monthly` is the calendar month,
     * `Quarterly` is the calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec)
     * so a masjid that collects once a quarter gets a real quarterly account
     * rather than three empty monthly rows.
     */
    fun currentPeriod(frequency: SubscriptionFrequency, on: LocalDate = LocalDate.parse(today(), ISO_DATE)): Period {
        return when (frequency) {
            SubscriptionFrequency.Monthly -> {
                val start = on.withDayOfMonth(1)
                Period(start.format(ISO_DATE), start.plusMonths(1).minusDays(1).format(ISO_DATE), frequency)
            }

            SubscriptionFrequency.Quarterly -> {
                val startMonth = ((on.monthValue - 1) / 3) * 3 + 1 // 1, 4, 7, 10
                val start = LocalDate.of(on.year, startMonth, 1)
                val endMonth = startMonth + 2
                val end = LocalDate.of(on.year, endMonth, 1)
                    .plusMonths(1).minusDays(1)
                Period(start.format(ISO_DATE), end.format(ISO_DATE), frequency)
            }
        }
    }

    /** The period covering [ymd], used when rolling an account forward. */
    fun periodOf(frequency: SubscriptionFrequency, ymd: String): Period? {
        val date = parseDate(ymd) ?: return null
        return currentPeriod(frequency, date)
    }

    // ---------------------------------------------------------------- display

    /** `yyyy-MM-dd` → `dd-MM-yyyy`. Anything unparseable passes through. */
    fun fmtDdMmYyyy(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val date = parseDate(value) ?: return value
        return date.format(DISPLAY_DATE)
    }

    /** `yyyy-MM` or `yyyy-MM-dd` → "September 2026" (or the Malayalam month). */
    fun monthLabel(value: String?, malayalam: Boolean = false): String {
        val raw = value?.trim().orEmpty()
        if (raw.length < 7) return raw
        val year = raw.substring(0, 4)
        val monthIndex = raw.substring(5, 7).toIntOrNull()?.minus(1) ?: return raw
        val names = if (malayalam) MONTH_NAMES_ML else MONTH_NAMES
        val name = names.getOrNull(monthIndex) ?: return raw
        return "$name $year"
    }

    /** Short month axis label ("Sep", "ഒക്ടോ") for the dashboard charts. */
    fun monthShort(value: String?, malayalam: Boolean = false): String {
        val label = monthLabel(value, malayalam)
        return if (malayalam) label.substringBefore(' ') else label.substringBefore(' ').take(3)
    }

    /** "09:41" from a stored `yyyy-MM-dd HH:mm:ss` / epoch value. */
    fun fmtTime(value: String?): String {
        val raw = value?.trim().orEmpty()
        // "yyyy-MM-dd HH:mm[:ss]"
        if (raw.length >= 16 && raw[10] == ' ') return raw.substring(11, 16)
        return raw
    }

    /** `yyyy-MM-dd HH:mm:ss` → `dd-MM-yyyy, HH:mm` — the app's list convention. */
    fun fmtDateTime(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val date = fmtDdMmYyyy(value)
        val time = fmtTime(value)
        return if (time.isBlank()) date else "$date, $time"
    }

    /** Today's date as a display string ("24-10-2026"). */
    fun todayDisplay(): String = fmtDdMmYyyy(today())

    /** Current IST wall-clock time for the dashboard greeting ticker. */
    fun clockNow(): LocalTime = now().toLocalTime()

    /** Greeting bucket used by the dashboard hero ("Good morning" …). */
    fun greetingKey(): Greeting = when (now().hour) {
        in 5..11 -> Greeting.MORNING
        in 12..16 -> Greeting.AFTERNOON
        in 17..20 -> Greeting.EVENING
        else -> Greeting.NIGHT
    }

    /** Days between two stored dates; null when either is missing. */
    fun daysBetween(from: String?, to: String?): Long? {
        val a = parseDate(from) ?: return null
        val b = parseDate(to) ?: return null
        return java.time.temporal.ChronoUnit.DAYS.between(a, b)
    }

    /** True when [ymd] is strictly before today in IST. */
    fun isPast(ymd: String?): Boolean {
        val date = parseDate(ymd) ?: return false
        return date.isBefore(LocalDate.parse(today(), ISO_DATE))
    }

    /** `yyyy-MM` for a stored date, or null. */
    fun monthKeyOf(ymd: String?): String? = parseDate(ymd)?.format(MONTH_KEY)

    /** The last [count] month keys ending with the current one, oldest first. */
    fun trailingMonths(count: Int): List<String> {
        val thisMonth = LocalDate.parse(today(), ISO_DATE).withDayOfMonth(1)
        return (count - 1 downTo 0).map { thisMonth.minusMonths(it.toLong()).format(MONTH_KEY) }
    }
}

/** A recurring billing window (see [IstDate.currentPeriod]). */
data class Period(
    val start: String,
    val end: String,
    val frequency: SubscriptionFrequency,
)

/** How often the mahallu bills a household. Mirrors `settings.subscription_frequency`. */
enum class SubscriptionFrequency {
    Monthly,
    Quarterly,
    ;

    companion object {
        fun from(raw: String?): SubscriptionFrequency =
            if (raw?.equals("Quarterly", ignoreCase = true) == true) Quarterly else Monthly
    }
}

/** Time-of-day bucket for the dashboard greeting. */
enum class Greeting { MORNING, AFTERNOON, EVENING, NIGHT }
