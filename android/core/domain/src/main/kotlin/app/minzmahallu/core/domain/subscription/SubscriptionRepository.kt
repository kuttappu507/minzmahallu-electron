package app.minzmahallu.core.domain.subscription

import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.PaymentMethod
import app.minzmahallu.core.common.PaymentStatus
import app.minzmahallu.core.common.ReceiptKind
import app.minzmahallu.core.common.SubscriptionFrequency
import app.minzmahallu.core.common.DocNumber
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.billing.AccountState
import app.minzmahallu.core.domain.billing.PreviousAllocation
import app.minzmahallu.core.domain.billing.SubscriptionAllocation
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.SubscriptionEntity
import app.minzmahallu.core.model.SubscriptionPayment
import app.minzmahallu.core.model.SubscriptionPaymentWithFamily
import app.minzmahallu.core.model.SubscriptionWithFamily
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The recurring subscription account.
 *
 * The model is the desktop app's (V030): exactly ONE row per family, rolled
 * forward every period; the money lives in the append-only
 * `subscription_payments` ledger. Every allocation goes through
 * [SubscriptionAllocation], the pure port of the TypeScript rule.
 */
@Singleton
class SubscriptionRepository @Inject constructor(
    private val dao: SubscriptionDao,
    private val families: FamilyDao,
    private val members: MemberDao,
    private val settings: SettingsDao,
    private val auth: AuthRepository,
) {

    data class RollResult(val created: Int, val rolledOver: Int, val rate: Double, val periodStart: String, val periodEnd: String)

    /**
     * Brings every active family's account up to the current period. Called on
     * app start and whenever the subscription list opens — the same
     * housekeeping the desktop performs behind `families:list`.
     */
    suspend fun ensureCurrentPeriod(): RollResult {
        val config = settings.get()
        val frequency = SubscriptionFrequency.from(config?.subscriptionFrequency)
        val period = IstDate.currentPeriod(frequency)
        val rate = (if (frequency == SubscriptionFrequency.Quarterly) {
            config?.subscriptionQuarterlyAmount ?: 0.0
        } else {
            config?.subscriptionMonthlyAmount ?: 0.0
        }).let { if (it <= 0) config?.subscriptionMonthlyAmount ?: 0.0 else it }
        if (rate <= 0) return RollResult(0, 0, rate, period.start, period.end)

        val plan = dao.planFor(frequency.wire) ?: dao.planFor(SubscriptionFrequency.Monthly.wire)
            ?: return RollResult(0, 0, rate, period.start, period.end)

        var created = 0
        var rolled = 0
        for (familyId in families.activeIds()) {
            val existing = dao.byFamily(familyId)
            if (existing == null) {
                dao.insert(
                    SubscriptionEntity(
                        familyId = familyId,
                        memberId = headId(familyId),
                        planId = plan.id,
                        periodStart = period.start,
                        periodEnd = period.end,
                        amount = rate,
                        amountPaid = 0.0,
                        status = PaymentStatus.Pending.wire,
                    ),
                )
                created++
                continue
            }
            // Always keep the account pointed at the current head.
            val currentHead = headId(familyId)
            val withHead = if (currentHead != null && currentHead != existing.memberId) {
                existing.copy(memberId = currentHead)
            } else {
                existing
            }
            if (existing.periodStart == period.start) {
                // Same period: adopt a mid-period rate change only while unpaid.
                if (existing.amountPaid == 0.0 && existing.amount != rate) {
                    dao.update(withHead.copy(amount = rate, updatedAt = IstDate.dateTimeStr()))
                } else if (withHead !== existing) {
                    dao.update(withHead.copy(updatedAt = IstDate.dateTimeStr()))
                }
                continue
            }
            val roll = SubscriptionAllocation.rollOver(
                closing = AccountState(
                    rate = existing.amount,
                    amountPaid = existing.amountPaid,
                    arrears = existing.arrears,
                    advance = existing.advance,
                ),
                newRate = rate,
            )
            // Safety net: a closing period paid through a path that bypassed
            // applyPayment is snapshotted into the ledger before the roll.
            if (existing.amountPaid > 0 &&
                dao.ledgerRowForPeriod(existing.id, existing.periodStart) == null
            ) {
                dao.insertPayment(
                    SubscriptionPayment(
                        subscriptionId = existing.id,
                        familyId = existing.familyId,
                        memberId = existing.memberId,
                        periodStart = existing.periodStart,
                        periodEnd = existing.periodEnd,
                        amount = existing.amountPaid,
                        receiptNumber = existing.receiptNumber,
                        paymentDate = existing.paymentDate ?: existing.periodStart,
                        paymentMethod = existing.paymentMethod ?: PaymentMethod.Cash.wire,
                        transactionRef = existing.transactionRef.orEmpty(),
                        collectedBy = existing.collectedBy,
                        remarks = existing.remarks.orEmpty(),
                    ),
                )
            }
            dao.update(
                withHead.copy(
                    planId = plan.id,
                    periodStart = period.start,
                    periodEnd = period.end,
                    amount = roll.rate,
                    amountPaid = roll.amountPaid,
                    paymentDate = null,
                    receiptNumber = null,
                    status = roll.status.wire,
                    arrears = roll.arrears,
                    advance = roll.advance,
                    advanceCovered = if (roll.advanceCovered) 1 else 0,
                    updatedAt = IstDate.dateTimeStr(),
                ),
            )
            if (roll.advanceCovered) {
                // Zero-cash ledger row: the money moved in a PAST period, this
                // one only records that the credit settled it.
                dao.insertPayment(
                    SubscriptionPayment(
                        subscriptionId = existing.id,
                        familyId = existing.familyId,
                        memberId = currentHead,
                        periodStart = period.start,
                        periodEnd = period.end,
                        amount = 0.0,
                        advanceUsed = roll.advanceUsed,
                        paymentMethod = "Advance",
                        remarks = "Covered by advance balance",
                    ),
                )
            }
            rolled++
        }
        return RollResult(created, rolled, rate, period.start, period.end)
    }

    /** The account is always recorded against the family HEAD (`is_head` first,
     *  then `relationship = 'Head'`), so a head change re-points the account. */
    private suspend fun headId(familyId: Long): Long? = members.headId(familyId)

    // ---------------------------------------------------------------- listing

    suspend fun page(
        search: String?,
        status: String?,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<SubscriptionWithFamily> {
        ensureCurrentPeriod()
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = dao.page(
            search = search?.trim()?.ifBlank { null },
            status = status,
            approval = approval,
            limit = pageSize,
            offset = (page - 1) * pageSize,
        )
        val total = dao.count(search?.trim()?.ifBlank { null }, status, approval)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): SubscriptionEntity = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun byFamily(familyId: Long): SubscriptionEntity? = dao.byFamily(familyId)

    /** Stamps the receipt as sent on WhatsApp; see SubscriptionDao. */
    suspend fun markReceiptSent(subscriptionId: Long, msgId: String? = null) =
        dao.markSubscriptionReceiptSent(subscriptionId, IstDate.dateTimeStr(), msgId)

    suspend fun paymentsHistory(familyId: Long, limit: Int = 60): List<SubscriptionPaymentWithFamily> =
        dao.paymentHistory(familyId, limit)

    suspend fun familyBalance(familyId: Long): Double = dao.familyBalance(familyId)

    suspend fun totalPending(): Double = dao.totalPending()

    suspend fun totalCollected(): Double = dao.totalCollected()

    // ------------------------------------------------------------------ write

    /**
     * Open a subscription account for a family. A family has exactly ONE —
     * the desktop refuses a second one and points the user at the existing row,
     * and so does this.
     */
    suspend fun create(
        familyId: Long,
        memberId: Long?,
        amountPaid: Double = 0.0,
        paymentMethod: PaymentMethod = PaymentMethod.Cash,
        transactionRef: String = "",
        remarks: String = "",
        paymentDate: String? = null,
    ): Long {
        val actor = auth.requireActor()
        if (dao.byFamily(familyId) != null) fail(ErrorKeys.ONE_SUBSCRIPTION_PER_FAMILY)

        val config = settings.get()
        val frequency = SubscriptionFrequency.from(config?.subscriptionFrequency)
        val period = IstDate.currentPeriod(frequency)
        val rate = config?.subscriptionMonthlyAmount ?: 0.0
        val plan = dao.planFor(frequency.wire) ?: dao.planFor(SubscriptionFrequency.Monthly.wire)
            ?: fail(ErrorKeys.NOT_FOUND, "subscription plan")

        // A Member/Staff entry stays PENDING and its first payment is PARKED —
        // no receipt, no money counted, until an admin approves.
        val pending = RoleAccess.createsPending(actor.role)
        val parked = if (pending && amountPaid > 0) amountPaid else null

        val id = dao.insert(
            SubscriptionEntity(
                familyId = familyId,
                memberId = memberId ?: headId(familyId),
                planId = plan.id,
                periodStart = period.start,
                periodEnd = period.end,
                amount = rate,
                amountPaid = 0.0,
                status = PaymentStatus.Pending.wire,
                paymentMethod = paymentMethod.wire,
                transactionRef = transactionRef,
                remarks = remarks,
                collectedBy = actor.id,
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
                pendingAmountPaid = parked,
                pendingPaymentMethod = parked?.let { paymentMethod.wire },
                pendingPaymentDate = parked?.let { paymentDate ?: IstDate.today() },
            ),
        )
        if (parked == null && amountPaid > 0) {
            applyPayment(
                id = id,
                amountPaid = amountPaid,
                paymentMethod = paymentMethod,
                transactionRef = transactionRef,
                remarks = remarks,
                paymentDate = paymentDate,
            )
        }
        auth.log(
            actor.id, actor.username, "CREATE", "subscriptions", id,
            if (pending) "Subscription account opened (awaiting approval)" else "Subscription account opened",
        )
        return id
    }

    /**
     * Record (or correct) this period's payment.
     *
     * Only *how much was given* may change: the family, member, period and rate
     * are locked, because the subscription is a recurring account. If a receipt
     * has already been generated for the period the edit is refused outright —
     * the copy the payee holds must keep matching the register in every field.
     */
    suspend fun applyPayment(
        id: Long,
        amountPaid: Double,
        paymentMethod: PaymentMethod = PaymentMethod.Cash,
        transactionRef: String = "",
        remarks: String = "",
        paymentDate: String? = null,
    ): PaymentReceipt {
        val actor = auth.requireActor()
        val account = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (account.approvalStatus == ApprovalStatus.Pending.wire) fail(ErrorKeys.AWAITING_APPROVAL)

        val active = dao.activeLedgerRowForPeriod(id, account.periodStart)
        if (active?.receiptGeneratedAt != null) fail(ErrorKeys.RECEIPT_FROZEN)

        val previous = dao.ledgerRowForPeriod(id, account.periodStart)
        val allocation = SubscriptionAllocation.apply(
            monthStart = AccountState(
                rate = account.amount,
                amountPaid = account.amountPaid,
                arrears = account.arrears,
                advance = account.advance,
            ),
            cashGiven = amountPaid,
            previous = previous?.let {
                PreviousAllocation(it.arrearsCleared, it.advanceAdded, it.advanceUsed)
            },
        )

        val date = paymentDate ?: IstDate.today()
        // A receipt number already issued for this period is NEVER renumbered.
        val receipt = previous?.receiptNumber?.takeIf { it.isNotBlank() }
            ?: nextReceiptNumber(date)

        val now = IstDate.dateTimeStr()
        if (previous != null) {
            dao.updatePayment(
                previous.copy(
                    memberId = account.memberId,
                    amount = maxOf(0.0, amountPaid),
                    arrearsCleared = allocation.arrearsCleared,
                    advanceAdded = allocation.advanceAdded,
                    advanceUsed = allocation.advanceUsed,
                    receiptNumber = receipt,
                    paymentDate = date,
                    paymentMethod = paymentMethod.wire,
                    transactionRef = transactionRef,
                    remarks = remarks,
                    status = "Active",
                    updatedAt = now,
                ),
            )
        } else {
            dao.insertPayment(
                SubscriptionPayment(
                    subscriptionId = id,
                    familyId = account.familyId,
                    memberId = account.memberId,
                    periodStart = account.periodStart,
                    periodEnd = account.periodEnd,
                    amount = maxOf(0.0, amountPaid),
                    arrearsCleared = allocation.arrearsCleared,
                    advanceAdded = allocation.advanceAdded,
                    advanceUsed = allocation.advanceUsed,
                    receiptNumber = receipt,
                    paymentDate = date,
                    paymentMethod = paymentMethod.wire,
                    transactionRef = transactionRef,
                    collectedBy = actor.id,
                    remarks = remarks,
                ),
            )
        }

        dao.update(
            account.copy(
                amountPaid = if (amountPaid > 0) allocation.monthTake else 0.0,
                arrears = allocation.arrears,
                advance = allocation.advance,
                paymentDate = if (amountPaid > 0) date else null,
                receiptNumber = if (amountPaid > 0) receipt else null,
                paymentMethod = paymentMethod.wire,
                transactionRef = transactionRef,
                status = allocation.status.wire,
                remarks = remarks,
                advanceCovered = 0,
                updatedAt = now,
            ),
        )

        auth.log(
            actor.id, actor.username, "PAYMENT", "subscriptions", id,
            "Subscription payment recorded (${amountPaid}) — receipt $receipt",
        )
        return PaymentReceipt(
            subscriptionId = id,
            receiptNumber = if (amountPaid > 0) receipt else "",
            status = allocation.status,
            amountPaid = maxOf(0.0, amountPaid),
            monthPaid = allocation.monthTake,
            arrears = allocation.arrears,
            advance = allocation.advance,
            dueTotal = allocation.dueTotal,
        )
    }

    /**
     * Cancel this period's payment (secure action). The month goes back to
     * unpaid and the ledger row is marked Cancelled — nothing is deleted, and
     * whatever the payment consumed is put back exactly.
     */
    suspend fun cancelPayment(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "SUBSCRIPTION_CANCEL", "Cancelled subscription payment #$id")
        val account = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        val active = dao.activeLedgerRowForPeriod(id, account.periodStart)
        val now = IstDate.dateTimeStr()
        if (active != null) {
            val restored = SubscriptionAllocation.cancel(
                current = AccountState(account.amount, account.amountPaid, account.arrears, account.advance),
                cancelled = PreviousAllocation(active.arrearsCleared, active.advanceAdded, active.advanceUsed),
            )
            dao.cancelPayment(active.id, now)
            dao.update(
                account.copy(
                    amountPaid = 0.0,
                    arrears = restored.arrears,
                    advance = restored.advance,
                    paymentDate = null,
                    receiptNumber = null,
                    status = PaymentStatus.Pending.wire,
                    advanceCovered = 0,
                    updatedAt = now,
                ),
            )
        } else {
            dao.update(
                account.copy(
                    amountPaid = 0.0,
                    paymentDate = null,
                    receiptNumber = null,
                    status = PaymentStatus.Pending.wire,
                    advanceCovered = 0,
                    updatedAt = now,
                ),
            )
        }
        auth.log(actor.id, actor.username, "CANCEL_PAYMENT", "subscriptions", id, "Payment cancelled: $reason")
    }

    /** Flags accounts carrying past-period debt as Overdue. */
    suspend fun markOverdue(): Int = dao.markOverdue(IstDate.dateTimeStr())

    /** Accounts whose current period the standing advance settled with no cash. */
    suspend fun advanceReady() = dao.advanceReady()

    private suspend fun nextReceiptNumber(date: String): String {
        val config = settings.get()
        val prefix = DocNumber.mahalluPrefix(config?.receiptPrefix, config?.mahalluName)
        return DocNumber.nextReceiptNumber(
            dateStr = date,
            kind = ReceiptKind.Subscription,
            mahalluPrefix = prefix,
            existingNumbers = dao.ledgerReceiptNumbers() + dao.legacyReceiptNumbers(),
        )
    }
}

data class PaymentReceipt(
    val subscriptionId: Long,
    val receiptNumber: String,
    val status: PaymentStatus,
    val amountPaid: Double,
    val monthPaid: Double,
    val arrears: Double,
    val advance: Double,
    val dueTotal: Double,
)
