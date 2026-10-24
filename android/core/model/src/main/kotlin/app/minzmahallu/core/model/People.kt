package app.minzmahallu.core.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/** A registered household — the unit the mahallu bills and counts. */
@Entity(tableName = "families")
data class FamilyEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "family_number") val familyNumber: String,
    @ColumnInfo(name = "house_name") val houseName: String? = null,
    @ColumnInfo(name = "house_number") val houseNumber: String? = null,
    @ColumnInfo(name = "ward") val ward: String? = null,
    @ColumnInfo(name = "area") val area: String? = null,
    @ColumnInfo(name = "address") val address: String? = null,
    @ColumnInfo(name = "pincode") val pincode: String? = null,
    @ColumnInfo(name = "phone") val phone: String? = null,
    @ColumnInfo(name = "alternative_phone") val alternativePhone: String? = null,
    @ColumnInfo(name = "status") val status: String = "Active",
    @ColumnInfo(name = "notes") val notes: String? = null,
    @ColumnInfo(name = "whatsapp_phone") val whatsappPhone: String? = null,
    @ColumnInfo(name = "whatsapp_enabled") val whatsappEnabled: Int = 1,
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "archived_at") val archivedAt: String? = null,
    @ColumnInfo(name = "archived_by") val archivedBy: Long? = null,
    @ColumnInfo(name = "archive_reason") val archiveReason: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

/** A family row joined with the counts the list screen shows. */
data class FamilyWithStats(
    @androidx.room.Embedded val family: FamilyEntity,
    @ColumnInfo(name = "member_count") val memberCount: Int,
    @ColumnInfo(name = "head_name") val headName: String?,
    @ColumnInfo(name = "due_amount") val dueAmount: Double?,
)

/** A person belonging to a household. */
@Entity(tableName = "members")
data class MemberEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "family_id") val familyId: Long,
    @ColumnInfo(name = "member_code") val memberCode: String? = null,
    @ColumnInfo(name = "photo_path") val photoPath: String? = null,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "arabic_name") val arabicName: String? = null,
    @ColumnInfo(name = "father_name") val fatherName: String? = null,
    @ColumnInfo(name = "gender") val gender: String,
    @ColumnInfo(name = "date_of_birth") val dateOfBirth: String? = null,
    @ColumnInfo(name = "age") val age: Int? = null,
    @ColumnInfo(name = "blood_group") val bloodGroup: String? = null,
    @ColumnInfo(name = "occupation") val occupation: String? = null,
    @ColumnInfo(name = "education") val education: String? = null,
    @ColumnInfo(name = "marital_status") val maritalStatus: String? = null,
    @ColumnInfo(name = "mobile") val mobile: String? = null,
    @ColumnInfo(name = "email") val email: String? = null,
    @ColumnInfo(name = "nationality") val nationality: String = "Indian",
    @ColumnInfo(name = "address") val address: String? = null,
    @ColumnInfo(name = "emergency_contact") val emergencyContact: String? = null,
    @ColumnInfo(name = "relationship") val relationship: String? = null,
    @ColumnInfo(name = "is_head") val isHead: Int = 0,
    @ColumnInfo(name = "status") val status: String = "Active",
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "father_id") val fatherId: Long? = null,
    @ColumnInfo(name = "mother_id") val motherId: Long? = null,
    @ColumnInfo(name = "spouse_id") val spouseId: Long? = null,
    @ColumnInfo(name = "archive_state") val archiveState: Int = 0,
    @ColumnInfo(name = "archive_source") val archiveSource: String? = null,
    @ColumnInfo(name = "archived_at") val archivedAt: String? = null,
    @ColumnInfo(name = "archived_by") val archivedBy: Long? = null,
    @ColumnInfo(name = "archive_reason") val archiveReason: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

data class MemberWithFamily(
    @androidx.room.Embedded val member: MemberEntity,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "family_house_name") val familyHouseName: String?,
    @ColumnInfo(name = "family_area") val familyArea: String?,
)

/** A paid employee of the mahallu (Imam, Muazzin, cleaner, …). */
@Entity(tableName = "staff")
data class StaffEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "staff_code") val staffCode: String,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "role") val role: String = "Staff",
    @ColumnInfo(name = "id_number") val idNumber: String? = null,
    @ColumnInfo(name = "phone") val phone: String? = "",
    @ColumnInfo(name = "email") val email: String? = "",
    @ColumnInfo(name = "address") val address: String? = "",
    @ColumnInfo(name = "joined_date") val joinedDate: String? = null,
    @ColumnInfo(name = "salary") val salary: Double = 0.0,
    @ColumnInfo(name = "payment_frequency") val paymentFrequency: String = "Monthly",
    @ColumnInfo(name = "status") val status: String = "Active",
    @ColumnInfo(name = "notes") val notes: String? = "",
    @ColumnInfo(name = "archive_state") val archiveState: Int = 0,
    @ColumnInfo(name = "archive_source") val archiveSource: String? = null,
    @ColumnInfo(name = "archived_at") val archivedAt: String? = null,
    @ColumnInfo(name = "archived_by") val archivedBy: Long? = null,
    @ColumnInfo(name = "archive_reason") val archiveReason: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

/** One salary payment for one staff member in one period. */
@Entity(tableName = "staff_payments")
data class StaffPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "staff_id") val staffId: Long,
    @ColumnInfo(name = "period_month") val periodMonth: Int,
    @ColumnInfo(name = "period_year") val periodYear: Int,
    @ColumnInfo(name = "amount") val amount: Double = 0.0,
    @ColumnInfo(name = "payment_date") val paymentDate: String = SqlDefaults.date(),
    @ColumnInfo(name = "payment_method") val paymentMethod: String? = "Cash",
    @ColumnInfo(name = "transaction_ref") val transactionRef: String? = "",
    @ColumnInfo(name = "status") val status: String = "Paid",
    @ColumnInfo(name = "notes") val notes: String? = "",
    @ColumnInfo(name = "paid_by") val paidBy: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
)

data class StaffPaymentWithStaff(
    @androidx.room.Embedded val payment: StaffPayment,
    @ColumnInfo(name = "staff_name") val staffName: String?,
    @ColumnInfo(name = "staff_role") val staffRole: String?,
)

/** An elected community representative holding office for a defined term. */
@Entity(tableName = "committee_members")
data class CommitteeMember(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "committee_code") val committeeCode: String,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "position") val position: String = "Committee Member",
    @ColumnInfo(name = "committee_type") val committeeType: String = "Executive",
    @ColumnInfo(name = "phone") val phone: String? = "",
    @ColumnInfo(name = "email") val email: String? = "",
    @ColumnInfo(name = "address") val address: String? = "",
    @ColumnInfo(name = "term_start") val termStart: String? = null,
    @ColumnInfo(name = "term_end") val termEnd: String? = null,
    @ColumnInfo(name = "status") val status: String = "Active",
    @ColumnInfo(name = "notes") val notes: String? = "",
    @ColumnInfo(name = "archive_state") val archiveState: Int = 0,
    @ColumnInfo(name = "archive_source") val archiveSource: String? = null,
    @ColumnInfo(name = "archived_at") val archivedAt: String? = null,
    @ColumnInfo(name = "archived_by") val archivedBy: Long? = null,
    @ColumnInfo(name = "archive_reason") val archiveReason: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

/** A member moving between households — kept as its own audit trail. */
@Entity(tableName = "family_moves")
data class FamilyMove(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "member_id") val memberId: Long,
    @ColumnInfo(name = "old_family_id") val oldFamilyId: Long,
    @ColumnInfo(name = "new_family_id") val newFamilyId: Long,
    @ColumnInfo(name = "move_type") val moveType: String,
    @ColumnInfo(name = "reason") val reason: String,
    @ColumnInfo(name = "moved_at") val movedAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "moved_by") val movedBy: Long? = null,
)
