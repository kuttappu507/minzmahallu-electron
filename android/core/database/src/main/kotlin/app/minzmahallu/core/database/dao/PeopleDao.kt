package app.minzmahallu.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import app.minzmahallu.core.model.CommitteeMember
import app.minzmahallu.core.model.FamilyEntity
import app.minzmahallu.core.model.FamilyMove
import app.minzmahallu.core.model.FamilyWithStats
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.model.MemberWithFamily
import app.minzmahallu.core.model.StaffEntity
import app.minzmahallu.core.model.StaffPayment
import app.minzmahallu.core.model.StaffPaymentWithStaff

/**
 * Families + members.
 *
 * The list query reproduces `families.service.ts` exactly: the member count
 * excludes inactive members, and the head is the member flagged `is_head`
 * first, else the one whose relationship is "Head".
 */
@Dao
interface FamilyDao {

    @Query(
        """
        SELECT f.*,
          (SELECT COUNT(*) FROM members m WHERE m.family_id = f.id AND m.status != 'Inactive') AS member_count,
          (SELECT m.name FROM members m WHERE m.family_id = f.id AND m.status != 'Inactive'
             AND (m.is_head = 1 OR (m.is_head IS NULL AND m.relationship = 'Head'))
           ORDER BY m.is_head DESC LIMIT 1) AS head_name,
          (SELECT COALESCE(SUM(MAX(0, MAX(0, s.amount - s.amount_paid) + COALESCE(s.arrears,0) - COALESCE(s.advance,0))), 0)
             FROM subscriptions s WHERE s.family_id = f.id AND s.status IN ('Pending','Partial','Overdue')) AS due_amount
        FROM families f
        WHERE (:search IS NULL OR f.family_number LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.house_number LIKE '%' || :search || '%'
               OR f.phone LIKE '%' || :search || '%'
               OR f.area LIKE '%' || :search || '%'
               OR f.ward LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR f.status = :status)
          AND (:approval IS NULL OR f.approval_status = :approval)
        ORDER BY f.family_number ASC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        status: String?,
        approval: String?,
        limit: Int,
        offset: Int,
    ): List<FamilyWithStats>

    @Query(
        """
        SELECT COUNT(*) FROM families f
        WHERE (:search IS NULL OR f.family_number LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.house_number LIKE '%' || :search || '%'
               OR f.phone LIKE '%' || :search || '%'
               OR f.area LIKE '%' || :search || '%'
               OR f.ward LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR f.status = :status)
          AND (:approval IS NULL OR f.approval_status = :approval)
        """,
    )
    suspend fun count(search: String?, status: String?, approval: String?): Int

    @Query("SELECT id FROM families WHERE status = 'Active' ORDER BY id")
    suspend fun activeIds(): List<Long>

    @Query("SELECT * FROM families WHERE id = :id")
    suspend fun byId(id: Long): FamilyEntity?

    @Query("SELECT * FROM families ORDER BY family_number ASC")
    suspend fun all(): List<FamilyEntity>

    @Query(
        """
        SELECT family_number, house_name, id FROM families
        WHERE status = 'Active'
          AND (:search IS NULL OR house_name LIKE '%' || :search || '%'
               OR family_number LIKE '%' || :search || '%')
        ORDER BY family_number ASC LIMIT :limit
        """,
    )
    suspend fun searchLite(search: String?, limit: Int = 40): List<FamilyEntity>

    @Query("SELECT MAX(id) FROM families")
    suspend fun maxId(): Long?

    @Query("SELECT family_number FROM families")
    suspend fun allNumbers(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(family: FamilyEntity): Long

    @Update
    suspend fun update(family: FamilyEntity)

    @Query(
        """
        UPDATE families SET status = 'Archived', archived_at = :at, archived_by = :by,
          archive_reason = :reason, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun archive(id: Long, reason: String, at: String, by: Long?)

    @Query(
        """
        UPDATE families SET status = 'Active', archived_at = NULL, archived_by = NULL,
          archive_reason = NULL, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun restore(id: Long, at: String)

    @Query("UPDATE families SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query("DELETE FROM families WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface MemberDao {

    @Query(
        """
        SELECT m.*, f.family_number, f.house_name AS family_house_name, f.area AS family_area
        FROM members m LEFT JOIN families f ON f.id = m.family_id
        WHERE (:search IS NULL OR m.name LIKE '%' || :search || '%'
               OR m.member_code LIKE '%' || :search || '%'
               OR m.mobile LIKE '%' || :search || '%'
               OR m.email LIKE '%' || :search || '%')
          AND (:familyId IS NULL OR m.family_id = :familyId)
          AND (:status IS NULL OR :status = 'All'
               OR (:status = 'Archived' AND m.archive_state = 1)
               OR (:status = 'Active' AND m.archive_state = 0)
               OR (:status NOT IN ('Archived','Active') AND m.status = :status))
          AND (:approval IS NULL OR m.approval_status = :approval)
        ORDER BY m.member_code ASC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        familyId: Long?,
        status: String?,
        approval: String?,
        limit: Int,
        offset: Int,
    ): List<MemberWithFamily>

    @Query(
        """
        SELECT COUNT(*) FROM members m
        WHERE (:search IS NULL OR m.name LIKE '%' || :search || '%'
               OR m.member_code LIKE '%' || :search || '%'
               OR m.mobile LIKE '%' || :search || '%'
               OR m.email LIKE '%' || :search || '%')
          AND (:familyId IS NULL OR m.family_id = :familyId)
          AND (:status IS NULL OR :status = 'All'
               OR (:status = 'Archived' AND m.archive_state = 1)
               OR (:status = 'Active' AND m.archive_state = 0)
               OR (:status NOT IN ('Archived','Active') AND m.status = :status))
          AND (:approval IS NULL OR m.approval_status = :approval)
        """,
    )
    suspend fun count(search: String?, familyId: Long?, status: String?, approval: String?): Int

    @Query("SELECT * FROM members WHERE id = :id")
    suspend fun byId(id: Long): MemberEntity?

    @Query("SELECT * FROM members WHERE family_id = :familyId AND archive_state = 0 ORDER BY is_head DESC, id ASC")
    suspend fun byFamily(familyId: Long): List<MemberEntity>

    @Query(
        """
        SELECT id FROM members WHERE family_id = :familyId AND archive_state = 0
        ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id
        LIMIT 1
        """,
    )
    suspend fun headId(familyId: Long): Long?

    /** The single-head rule: another member of this family is already head. */
    @Query(
        """
        SELECT id, name FROM members
        WHERE family_id = :familyId AND archive_state = 0
          AND (is_head = 1 OR relationship = 'Head') AND id != :excludeId
        ORDER BY CASE WHEN is_head = 1 THEN 0 ELSE 1 END, id LIMIT 1
        """,
    )
    suspend fun existingHead(familyId: Long, excludeId: Long): MemberEntity?

    @Query(
        """
        SELECT member_code, name, id, family_id FROM members
        WHERE archive_state = 0 AND (:search IS NULL OR name LIKE '%' || :search || '%'
               OR member_code LIKE '%' || :search || '%' OR mobile LIKE '%' || :search || '%')
        ORDER BY name ASC LIMIT :limit
        """,
    )
    suspend fun searchLite(search: String?, limit: Int = 40): List<MemberEntity>

    @Query("SELECT MAX(id) FROM members")
    suspend fun maxId(): Long?

    @Query("SELECT member_code FROM members")
    suspend fun allCodes(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(member: MemberEntity): Long

    @Update
    suspend fun update(member: MemberEntity)

    @Query("UPDATE members SET family_id = :familyId, updated_at = :at WHERE id IN (:ids)")
    suspend fun moveToFamily(ids: List<Long>, familyId: Long, at: String)

    @Query(
        """
        UPDATE members SET archive_state = 1, archived_at = :at, archived_by = :by,
          archive_reason = :reason, archive_source = :source, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun archive(id: Long, reason: String, at: String, by: Long?, source: String)

    @Query(
        """
        UPDATE members SET archive_state = 0, archived_at = NULL, archived_by = NULL,
          archive_reason = NULL, archive_source = NULL, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun restore(id: Long, at: String)

    /** Every active member of a family — used when archiving the household. */
    @Query(
        """
        UPDATE members SET archive_state = 1, archived_at = :at, archived_by = :by,
          archive_reason = :reason, archive_source = 'family', updated_at = :at
        WHERE family_id = :familyId AND archive_state = 0
        """,
    )
    suspend fun archiveWholeFamily(familyId: Long, reason: String, at: String, by: Long?)

    @Query(
        """
        UPDATE members SET archive_state = 0, archived_at = NULL, archive_reason = NULL,
          updated_at = :at
        WHERE family_id = :familyId AND archive_source = 'family'
        """,
    )
    suspend fun restoreFromFamilyArchive(familyId: Long, at: String)

    @Query("UPDATE members SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query("DELETE FROM members WHERE id = :id")
    suspend fun delete(id: Long)

    @Insert
    suspend fun insertMove(move: FamilyMove): Long

    @Query("SELECT * FROM family_moves WHERE member_id = :memberId ORDER BY moved_at DESC, id DESC")
    suspend fun movesOf(memberId: Long): List<FamilyMove>
}

@Dao
interface StaffDao {

    @Query(
        """
        SELECT * FROM staff
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR staff_code LIKE '%' || :search || '%' OR phone LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR status = :status)
          AND (:archived = 1 OR archive_state = 0)
        ORDER BY name ASC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, status: String?, archived: Int, limit: Int, offset: Int): List<StaffEntity>

    @Query(
        """
        SELECT COUNT(*) FROM staff
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR staff_code LIKE '%' || :search || '%' OR phone LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR status = :status)
          AND (:archived = 1 OR archive_state = 0)
        """,
    )
    suspend fun count(search: String?, status: String?, archived: Int): Int

    @Query("SELECT * FROM staff WHERE id = :id")
    suspend fun byId(id: Long): StaffEntity?

    @Query("SELECT MAX(id) FROM staff")
    suspend fun maxId(): Long?

    @Query("SELECT DISTINCT role FROM staff WHERE role IS NOT NULL AND role != '' ORDER BY role")
    suspend fun roles(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(staff: StaffEntity): Long

    @Update
    suspend fun update(staff: StaffEntity)

    @Query(
        """
        UPDATE staff SET archive_state = 1, archived_at = :at, archived_by = :by,
          archive_reason = :reason, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun archive(id: Long, reason: String, at: String, by: Long?)

    @Query("UPDATE staff SET archive_state = 0, archived_at = NULL, archive_reason = NULL, updated_at = :at WHERE id = :id")
    suspend fun restore(id: Long, at: String)

    @Query(
        """
        SELECT p.*, s.name AS staff_name, s.role AS staff_role
        FROM staff_payments p JOIN staff s ON s.id = p.staff_id
        WHERE (:staffId IS NULL OR p.staff_id = :staffId)
          AND (:year IS NULL OR p.period_year = :year)
          AND (:status IS NULL OR :status = 'All' OR p.status = :status)
        ORDER BY p.period_year DESC, p.period_month DESC, p.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun paymentPage(staffId: Long?, year: Int?, status: String?, limit: Int, offset: Int): List<StaffPaymentWithStaff>

    @Query(
        """
        SELECT COUNT(*) FROM staff_payments p
        WHERE (:staffId IS NULL OR p.staff_id = :staffId)
          AND (:year IS NULL OR p.period_year = :year)
          AND (:status IS NULL OR :status = 'All' OR p.status = :status)
        """,
    )
    suspend fun paymentCount(staffId: Long?, year: Int?, status: String?): Int

    /** The duplicate-salary guard: this period is already paid for this person. */
    @Query(
        """
        SELECT * FROM staff_payments
        WHERE staff_id = :staffId AND period_year = :year AND period_month = :month
          AND status = 'Paid' LIMIT 1
        """,
    )
    suspend fun existingPayment(staffId: Long, year: Int, month: Int): StaffPayment?

    @Query(
        """
        SELECT COALESCE(SUM(amount), 0) FROM staff_payments
        WHERE status = 'Paid' AND (:year IS NULL OR period_year = :year)
        """,
    )
    suspend fun paidTotal(year: Int?): Double

    @Query(
        """
        SELECT COALESCE(SUM(amount), 0) FROM staff_payments
        WHERE status = 'Paid' AND period_year = :year AND period_month = :month
        """,
    )
    suspend fun paidTotalFor(year: Int, month: Int): Double

    @Insert
    suspend fun insertPayment(payment: StaffPayment): Long

    @Query("UPDATE staff_payments SET status = 'Cancelled' WHERE id = :id")
    suspend fun cancelPayment(id: Long)
}

@Dao
interface CommitteeDao {

    @Query(
        """
        SELECT * FROM committee_members
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR committee_code LIKE '%' || :search || '%'
               OR position LIKE '%' || :search || '%' OR phone LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR committee_type = :type)
          AND (:status IS NULL OR :status = 'All' OR status = :status)
          AND (:archived = 1 OR archive_state = 0)
        ORDER BY
          CASE status WHEN 'Active' THEN 0 WHEN 'Past' THEN 1 ELSE 2 END,
          name ASC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        type: String?,
        status: String?,
        archived: Int,
        limit: Int,
        offset: Int,
    ): List<CommitteeMember>

    @Query(
        """
        SELECT COUNT(*) FROM committee_members
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR committee_code LIKE '%' || :search || '%'
               OR position LIKE '%' || :search || '%' OR phone LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR committee_type = :type)
          AND (:status IS NULL OR :status = 'All' OR status = :status)
          AND (:archived = 1 OR archive_state = 0)
        """,
    )
    suspend fun count(search: String?, type: String?, status: String?, archived: Int): Int

    @Query("SELECT * FROM committee_members WHERE id = :id")
    suspend fun byId(id: Long): CommitteeMember?

    @Query("SELECT MAX(id) FROM committee_members")
    suspend fun maxId(): Long?

    /** Terms ending within [days] — the dashboard alert. */
    @Query(
        """
        SELECT COUNT(*) FROM committee_members
        WHERE archive_state = 0 AND status = 'Active'
          AND term_end IS NOT NULL AND term_end >= :today AND term_end <= :horizon
        """,
    )
    suspend fun termsEndingSoon(today: String, horizon: String): Int

    @Query(
        """
        SELECT position, COUNT(*) AS n FROM committee_members
        WHERE archive_state = 0 AND status = 'Active'
        GROUP BY position ORDER BY n DESC
        """,
    )
    suspend fun positionSummary(): List<PositionCount>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(member: CommitteeMember): Long

    @Update
    suspend fun update(member: CommitteeMember)

    @Query(
        """
        UPDATE committee_members SET archive_state = 1, archived_at = :at, archived_by = :by,
          archive_reason = :reason, updated_at = :at
        WHERE id = :id
        """,
    )
    suspend fun archive(id: Long, reason: String, at: String, by: Long?)

    @Query("UPDATE committee_members SET archive_state = 0, archived_at = NULL, archive_reason = NULL, updated_at = :at WHERE id = :id")
    suspend fun restore(id: Long, at: String)
}

data class PositionCount(
    val position: String,
    val n: Int,
)

/** Wraps the two statements every archive performs so they stay atomic. */
@Dao
abstract class ArchiveDao(private val members: MemberDao, private val families: FamilyDao) {

    @Transaction
    open suspend fun archiveFamilyWithMembers(familyId: Long, reason: String, at: String, by: Long?) {
        members.archiveWholeFamily(familyId, reason, at, by)
        families.archive(familyId, reason, at, by)
    }

    @Transaction
    open suspend fun restoreFamilyWithMembers(familyId: Long, at: String) {
        members.restoreFromFamilyArchive(familyId, at)
        families.restore(familyId, at)
    }
}
