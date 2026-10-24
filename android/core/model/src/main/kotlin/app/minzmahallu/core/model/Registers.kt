package app.minzmahallu.core.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/** The Nikah (marriage) register. */
@Entity(tableName = "marriages")
data class MarriageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "marriage_number") val marriageNumber: String,
    @ColumnInfo(name = "bride_name") val brideName: String,
    @ColumnInfo(name = "bride_father") val brideFather: String? = null,
    @ColumnInfo(name = "bride_address") val brideAddress: String? = null,
    @ColumnInfo(name = "groom_name") val groomName: String,
    @ColumnInfo(name = "groom_father") val groomFather: String? = null,
    @ColumnInfo(name = "groom_address") val groomAddress: String? = null,
    @ColumnInfo(name = "witness1") val witness1: String? = null,
    @ColumnInfo(name = "witness2") val witness2: String? = null,
    @ColumnInfo(name = "witness3") val witness3: String? = null,
    @ColumnInfo(name = "witness4") val witness4: String? = null,
    @ColumnInfo(name = "mahar") val mahar: String? = null,
    @ColumnInfo(name = "nikah_date") val nikahDate: String,
    @ColumnInfo(name = "registration_date") val registrationDate: String = SqlDefaults.date(),
    @ColumnInfo(name = "imam_id") val imamId: Long? = null,
    @ColumnInfo(name = "place") val place: String? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = null,
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

/** The death register. */
@Entity(tableName = "deaths")
data class DeathEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "death_number") val deathNumber: String,
    @ColumnInfo(name = "deceased_name") val deceasedName: String,
    @ColumnInfo(name = "father_name") val fatherName: String? = null,
    @ColumnInfo(name = "family_id") val familyId: Long? = null,
    @ColumnInfo(name = "gender") val gender: String? = null,
    @ColumnInfo(name = "date_of_death") val dateOfDeath: String,
    @ColumnInfo(name = "burial_date") val burialDate: String? = null,
    @ColumnInfo(name = "cause_of_death") val causeOfDeath: String? = null,
    @ColumnInfo(name = "burial_place") val burialPlace: String? = null,
    @ColumnInfo(name = "place_of_death") val placeOfDeath: String? = null,
    @ColumnInfo(name = "address") val address: String? = null,
    @ColumnInfo(name = "age") val age: Int? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = null,
    @ColumnInfo(name = "registration_date") val registrationDate: String? = null,
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

data class DeathWithFamily(
    @androidx.room.Embedded val death: DeathEntity,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
)

/** An assistance request: asked → approved → disbursed. */
@Entity(tableName = "welfare_requests")
data class WelfareRequest(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "request_number") val requestNumber: String,
    @ColumnInfo(name = "applicant_name") val applicantName: String,
    @ColumnInfo(name = "family_id") val familyId: Long? = null,
    @ColumnInfo(name = "category") val category: String,
    @ColumnInfo(name = "amount_requested") val amountRequested: Double,
    @ColumnInfo(name = "amount_approved") val amountApproved: Double? = null,
    @ColumnInfo(name = "reason") val reason: String? = null,
    @ColumnInfo(name = "status") val status: String = "Pending",
    @ColumnInfo(name = "approved_by") val approvedBy: Long? = null,
    @ColumnInfo(name = "disbursed_date") val disbursedDate: String? = null,
    @ColumnInfo(name = "minutes_date") val minutesDate: String? = null,
    @ColumnInfo(name = "rejection_reason") val rejectionReason: String? = null,
    @ColumnInfo(name = "processed_by") val processedBy: Long? = null,
    @ColumnInfo(name = "processed_date") val processedDate: String? = null,
    @ColumnInfo(name = "request_date") val requestDate: String? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

data class WelfareWithFamily(
    @androidx.room.Embedded val request: WelfareRequest,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
    @ColumnInfo(name = "approved_by_name") val approvedByName: String?,
)

/**
 * An issued certificate. `qrPayload` carries the anti-forgery string printed as
 * a QR on the document; `reprintCount` watermarks every copy after the first.
 */
@Entity(tableName = "certificates")
data class CertificateEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "certificate_number") val certificateNumber: String,
    @ColumnInfo(name = "type") val type: String,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "family_id") val familyId: Long? = null,
    @ColumnInfo(name = "marriage_id") val marriageId: Long? = null,
    @ColumnInfo(name = "death_id") val deathId: Long? = null,
    @ColumnInfo(name = "issued_to") val issuedTo: String? = null,
    @ColumnInfo(name = "issued_date") val issuedDate: String = SqlDefaults.date(),
    @ColumnInfo(name = "issued_by") val issuedBy: Long? = null,
    @ColumnInfo(name = "qr_payload") val qrPayload: String? = null,
    @ColumnInfo(name = "verification_code") val verificationCode: String? = null,
    @ColumnInfo(name = "reprint_count") val reprintCount: Int = 0,
    @ColumnInfo(name = "status") val status: String = "Issued",
    @ColumnInfo(name = "notes") val notes: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
)

data class CertificateWithRefs(
    @androidx.room.Embedded val certificate: CertificateEntity,
    @ColumnInfo(name = "member_name") val memberName: String?,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
    @ColumnInfo(name = "issued_by_name") val issuedByName: String?,
)

/** A distribution occasion (Iftar, Eid ration, relief kit …). */
@Entity(tableName = "token_events")
data class TokenEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "event_name") val eventName: String,
    @ColumnInfo(name = "event_type") val eventType: String = "general",
    @ColumnInfo(name = "event_date") val eventDate: String,
    @ColumnInfo(name = "event_time") val eventTime: String? = "",
    @ColumnInfo(name = "venue") val venue: String? = "",
    @ColumnInfo(name = "description") val description: String? = "",
    @ColumnInfo(name = "status") val status: String = "active",
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

/** One household's ticket for one event. */
@Entity(tableName = "token_assignments")
data class TokenAssignment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "event_id") val eventId: Long,
    @ColumnInfo(name = "family_id") val familyId: Long,
    @ColumnInfo(name = "token_code") val tokenCode: String,
    @ColumnInfo(name = "status") val status: String = "GENERATED",
    @ColumnInfo(name = "collected") val collected: Int = 0,
    @ColumnInfo(name = "collected_at") val collectedAt: String? = null,
    @ColumnInfo(name = "collected_by") val collectedBy: Long? = null,
    @ColumnInfo(name = "cancelled_at") val cancelledAt: String? = null,
    @ColumnInfo(name = "cancelled_reason") val cancelledReason: String? = null,
    @ColumnInfo(name = "replacement_for") val replacementFor: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
)

data class TokenWithFamily(
    @androidx.room.Embedded val token: TokenAssignment,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
    @ColumnInfo(name = "ward") val ward: String?,
    @ColumnInfo(name = "phone") val phone: String?,
    @ColumnInfo(name = "event_name") val eventName: String?,
    @ColumnInfo(name = "event_date") val eventDate: String?,
    @ColumnInfo(name = "venue") val venue: String?,
)

/** Live collection counters for an event. */
data class TokenStats(
    val total: Int,
    val collected: Int,
    val remaining: Int,
    /** Percentage collected, to one decimal. */
    val rate: Double,
)

/** In-app notifications (backup failures, update notices, alert digests). */
@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "user_id") val userId: Long? = null,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "message") val message: String? = null,
    @ColumnInfo(name = "severity") val severity: String = "info",
    @ColumnInfo(name = "is_read") val isRead: Int = 0,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
)
