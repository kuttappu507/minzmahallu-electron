package app.minzmahallu.core.domain.family

import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.FamilyStatus
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.HistoryDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.FamilyEntity
import app.minzmahallu.core.model.FamilyMove
import app.minzmahallu.core.model.FamilyWithStats
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.model.MemberWithFamily
import app.minzmahallu.core.model.RecordHistory
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FamilyRepository @Inject constructor(
    private val families: FamilyDao,
    private val members: MemberDao,
    private val history: HistoryDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        status: String?,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<FamilyWithStats> {
        val q = search?.trim()?.ifBlank { null }
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = families.page(q, status, approval, pageSize, (page - 1) * pageSize)
        val total = families.count(q, status, approval)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): FamilyEntity = families.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun all(): List<FamilyEntity> = families.all()

    suspend fun searchLite(query: String?, limit: Int = 40): List<FamilyEntity> =
        families.searchLite(query?.trim()?.ifBlank { null }, limit)

    suspend fun membersOf(familyId: Long): List<MemberEntity> = members.byFamily(familyId)

    /** House name and phone are mandatory — the office cannot bill without them. */
    suspend fun create(input: FamilyInput): Long {
        val actor = auth.requireActor()
        if (input.houseName.isBlank()) fail(ErrorKeys.VALIDATION, "house name")
        if (!Phone.isComplete10(input.phone)) fail(ErrorKeys.VALIDATION, "phone")

        val pending = RoleAccess.createsPending(actor.role)
        val number = nextFamilyNumber()
        val id = families.insert(
            FamilyEntity(
                familyNumber = number,
                houseName = input.houseName.trim(),
                houseNumber = input.houseNumber.trim().ifBlank { null },
                ward = input.ward.trim().ifBlank { null },
                area = input.area.trim().ifBlank { null },
                address = input.address.trim().ifBlank { null },
                pincode = input.pincode.trim().ifBlank { null },
                phone = Phone.clamp10(input.phone),
                alternativePhone = Phone.clamp10(input.altPhone).ifBlank { null },
                status = FamilyStatus.Active.wire,
                notes = input.notes.trim().ifBlank { null },
                whatsappPhone = Phone.toWhatsApp(input.whatsappPhone).ifBlank { null },
                whatsappEnabled = if (input.whatsappEnabled) 1 else 0,
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
            ),
        )
        auth.log(
            actor.id, actor.username, "CREATE", "families", id,
            "Family $number (${input.houseName.trim()}) added" + if (pending) " — awaiting approval" else "",
        )
        return id
    }

    suspend fun update(id: Long, input: FamilyInput) {
        val actor = auth.requireActor()
        if (input.houseName.isBlank()) fail(ErrorKeys.VALIDATION, "house name")
        if (!Phone.isComplete10(input.phone)) fail(ErrorKeys.VALIDATION, "phone")
        val before = families.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        val after = before.copy(
            houseName = input.houseName.trim(),
            houseNumber = input.houseNumber.trim().ifBlank { null },
            ward = input.ward.trim().ifBlank { null },
            area = input.area.trim().ifBlank { null },
            address = input.address.trim().ifBlank { null },
            pincode = input.pincode.trim().ifBlank { null },
            phone = Phone.clamp10(input.phone),
            alternativePhone = Phone.clamp10(input.altPhone).ifBlank { null },
            notes = input.notes.trim().ifBlank { null },
            whatsappPhone = Phone.toWhatsApp(input.whatsappPhone).ifBlank { null },
            whatsappEnabled = if (input.whatsappEnabled) 1 else 0,
            updatedAt = IstDate.dateTimeStr(),
        )
        families.update(after)
        recordHistory("family", id, "UPDATE", diffOf(before, after), null)
    }

    /**
     * Archive a household: every active member is archived with it, and the
     * reason is compulsory. Nothing is deleted — the records and their history
     * survive, and [restore] brings back exactly what this archived.
     */
    suspend fun archive(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "FAMILY_ARCHIVE", "Archived family #$id")
        val now = IstDate.dateTimeStr()
        members.archiveWholeFamily(id, reason.trim(), now, actor.id)
        families.archive(id, reason.trim(), now, actor.id)
        auth.log(actor.id, actor.username, "ARCHIVE", "families", id, "Family archived: ${reason.trim()}")
    }

    suspend fun restore(id: Long, reason: String, adminPassword: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "FAMILY_RESTORE", "Restored family #$id")
        val now = IstDate.dateTimeStr()
        members.restoreFromFamilyArchive(id, now)
        families.restore(id, now)
        auth.log(actor.id, actor.username, "RESTORE", "families", id, "Family restored${if (reason.isBlank()) "" else ": ${reason.trim()}"}")
    }

    /** Create a new household out of existing members, moving them across. */
    suspend fun createFromMembers(memberIds: List<Long>, input: FamilyInput, headId: Long?, reason: String): Long {
        if (memberIds.isEmpty()) fail(ErrorKeys.VALIDATION, "no members selected")
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        val id = create(input)
        val now = IstDate.dateTimeStr()
        for (memberId in memberIds) {
            val member = members.byId(memberId) ?: continue
            members.moveToFamily(listOf(memberId), id, now)
            members.insertMove(
                FamilyMove(
                    memberId = memberId,
                    oldFamilyId = member.familyId,
                    newFamilyId = id,
                    moveType = "NewFamily",
                    reason = reason.trim(),
                    movedBy = actor.id,
                ),
            )
        }
        if (headId != null) {
            members.byId(headId)?.let { members.update(it.copy(isHead = 1, relationship = "Head", updatedAt = now)) }
        }
        auth.log(actor.id, actor.username, "MOVE_MEMBERS", "families", id, "New family created from ${memberIds.size} member(s): ${reason.trim()}")
        return id
    }

    suspend fun moveMembers(memberIds: List<Long>, toFamilyId: Long, reason: String) {
        if (memberIds.isEmpty()) fail(ErrorKeys.VALIDATION, "no members selected")
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        families.byId(toFamilyId) ?: fail(ErrorKeys.NOT_FOUND, "target family")
        val now = IstDate.dateTimeStr()
        for (memberId in memberIds) {
            val member = members.byId(memberId) ?: continue
            members.insertMove(
                FamilyMove(
                    memberId = memberId,
                    oldFamilyId = member.familyId,
                    newFamilyId = toFamilyId,
                    moveType = "ExistingFamily",
                    reason = reason.trim(),
                    movedBy = actor.id,
                ),
            )
        }
        members.moveToFamily(memberIds, toFamilyId, now)
        auth.log(actor.id, actor.username, "MOVE_MEMBERS", "members", toFamilyId, "${memberIds.size} member(s) moved: ${reason.trim()}")
    }

    suspend fun moveHistory(memberId: Long): List<FamilyMove> = members.movesOf(memberId)

    suspend fun historyOf(familyId: Long): List<RecordHistory> = history.forEntity("family", familyId)

    /** All receipt/certificate-irrelevant numbers, for the numbering scheme. */
    suspend fun familyNumbers(): List<String> = families.allNumbers()

    private suspend fun nextFamilyNumber(): String {
        val next = (families.maxId() ?: 0L) + 1
        return "FAM-${next.toString().padStart(4, '0')}"
    }

    /**
     * The old → new diff shown on every detail sheet, stored as the same JSON
     * shape the desktop writes (`{"field":{"old":…,"new":…}}`) so a database
     * shared between the two apps reads identically.
     */
    private suspend fun recordHistory(
        entityType: String,
        entityId: Long,
        action: String,
        changes: JsonObject,
        reason: String?,
    ) {
        val actor = auth.current ?: return
        history.insert(
            RecordHistory(
                entityType = entityType,
                entityId = entityId,
                action = action,
                userId = actor.id,
                username = actor.username,
                changedAt = IstDate.dateTimeStr(),
                summary = defaultSummary(entityType, action),
                changesJson = if (changes.isEmpty()) null else Json.encodeToString(JsonObject.serializer(), changes),
                reason = reason?.trim()?.ifBlank { null },
            ),
        )
    }

    private fun defaultSummary(entityType: String, action: String): String = when (action) {
        "UPDATE" -> "$entityType updated"
        "CREATE" -> "$entityType created"
        "ARCHIVE" -> "$entityType archived"
        else -> "$entityType $action"
    }
}

data class FamilyInput(
    val houseName: String,
    val houseNumber: String = "",
    val ward: String = "",
    val area: String = "",
    val address: String = "",
    val pincode: String = "",
    val phone: String,
    val altPhone: String = "",
    val notes: String = "",
    val whatsappPhone: String = "",
    val whatsappEnabled: Boolean = true,
)

/** Field-level diff between two records, as `{"field":{"old":…,"new":…}}`. */
fun diffOf(before: FamilyEntity, after: FamilyEntity): JsonObject = buildJsonObject {
    fun field(name: String, old: String?, new: String?) {
        if (old == new) return
        put(name, buildJsonObject {
            put("old", old ?: "")
            put("new", new ?: "")
        })
    }
    field("house_name", before.houseName, after.houseName)
    field("house_number", before.houseNumber, after.houseNumber)
    field("ward", before.ward, after.ward)
    field("area", before.area, after.area)
    field("address", before.address, after.address)
    field("pincode", before.pincode, after.pincode)
    field("phone", before.phone, after.phone)
    field("alternative_phone", before.alternativePhone, after.alternativePhone)
    field("status", before.status, after.status)
    field("notes", before.notes, after.notes)
    field("whatsapp_phone", before.whatsappPhone, after.whatsappPhone)
    field("whatsapp_enabled", before.whatsappEnabled.toString(), after.whatsappEnabled.toString())
}

fun diffOf(before: MemberEntity, after: MemberEntity): JsonObject = buildJsonObject {
    fun field(name: String, old: String?, new: String?) {
        if (old == new) return
        put(name, buildJsonObject {
            put("old", old ?: "")
            put("new", new ?: "")
        })
    }
    field("name", before.name, after.name)
    field("arabic_name", before.arabicName, after.arabicName)
    field("father_name", before.fatherName, after.fatherName)
    field("gender", before.gender, after.gender)
    field("date_of_birth", before.dateOfBirth, after.dateOfBirth)
    field("blood_group", before.bloodGroup, after.bloodGroup)
    field("occupation", before.occupation, after.occupation)
    field("education", before.education, after.education)
    field("marital_status", before.maritalStatus, after.maritalStatus)
    field("mobile", before.mobile, after.mobile)
    field("email", before.email, after.email)
    field("address", before.address, after.address)
    field("emergency_contact", before.emergencyContact, after.emergencyContact)
    field("relationship", before.relationship, after.relationship)
    field("status", before.status, after.status)
}

/** Renders a stored `changes_json` blob for the history panel. */
fun renderChanges(json: String?): List<FieldChange> {
    if (json.isNullOrBlank()) return emptyList()
    return runCatching {
        val obj = Json.parseToJsonElement(json) as? JsonObject ?: return@runCatching emptyList()
        obj.map { (field, value) ->
            val change = value as? JsonObject
            FieldChange(
                field = field.replace('_', ' ').replaceFirstChar { it.uppercase() },
                oldValue = (change?.get("old") as? JsonPrimitive)?.content ?: "—",
                newValue = (change?.get("new") as? JsonPrimitive)?.content ?: "—",
            )
        }
    }.getOrDefault(emptyList())
}

data class FieldChange(val field: String, val oldValue: String, val newValue: String)
