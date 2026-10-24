package app.minzmahallu.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

/**
 * Port of `electron/services/ist-date.test.ts` — the calendar rules the whole
 * ledger depends on. The timezone pinning is what stops a receipt being
 * numbered into the wrong month on a device that has travelled.
 */
class IstDateTest {

    @Test
    fun `an instant late in the UTC day is already tomorrow in India`() {
        // 2026-09-30 20:00 UTC == 2026-10-01 01:30 IST.
        val utc = LocalDateTime.of(2026, 9, 30, 20, 0).atZone(ZoneOffset.UTC)
        assertThat(IstDate.dateStr(utc)).isEqualTo("2026-10-01")
    }

    @Test
    fun `an instant early in the UTC day is still the same day in India`() {
        val utc = LocalDateTime.of(2026, 9, 30, 2, 0).atZone(ZoneOffset.UTC)
        assertThat(IstDate.dateStr(utc)).isEqualTo("2026-09-30")
    }

    @Test
    fun `today and month agree on the IST prefix`() {
        assertThat(IstDate.today()).matches(Regex("^\\d{4}-\\d{2}-\\d{2}$"))
        assertThat(IstDate.month()).isEqualTo(IstDate.today().substring(0, 7))
    }

    @Test
    fun `plus days is pure calendar arithmetic`() {
        val plus = IstDate.plusDays(30)
        val back = IstDate.plusDays(-30)
        assertThat(IstDate.daysBetween(IstDate.today(), plus)).isEqualTo(30)
        assertThat(IstDate.daysBetween(IstDate.today(), back)).isEqualTo(-30)
        // Crossing a year boundary.
        assertThat(IstDate.plusDays(400).take(4)).isNotEqualTo("????")
    }

    @Test
    fun `a monthly period spans the calendar month`() {
        val period = IstDate.currentPeriod(SubscriptionFrequency.Monthly, LocalDate.of(2026, 2, 14))
        assertThat(period.start).isEqualTo("2026-02-01")
        assertThat(period.end).isEqualTo("2026-02-28")
        // Leap year.
        val leap = IstDate.currentPeriod(SubscriptionFrequency.Monthly, LocalDate.of(2028, 2, 3))
        assertThat(leap.end).isEqualTo("2028-02-29")
    }

    @Test
    fun `a quarterly period spans the calendar quarter`() {
        val q3 = IstDate.currentPeriod(SubscriptionFrequency.Quarterly, LocalDate.of(2026, 8, 20))
        assertThat(q3.start).isEqualTo("2026-07-01")
        assertThat(q3.end).isEqualTo("2026-09-30")

        val q1 = IstDate.currentPeriod(SubscriptionFrequency.Quarterly, LocalDate.of(2026, 1, 1))
        assertThat(q1.start).isEqualTo("2026-01-01")
        assertThat(q1.end).isEqualTo("2026-03-31")

        val q4 = IstDate.currentPeriod(SubscriptionFrequency.Quarterly, LocalDate.of(2026, 12, 31))
        assertThat(q4.start).isEqualTo("2026-10-01")
        assertThat(q4.end).isEqualTo("2026-12-31")
    }

    @Test
    fun `the stored date is shown as dd-mm-yyyy and garbage passes through`() {
        assertThat(IstDate.fmtDdMmYyyy("2026-09-15")).isEqualTo("15-09-2026")
        assertThat(IstDate.fmtDdMmYyyy("2026-09-15 10:30:00")).isEqualTo("15-09-2026")
        assertThat(IstDate.fmtDdMmYyyy("not a date")).isEqualTo("not a date")
        assertThat(IstDate.fmtDdMmYyyy(null)).isEmpty()
    }

    @Test
    fun `month labels are localized`() {
        assertThat(IstDate.monthLabel("2026-09")).isEqualTo("September 2026")
        assertThat(IstDate.monthLabel("2026-09-15")).isEqualTo("September 2026")
        assertThat(IstDate.monthLabel("2026-01")).isEqualTo("January 2026")
        assertThat(IstDate.monthLabel("2026-09", malayalam = true)).isEqualTo("സെപ്റ്റംബർ 2026")
        assertThat(IstDate.monthShort("2026-09")).isEqualTo("Sep")
    }

    @Test
    fun `timestamps are read out in the app convention`() {
        assertThat(IstDate.fmtDateTime("2026-09-15 09:41:07")).isEqualTo("15-09-2026, 09:41")
        assertThat(IstDate.fmtTime("2026-09-15 09:41:07")).isEqualTo("09:41")
    }

    @Test
    fun `trailing months are continuous and end with the current one`() {
        val months = IstDate.trailingMonths(6)
        assertThat(months).hasSize(6)
        assertThat(months.last()).isEqualTo(IstDate.month())
        assertThat(months).containsNoDuplicates()
        // No gap: every step is exactly one month apart.
        months.zipWithNext().forEach { (a, b) ->
            assertThat(IstDate.monthLabel(b)).isNotEqualTo(IstDate.monthLabel(a))
        }
    }

    @Test
    fun `past detection drives the token-event delete guard`() {
        assertThat(IstDate.isPast("2000-01-01")).isTrue()
        assertThat(IstDate.isPast(IstDate.today())).isFalse()
        assertThat(IstDate.isPast(IstDate.plusDays(7))).isFalse()
        assertThat(IstDate.isPast(null)).isFalse()
    }

    @Test
    fun `frequency parses the stored setting text`() {
        assertThat(SubscriptionFrequency.from("Quarterly")).isEqualTo(SubscriptionFrequency.Quarterly)
        assertThat(SubscriptionFrequency.from("quarterly")).isEqualTo(SubscriptionFrequency.Quarterly)
        assertThat(SubscriptionFrequency.from("Monthly")).isEqualTo(SubscriptionFrequency.Monthly)
        assertThat(SubscriptionFrequency.from(null)).isEqualTo(SubscriptionFrequency.Monthly)
    }
}
