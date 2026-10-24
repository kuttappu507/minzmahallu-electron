package app.minzmahallu.core.domain.welfare

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.WelfareCategory
import app.minzmahallu.core.common.WelfareStatus
import app.minzmahallu.core.database.dao.WelfareDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.WelfareRequest
import app.minzmahallu.core.model.WelfareWithFamily
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Welfare assistance: asked → approved → disbursed.
 *
 * Two of the mahallu's own rules are enforced here:
 * * approval records the **minutes date** — the date of the committee meeting
 *   that agreed the amount;
 * * disbursement is a secure action: reason + administrator password.
 */
@Singleton
class WelfareRepository @Inject constructor(
    private val dao: WelfareDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        status: String?,
        category: String?,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<WelfareWithFamily> {
        val q = search?.trim()?.ifBlank { null }
        val rows = dao.page(q, status, category, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, status, category)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): WelfareRequest = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun pendingCount(): Int = dao.pendingCount()

    suspend fun disbursedInMonth(month: String): Double = dao.disbursedInMonth(month)

    suspend fun beneficiariesInYear(year: String): Int = dao.beneficiariesInYear(year)

    suspend fun create(input: WelfareInput): Long {
        val actor = auth.requireActor()
        if (input.applicantName.isBlank()) fail(ErrorKeys.VALIDATION, "applicant name")
        if (input.amountRequested <= 0) fail(ErrorKeys.VALIDATION, "amount requested")
        val number = nextNumber()
        val id = dao.insert(
            WelfareRequest(
                requestNumber = number,
                applicantName = input.applicantName.trim(),
                familyId = input.familyId,
                category = input.category.wire,
                amountRequested = input.amountRequested,
                reason = input.reason.trim().ifBlank { null },
                status = WelfareStatus.Pending.wire,
                requestDate = IstDate.today(),
                remarks = input.remarks.trim().ifBlank { null },
            ),
        )
        auth.log(actor.id, actor.username, "CREATE", "welfare", id, "Welfare request $number (${input.applicantName.trim()}, ${input.amountRequested})")
        return id
    }

    suspend fun update(id: Long, input: WelfareInput) {
        val existing = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (existing.status != WelfareStatus.Pending.wire) fail(ErrorKeys.VALIDATION, "only a pending request can be edited")
        dao.update(
            existing.copy(
                applicantName = input.applicantName.trim(),
                familyId = input.familyId,
                category = input.category.wire,
                amountRequested = input.amountRequested,
                reason = input.reason.trim().ifBlank { null },
                remarks = input.remarks.trim().ifBlank { null },
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    suspend fun approve(id: Long, amountApproved: Double, reason: String, minutesDate: String?) {
        val actor = auth.requireActor()
        val request = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (request.status != WelfareStatus.Pending.wire) fail(ErrorKeys.VALIDATION, "already processed")
        if (amountApproved <= 0) fail(ErrorKeys.VALIDATION, "approved amount")
        dao.update(
            request.copy(
                amountApproved = amountApproved,
                status = WelfareStatus.Approved.wire,
                approvedBy = actor.id,
                minutesDate = minutesDate?.ifBlank { null } ?: IstDate.today(),
                processedBy = actor.id,
                processedDate = IstDate.today(),
                remarks = reason.trim().ifBlank { request.remarks },
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "APPROVE", "welfare", id, "Welfare approved: $amountApproved for ${request.applicantName}")
    }

    suspend fun reject(id: Long, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        val request = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (request.status != WelfareStatus.Pending.wire) fail(ErrorKeys.VALIDATION, "already processed")
        dao.update(
            request.copy(
                status = WelfareStatus.Rejected.wire,
                rejectionReason = reason.trim(),
                processedBy = actor.id,
                processedDate = IstDate.today(),
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "REJECT", "welfare", id, "Welfare rejected: ${reason.trim()}")
    }

    /** Handing the money over — secure action, reason + administrator password. */
    suspend fun disburse(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "WELFARE_DISBURSE", reason)
        val request = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (request.status != WelfareStatus.Approved.wire) fail(ErrorKeys.VALIDATION, "not approved yet")
        dao.update(
            request.copy(
                status = WelfareStatus.Disbursed.wire,
                disbursedDate = IstDate.today(),
                processedBy = actor.id,
                processedDate = IstDate.today(),
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "DISBURSE", "welfare", id, "Welfare disbursed: ${request.amountApproved} to ${request.applicantName}")
    }

    suspend fun close(id: Long, reason: String) {
        val actor = auth.requireActor()
        val request = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        dao.update(
            request.copy(status = WelfareStatus.Closed.wire, updatedAt = IstDate.dateTimeStr(), remarks = reason.ifBlank { request.remarks }),
        )
        auth.log(actor.id, actor.username, "CLOSE", "welfare", id, "Welfare request closed")
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "WELFARE_DELETE", reason)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "welfare", id, "Welfare request deleted: ${reason.trim()}")
    }

    private suspend fun nextNumber(): String {
        val max = dao.allNumbers().mapNotNull { TRAILING.find(it)?.value?.toIntOrNull() }.maxOrNull() ?: 0
        return "WEL-${(max + 1).toString().padStart(4, '0')}"
    }

    private companion object {
        val TRAILING = Regex("""(\d+)\s*$""")
    }
}

data class WelfareInput(
    val applicantName: String,
    val familyId: Long? = null,
    val category: WelfareCategory,
    val amountRequested: Double,
    val reason: String = "",
    val remarks: String = "",
)
