package app.minzmahallu.core.domain.member

import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.Gender
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.MemberStatus
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.HistoryDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.family.diffOf
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.model.MemberWithFamily
import app.minzmahallu.core.model.RecordHistory
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MemberRepository @Inject constructor(
    private val members: MemberDao,
    private val families: FamilyDao,
    private val history: HistoryDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        familyId: Long?,
        status: String?,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<MemberWithFamily> {
        val q = search?.trim()?.ifBlank { null }
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = members.page(q, familyId, status, approval, pageSize, (page - 1) * pageSize)
        val total = members.count(q, familyId, status, approval)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): MemberEntity = members.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun byFamily(familyId: Long): List<MemberEntity> = members.byFamily(familyId)

    suspend fun searchLite(query: String?, limit: Int = 40): List<MemberEntity> =
        members.searchLite(query?.trim()?.ifBlank { null }, limit)

    suspend fun historyOf(memberId: Long): List<RecordHistory> = history.forEntity("member", memberId)

    suspend fun create(input: MemberInput): Long {
        val actor = auth.requireActor()
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        families.byId(input.familyId) ?: fail(ErrorKeys.NOT_FOUND, "family")
        if (input.isHead) assertSingleHead(input.familyId, excludeMemberId = -1)

        val pending = RoleAccess.createsPending(actor.role)
        val code = nextMemberCode()
        val id = members.insert(
            MemberEntity(
                familyId = input.familyId,
                memberCode = code,
                name = input.name.trim(),
                arabicName = input.arabicName.trim().ifBlank { null },
                fatherName = input.fatherName.trim().ifBlank { null },
                gender = input.gender.wire,
                dateOfBirth = input.dateOfBirth?.ifBlank { null },
                age = input.age?.takeIf { it > 0 },
                bloodGroup = input.bloodGroup?.ifBlank { null },
                occupation = input.occupation?.trim()?.ifBlank { null },
                education = input.education?.trim()?.ifBlank { null },
                maritalStatus = input.maritalStatus?.ifBlank { null },
                mobile = Phone.clamp10(input.mobile).ifBlank { null },
                email = input.email?.trim()?.ifBlank { null },
                nationality = input.nationality.ifBlank { "Indian" },
                address = input.address?.trim()?.ifBlank { null },
                emergencyContact = Phone.clamp10(input.emergencyContact).ifBlank { null },
                relationship = input.relationship?.ifBlank { null },
                isHead = if (input.isHead) 1 else 0,
                status = input.status.wire,
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
            ),
        )
        auth.log(
            actor.id, actor.username, "CREATE", "members", id,
            "Member $code (${input.name.trim()}) added" + if (pending) " — awaiting approval" else "",
        )
        return id
    }

    suspend fun update(id: Long, input: MemberInput) {
        val actor = auth.requireActor()
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "name")
        if (input.isHead) assertSingleHead(input.familyId, excludeMemberId = id)
        val before = members.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        val after = before.copy(
            name = input.name.trim(),
            arabicName = input.arabicName.trim().ifBlank { null },
            fatherName = input.fatherName.trim().ifBlank { null },
            gender = input.gender.wire,
            dateOfBirth = input.dateOfBirth?.ifBlank { null },
            age = input.age?.takeIf { it > 0 },
            bloodGroup = input.bloodGroup?.ifBlank { null },
            occupation = input.occupation?.trim()?.ifBlank { null },
            education = input.education?.trim()?.ifBlank { null },
            maritalStatus = input.maritalStatus?.ifBlank { null },
            mobile = Phone.clamp10(input.mobile).ifBlank { null },
            email = input.email?.trim()?.ifBlank { null },
            nationality = input.nationality.ifBlank { "Indian" },
            address = input.address?.trim()?.ifBlank { null },
            emergencyContact = Phone.clamp10(input.emergencyContact).ifBlank { null },
            relationship = input.relationship?.ifBlank { null },
            isHead = if (input.isHead) 1 else 0,
            status = input.status.wire,
            updatedAt = IstDate.dateTimeStr(),
        )
        members.update(after)
        recordHistory(id, "UPDATE", diffOf(before, after), null)
    }

    /**
     * A family can have only ONE head. The rule fires only when the member
     * being saved is *itself* the head — adding a son to a family that already
     * has a head is normal and must not be blocked.
     */
    suspend fun assertSingleHead(familyId: Long, excludeMemberId: Long) {
        val existing = members.existingHead(familyId, excludeMemberId) ?: return
        fail(ErrorKeys.SINGLE_HEAD, existing.name)
    }

    /**
     * Archive a member. The record keeps `status = Active`; `archive_state` is
     * the real flag, so the archived list and the active list stay correct.
     */
    suspend fun archive(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "MEMBER_ARCHIVE", "Archived member #$id")
        members.archive(id, reason.trim(), IstDate.dateTimeStr(), actor.id, "manual")
        auth.log(actor.id, actor.username, "ARCHIVE", "members", id, "Member archived: ${reason.trim()}")
    }

    suspend fun restore(id: Long, reason: String, adminPassword: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "MEMBER_RESTORE", "Restored member #$id")
        members.restore(id, IstDate.dateTimeStr())
        auth.log(actor.id, actor.username, "RESTORE", "members", id, "Member restored${if (reason.isBlank()) "" else ": ${reason.trim()}"}")
    }

    /** Mark a member deceased — also what the death register offers to do. */
    suspend fun markDeceased(id: Long, dateOfDeath: String) {
        val actor = auth.requireActor()
        val member = members.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        members.update(member.copy(status = MemberStatus.Deceased.wire, updatedAt = IstDate.dateTimeStr()))
        auth.log(actor.id, actor.username, "UPDATE", "members", id, "Member marked deceased on $dateOfDeath")
    }

    private suspend fun recordHistory(entityId: Long, action: String, changes: JsonObject, reason: String?) {
        val actor = auth.current ?: return
        history.insert(
            RecordHistory(
                entityType = "member",
                entityId = entityId,
                action = action,
                userId = actor.id,
                username = actor.username,
                changedAt = IstDate.dateTimeStr(),
                summary = "member updated",
                changesJson = if (changes.isEmpty()) null else Json.encodeToString(JsonObject.serializer(), changes),
                reason = reason?.trim()?.ifBlank { null },
            ),
        )
    }

    private suspend fun nextMemberCode(): String {
        val next = (members.maxId() ?: 0L) + 1
        return "MEM-${next.toString().padStart(4, '0')}"
    }
}

data class MemberInput(
    val familyId: Long,
    val name: String,
    val arabicName: String = "",
    val fatherName: String = "",
    val gender: Gender,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val bloodGroup: String? = null,
    val occupation: String? = null,
    val education: String? = null,
    val maritalStatus: String? = null,
    val mobile: String = "",
    val email: String? = null,
    val nationality: String = "Indian",
    val address: String? = null,
    val emergencyContact: String = "",
    val relationship: String? = null,
    val isHead: Boolean = false,
    val status: MemberStatus = MemberStatus.Active,
)
