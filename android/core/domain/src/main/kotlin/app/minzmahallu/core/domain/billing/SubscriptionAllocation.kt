package app.minzmahallu.core.domain.billing

import app.minzmahallu.core.common.Money
import app.minzmahallu.core.common.PaymentStatus

/**
 * The subscription allocation rule — the single most intricate piece of
 * business logic in the app, lifted verbatim from
 * `subscriptions.service.ts → applyPayment` into a pure function so it can be
 * tested without a database.
 *
 * Cash given this month is applied **oldest first**:
 *
 * 1. old arrears (debt carried from closed periods),
 * 2. this period's rate,
 * 3. anything left over becomes standing ADVANCE credit.
 *
 * Then the credit tops up a shortfall: "sub 120, advance 100, pays 20 ⇒ the
 * month must COMPLETE, not stay partial". A 0-cash edit never eats the credit.
 *
 * Re-recording a month first rolls the previous allocation back (each ledger
 * row remembers how much of its cash cleared arrears / became advance), so the
 * account is always exactly "period-start state + this period's cash".
 */
object SubscriptionAllocation {

    /** Half a paisa — the tolerance the ledger uses for "fully settled". */
    const val EPSILON = 0.004

    /**
     * @param monthStart the account state before this period's cash is applied.
     * @param previous the period's existing ledger row, when re-recording.
     */
    fun apply(monthStart: AccountState, cashGiven: Double, previous: PreviousAllocation?): Allocation {
        val rate = Money.round2(monthStart.rate)
        // Roll the previous allocation back to the period-start state.
        var arrears = monthStart.arrears + (previous?.arrearsCleared ?: 0.0)
        var advance = Money.round2(
            maxOf(
                0.0,
                monthStart.advance - (previous?.advanceAdded ?: 0.0) + (previous?.advanceUsed ?: 0.0),
            ),
        )
        val cash = maxOf(0.0, Money.round2(cashGiven))

        // 1) old dues
        val arrearsTake = minOf(arrears, cash)
        arrears = Money.round2(arrears - arrearsTake)
        val afterArrears = Money.round2(cash - arrearsTake)
        // 2) this period
        var monthTake = minOf(rate, afterArrears)
        // 3) the rest is credit
        val advanceAdded = Money.round2(afterArrears - monthTake)
        advance = Money.round2(advance + advanceAdded)
        // 4) credit covers the shortfall
        var advanceUsed = 0.0
        val shortfall = Money.round2(rate - monthTake)
        if (cash > 0 && shortfall > EPSILON && advance > 0) {
            advanceUsed = minOf(shortfall, advance)
            monthTake = Money.round2(monthTake + advanceUsed)
            advance = Money.round2(advance - advanceUsed)
        }

        val status = when {
            cash <= 0 -> PaymentStatus.Pending
            arrears <= EPSILON && monthTake >= rate -> PaymentStatus.Paid
            else -> PaymentStatus.Partial
        }

        // The account's dues after this payment — never negative: an overpaid
        // family is "paid ahead", not "minus pending".
        val dueTotal = maxOf(0.0, Money.round2(arrears + maxOf(0.0, rate - monthTake) - advance))

        return Allocation(
            arrearsCleared = arrearsTake,
            advanceAdded = advanceAdded,
            advanceUsed = advanceUsed,
            monthTake = monthTake,
            arrears = arrears,
            advance = advance,
            status = status,
            dueTotal = dueTotal,
            settledByCreditOnly = cash > 0 && arrearsTake == 0.0 && advanceUsed > 0,
        )
    }

    /**
     * The monthly roll-over: closing a period and opening the next one on the
     * SAME account row. Ported from `ensureCurrentMonth`.
     *
     * The closing period's unpaid balance becomes arrears; an overpayment
     * becomes advance. The two then net against each other, and when the
     * standing credit covers the whole fresh rate the new period is settled
     * with **no cash at all** — "paid 500 for a 120 sub ⇒ the next months
     * happen on their own".
     */
    fun rollOver(closing: AccountState, newRate: Double): RollOver {
        val rate = Money.round2(newRate)
        val closingPaid = Money.round2(closing.amountPaid)
        val closingRate = Money.round2(closing.rate)

        var arrears = closing.arrears
        var advance = closing.advance
        if (closingPaid < closingRate) {
            arrears = Money.round2(arrears + (closingRate - closingPaid))
        } else if (closingPaid > closingRate) {
            advance = Money.round2(advance + (closingPaid - closingRate))
        }
        // Credit eats debt before anything else.
        val offset = minOf(arrears, advance)
        arrears = Money.round2(arrears - offset)
        advance = Money.round2(advance - offset)

        var advanceCovered = false
        var advanceUsed = 0.0
        if (arrears <= EPSILON && rate > 0 && advance + EPSILON >= rate) {
            advanceCovered = true
            advanceUsed = rate
            advance = Money.round2(advance - rate)
        }

        return RollOver(
            arrears = arrears,
            advance = advance,
            amountPaid = if (advanceCovered) rate else 0.0,
            status = if (advanceCovered) PaymentStatus.Paid else PaymentStatus.Pending,
            advanceCovered = advanceCovered,
            advanceUsed = advanceUsed,
            rate = rate,
        )
    }

    /**
     * Undo a period's payment exactly — the inverse of [apply] using what the
     * cancelled ledger row recorded.
     */
    fun cancel(current: AccountState, cancelled: PreviousAllocation): AccountState =
        AccountState(
            rate = current.rate,
            amountPaid = 0.0,
            arrears = maxOf(0.0, Money.round2(current.arrears + cancelled.arrearsCleared)),
            advance = maxOf(
                0.0,
                Money.round2(current.advance - cancelled.advanceAdded + cancelled.advanceUsed),
            ),
        )
}

/** A subscription account's state at the start of a billing period. */
data class AccountState(
    val rate: Double,
    val amountPaid: Double,
    val arrears: Double,
    val advance: Double,
)

/** What the period's existing ledger row consumed, so it can be rolled back. */
data class PreviousAllocation(
    val arrearsCleared: Double,
    val advanceAdded: Double,
    val advanceUsed: Double,
)

data class Allocation(
    val arrearsCleared: Double,
    val advanceAdded: Double,
    val advanceUsed: Double,
    val monthTake: Double,
    val arrears: Double,
    val advance: Double,
    val status: PaymentStatus,
    val dueTotal: Double,
    /** True when the credit, not cash, is what settled the period. */
    val settledByCreditOnly: Boolean,
)

data class RollOver(
    val arrears: Double,
    val advance: Double,
    val amountPaid: Double,
    val status: PaymentStatus,
    val advanceCovered: Boolean,
    val advanceUsed: Double,
    val rate: Double,
)
