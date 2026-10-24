package app.minzmahallu.core.domain.auth

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.PasswordPolicy
import app.minzmahallu.core.common.Role
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.database.MahalluDatabase
import app.minzmahallu.core.database.dao.AuditDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.database.dao.UserDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.core.model.UserEntity
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.ZonedDateTime
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Authentication, exactly as `electron/services/auth.service.ts` does it:
 * PBKDF2-SHA256, 200 000 iterations, a random 16-byte salt, and the stored form
 * `pbkdf2_sha256$<iter>$<saltB64>$<hashB64>`.
 *
 * Keeping the encoding identical is what lets the same database be used by the
 * desktop app and this one — a password set on Windows still verifies here.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val users: UserDao,
    private val audit: AuditDao,
    private val settings: SettingsDao,
) {

    private val random = SecureRandom()

    /** The signed-in account for this process, or null when logged out. */
    @Volatile
    var current: CurrentActor? = null
        private set

    data class CurrentActor(val id: Long, val username: String, val role: Role)

    // ------------------------------------------------------------------ setup

    /**
     * True when the app must show Initial Setup: no accounts at all, or the
     * only account is the publicly-known seeded placeholder administrator.
     */
    suspend fun needsInitialSetup(): Boolean {
        val count = users.count()
        if (count == 0) return true
        val seeded = users.seededAdministrator(MahalluDatabase.SEEDED_ADMIN_HASHES)
        return seeded != null && count == 1
    }

    suspend fun createInitialAdministrator(username: String, fullName: String, password: String): Session {
        if (!needsInitialSetup()) fail(ErrorKeys.SETUP_DONE)
        val name = username.trim()
        PasswordPolicy.usernameError(name)?.let { fail(ErrorKeys.USERNAME_POLICY, it.name) }
        if (fullName.isBlank()) fail(ErrorKeys.VALIDATION, "full name")
        PasswordPolicy.violation(password)?.let { fail(ErrorKeys.PWD_POLICY, it::class.simpleName) }

        val (hash, salt) = hashPassword(password)
        val placeholder = users.seededAdministrator(MahalluDatabase.SEEDED_ADMIN_HASHES)
        val now = IstDate.dateTimeStr()

        // The placeholder is REPLACED on the same id so the audit trail stays
        // intact — the rule the desktop app states explicitly.
        val id = if (placeholder != null) {
            users.update(
                placeholder.copy(
                    username = name,
                    fullName = fullName.trim(),
                    passwordHash = hash,
                    passwordSalt = salt,
                    role = Role.Administrator.wire,
                    isActive = 1,
                    isLocked = 0,
                    failedAttempts = 0,
                    lockedUntil = null,
                    mustChangePwd = 0,
                    updatedAt = now,
                ),
            )
            placeholder.id
        } else {
            users.insert(
                UserEntity(
                    username = name,
                    fullName = fullName.trim(),
                    passwordHash = hash,
                    passwordSalt = salt,
                    role = Role.Administrator.wire,
                ),
            )
        }
        return openSession(id)
    }

    // ------------------------------------------------------------------ login

    suspend fun login(username: String, password: String): Session {
        if (username.isBlank() || password.isEmpty()) fail(ErrorKeys.BAD_CREDENTIALS)
        if (needsInitialSetup()) fail(ErrorKeys.SETUP_DONE)

        val user = users.byUsername(username.trim()) ?: fail(ErrorKeys.BAD_CREDENTIALS)
        if (user.isActive == 0) fail(ErrorKeys.INACTIVE)
        assertNotLocked(user)

        if (!verifyPassword(password, user.passwordHash)) {
            val attempts = user.failedAttempts + 1
            val lock = attempts >= PasswordPolicy.MAX_FAILED_ATTEMPTS
            val lockedUntil = if (lock) {
                IstDate.dateTimeStr(
                    ZonedDateTime.now(IstDate.ZONE).plusMinutes(PasswordPolicy.LOCK_MINUTES.toLong()),
                )
            } else {
                null
            }
            users.recordFailedAttempt(user.id, attempts, if (lock) 1 else 0, lockedUntil, IstDate.dateTimeStr())
            fail(ErrorKeys.BAD_CREDENTIALS)
        }

        users.recordSuccessfulLogin(user.id, IstDate.dateTimeStr())
        log(user.id, user.username, "LOGIN", "auth", user.id, "Signed in")
        return openSession(user.id)
    }

    fun logout() {
        current = null
    }

    private suspend fun assertNotLocked(user: UserEntity) {
        if (user.isLocked == 0) return
        val until = user.lockedUntil ?: fail(ErrorKeys.LOCKED)
        val parsed = parseStoredTimestamp(until)
        if (parsed != null && parsed.isAfter(ZonedDateTime.now(IstDate.ZONE))) fail(ErrorKeys.LOCKED)
        // The lock has expired on its own — release it and carry on.
        users.recordFailedAttempt(user.id, 0, 0, null, IstDate.dateTimeStr())
    }

    /** SQLite writes `datetime('now')` in UTC; read it back the same way. */
    private fun parseStoredTimestamp(value: String): ZonedDateTime? = runCatching {
        val normalized = value.trim().replace(' ', 'T')
        val instant = java.time.LocalDateTime.parse(
            if (normalized.length == 16) "$normalized:00" else normalized,
        )
        instant.atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(IstDate.ZONE)
    }.getOrNull()

    private suspend fun openSession(id: Long): Session {
        val user = users.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        val session = Session(
            id = user.id,
            username = user.username,
            fullName = user.fullName,
            role = wireTo(user.role, Role.Member),
            mustChangePassword = user.mustChangePwd == 1,
            initials = initialsOf(user.fullName),
        )
        current = CurrentActor(user.id, user.username, session.role)
        return session
    }

    // --------------------------------------------------------------- password

    suspend fun changePassword(userId: Long, newPassword: String) {
        val actor = requireActor()
        if (actor.id != userId && actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        val target = users.byId(userId) ?: fail(ErrorKeys.NOT_FOUND)
        if (target.isActive == 0) fail(ErrorKeys.INACTIVE)
        PasswordPolicy.violation(newPassword)?.let { fail(ErrorKeys.PWD_POLICY, it::class.simpleName) }
        val (hash, salt) = hashPassword(newPassword)
        users.setPassword(userId, hash, salt, IstDate.dateTimeStr())
        log(actor.id, actor.username, "PASSWORD_CHANGE", "auth", userId, "Password changed")
    }

    /**
     * Re-authentication for secure actions (cancel a payment, disburse welfare,
     * expel staff…). Verifies the CURRENTLY logged-in administrator's password
     * so a walked-away phone cannot be abused.
     */
    suspend fun verifyAdminPassword(password: String, action: String, detail: String = ""): CurrentActor {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        if (password.isEmpty()) fail(ErrorKeys.ADMIN_PASSWORD)
        val user = users.byId(actor.id) ?: fail(ErrorKeys.NOT_FOUND)
        if (user.isActive == 0) fail(ErrorKeys.INACTIVE)
        if (user.isLocked == 1) fail(ErrorKeys.LOCKED)
        if (!verifyPassword(password, user.passwordHash)) fail(ErrorKeys.ADMIN_PASSWORD)
        if (action.isNotBlank()) {
            log(actor.id, actor.username, action, "security", actor.id, detail.ifBlank { action })
        }
        return actor
    }

    fun requireActor(): CurrentActor = current ?: fail(ErrorKeys.ROLE_DENIED)

    // ------------------------------------------------------------------ users

    suspend fun listUsers(): List<UserEntity> = users.all()

    suspend fun createUser(
        username: String,
        fullName: String,
        password: String,
        role: Role,
        email: String?,
        phone: String?,
    ): Long {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        val name = username.trim()
        PasswordPolicy.usernameError(name)?.let { fail(ErrorKeys.USERNAME_POLICY, it.name) }
        PasswordPolicy.violation(password)?.let { fail(ErrorKeys.PWD_POLICY, it::class.simpleName) }
        if (users.byUsername(name) != null) fail(ErrorKeys.DUPLICATE, name)
        val (hash, salt) = hashPassword(password)
        val id = users.insert(
            UserEntity(
                username = name,
                fullName = fullName.trim(),
                passwordHash = hash,
                passwordSalt = salt,
                role = role.wire,
                email = email?.ifBlank { null },
                phone = phone?.ifBlank { null },
            ),
        )
        log(actor.id, actor.username, "CREATE", "users", id, "Created user '$name' (${role.wire})")
        return id
    }

    suspend fun updateUser(id: Long, fullName: String, role: Role, email: String?, phone: String?, active: Boolean) {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        val user = users.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        users.update(
            user.copy(
                fullName = fullName.trim(),
                role = role.wire,
                email = email?.ifBlank { null },
                phone = phone?.ifBlank { null },
                isActive = if (active) 1 else 0,
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        log(actor.id, actor.username, "UPDATE", "users", id, "Updated user '${user.username}'")
    }

    suspend fun toggleLock(id: Long, locked: Boolean) {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        users.setLocked(id, if (locked) 1 else 0, IstDate.dateTimeStr())
        log(actor.id, actor.username, if (locked) "LOCK" else "UNLOCK", "users", id, "Account ${if (locked) "locked" else "unlocked"}")
    }

    suspend fun resetPassword(id: Long, newPassword: String) {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        PasswordPolicy.violation(newPassword)?.let { fail(ErrorKeys.PWD_POLICY, it::class.simpleName) }
        val (hash, salt) = hashPassword(newPassword)
        users.setPassword(id, hash, salt, IstDate.dateTimeStr())
        log(actor.id, actor.username, "PASSWORD_RESET", "users", id, "Password reset by administrator")
    }

    suspend fun deleteUser(id: Long) {
        val actor = requireActor()
        if (actor.role != Role.Administrator) fail(ErrorKeys.ROLE_DENIED)
        if (actor.id == id) fail(ErrorKeys.VALIDATION, "cannot delete your own account")
        users.delete(id)
        log(actor.id, actor.username, "DELETE", "users", id, "Deleted user #$id")
    }

    // ----------------------------------------------------------------- crypto

    fun hashPassword(password: String): Pair<String, String> {
        PasswordPolicy.violation(password)?.let { fail(ErrorKeys.PWD_POLICY, it::class.simpleName) }
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val hash = pbkdf2(password, salt, ITERATIONS, HASH_BYTES)
        val saltB64 = Base64.getEncoder().encodeToString(salt)
        val hashB64 = Base64.getEncoder().encodeToString(hash)
        return "pbkdf2_sha256\$$ITERATIONS\$$saltB64\$$hashB64" to saltB64
    }

    fun verifyPassword(plain: String, stored: String): Boolean {
        val parts = stored.split('$')
        if (parts.size != 4 || parts[0] != "pbkdf2_sha256") return false
        val iterations = parts[1].toIntOrNull() ?: return false
        if (iterations <= 0) return false
        val salt = runCatching { Base64.getDecoder().decode(parts[2]) }.getOrNull() ?: return false
        val expected = runCatching { Base64.getDecoder().decode(parts[3]) }.getOrNull() ?: return false
        if (salt.isEmpty() || expected.isEmpty()) return false
        val actual = pbkdf2(plain, salt, iterations, expected.size)
        return MessageDigest.isEqual(actual, expected)
    }

    private fun pbkdf2(password: String, salt: ByteArray, iterations: Int, keyLength: Int): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, keyLength * 8)
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    }

    // ------------------------------------------------------------------ audit

    suspend fun log(userId: Long, username: String, action: String, module: String, entityId: Long?, description: String) {
        audit.insert(
            AuditEntry(
                userId = userId,
                username = username,
                action = action,
                module = module,
                entityId = entityId,
                description = description,
                createdAt = IstDate.dateTimeStr() + ":00",
            ),
        )
    }

    suspend fun mahalluName(): String = settings.get()?.mahalluName.orEmpty()

    private companion object {
        const val ITERATIONS = 200_000
        const val SALT_BYTES = 16
        const val HASH_BYTES = 32
    }
}

/** The signed-in account, as the UI holds it. */
data class Session(
    val id: Long,
    val username: String,
    val fullName: String,
    val role: Role,
    val mustChangePassword: Boolean,
    val initials: String,
)

/** "Muhammed Ashraf" → "MA"; a single word takes its first letter. */
fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when (parts.size) {
        0 -> "?"
        1 -> parts[0].take(1).uppercase()
        else -> (parts.first().take(1) + parts.last().take(1)).uppercase()
    }
}

/** Minutes remaining on a lockout, for the login screen's countdown. */
fun lockMinutesRemaining(lockedUntil: String?): Long {
    val raw = lockedUntil?.trim() ?: return 0
    return runCatching {
        val normalized = raw.replace(' ', 'T')
        val instant = java.time.LocalDateTime.parse(
            if (normalized.length == 16) "$normalized:00" else normalized,
        ).atZone(java.time.ZoneOffset.UTC)
        Duration.between(ZonedDateTime.now(java.time.ZoneOffset.UTC), instant).toMinutes().coerceAtLeast(0)
    }.getOrDefault(0)
}
