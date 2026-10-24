package app.minzmahallu.core.domain.settings

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.SubscriptionFrequency
import app.minzmahallu.core.database.dao.AuditDao
import app.minzmahallu.core.database.dao.NotificationDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.core.model.NotificationEntity
import app.minzmahallu.core.model.SettingsEntity
import kotlinx.coroutines.flow.Flow
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/** The mahallu's profile — one row, read by every printed document. */
@Singleton
class SettingsRepository @Inject constructor(
    private val dao: SettingsDao,
    private val auth: AuthRepository,
) {

    fun observe(): Flow<SettingsEntity?> = dao.observe()

    suspend fun get(): SettingsEntity = dao.get() ?: SettingsEntity()

    /**
     * Partial update. Only the fields present in [patch] are written — the
     * desktop learned this the hard way: a full-row save from a caller that
     * only meant to change the language silently wiped the registration
     * numbers.
     */
    suspend fun save(patch: SettingsPatch) {
        val current = get()
        val merged = current.copy(
            mahalluName = patch.mahalluName ?: current.mahalluName,
            address = patch.address ?: current.address,
            phone = patch.phone ?: current.phone,
            email = patch.email ?: current.email,
            financialYearStart = patch.financialYearStart ?: current.financialYearStart,
            currencySymbol = patch.currencySymbol?.ifBlank { null } ?: current.currencySymbol,
            subscriptionMonthlyAmount = patch.subscriptionMonthlyAmount ?: current.subscriptionMonthlyAmount,
            subscriptionFrequency = patch.subscriptionFrequency?.wire ?: current.subscriptionFrequency,
            subscriptionQuarterlyAmount = patch.subscriptionQuarterlyAmount ?: current.subscriptionQuarterlyAmount,
            theme = patch.theme ?: current.theme,
            language = patch.language ?: current.language,
            autoBackup = patch.autoBackup?.let { if (it) 1 else 0 } ?: current.autoBackup,
            backupIntervalHours = patch.backupIntervalHours ?: current.backupIntervalHours,
            backupKeepCount = (patch.backupKeepCount ?: current.backupKeepCount).coerceIn(3, 200),
            receiptPrefix = patch.receiptPrefix ?: current.receiptPrefix,
            affiliationNumber = patch.affiliationNumber ?: current.affiliationNumber,
            committeeTermStart = patch.committeeTermStart ?: current.committeeTermStart,
            committeeTermEnd = patch.committeeTermEnd ?: current.committeeTermEnd,
            wakfRegNo = patch.wakfRegNo ?: current.wakfRegNo,
            societyRegNo = patch.societyRegNo ?: current.societyRegNo,
            village = patch.village ?: current.village,
            panchayath = patch.panchayath ?: current.panchayath,
            taluk = patch.taluk ?: current.taluk,
            district = patch.district ?: current.district,
            pincode = patch.pincode ?: current.pincode,
            state = patch.state ?: current.state,
            updatedAt = IstDate.dateTimeStr(),
        )
        dao.upsert(merged)
        val actor = auth.current
        if (actor != null) {
            auth.log(actor.id, actor.username, "UPDATE", "settings", 1, "Mahallu settings updated")
        }
    }

    /** Bind the device identity used by the anti-forgery QR payloads. */
    suspend fun bindDevice(fingerprint: String, signingKey: String) {
        val current = get()
        dao.upsert(
            current.copy(
                deviceFingerprint = fingerprint,
                qrSigningKey = current.qrSigningKey?.takeIf { it.isNotBlank() } ?: signingKey,
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    /** A stable, non-reversible identity for this install. */
    fun fingerprintOf(installId: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(installId.toByteArray())
        return digest.take(4).joinToString("") { "%02x".format(it) }.uppercase()
    }
}

data class SettingsPatch(
    val mahalluName: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val financialYearStart: String? = null,
    val currencySymbol: String? = null,
    val subscriptionMonthlyAmount: Double? = null,
    val subscriptionFrequency: SubscriptionFrequency? = null,
    val subscriptionQuarterlyAmount: Double? = null,
    val theme: String? = null,
    val language: String? = null,
    val autoBackup: Boolean? = null,
    val backupIntervalHours: Int? = null,
    val backupKeepCount: Int? = null,
    val receiptPrefix: String? = null,
    val affiliationNumber: String? = null,
    val committeeTermStart: String? = null,
    val committeeTermEnd: String? = null,
    val wakfRegNo: String? = null,
    val societyRegNo: String? = null,
    val village: String? = null,
    val panchayath: String? = null,
    val taluk: String? = null,
    val district: String? = null,
    val pincode: String? = null,
    val state: String? = null,
)

/** The audit log — who did what, when, and why. Read-only in the app. */
@Singleton
class AuditRepository @Inject constructor(
    private val dao: AuditDao,
) {

    suspend fun page(
        search: String?,
        action: String?,
        module: String?,
        page: Int = 1,
        pageSize: Int = 50,
    ): PagedList<AuditEntry> {
        val q = search?.trim()?.ifBlank { null }
        val rows = dao.page(q, action, module, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, action, module)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun recent(limit: Int = 8): List<AuditEntry> = dao.recent(limit)

    fun observeRecent(limit: Int = 8): Flow<List<AuditEntry>> = dao.observeRecent(limit)

    suspend fun modules(): List<String> = dao.modules()

    suspend fun count(): Int = dao.count()

    /**
     * Chain verification. Each row hashes the previous row's hash, so a row
     * deleted or edited in the middle breaks the chain from that point on —
     * and a truncated tail is caught by the anchor row.
     */
    suspend fun verify(): AuditIntegrity {
        val rows = dao.page(null, null, null, Int.MAX_VALUE, 0)
        if (rows.isEmpty()) return AuditIntegrity(ok = true, entries = 0, firstBadId = null)
        // `page` returns newest-first; walk oldest → newest.
        var previous: String? = null
        for (entry in rows.asReversed()) {
            if (entry.entryHash == null) continue // pre-chain rows are not verifiable
            val expected = hashOf(previous, entry)
            if (entry.entryHash != expected) {
                return AuditIntegrity(ok = false, entries = rows.size, firstBadId = entry.id)
            }
            previous = entry.entryHash
        }
        val anchor = dao.lastHash()
        val tailOk = anchor == null || anchor == rows.first().entryHash
        return AuditIntegrity(ok = tailOk, entries = rows.size, firstBadId = if (tailOk) null else rows.first().id)
    }

    /** Compute the hash a new row must carry, chaining from [previousHash]. */
    fun hashOf(previousHash: String?, entry: AuditEntry): String {
        val material = listOf(
            previousHash.orEmpty(),
            entry.userId?.toString().orEmpty(),
            entry.username.orEmpty(),
            entry.action,
            entry.module.orEmpty(),
            entry.entityId?.toString().orEmpty(),
            entry.description.orEmpty(),
            entry.createdAt,
        ).joinToString("|")
        return MessageDigest.getInstance("SHA-256").digest(material.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}

data class AuditIntegrity(val ok: Boolean, val entries: Int, val firstBadId: Long?)

/** In-app notifications (backup results, alert digests, update notices). */
@Singleton
class NotificationRepository @Inject constructor(
    private val dao: NotificationDao,
) {
    suspend fun recent(limit: Int = 50): List<NotificationEntity> = dao.recent(limit)
    suspend fun unreadCount(): Int = dao.unreadCount()
    suspend fun markRead(id: Long) = dao.markRead(id)
    suspend fun markAllRead() = dao.markAllRead()
    suspend fun push(title: String, message: String?, severity: String = "info") =
        dao.insert(NotificationEntity(title = title, message = message, severity = severity))
}
