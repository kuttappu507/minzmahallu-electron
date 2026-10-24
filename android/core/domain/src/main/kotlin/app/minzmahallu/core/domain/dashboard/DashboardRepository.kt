package app.minzmahallu.core.domain.dashboard

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.database.dao.AssetDao
import app.minzmahallu.core.database.dao.AuditDao
import app.minzmahallu.core.database.dao.CertificateDao
import app.minzmahallu.core.database.dao.CommitteeDao
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.LedgerDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.StaffDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.database.dao.WelfareDao
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.finance.AccountingRepository
import app.minzmahallu.core.model.AuditEntry
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Everything the dashboard shows, computed the same way the desktop does.
 *
 * The two numbers that used to disagree with the Accounting page — the fund
 * balance and the income/expense chart — are read from
 * [AccountingRepository.unifiedSummary], so the hero card and the ledger can
 * never tell two different stories.
 */
@Singleton
class DashboardRepository @Inject constructor(
    private val families: FamilyDao,
    private val members: MemberDao,
    private val subscriptions: SubscriptionDao,
    private val donations: DonationDao,
    private val ledger: LedgerDao,
    private val welfare: WelfareDao,
    private val marriages: MarriageDao,
    private val deaths: DeathDao,
    private val certificates: CertificateDao,
    private val committee: CommitteeDao,
    private val staff: StaffDao,
    private val assets: AssetDao,
    private val audit: AuditDao,
    private val accounting: AccountingRepository,
    private val auth: AuthRepository,
) {

    /** The headline counters. */
    suspend fun summary(): DashboardSummary {
        val year = IstDate.now().year.toString()
        val month = IstDate.month()
        return DashboardSummary(
            totalFamilies = families.count(null, "Active", null),
            totalMembers = members.count(null, null, "Active", null),
            monthlyCollection = subscriptions.collectionsInMonth(month),
            pendingDues = subscriptions.totalPending(),
            monthlyDonations = donations.totalInMonth(month),
            welfareBeneficiaries = welfare.beneficiariesInYear(year),
            marriagesThisYear = marriages.countInYear(year),
            deathsThisYear = deaths.countInYear(year),
        )
    }

    /** Fund balance from the unified ledger. */
    suspend fun balance(): Double = accounting.balance()

    /** Last [months] months of collections, zero-filled and oldest-first. */
    suspend fun monthlyCollections(months: Int = 6): List<MonthPoint> {
        val keys = IstDate.trailingMonths(months)
        return keys.map { MonthPoint(it, subscriptions.collectionsInMonth(it)) }
    }

    /** Last [months] months of donations, zero-filled and oldest-first. */
    suspend fun monthlyDonations(months: Int = 6): List<MonthPoint> {
        val keys = IstDate.trailingMonths(months)
        return keys.map { MonthPoint(it, donations.totalInMonth(it)) }
    }

    /**
     * Income vs expense per month, from the SAME unified ledger the Accounting
     * page reads — manual entries, donations and paid subscriptions as income;
     * manual expenses, welfare disbursements and paid salaries as expense.
     */
    suspend fun incomeVsExpense(months: Int = 6): List<IncomeExpensePoint> {
        val keys = IstDate.trailingMonths(months)
        return keys.map { month ->
            val year = month.substring(0, 4).toInt()
            val m = month.substring(5, 7).toInt()
            IncomeExpensePoint(
                month = month,
                income = ledger.incomeInMonth(month) +
                    donations.totalInMonth(month) +
                    subscriptions.collectionsInMonth(month),
                expense = ledger.expenseInMonth(month) +
                    welfare.disbursedInMonth(month) +
                    staff.paidTotalFor(year, m),
            )
        }
    }

    suspend fun recentActivity(limit: Int = 8): List<AuditEntry> = audit.recent(limit)

    /** "Today at a glance" — receipts, donations, pending welfare, balance. */
    suspend fun todayAtGlance(): TodayGlance {
        val today = IstDate.today()
        return TodayGlance(
            receiptsToday = subscriptions.receiptCountOn(today) + donations.countOnDay(today),
            donationsToday = donations.totalOnDay(today),
            welfarePending = welfare.pendingCount(),
            fundBalance = accounting.balance(),
        )
    }

    /**
     * The alert strip: committee terms ending within 30 days, overdue
     * subscriptions, pending welfare, and gaps in the receipt sequence (which
     * can only mean the database was edited by hand).
     */
    suspend fun alerts(): List<DashboardAlert> {
        val out = mutableListOf<DashboardAlert>()
        val endingSoon = committee.termsEndingSoon(IstDate.today(), IstDate.plusDays(30))
        if (endingSoon > 0) out += DashboardAlert("committee_ending", endingSoon, Destination.Committee)

        val overdue = subscriptions.count(null, "Overdue", null)
        if (overdue > 0) out += DashboardAlert("subscriptions_overdue", overdue, Destination.Subscriptions)

        val pendingWelfare = welfare.pendingCount()
        if (pendingWelfare > 0) out += DashboardAlert("welfare_pending", pendingWelfare, Destination.Welfare)

        runCatching {
            val gaps = accounting.receiptSequence().missing
            if (gaps.isNotEmpty()) out += DashboardAlert("receipt_gaps", gaps.size, Destination.Accounting)
        }
        return out
    }

    /** Asset register headline numbers, for the Assets tile. */
    suspend fun assetSummary(): AssetSummary = AssetSummary(
        count = assets.count(),
        acquisitionTotal = assets.acquisitionTotal(),
        currentTotal = assets.currentTotal(),
        monthlyRent = assets.monthlyRentTotal(),
    )
}

data class DashboardSummary(
    val totalFamilies: Int,
    val totalMembers: Int,
    val monthlyCollection: Double,
    val pendingDues: Double,
    val monthlyDonations: Double,
    val welfareBeneficiaries: Int,
    val marriagesThisYear: Int,
    val deathsThisYear: Int,
)

data class MonthPoint(val month: String, val amount: Double)

data class IncomeExpensePoint(val month: String, val income: Double, val expense: Double)

data class TodayGlance(
    val receiptsToday: Int,
    val donationsToday: Double,
    val welfarePending: Int,
    val fundBalance: Double,
)

data class DashboardAlert(val type: String, val count: Int, val destination: Destination)

data class AssetSummary(
    val count: Int,
    val acquisitionTotal: Double,
    val currentTotal: Double,
    val monthlyRent: Double,
)

enum class Destination { Dashboard, Subscriptions, Donations, Welfare, Accounting, Committee, Assets, Approvals }
