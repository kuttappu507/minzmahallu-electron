package app.minzmahallu.core.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A login account. Column names match the Electron schema exactly
 * (`resources/sql/schema.sql` + `ensureRuntimeSchema`), so a database copied
 * off the desktop app opens in this one unchanged.
 */
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "username") val username: String,
    @ColumnInfo(name = "full_name") val fullName: String,
    @ColumnInfo(name = "password_hash") val passwordHash: String,
    @ColumnInfo(name = "password_salt") val passwordSalt: String,
    @ColumnInfo(name = "role") val role: String,
    @ColumnInfo(name = "email") val email: String? = null,
    @ColumnInfo(name = "phone") val phone: String? = null,
    @ColumnInfo(name = "is_active") val isActive: Int = 1,
    @ColumnInfo(name = "is_locked") val isLocked: Int = 0,
    @ColumnInfo(name = "failed_attempts") val failedAttempts: Int = 0,
    @ColumnInfo(name = "locked_until") val lockedUntil: String? = null,
    @ColumnInfo(name = "last_login_at") val lastLoginAt: String? = null,
    @ColumnInfo(name = "must_change_pwd") val mustChangePwd: Int = 0,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

/** The signed-in account, as the UI sees it. */
data class SessionUser(
    val id: Long,
    val username: String,
    val fullName: String,
    val role: app.minzmahallu.core.common.Role,
    val mustChangePassword: Boolean,
    val initials: String,
)

/**
 * The mahallu's own profile — one row, always id = 1.
 * Drives every printed receipt, certificate and report header.
 */
@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey val id: Long = 1,
    @ColumnInfo(name = "mahallu_name") val mahalluName: String = "Minz Mahallu Management",
    @ColumnInfo(name = "address") val address: String? = null,
    @ColumnInfo(name = "phone") val phone: String? = null,
    @ColumnInfo(name = "email") val email: String? = null,
    @ColumnInfo(name = "logo_path") val logoPath: String? = null,
    @ColumnInfo(name = "seal_path") val sealPath: String? = null,
    @ColumnInfo(name = "financial_year_start") val financialYearStart: String = "04-01",
    @ColumnInfo(name = "currency_symbol") val currencySymbol: String = "₹",
    @ColumnInfo(name = "subscription_monthly_amount") val subscriptionMonthlyAmount: Double = 100.0,
    @ColumnInfo(name = "subscription_frequency") val subscriptionFrequency: String = "Monthly",
    @ColumnInfo(name = "subscription_quarterly_amount") val subscriptionQuarterlyAmount: Double = 300.0,
    @ColumnInfo(name = "theme") val theme: String = "light",
    @ColumnInfo(name = "language") val language: String = "ml",
    @ColumnInfo(name = "auto_backup") val autoBackup: Int = 1,
    @ColumnInfo(name = "backup_interval_hours") val backupIntervalHours: Int = 24,
    @ColumnInfo(name = "backup_keep_count") val backupKeepCount: Int = 30,
    @ColumnInfo(name = "receipt_prefix") val receiptPrefix: String = "RCP",
    @ColumnInfo(name = "affiliation_number") val affiliationNumber: String? = null,
    @ColumnInfo(name = "committee_term_start") val committeeTermStart: String? = null,
    @ColumnInfo(name = "committee_term_end") val committeeTermEnd: String? = null,
    @ColumnInfo(name = "wakf_reg_no") val wakfRegNo: String? = null,
    @ColumnInfo(name = "society_reg_no") val societyRegNo: String? = null,
    @ColumnInfo(name = "village") val village: String? = null,
    @ColumnInfo(name = "panchayath") val panchayath: String? = null,
    @ColumnInfo(name = "taluk") val taluk: String? = null,
    @ColumnInfo(name = "district") val district: String? = null,
    @ColumnInfo(name = "pincode") val pincode: String? = null,
    @ColumnInfo(name = "state") val state: String? = null,
    @ColumnInfo(name = "device_fingerprint") val deviceFingerprint: String? = null,
    @ColumnInfo(name = "qr_signing_key") val qrSigningKey: String? = null,
    @ColumnInfo(name = "backup_mirror_dir") val backupMirrorDir: String? = null,
    @ColumnInfo(name = "demo_data") val demoData: Int = 0,
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

/** One row of the tamper-evident audit log. */
@Entity(tableName = "audit_log")
data class AuditEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "user_id") val userId: Long? = null,
    @ColumnInfo(name = "username") val username: String? = null,
    @ColumnInfo(name = "action") val action: String,
    @ColumnInfo(name = "module") val module: String? = null,
    @ColumnInfo(name = "entity_id") val entityId: Long? = null,
    @ColumnInfo(name = "description") val description: String? = null,
    @ColumnInfo(name = "ip_address") val ipAddress: String? = null,
    @ColumnInfo(name = "metadata") val metadata: String? = null,
    @ColumnInfo(name = "prev_hash") val prevHash: String? = null,
    @ColumnInfo(name = "entry_hash") val entryHash: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
)

/**
 * Per-record change history — who changed what, and why. Shown on the detail
 * sheet of every register (family, member, staff, committee) as an old → new
 * diff, exactly as the desktop "Activity & History" panel does.
 */
@Entity(tableName = "record_history")
data class RecordHistory(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: Long,
    @ColumnInfo(name = "action") val action: String,
    @ColumnInfo(name = "user_id") val userId: Long? = null,
    @ColumnInfo(name = "username") val username: String? = null,
    @ColumnInfo(name = "changed_at") val changedAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "summary") val summary: String,
    @ColumnInfo(name = "changes_json") val changesJson: String? = null,
    @ColumnInfo(name = "reason") val reason: String? = null,
)

/**
 * Defaults that mirror the SQL `DEFAULT (datetime('now'))` clauses. Room cannot
 * evaluate a SQL expression default portably for TEXT columns, so the value is
 * supplied in Kotlin at construction time — the same instant, the same format.
 */
object SqlDefaults {
    fun now(): String = app.minzmahallu.core.common.IstDate.dateTimeStr() + ":00"
    fun date(): String = app.minzmahallu.core.common.IstDate.today()
}
