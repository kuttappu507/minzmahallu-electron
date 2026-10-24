package app.minzmahallu.core.domain.people

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Money
import app.minzmahallu.core.common.PaymentFrequency
import app.minzmahallu.core.common.PaymentMethod
import app.minzmahallu.core.common.PaymentStatus
import app.minzmahallu.core.common.StaffStatus
import app.minzmahallu.core.database.dao.CommitteeDao
import app.minzmahallu.core.database.dao.HistoryDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.StaffDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.CommitteeMember
import app.minzmahallu.core.model.RecordHistory
import app.minzmahallu.core.model.StaffEntity
import app.minzmahallu.core.model.StaffPayment
import app.minzmahallu.core.model.StaffPaymentWithStaff
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/** Staff directory and salary payments. */
@Singleton
class StaffRepository @Inject constructor(
    private val dao: StaffDao,
    private val members: MemberDao,
    private val history: HistoryDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        status: String?,
        showArchived: Boolean = false,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<StaffEntity> {
        val q = search?.trim()?.ifBlank { null }
        val archived = if (showArchived) 1 else 0
        val rows = dao.page(q, status, archived, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, status, archived)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): StaffEntity = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun roles(): List<String> = (dao.roles() + app.minzmahallu.core.common.STAFF_ROLES).distinct()

    suspend fun historyOf(staffId: Long): List<RecordHistory> = history.forEntity("staff", staffId)

    suspend fun create(input: StaffInput): Long {
        val actor = auth.requireActor()
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        Money.nonNegativeError(input.salary.toString())?.let { fail(ErrorKeys.VALIDATION, "salary") }
        val code = "STF-${((dao.maxId() ?: 0L) + 1).toString().padStart(4, '0')}"
        val id = dao.insert(
            StaffEntity(
                staffCode = code,
                memberId = input.memberId,
                name = input.name.trim(),
                role = input.role.ifBlank { "Staff" },
                idNumber = input.idNumber?.trim()?.ifBlank { null },
                phone = app.minzmahallu.core.common.Phone.clamp10(input.phone),
                email = input.email?.trim()?.ifBlank { null },
                address = input.address?.trim()?.ifBlank { null },
                joinedDate = input.joinedDate?.ifBlank { null },
                salary = input.salary,
                paymentFrequency = input.paymentFrequency.wire,
                status = StaffStatus.Active.wire,
                notes = input.notes?.trim()?.ifBlank { null },
            ),
        )
        auth.log(actor.id, actor.username, "CREATE", "staff", id, "Staff $code (${input.name.trim()}, ${input.role}) added")
        return id
    }

    suspend fun update(id: Long, input: StaffInput) {
        val before = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        Money.nonNegativeError(input.salary.toString())?.let { fail(ErrorKeys.VALIDATION, "salary") }
        val after = before.copy(
            memberId = input.memberId,
            name = input.name.trim(),
            role = input.role.ifBlank { "Staff" },
            idNumber = input.idNumber?.trim()?.ifBlank { null },
            phone = app.minzmahallu.core.common.Phone.clamp10(input.phone),
            email = input.email?.trim()?.ifBlank { null },
            address = input.address?.trim()?.ifBlank { null },
            joinedDate = input.joinedDate?.ifBlank { null },
            salary = input.salary,
            paymentFrequency = input.paymentFrequency.wire,
            notes = input.notes?.trim()?.ifBlank { null },
            updatedAt = IstDate.dateTimeStr(),
        )
        dao.update(after)
        recordHistory(id, "UPDATE", diffOf(before, after), null)
    }

    suspend fun archive(id: Long, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        dao.archive(id, reason.trim(), IstDate.dateTimeStr(), actor.id)
        auth.log(actor.id, actor.username, "ARCHIVE", "staff", id, "Staff archived: ${reason.trim()}")
    }

    /** Resigned and expelled are different facts and are recorded differently. */
    suspend fun setStatus(id: Long, status: StaffStatus, effectiveDate: String, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "STAFF_STATUS_${status.wire.uppercase()}", reason)
        val staff = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        dao.update(
            staff.copy(
                status = status.wire,
                notes = listOfNotNull(staff.notes?.takeIf { it.isNotBlank() }, "${status.wire} on $effectiveDate: ${reason.trim()}")
                    .joinToString(" | ")
                    .ifBlank { null },
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "STATUS", "staff", id, "Staff marked ${status.wire} from $effectiveDate: ${reason.trim()}")
    }

    suspend fun restore(id: Long, adminPassword: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "STAFF_RESTORE", "Restored staff #$id")
        dao.restore(id, IstDate.dateTimeStr())
        auth.log(actor.id, actor.username, "RESTORE", "staff", id, "Staff restored")
    }

    // --------------------------------------------------------------- payments

    suspend fun paymentPage(
        staffId: Long?,
        year: Int?,
        status: String?,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<StaffPaymentWithStaff> {
        val rows = dao.paymentPage(staffId, year, status, pageSize, (page - 1) * pageSize)
        val total = dao.paymentCount(staffId, year, status)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun paidTotal(year: Int?): Double = dao.paidTotal(year)

    /**
     * Pay a salary. The duplicate guard is what the office asked for: the same
     * person cannot be paid twice for the same period.
     */
    suspend fun paySalary(input: SalaryInput): Long {
        val actor = auth.requireActor()
        val staff = dao.byId(input.staffId) ?: fail(ErrorKeys.NOT_FOUND)
        if (input.amount <= 0) fail(ErrorKeys.VALIDATION, "amount")
        if (dao.existingPayment(input.staffId, input.periodYear, input.periodMonth) != null) {
            fail(ErrorKeys.DUPLICATE_SALARY, "${staff.name} — ${input.periodYear}-${input.periodMonth}")
        }
        val id = dao.insertPayment(
            StaffPayment(
                staffId = input.staffId,
                periodMonth = input.periodMonth,
                periodYear = input.periodYear,
                amount = input.amount,
                paymentDate = input.paymentDate ?: IstDate.today(),
                paymentMethod = input.paymentMethod.wire,
                transactionRef = input.transactionRef.trim(),
                status = PaymentStatus.Paid.wire,
                notes = input.notes.trim(),
                paidBy = actor.id,
            ),
        )
        auth.log(
            actor.id, actor.username, "SALARY", "staff", input.staffId,
            "Salary ${input.amount} paid to ${staff.name} for ${input.periodYear}-${input.periodMonth}",
        )
        return id
    }

    suspend fun cancelPayment(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "SALARY_CANCEL", reason)
        dao.cancelPayment(id)
        auth.log(actor.id, actor.username, "CANCEL_PAYMENT", "staff", id, "Salary payment cancelled: ${reason.trim()}")
    }

    private suspend fun recordHistory(entityId: Long, action: String, changes: JsonObject, reason: String?) {
        val actor = auth.current ?: return
        history.insert(
            RecordHistory(
                entityType = "staff",
                entityId = entityId,
                action = action,
                userId = actor.id,
                username = actor.username,
                changedAt = IstDate.dateTimeStr(),
                summary = "staff updated",
                changesJson = if (changes.isEmpty()) null else Json.encodeToString(JsonObject.serializer(), changes),
                reason = reason?.trim()?.ifBlank { null },
            ),
        )
    }
}

data class StaffInput(
    val name: String,
    val memberId: Long? = null,
    val role: String = "Staff",
    val idNumber: String? = null,
    val phone: String = "",
    val email: String? = null,
    val address: String? = null,
    val joinedDate: String? = null,
    val salary: Double = 0.0,
    val paymentFrequency: PaymentFrequency = PaymentFrequency.Monthly,
    val notes: String? = null,
)

data class SalaryInput(
    val staffId: Long,
    val periodMonth: Int,
    val periodYear: Int,
    val amount: Double,
    val paymentDate: String? = null,
    val paymentMethod: PaymentMethod = PaymentMethod.Cash,
    val transactionRef: String = "",
    val notes: String = "",
)

fun diffOf(before: StaffEntity, after: StaffEntity): JsonObject = buildJsonObject {
    fun field(name: String, old: String?, new: String?) {
        if (old == new) return
        put(name, buildJsonObject {
            put("old", old ?: "")
            put("new", new ?: "")
        })
    }
    field("name", before.name, after.name)
    field("role", before.role, after.role)
    field("id_number", before.idNumber, after.idNumber)
    field("phone", before.phone, after.phone)
    field("email", before.email, after.email)
    field("address", before.address, after.address)
    field("joined_date", before.joinedDate, after.joinedDate)
    field("salary", before.salary.toString(), after.salary.toString())
    field("payment_frequency", before.paymentFrequency, after.paymentFrequency)
    field("status", before.status, after.status)
    field("notes", before.notes, after.notes)
}

/** Elected committee members with term tracking. */
@Singleton
class CommitteeRepository @Inject constructor(
    private val dao: CommitteeDao,
    private val history: HistoryDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        type: String?,
        status: String?,
        showArchived: Boolean = false,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<CommitteeMember> {
        val q = search?.trim()?.ifBlank { null }
        val archived = if (showArchived) 1 else 0
        val rows = dao.page(q, type, status, archived, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, type, status, archived)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): CommitteeMember = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun historyOf(id: Long): List<RecordHistory> = history.forEntity("committee", id)

    suspend fun termsEndingSoon(): Int = dao.termsEndingSoon(IstDate.today(), IstDate.plusDays(30))

    suspend fun positionSummary() = dao.positionSummary()

    suspend fun create(input: CommitteeInput): Long {
        val actor = auth.requireActor()
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        val code = "CMT-${((dao.maxId() ?: 0L) + 1).toString().padStart(4, '0')}"
        val id = dao.insert(
            CommitteeMember(
                committeeCode = code,
                memberId = input.memberId,
                name = input.name.trim(),
                position = input.position,
                committeeType = input.committeeType.wire,
                phone = app.minzmahallu.core.common.Phone.clamp10(input.phone),
                email = input.email?.trim()?.ifBlank { null },
                address = input.address?.trim()?.ifBlank { null },
                termStart = input.termStart?.ifBlank { null },
                termEnd = input.termEnd?.ifBlank { null },
                notes = input.notes?.trim()?.ifBlank { null },
            ),
        )
        auth.log(actor.id, actor.username, "CREATE", "committee", id, "Committee member $code (${input.name.trim()}, ${input.position}) added")
        return id
    }

    suspend fun update(id: Long, input: CommitteeInput, adminPassword: String, reason: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "COMMITTEE_EDIT", reason)
        val before = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        val after = before.copy(
            memberId = input.memberId,
            name = input.name.trim(),
            position = input.position,
            committeeType = input.committeeType.wire,
            phone = app.minzmahallu.core.common.Phone.clamp10(input.phone),
            email = input.email?.trim()?.ifBlank { null },
            address = input.address?.trim()?.ifBlank { null },
            termStart = input.termStart?.ifBlank { null },
            termEnd = input.termEnd?.ifBlank { null },
            status = input.status.wire,
            notes = input.notes?.trim()?.ifBlank { null },
            updatedAt = IstDate.dateTimeStr(),
        )
        dao.update(after)
        recordHistory(id, "UPDATE", diffOf(before, after), reason)
        auth.log(actor.id, actor.username, "UPDATE", "committee", id, "Committee member updated: $reason")
    }

    suspend fun archive(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "COMMITTEE_ARCHIVE", reason)
        dao.archive(id, reason.trim(), IstDate.dateTimeStr(), actor.id)
        auth.log(actor.id, actor.username, "ARCHIVE", "committee", id, "Committee member archived: ${reason.trim()}")
    }

    suspend fun restore(id: Long, adminPassword: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "COMMITTEE_RESTORE", "Restored committee member #$id")
        dao.restore(id, IstDate.dateTimeStr())
        auth.log(actor.id, actor.username, "RESTORE", "committee", id, "Committee member restored")
    }

    private suspend fun recordHistory(entityId: Long, action: String, changes: JsonObject, reason: String?) {
        val actor = auth.current ?: return
        history.insert(
            RecordHistory(
                entityType = "committee",
                entityId = entityId,
                action = action,
                userId = actor.id,
                username = actor.username,
                changedAt = IstDate.dateTimeStr(),
                summary = "committee member updated",
                changesJson = if (changes.isEmpty()) null else Json.encodeToString(JsonObject.serializer(), changes),
                reason = reason?.trim()?.ifBlank { null },
            ),
        )
    }
}

data class CommitteeInput(
    val name: String,
    val memberId: Long? = null,
    val position: String = "Committee Member",
    val committeeType: app.minzmahallu.core.common.CommitteeType = app.minzmahallu.core.common.CommitteeType.Executive,
    val status: app.minzmahallu.core.common.CommitteeStatus = app.minzmahallu.core.common.CommitteeStatus.Active,
    val phone: String = "",
    val email: String? = null,
    val address: String? = null,
    val termStart: String? = null,
    val termEnd: String? = null,
    val notes: String? = null,
)

fun diffOf(before: CommitteeMember, after: CommitteeMember): JsonObject = buildJsonObject {
    fun field(name: String, old: String?, new: String?) {
        if (old == new) return
        put(name, buildJsonObject {
            put("old", old ?: "")
            put("new", new ?: "")
        })
    }
    field("name", before.name, after.name)
    field("position", before.position, after.position)
    field("committee_type", before.committeeType, after.committeeType)
    field("phone", before.phone, after.phone)
    field("email", before.email, after.email)
    field("term_start", before.termStart, after.termStart)
    field("term_end", before.termEnd, after.termEnd)
    field("status", before.status, after.status)
    field("notes", before.notes, after.notes)
}
