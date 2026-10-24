package app.minzmahallu.core.domain.registers

import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.Gender
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.DeathEntity
import app.minzmahallu.core.model.DeathWithFamily
import app.minzmahallu.core.model.MarriageEntity
import javax.inject.Inject
import javax.inject.Singleton

/** The Nikah register. */
@Singleton
class MarriageRepository @Inject constructor(
    private val dao: MarriageDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        from: String? = null,
        to: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<MarriageEntity> {
        val q = search?.trim()?.ifBlank { null }
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = dao.page(q, from, to, approval, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, from, to, approval)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): MarriageEntity = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun all(): List<MarriageEntity> = dao.all()

    suspend fun countInYear(year: String): Int = dao.countInYear(year)

    suspend fun create(input: MarriageInput): Long {
        val actor = auth.requireActor()
        if (input.brideName.isBlank() || input.groomName.isBlank()) fail(ErrorKeys.VALIDATION, "bride/groom name")
        if (input.nikahDate.isBlank()) fail(ErrorKeys.VALIDATION, "nikah date")
        val pending = RoleAccess.createsPending(actor.role)
        val number = nextNumber()
        val id = dao.insert(
            MarriageEntity(
                marriageNumber = number,
                brideName = input.brideName.trim(),
                brideFather = input.brideFather.trim().ifBlank { null },
                brideAddress = input.brideAddress.trim().ifBlank { null },
                groomName = input.groomName.trim(),
                groomFather = input.groomFather.trim().ifBlank { null },
                groomAddress = input.groomAddress.trim().ifBlank { null },
                witness1 = input.witnesses.getOrNull(0)?.ifBlank { null },
                witness2 = input.witnesses.getOrNull(1)?.ifBlank { null },
                witness3 = input.witnesses.getOrNull(2)?.ifBlank { null },
                witness4 = input.witnesses.getOrNull(3)?.ifBlank { null },
                mahar = input.mahar.trim().ifBlank { null },
                nikahDate = input.nikahDate,
                registrationDate = input.registrationDate ?: IstDate.today(),
                place = input.place.trim().ifBlank { null },
                remarks = input.remarks.trim().ifBlank { null },
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
            ),
        )
        auth.log(
            actor.id, actor.username, "CREATE", "marriages", id,
            "Nikah registered: $number (${input.brideName.trim()} & ${input.groomName.trim()})",
        )
        return id
    }

    suspend fun update(id: Long, input: MarriageInput) {
        val existing = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        dao.update(
            existing.copy(
                brideName = input.brideName.trim(),
                brideFather = input.brideFather.trim().ifBlank { null },
                brideAddress = input.brideAddress.trim().ifBlank { null },
                groomName = input.groomName.trim(),
                groomFather = input.groomFather.trim().ifBlank { null },
                groomAddress = input.groomAddress.trim().ifBlank { null },
                witness1 = input.witnesses.getOrNull(0)?.ifBlank { null },
                witness2 = input.witnesses.getOrNull(1)?.ifBlank { null },
                witness3 = input.witnesses.getOrNull(2)?.ifBlank { null },
                witness4 = input.witnesses.getOrNull(3)?.ifBlank { null },
                mahar = input.mahar.trim().ifBlank { null },
                nikahDate = input.nikahDate,
                registrationDate = input.registrationDate ?: existing.registrationDate,
                place = input.place.trim().ifBlank { null },
                remarks = input.remarks.trim().ifBlank { null },
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "MARRIAGE_DELETE", reason)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "marriages", id, "Nikah record deleted: ${reason.trim()}")
    }

    private suspend fun nextNumber(): String {
        val max = dao.allNumbers().mapNotNull { REGISTER_NUMBER.find(it)?.value?.toIntOrNull() }.maxOrNull() ?: 0
        return "NIK-${(max + 1).toString().padStart(4, '0')}"
    }

    private companion object {
        val REGISTER_NUMBER = Regex("""(\d+)\s*$""")
    }
}

data class MarriageInput(
    val brideName: String,
    val brideFather: String = "",
    val brideAddress: String = "",
    val groomName: String,
    val groomFather: String = "",
    val groomAddress: String = "",
    val witnesses: List<String> = emptyList(),
    val mahar: String = "",
    val nikahDate: String,
    val registrationDate: String? = null,
    val place: String = "",
    val remarks: String = "",
)

/** The death register. */
@Singleton
class DeathRepository @Inject constructor(
    private val dao: DeathDao,
    private val members: MemberDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        from: String? = null,
        to: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<DeathWithFamily> {
        val q = search?.trim()?.ifBlank { null }
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = dao.page(q, from, to, approval, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, from, to, approval)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): DeathWithFamily = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun countInYear(year: String): Int = dao.countInYear(year)

    suspend fun create(input: DeathInput): Long {
        val actor = auth.requireActor()
        if (input.deceasedName.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        if (input.dateOfDeath.isBlank()) fail(ErrorKeys.VALIDATION, "date of death")
        val pending = RoleAccess.createsPending(actor.role)
        val number = nextNumber()
        val id = dao.insert(
            DeathEntity(
                deathNumber = number,
                deceasedName = input.deceasedName.trim(),
                fatherName = input.fatherName.trim().ifBlank { null },
                familyId = input.familyId,
                gender = input.gender?.wire,
                dateOfDeath = input.dateOfDeath,
                burialDate = input.burialDate?.ifBlank { null },
                causeOfDeath = input.causeOfDeath?.trim()?.ifBlank { null },
                burialPlace = input.burialPlace?.trim()?.ifBlank { null },
                placeOfDeath = input.placeOfDeath?.trim()?.ifBlank { null },
                address = input.address?.trim()?.ifBlank { null },
                age = input.age?.takeIf { it > 0 },
                remarks = input.remarks?.trim()?.ifBlank { null },
                registrationDate = input.registrationDate ?: IstDate.today(),
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
            ),
        )
        // The linked member is marked deceased in the same action, so the
        // member directory and the register never disagree.
        input.memberId?.let { markMemberDeceased(it, input.dateOfDeath) }
        auth.log(
            actor.id, actor.username, "CREATE", "deaths", id,
            "Death registered: $number (${input.deceasedName.trim()})",
        )
        return id
    }

    suspend fun update(id: Long, input: DeathInput) {
        val existing = dao.byId(id)?.death ?: fail(ErrorKeys.NOT_FOUND)
        dao.update(
            existing.copy(
                deceasedName = input.deceasedName.trim(),
                fatherName = input.fatherName.trim().ifBlank { null },
                familyId = input.familyId,
                gender = input.gender?.wire,
                dateOfDeath = input.dateOfDeath,
                burialDate = input.burialDate?.ifBlank { null },
                causeOfDeath = input.causeOfDeath?.trim()?.ifBlank { null },
                burialPlace = input.burialPlace?.trim()?.ifBlank { null },
                placeOfDeath = input.placeOfDeath?.trim()?.ifBlank { null },
                address = input.address?.trim()?.ifBlank { null },
                age = input.age?.takeIf { it > 0 },
                remarks = input.remarks?.trim()?.ifBlank { null },
                registrationDate = input.registrationDate ?: existing.registrationDate,
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "DEATH_DELETE", reason)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "deaths", id, "Death record deleted: ${reason.trim()}")
    }

    private suspend fun markMemberDeceased(memberId: Long, dateOfDeath: String) {
        val member = members.byId(memberId) ?: return
        members.update(
            member.copy(status = app.minzmahallu.core.common.MemberStatus.Deceased.wire, updatedAt = IstDate.dateTimeStr()),
        )
    }

    private suspend fun nextNumber(): String {
        val max = dao.allNumbers().mapNotNull { TRAILING.find(it)?.value?.toIntOrNull() }.maxOrNull() ?: 0
        return "DTH-${(max + 1).toString().padStart(4, '0')}"
    }

    private companion object {
        val TRAILING = Regex("""(\d+)\s*$""")
    }
}

data class DeathInput(
    val deceasedName: String,
    val fatherName: String = "",
    val familyId: Long? = null,
    val memberId: Long? = null,
    val gender: Gender? = null,
    val dateOfDeath: String,
    val burialDate: String? = null,
    val causeOfDeath: String? = null,
    val burialPlace: String? = null,
    val placeOfDeath: String? = null,
    val address: String? = null,
    val age: Int? = null,
    val remarks: String? = null,
    val registrationDate: String? = null,
)
