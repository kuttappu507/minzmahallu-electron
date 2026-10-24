package app.minzmahallu.core.domain.finance

import app.minzmahallu.core.common.DocNumber
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.LedgerEntryStatus
import app.minzmahallu.core.common.LedgerType
import app.minzmahallu.core.common.Money
import app.minzmahallu.core.database.dao.AssetDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.LedgerDao
import app.minzmahallu.core.database.dao.StaffDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.database.dao.WelfareDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.AssetEntity
import app.minzmahallu.core.model.LedgerAccount
import app.minzmahallu.core.model.TransactionEntity
import app.minzmahallu.core.model.TransactionWithRefs
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The manual ledger, plus the UNIFIED view that the dashboard and every
 * financial report read.
 *
 * The unified ledger is the desktop app's rule: the fund balance is not just
 * the `transactions` table — it is manual entries **plus** donations **plus**
 * paid subscriptions **minus** welfare disbursements **minus** paid salaries.
 * Summing only the manual table made the dashboard disagree with the accounting
 * page, which is exactly what this class prevents.
 */
@Singleton
class AccountingRepository @Inject constructor(
    private val ledger: LedgerDao,
    private val donations: DonationDao,
    private val subscriptions: SubscriptionDao,
    private val welfare: WelfareDao,
    private val staff: StaffDao,
    private val assets: AssetDao,
    private val auth: AuthRepository,
) {

    data class Period(val from: String?, val to: String?)

    /** `all | this_month | last_month | this_quarter | last_quarter | this_year | last_year | custom`. */
    fun resolvePeriod(preset: String, from: String? = null, to: String? = null): Period {
        val today = IstDate.now().toLocalDate()
        return when (preset) {
            "all" -> Period(null, null)
            "custom" -> Period(from, to)
            "this_month" -> Period(
                today.withDayOfMonth(1).toString(),
                today.withDayOfMonth(1).plusMonths(1).minusDays(1).toString(),
            )

            "last_month" -> {
                val start = today.minusMonths(1).withDayOfMonth(1)
                Period(start.toString(), start.plusMonths(1).minusDays(1).toString())
            }

            "this_quarter" -> {
                val startMonth = ((today.monthValue - 1) / 3) * 3 + 1
                val start = today.withMonth(startMonth).withDayOfMonth(1)
                Period(start.toString(), start.plusMonths(3).minusDays(1).toString())
            }

            "last_quarter" -> {
                val startMonth = ((today.monthValue - 1) / 3) * 3 + 1
                val end = today.withMonth(startMonth).withDayOfMonth(1).minusDays(1)
                val start = end.withDayOfMonth(1).minusMonths(2)
                Period(start.toString(), end.toString())
            }

            "this_year" -> Period("${today.year}-01-01", "${today.year}-12-31")
            "last_year" -> Period("${today.year - 1}-01-01", "${today.year - 1}-12-31")
            else -> Period(null, null)
        }
    }

    suspend fun page(
        search: String?,
        type: String?,
        preset: String = "all",
        from: String? = null,
        to: String? = null,
        includeVoid: Boolean = false,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<TransactionWithRefs> {
        val range = resolvePeriod(preset, from, to)
        val q = search?.trim()?.ifBlank { null }
        val rows = ledger.page(
            q, type, range.from, range.to,
            if (includeVoid) 1 else 0, pageSize, (page - 1) * pageSize,
        )
        val total = ledger.count(q, type, range.from, range.to, if (includeVoid) 1 else 0)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): TransactionEntity = ledger.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun accounts(): List<LedgerAccount> = ledger.accounts()

    suspend fun assetOptions(): List<AssetEntity> = assets.options()

    /**
     * Create a manual entry. Receipt numbers are never reused (the suffix-max
     * scheme, not MAX(id)+1, so a typed high number cannot be collided with),
     * a voucher reference is auto-filled, and a repeated bill number is
     * *warned about* rather than blocked — a duplicate-payment red flag.
     */
    suspend fun create(input: LedgerInput): CreatedEntry {
        val actor = auth.requireActor()
        if (input.amount <= 0) fail(ErrorKeys.VALIDATION, "amount")
        val date = input.txnDate ?: IstDate.today()

        if (input.assetId != null && ledger.assetById(input.assetId) == null) fail(ErrorKeys.ASSET_MISSING)

        val receipt = input.receiptNumber?.trim()?.ifBlank { null }
            ?: DocNumber.nextLedgerNumber(ledger.receiptNumbers())
        val voucher = input.voucherNo?.trim()?.ifBlank { null }
            ?: DocNumber.nextVoucherNumber(IstDate.now().year, ((ledger.maxId() ?: 0L) + 1).toInt())

        val duplicate = input.billNo?.trim()?.takeIf { it.isNotBlank() }?.let {
            ledger.duplicateBill(it, -1)
        }

        val id = ledger.insert(
            TransactionEntity(
                txnDate = date,
                accountId = input.accountId,
                type = input.type.wire,
                amount = input.amount,
                paymentMethod = input.paymentMethod,
                description = input.description.trim().ifBlank { null },
                receiptNumber = receipt,
                transactionRef = input.transactionRef.trim().ifBlank { null },
                voucherNo = voucher,
                billNo = input.billNo?.trim()?.ifBlank { null },
                payee = input.payee?.trim()?.ifBlank { null },
                category = input.category?.trim()?.ifBlank { null },
                assetId = input.assetId,
                status = LedgerEntryStatus.Posted.wire,
                createdBy = actor.id,
            ),
        )
        auth.log(
            actor.id, actor.username, "CREATE", "accounting", id,
            "${input.type.wire} ${input.amount} — $receipt / $voucher",
        )
        return CreatedEntry(id, receipt, voucher, duplicate)
    }

    suspend fun update(id: Long, input: LedgerInput, adminPassword: String, reason: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "LEDGER_EDIT", reason)
        val existing = ledger.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (existing.status == LedgerEntryStatus.Void.wire) fail(ErrorKeys.VOIDED)
        if (input.assetId != null && ledger.assetById(input.assetId) == null) fail(ErrorKeys.ASSET_MISSING)
        ledger.update(
            existing.copy(
                txnDate = input.txnDate ?: existing.txnDate,
                accountId = input.accountId,
                type = input.type.wire,
                amount = input.amount,
                paymentMethod = input.paymentMethod,
                description = input.description.trim().ifBlank { null },
                transactionRef = input.transactionRef.trim().ifBlank { null },
                voucherNo = input.voucherNo?.trim()?.ifBlank { null },
                billNo = input.billNo?.trim()?.ifBlank { null },
                payee = input.payee?.trim()?.ifBlank { null },
                category = input.category?.trim()?.ifBlank { null },
                assetId = input.assetId,
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "UPDATE", "accounting", id, "Ledger entry edited: $reason")
    }

    /**
     * VOID instead of delete: the receipt number stays occupied and the entry
     * stays visible (struck through) with who, when and why.
     */
    suspend fun void(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "LEDGER_VOID", reason)
        val existing = ledger.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (existing.status == LedgerEntryStatus.Void.wire) fail(ErrorKeys.VOIDED)
        ledger.markVoid(id, reason.trim(), IstDate.dateTimeStr(), actor.id)
        auth.log(actor.id, actor.username, "VOID", "accounting", id, "Entry ${existing.receiptNumber} voided: ${reason.trim()}")
    }

    /** Continuity check: gaps in the receipt sequence can only mean tampering. */
    suspend fun receiptSequence(): ReceiptSequence {
        val rows = ledger.page(null, null, null, null, 1, Int.MAX_VALUE, 0)
        val numbers = rows.mapNotNull { it.transaction.receiptNumber }
            .filter { it.startsWith("TXN-") }
            .mapNotNull { it.removePrefix("TXN-").toIntOrNull() }
            .sorted()
        val missing = mutableListOf<Int>()
        for (i in 1 until numbers.size) {
            for (n in numbers[i - 1] + 1 until numbers[i]) missing += n
        }
        return ReceiptSequence(count = numbers.size, missing = missing)
    }

    // -------------------------------------------------------- unified ledger

    /**
     * Every money movement in one place, each tagged with where it came from so
     * the list can badge it. This is the single source the dashboard, the
     * income/expense chart and the fund-balance card all read.
     */
    suspend fun unifiedSummary(preset: String = "all", from: String? = null, to: String? = null): UnifiedSummary {
        if (preset == "all") {
            val income = ledger.totalIncome() + donations.totalAll() + subscriptions.collectionsTotal()
            val expense = ledger.totalExpense() + welfare.disbursedTotal() + staff.paidTotal(null)
            return UnifiedSummary(
                income = Money.round2(income),
                expense = Money.round2(expense),
                balance = Money.round2(income - expense),
                manualIncome = Money.round2(ledger.totalIncome()),
                manualExpense = Money.round2(ledger.totalExpense()),
            )
        }
        var income = 0.0
        var expense = 0.0
        var manualIncome = 0.0
        var manualExpense = 0.0
        var donationIncome = 0.0
        var subscriptionIncome = 0.0
        for (month in monthKeysFor(preset, from, to)) {
            val mi = ledger.incomeInMonth(month)
            val me = ledger.expenseInMonth(month)
            manualIncome += mi
            manualExpense += me
            donationIncome += donations.totalInMonth(month)
            subscriptionIncome += subscriptions.collectionsInMonth(month)
            income += mi + donationIncome + subscriptionIncome
            expense += me + welfare.disbursedInMonth(month) + staff.paidTotalFor(
                month.substring(0, 4).toInt(),
                month.substring(5, 7).toInt(),
            )
        }
        return UnifiedSummary(
            income = Money.round2(income),
            expense = Money.round2(expense),
            balance = Money.round2(income - expense),
            manualIncome = Money.round2(manualIncome),
            manualExpense = Money.round2(manualExpense),
        )
    }

    /** The fund balance — the number the dashboard hero shows. */
    suspend fun balance(): Double = unifiedSummary("all").balance

    /** Month keys covered by a preset, for the per-month aggregation above. */
    private fun monthKeysFor(preset: String, from: String?, to: String?): List<String> {
        val range = resolvePeriod(preset, from, to)
        if (range.from == null || range.to == null) {
            // "all": enumerate every month from the earliest plausible record.
            return (2000..IstDate.now().year).flatMap { y -> (1..12).map { "%04d-%02d".format(y, it) } }
                .filter { it <= IstDate.month() }
        }
        val start = java.time.LocalDate.parse(range.from).withDayOfMonth(1)
        val end = java.time.LocalDate.parse(range.to)
        val out = mutableListOf<String>()
        var cursor = start
        while (!cursor.isAfter(end)) {
            out += "%04d-%02d".format(cursor.year, cursor.monthValue)
            cursor = cursor.plusMonths(1)
        }
        return out
    }
}

data class LedgerInput(
    val txnDate: String?,
    val accountId: Long,
    val type: LedgerType,
    val amount: Double,
    val paymentMethod: String = "Cash",
    val description: String = "",
    val receiptNumber: String? = null,
    val transactionRef: String = "",
    val voucherNo: String? = null,
    val billNo: String? = null,
    val payee: String? = null,
    val category: String? = null,
    val assetId: Long? = null,
)

data class CreatedEntry(
    val id: Long,
    val receiptNumber: String,
    val voucherNo: String,
    val duplicateBill: app.minzmahallu.core.database.dao.DuplicateBill?,
)

data class ReceiptSequence(val count: Int, val missing: List<Int>)

data class UnifiedSummary(
    val income: Double,
    val expense: Double,
    val balance: Double,
    val manualIncome: Double,
    val manualExpense: Double,
)
