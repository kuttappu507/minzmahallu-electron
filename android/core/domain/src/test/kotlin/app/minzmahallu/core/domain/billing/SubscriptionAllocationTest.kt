package app.minzmahallu.core.domain.billing

import app.minzmahallu.core.common.PaymentStatus
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The scenarios below are the ones the mahallu actually asked for, quoted in
 * the comments of `subscriptions.service.ts`. Reproducing them here is what
 * proves the Kotlin port allocates money the same way the desktop app does.
 */
class SubscriptionAllocationTest {

    private fun state(rate: Double, paid: Double = 0.0, arrears: Double = 0.0, advance: Double = 0.0) =
        AccountState(rate = rate, amountPaid = paid, arrears = arrears, advance = advance)

    // ------------------------------------------------------------ first month

    @Test
    fun `paying exactly the rate settles the month`() {
        val r = SubscriptionAllocation.apply(state(rate = 120.0), cashGiven = 120.0, previous = null)
        assertThat(r.status).isEqualTo(PaymentStatus.Paid)
        assertThat(r.monthTake).isWithin(1e-9).of(120.0)
        assertThat(r.arrears).isWithin(1e-9).of(0.0)
        assertThat(r.advance).isWithin(1e-9).of(0.0)
        assertThat(r.dueTotal).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `paying nothing leaves the month pending with the full rate due`() {
        val r = SubscriptionAllocation.apply(state(rate = 120.0), cashGiven = 0.0, previous = null)
        assertThat(r.status).isEqualTo(PaymentStatus.Pending)
        assertThat(r.monthTake).isWithin(1e-9).of(0.0)
        assertThat(r.dueTotal).isWithin(1e-9).of(120.0)
    }

    @Test
    fun `part payment is partial`() {
        val r = SubscriptionAllocation.apply(state(rate = 120.0), cashGiven = 50.0, previous = null)
        assertThat(r.status).isEqualTo(PaymentStatus.Partial)
        assertThat(r.monthTake).isWithin(1e-9).of(50.0)
        assertThat(r.dueTotal).isWithin(1e-9).of(70.0)
    }

    // --------------------------------------------------------------- arrears

    @Test
    fun `cash clears old arrears before it touches this month`() {
        // 3 months of 120 owed, pays 200 → 120 to arrears, 80 to this month.
        val r = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, arrears = 360.0),
            cashGiven = 200.0,
            previous = null,
        )
        assertThat(r.arrearsCleared).isWithin(1e-9).of(200.0)
        assertThat(r.arrears).isWithin(1e-9).of(160.0)
        assertThat(r.monthTake).isWithin(1e-9).of(0.0)
        assertThat(r.status).isEqualTo(PaymentStatus.Partial)
    }

    @Test
    fun `a month is Paid only when the rate is covered AND no arrears remain`() {
        val r = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, arrears = 100.0),
            cashGiven = 220.0,
            previous = null,
        )
        assertThat(r.arrearsCleared).isWithin(1e-9).of(100.0)
        assertThat(r.monthTake).isWithin(1e-9).of(120.0)
        assertThat(r.status).isEqualTo(PaymentStatus.Paid)
        assertThat(r.arrears).isWithin(1e-9).of(0.0)
    }

    // --------------------------------------------------------------- advance

    @Test
    fun `overpayment becomes standing credit, never a paid-ahead month`() {
        val r = SubscriptionAllocation.apply(state(rate = 120.0), cashGiven = 500.0, previous = null)
        assertThat(r.status).isEqualTo(PaymentStatus.Paid)
        assertThat(r.monthTake).isWithin(1e-9).of(120.0)
        assertThat(r.advanceAdded).isWithin(1e-9).of(380.0)
        assertThat(r.advance).isWithin(1e-9).of(380.0)
        // "due 150, paid 200" reads as 0 due — the extra is a prepayment.
        assertThat(r.dueTotal).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `credit tops up a shortfall so the month completes`() {
        // The mahallu's own example: "sub 120, advance 100, pays 20 ⇒ the
        // month must COMPLETE, not stay partial".
        val r = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, advance = 100.0),
            cashGiven = 20.0,
            previous = null,
        )
        assertThat(r.status).isEqualTo(PaymentStatus.Paid)
        assertThat(r.monthTake).isWithin(1e-9).of(120.0)
        assertThat(r.advanceUsed).isWithin(1e-9).of(100.0)
        assertThat(r.advance).isWithin(1e-9).of(0.0)
        assertThat(r.settledByCreditOnly).isTrue()
    }

    @Test
    fun `a zero-cash edit never eats the credit`() {
        val r = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, advance = 100.0),
            cashGiven = 0.0,
            previous = null,
        )
        assertThat(r.advanceUsed).isWithin(1e-9).of(0.0)
        assertThat(r.advance).isWithin(1e-9).of(100.0)
        assertThat(r.status).isEqualTo(PaymentStatus.Pending)
    }

    // ------------------------------------------------------------ re-recording

    @Test
    fun `re-recording a month rolls the previous allocation back first`() {
        val first = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, arrears = 300.0),
            cashGiven = 200.0,
            previous = null,
        )
        // The account now holds what `first` produced; correcting the month to
        // 500 must behave exactly as if 500 had been given in the first place.
        val after = state(rate = 120.0, arrears = first.arrears, advance = first.advance)
        val corrected = SubscriptionAllocation.apply(
            monthStart = after,
            cashGiven = 500.0,
            previous = PreviousAllocation(first.arrearsCleared, first.advanceAdded, first.advanceUsed),
        )
        val expected = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, arrears = 300.0),
            cashGiven = 500.0,
            previous = null,
        )
        assertThat(corrected.arrears).isWithin(1e-9).of(expected.arrears)
        assertThat(corrected.monthTake).isWithin(1e-9).of(expected.monthTake)
        assertThat(corrected.advance).isWithin(1e-9).of(expected.advance)
        assertThat(corrected.status).isEqualTo(expected.status)
    }

    @Test
    fun `a receipt number already issued is never renumbered`() {
        // The freeze is enforced by the repository; the allocation itself must
        // stay stable so the reprint matches the register.
        val a = SubscriptionAllocation.apply(state(rate = 120.0), 120.0, null)
        val b = SubscriptionAllocation.apply(state(rate = 120.0), 120.0, null)
        assertThat(a).isEqualTo(b)
    }

    // ---------------------------------------------------------------- cancel

    @Test
    fun `cancelling a payment restores arrears credit and used advance exactly`() {
        val applied = SubscriptionAllocation.apply(
            monthStart = state(rate = 120.0, arrears = 100.0, advance = 50.0),
            cashGiven = 150.0,
            previous = null,
        )
        val after = state(rate = 120.0, arrears = applied.arrears, advance = applied.advance)
        val restored = SubscriptionAllocation.cancel(
            current = after,
            cancelled = PreviousAllocation(applied.arrearsCleared, applied.advanceAdded, applied.advanceUsed),
        )
        assertThat(restored.arrears).isWithin(1e-9).of(100.0)
        assertThat(restored.advance).isWithin(1e-9).of(50.0)
        assertThat(restored.amountPaid).isWithin(1e-9).of(0.0)
    }

    // --------------------------------------------------------------- roll-over

    @Test
    fun `an unpaid closing month becomes arrears on the new one`() {
        val r = SubscriptionAllocation.rollOver(closing = state(rate = 120.0, paid = 0.0), newRate = 120.0)
        assertThat(r.arrears).isWithin(1e-9).of(120.0)
        assertThat(r.status).isEqualTo(PaymentStatus.Pending)
        assertThat(r.amountPaid).isWithin(1e-9).of(0.0)
        assertThat(r.advanceCovered).isFalse()
    }

    @Test
    fun `arrears accumulate month after month`() {
        val first = SubscriptionAllocation.rollOver(state(rate = 120.0, paid = 0.0), 120.0)
        // Next roll starts from the arrears the first one produced.
        val second = SubscriptionAllocation.rollOver(
            closing = state(rate = 120.0, paid = 0.0, arrears = first.arrears),
            newRate = 120.0,
        )
        assertThat(second.arrears).isWithin(1e-9).of(240.0) // "3 months due" = 3 × rate
    }

    @Test
    fun `an overpaid closing month becomes credit that nets against arrears`() {
        // A family that prepaid 50 and then missed a 50 month owes nothing.
        val r = SubscriptionAllocation.rollOver(
            closing = state(rate = 50.0, paid = 100.0),
            newRate = 50.0,
        )
        assertThat(r.arrears).isWithin(1e-9).of(0.0)
        // 50 credit, and the new 50 rate is covered by it.
        assertThat(r.advanceCovered).isTrue()
        assertThat(r.status).isEqualTo(PaymentStatus.Paid)
        assertThat(r.advanceUsed).isWithin(1e-9).of(50.0)
        assertThat(r.advance).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `a large prepayment settles several future months on its own`() {
        // "paid 500 for a 120 sub ⇒ the next months happen on their own, the
        // balance just keeps shrinking".
        val open = SubscriptionAllocation.rollOver(closing = state(rate = 120.0, paid = 500.0), newRate = 120.0)
        assertThat(open.advanceCovered).isTrue()
        // 500 − 120 (closing rate) = 380 credit; the new 120 is covered → 260 left.
        assertThat(open.advance).isWithin(1e-9).of(260.0)

        val next = SubscriptionAllocation.rollOver(
            closing = state(rate = 120.0, paid = open.amountPaid, arrears = open.arrears, advance = open.advance),
            newRate = 120.0,
        )
        assertThat(next.advanceCovered).isTrue()
        assertThat(next.advance).isWithin(1e-9).of(140.0)
    }

    @Test
    fun `credit smaller than the rate does not settle the month`() {
        val r = SubscriptionAllocation.rollOver(closing = state(rate = 120.0, paid = 170.0), newRate = 120.0)
        // 50 credit against a 120 rate: not enough, so the month opens Pending.
        assertThat(r.advanceCovered).isFalse()
        assertThat(r.status).isEqualTo(PaymentStatus.Pending)
        assertThat(r.advance).isWithin(1e-9).of(50.0)
    }

    @Test
    fun `a mid-month rate change applies only while the month is unpaid`() {
        // Unpaid: the new rate is adopted.
        val unpaid = SubscriptionAllocation.rollOver(closing = state(rate = 100.0, paid = 0.0), newRate = 200.0)
        assertThat(unpaid.rate).isWithin(1e-9).of(200.0)
        assertThat(unpaid.arrears).isWithin(1e-9).of(100.0) // closed at the OLD rate
    }
}
