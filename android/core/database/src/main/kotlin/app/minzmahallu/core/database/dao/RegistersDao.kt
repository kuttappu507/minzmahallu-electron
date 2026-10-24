package app.minzmahallu.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import app.minzmahallu.core.model.CertificateEntity
import app.minzmahallu.core.model.CertificateWithRefs
import app.minzmahallu.core.model.DeathEntity
import app.minzmahallu.core.model.DeathWithFamily
import app.minzmahallu.core.model.MarriageEntity
import app.minzmahallu.core.model.NotificationEntity
import app.minzmahallu.core.model.TokenAssignment
import app.minzmahallu.core.model.TokenEvent
import app.minzmahallu.core.model.TokenWithFamily
import app.minzmahallu.core.model.WelfareRequest
import app.minzmahallu.core.model.WelfareWithFamily

@Dao
interface MarriageDao {

    @Query(
        """
        SELECT * FROM marriages
        WHERE (:search IS NULL OR marriage_number LIKE '%' || :search || '%'
               OR bride_name LIKE '%' || :search || '%' OR groom_name LIKE '%' || :search || '%'
               OR place LIKE '%' || :search || '%')
          AND (:from IS NULL OR nikah_date >= :from)
          AND (:to IS NULL OR nikah_date <= :to)
          AND (:approval IS NULL OR approval_status = :approval)
        ORDER BY nikah_date DESC, id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, from: String?, to: String?, approval: String?, limit: Int, offset: Int): List<MarriageEntity>

    @Query(
        """
        SELECT COUNT(*) FROM marriages
        WHERE (:search IS NULL OR marriage_number LIKE '%' || :search || '%'
               OR bride_name LIKE '%' || :search || '%' OR groom_name LIKE '%' || :search || '%'
               OR place LIKE '%' || :search || '%')
          AND (:from IS NULL OR nikah_date >= :from)
          AND (:to IS NULL OR nikah_date <= :to)
          AND (:approval IS NULL OR approval_status = :approval)
        """,
    )
    suspend fun count(search: String?, from: String?, to: String?, approval: String?): Int

    @Query("SELECT * FROM marriages WHERE id = :id")
    suspend fun byId(id: Long): MarriageEntity?

    @Query("SELECT * FROM marriages ORDER BY nikah_date DESC, id DESC")
    suspend fun all(): List<MarriageEntity>

    @Query("SELECT COUNT(*) FROM marriages WHERE strftime('%Y', nikah_date) = :year")
    suspend fun countInYear(year: String): Int

    @Query("SELECT marriage_number FROM marriages")
    suspend fun allNumbers(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(marriage: MarriageEntity): Long

    @Update
    suspend fun update(marriage: MarriageEntity)

    @Query("UPDATE marriages SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query("DELETE FROM marriages WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface DeathDao {

    @Query(
        """
        SELECT d.*, f.family_number, f.house_name
        FROM deaths d LEFT JOIN families f ON f.id = d.family_id
        WHERE (:search IS NULL OR d.death_number LIKE '%' || :search || '%'
               OR d.deceased_name LIKE '%' || :search || '%'
               OR d.father_name LIKE '%' || :search || '%'
               OR d.burial_place LIKE '%' || :search || '%')
          AND (:from IS NULL OR d.date_of_death >= :from)
          AND (:to IS NULL OR d.date_of_death <= :to)
          AND (:approval IS NULL OR d.approval_status = :approval)
        ORDER BY d.date_of_death DESC, d.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, from: String?, to: String?, approval: String?, limit: Int, offset: Int): List<DeathWithFamily>

    @Query(
        """
        SELECT COUNT(*) FROM deaths d
        WHERE (:search IS NULL OR d.death_number LIKE '%' || :search || '%'
               OR d.deceased_name LIKE '%' || :search || '%'
               OR d.father_name LIKE '%' || :search || '%'
               OR d.burial_place LIKE '%' || :search || '%')
          AND (:from IS NULL OR d.date_of_death >= :from)
          AND (:to IS NULL OR d.date_of_death <= :to)
          AND (:approval IS NULL OR d.approval_status = :approval)
        """,
    )
    suspend fun count(search: String?, from: String?, to: String?, approval: String?): Int

    @Query(
        """
        SELECT d.*, f.family_number, f.house_name
        FROM deaths d LEFT JOIN families f ON f.id = d.family_id WHERE d.id = :id
        """,
    )
    suspend fun byId(id: Long): DeathWithFamily?

    @Query("SELECT COUNT(*) FROM deaths WHERE strftime('%Y', date_of_death) = :year")
    suspend fun countInYear(year: String): Int

    @Query("SELECT death_number FROM deaths")
    suspend fun allNumbers(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(death: DeathEntity): Long

    @Update
    suspend fun update(death: DeathEntity)

    @Query("UPDATE deaths SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query("DELETE FROM deaths WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface WelfareDao {

    @Query(
        """
        SELECT w.*, f.family_number, f.house_name, u.username AS approved_by_name
        FROM welfare_requests w
          LEFT JOIN families f ON f.id = w.family_id
          LEFT JOIN users u ON u.id = w.approved_by
        WHERE (:search IS NULL OR w.applicant_name LIKE '%' || :search || '%'
               OR w.request_number LIKE '%' || :search || '%'
               OR w.reason LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR w.status = :status)
          AND (:category IS NULL OR :category = 'All' OR w.category = :category)
        ORDER BY
          CASE w.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
          w.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, status: String?, category: String?, limit: Int, offset: Int): List<WelfareWithFamily>

    @Query(
        """
        SELECT COUNT(*) FROM welfare_requests w
        WHERE (:search IS NULL OR w.applicant_name LIKE '%' || :search || '%'
               OR w.request_number LIKE '%' || :search || '%'
               OR w.reason LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR w.status = :status)
          AND (:category IS NULL OR :category = 'All' OR w.category = :category)
        """,
    )
    suspend fun count(search: String?, status: String?, category: String?): Int

    @Query("SELECT * FROM welfare_requests WHERE id = :id")
    suspend fun byId(id: Long): WelfareRequest?

    @Query("SELECT COUNT(*) FROM welfare_requests WHERE status = 'Pending'")
    suspend fun pendingCount(): Int

    @Query(
        """
        SELECT COALESCE(SUM(amount_approved),0) FROM welfare_requests
        WHERE status = 'Disbursed' AND strftime('%Y-%m', COALESCE(disbursed_date, created_at)) = :month
        """,
    )
    suspend fun disbursedInMonth(month: String): Double

    @Query("SELECT COUNT(*) FROM welfare_requests WHERE status = 'Disbursed' AND strftime('%Y', disbursed_date) = :year")
    suspend fun beneficiariesInYear(year: String): Int

    @Query("SELECT COALESCE(SUM(amount_approved),0) FROM welfare_requests WHERE status = 'Disbursed'")
    suspend fun disbursedTotal(): Double

    @Query("SELECT request_number FROM welfare_requests")
    suspend fun allNumbers(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(request: WelfareRequest): Long

    @Update
    suspend fun update(request: WelfareRequest)

    @Query("DELETE FROM welfare_requests WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface CertificateDao {

    @Query(
        """
        SELECT c.*, m.name AS member_name, f.family_number, f.house_name, u.username AS issued_by_name
        FROM certificates c
          LEFT JOIN members m ON m.id = c.member_id
          LEFT JOIN families f ON f.id = c.family_id
          LEFT JOIN users u ON u.id = c.issued_by
        WHERE (:search IS NULL OR c.certificate_number LIKE '%' || :search || '%'
               OR c.issued_to LIKE '%' || :search || '%'
               OR m.name LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR c.type = :type)
        ORDER BY c.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, type: String?, limit: Int, offset: Int): List<CertificateWithRefs>

    @Query(
        """
        SELECT COUNT(*) FROM certificates c
          LEFT JOIN members m ON m.id = c.member_id
          LEFT JOIN families f ON f.id = c.family_id
        WHERE (:search IS NULL OR c.certificate_number LIKE '%' || :search || '%'
               OR c.issued_to LIKE '%' || :search || '%'
               OR m.name LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR c.type = :type)
        """,
    )
    suspend fun count(search: String?, type: String?): Int

    @Query(
        """
        SELECT c.*, m.name AS member_name, f.family_number, f.house_name, u.username AS issued_by_name
        FROM certificates c
          LEFT JOIN members m ON m.id = c.member_id
          LEFT JOIN families f ON f.id = c.family_id
          LEFT JOIN users u ON u.id = c.issued_by
        WHERE c.id = :id
        """,
    )
    suspend fun byId(id: Long): CertificateWithRefs?

    @Query("SELECT * FROM certificates WHERE certificate_number = :number LIMIT 1")
    suspend fun byNumber(number: String): CertificateEntity?

    @Query("SELECT * FROM certificates WHERE verification_code = :code LIMIT 1")
    suspend fun byVerificationCode(code: String): CertificateEntity?

    @Query(
        """
        SELECT * FROM certificates
        WHERE family_id = :familyId
        ORDER BY issued_date DESC, id DESC
        """,
    )
    suspend fun byFamily(familyId: Long): List<CertificateEntity>

    @Query(
        """
        SELECT * FROM certificates
        WHERE member_id = :memberId
        ORDER BY issued_date DESC, id DESC
        """,
    )
    suspend fun byMember(memberId: Long): List<CertificateEntity>

    @Query("SELECT certificate_number FROM certificates")
    suspend fun allNumbers(): List<String>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(certificate: CertificateEntity): Long

    @Update
    suspend fun update(certificate: CertificateEntity)

    @Query("UPDATE certificates SET reprint_count = reprint_count + 1 WHERE id = :id")
    suspend fun markReprint(id: Long)

    @Query("UPDATE certificates SET status = :status WHERE id = :id")
    suspend fun setStatus(id: Long, status: String)

    @Query("DELETE FROM certificates WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface TokenDao {

    @Query("SELECT * FROM token_events ORDER BY event_date DESC, id DESC")
    suspend fun events(): List<TokenEvent>

    @Query("SELECT * FROM token_events WHERE id = :id")
    suspend fun eventById(id: Long): TokenEvent?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertEvent(event: TokenEvent): Long

    @Update
    suspend fun updateEvent(event: TokenEvent)

    @Query("DELETE FROM token_assignments WHERE event_id = :eventId")
    suspend fun deleteTokensOf(eventId: Long)

    @Query("DELETE FROM token_events WHERE id = :id")
    suspend fun deleteEvent(id: Long)

    @Query("SELECT COUNT(*) FROM token_assignments WHERE event_id = :eventId")
    suspend fun tokenCountOf(eventId: Long): Int

    @Query(
        """
        SELECT ta.*, f.family_number, f.house_name, f.ward, f.phone,
          te.event_name, te.event_date, te.venue
        FROM token_assignments ta
          LEFT JOIN families f ON f.id = ta.family_id
          LEFT JOIN token_events te ON te.id = ta.event_id
        WHERE (:eventId IS NULL OR ta.event_id = :eventId)
          AND (:status IS NULL OR :status = 'All' OR ta.status = :status)
          AND (:search IS NULL OR ta.token_code LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.family_number LIKE '%' || :search || '%'
               OR f.ward LIKE '%' || :search || '%')
        ORDER BY ta.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(eventId: Long?, status: String?, search: String?, limit: Int, offset: Int): List<TokenWithFamily>

    @Query(
        """
        SELECT COUNT(*) FROM token_assignments ta LEFT JOIN families f ON f.id = ta.family_id
        WHERE (:eventId IS NULL OR ta.event_id = :eventId)
          AND (:status IS NULL OR :status = 'All' OR ta.status = :status)
          AND (:search IS NULL OR ta.token_code LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.family_number LIKE '%' || :search || '%'
               OR f.ward LIKE '%' || :search || '%')
        """,
    )
    suspend fun count(eventId: Long?, status: String?, search: String?): Int

    @Query("SELECT * FROM token_assignments WHERE id = :id")
    suspend fun byId(id: Long): TokenAssignment?

    /** Look a token up by the code read at the door. */
    @Query(
        """
        SELECT ta.*, f.family_number, f.house_name, f.ward, f.phone,
          te.event_name, te.event_date, te.venue
        FROM token_assignments ta
          LEFT JOIN families f ON f.id = ta.family_id
          LEFT JOIN token_events te ON te.id = ta.event_id
        WHERE ta.token_code = :code ORDER BY ta.id DESC LIMIT 1
        """,
    )
    suspend fun byCode(code: String): TokenWithFamily?

    @Query("SELECT family_id FROM token_assignments WHERE event_id = :eventId AND status != 'CANCELLED'")
    suspend fun familiesWithTokens(eventId: Long): List<Long>

    @Query("SELECT token_code FROM token_assignments WHERE event_id = :eventId")
    suspend fun codesOf(eventId: Long): List<String>

    @Query("SELECT COUNT(*) FROM token_assignments WHERE event_id = :eventId AND status != 'CANCELLED'")
    suspend fun totalFor(eventId: Long): Int

    @Query("SELECT COUNT(*) FROM token_assignments WHERE event_id = :eventId AND status = 'COLLECTED'")
    suspend fun collectedFor(eventId: Long): Int

    @Insert
    suspend fun insert(token: TokenAssignment): Long

    @Query(
        """
        UPDATE token_assignments SET status = 'COLLECTED', collected = 1,
          collected_at = :at, collected_by = :by
        WHERE id = :id AND status != 'CANCELLED'
        """,
    )
    suspend fun collect(id: Long, at: String, by: Long?): Int

    @Query(
        """
        UPDATE token_assignments SET status = 'CANCELLED', cancelled_at = :at,
          cancelled_reason = :reason
        WHERE id = :id
        """,
    )
    suspend fun cancel(id: Long, reason: String, at: String): Int
}

@Dao
interface NotificationDao {

    @Query("SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT :limit")
    suspend fun recent(limit: Int = 50): List<NotificationEntity>

    @Query("SELECT COUNT(*) FROM notifications WHERE is_read = 0")
    suspend fun unreadCount(): Int

    @Insert
    suspend fun insert(notification: NotificationEntity): Long

    @Query("UPDATE notifications SET is_read = 1 WHERE id = :id")
    suspend fun markRead(id: Long)

    @Query("UPDATE notifications SET is_read = 1")
    suspend fun markAllRead()
}
