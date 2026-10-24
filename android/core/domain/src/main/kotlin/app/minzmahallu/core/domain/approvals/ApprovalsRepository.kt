package app.minzmahallu.core.domain.approvals

import app.minzmahallu.core.common.ApprovalKind
import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Money
import app.minzmahallu.core.common.PaymentMethod
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.domain.subscription.SubscriptionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The pending-approval queue (V037).
 *
 * Member accounts can hand in donations and subscriptions; Staff accounts can
 * additionally add nikah, death, families and members. Those entries land with
 * `approval_status = 'pending'` and are **not** counted in any ledger,
 * dashboard or printed register until an Administrator or Secretary approves
 * them here. Rejecting removes the entry — it was never official — and the
 * decision is recorded in the audit log.
 */
@Singleton
class ApprovalsRepository @Inject constructor(
    private val donations: DonationDao,
    private val subscriptions: SubscriptionDao,
    private val families: FamilyDao,
    private val members: MemberDao,
    private val marriages: MarriageDao,
    private val deaths: DeathDao,
    private val subscriptionRepository: SubscriptionRepository,
    private val auth: AuthRepository,
) {

    /** Every pending entry, newest first, in one display shape. */
    suspend fun list(): List<PendingEntry> {
        val out = mutableListOf<PendingEntry>()

        donations.page(null, null, ApprovalStatus.Pending.wire, null, null, 500, 0).forEach { row ->
            out += PendingEntry(
                kind = ApprovalKind.Donations,
                id = row.donation.id,
                title = row.donation.donorName,
                detail = listOfNotNull(
                    row.donation.donationDate,
                    row.donation.paymentMethod,
                    row.donation.purpose,
                ).joinToString(" · "),
                amount = row.donation.amount,
                createdAt = row.donation.createdAt,
            )
        }

        subscriptions.page(null, null, ApprovalStatus.Pending.wire, 500, 0).forEach { row ->
            val parked = row.subscription.pendingAmountPaid ?: 0.0
            out += PendingEntry(
                kind = ApprovalKind.Subscriptions,
                id = row.subscription.id,
                title = row.houseName ?: "Family #${row.subscription.familyId}",
                detail = buildString {
                    append(row.subscription.periodStart.orEmpty())
                    append(" → ")
                    append(row.subscription.periodEnd.orEmpty())
                    if (parked > 0) append(" · payment ${Money.round2(parked)}")
                },
                amount = if (parked > 0) parked else row.subscription.amount,
                createdAt = row.subscription.createdAt,
            )
        }

        families.page(null, null, ApprovalStatus.Pending.wire, 500, 0).forEach { row ->
            out += PendingEntry(
                kind = ApprovalKind.Families,
                id = row.family.id,
                title = row.family.houseName.orEmpty(),
                detail = listOfNotNull(row.family.familyNumber, row.family.area, row.family.ward)
                    .filter { it.isNotBlank() }.joinToString(" · "),
                amount = null,
                createdAt = row.family.createdAt,
            )
        }

        members.page(null, null, null, ApprovalStatus.Pending.wire, 500, 0).forEach { row ->
            out += PendingEntry(
                kind = ApprovalKind.Members,
                id = row.member.id,
                title = row.member.name,
                detail = listOfNotNull(row.member.memberCode, row.member.relationship)
                    .filter { it.isNotBlank() }.joinToString(" · "),
                amount = null,
                createdAt = row.member.createdAt,
            )
        }

        marriages.page(null, null, null, ApprovalStatus.Pending.wire, 500, 0).forEach { row ->
            out += PendingEntry(
                kind = ApprovalKind.Marriages,
                id = row.id,
                title = "${row.brideName} & ${row.groomName}",
                detail = listOfNotNull(row.marriageNumber, row.nikahDate).joinToString(" · "),
                amount = null,
                createdAt = row.createdAt,
            )
        }

        deaths.page(null, null, null, ApprovalStatus.Pending.wire, 500, 0).forEach { row ->
            out += PendingEntry(
                kind = ApprovalKind.Deaths,
                id = row.death.id,
                title = row.death.deceasedName,
                detail = listOfNotNull(row.death.deathNumber, row.death.dateOfDeath).joinToString(" · "),
                amount = null,
                createdAt = row.death.createdAt,
            )
        }

        return out.sortedByDescending { it.createdAt }
    }

    /** Count of pending entries — the badge on the hub tile. */
    suspend fun pendingCount(): Int =
        donations.count(null, null, ApprovalStatus.Pending.wire, null, null) +
            subscriptions.count(null, null, ApprovalStatus.Pending.wire) +
            families.count(null, null, ApprovalStatus.Pending.wire) +
            members.count(null, null, null, ApprovalStatus.Pending.wire) +
            marriages.count(null, null, null, ApprovalStatus.Pending.wire) +
            deaths.count(null, null, null, ApprovalStatus.Pending.wire)

    /**
     * Approve an entry. For a subscription with a parked first payment, the
     * payment is applied NOW through the standard allocation — the receipt
     * number is minted and the money is finally counted.
     */
    suspend fun approve(kind: ApprovalKind, id: Long) {
        val actor = auth.requireActor()
        if (!RoleAccess.canApprove(actor.role)) fail(ErrorKeys.ROLE_DENIED)
        when (kind) {
            ApprovalKind.Donations -> {
                donations.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                donations.setApproval(id, ApprovalStatus.Approved.wire)
            }

            ApprovalKind.Subscriptions -> {
                val account = subscriptions.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                if (account.approvalStatus != ApprovalStatus.Pending.wire) fail(ErrorKeys.NOT_FOUND)
                subscriptions.setApproval(id, ApprovalStatus.Approved.wire)
                val parked = account.pendingAmountPaid ?: 0.0
                if (parked > 0) {
                    subscriptionRepository.applyPayment(
                        id = id,
                        amountPaid = parked,
                        paymentMethod = wireTo(account.pendingPaymentMethod, PaymentMethod.Cash),
                        paymentDate = account.pendingPaymentDate,
                    )
                    subscriptions.clearParkedPayment(id)
                }
            }

            ApprovalKind.Families -> {
                families.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                families.setApproval(id, ApprovalStatus.Approved.wire)
            }

            ApprovalKind.Members -> {
                members.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                members.setApproval(id, ApprovalStatus.Approved.wire)
            }

            ApprovalKind.Marriages -> {
                marriages.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                marriages.setApproval(id, ApprovalStatus.Approved.wire)
            }

            ApprovalKind.Deaths -> {
                deaths.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                deaths.setApproval(id, ApprovalStatus.Approved.wire)
            }
        }
        auth.log(actor.id, actor.username, "APPROVE", "approvals", id, "${kind.wire} #$id approved")
    }

    /** Reject = the entry was never official, so it is removed outright. */
    suspend fun reject(kind: ApprovalKind, id: Long, reason: String) {
        val actor = auth.requireActor()
        if (!RoleAccess.canApprove(actor.role)) fail(ErrorKeys.ROLE_DENIED)
        when (kind) {
            ApprovalKind.Donations -> {
                val row = donations.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                if (row.approvalStatus != ApprovalStatus.Pending.wire) fail(ErrorKeys.NOT_FOUND)
                donations.delete(id)
            }

            ApprovalKind.Subscriptions -> {
                val row = subscriptions.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                if (row.approvalStatus != ApprovalStatus.Pending.wire) fail(ErrorKeys.NOT_FOUND)
                subscriptions.delete(id)
            }

            ApprovalKind.Families -> {
                families.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                families.delete(id)
            }

            ApprovalKind.Members -> {
                members.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                members.delete(id)
            }

            ApprovalKind.Marriages -> {
                marriages.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                marriages.delete(id)
            }

            ApprovalKind.Deaths -> {
                deaths.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
                deaths.delete(id)
            }
        }
        auth.log(
            actor.id, actor.username, "REJECT", "approvals", id,
            "${kind.wire} #$id rejected${if (reason.isBlank()) "" else ": ${reason.trim()}"}",
        )
    }
}

data class PendingEntry(
    val kind: ApprovalKind,
    val id: Long,
    val title: String,
    val detail: String,
    val amount: Double?,
    val createdAt: String,
)
