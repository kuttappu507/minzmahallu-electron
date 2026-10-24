package app.minzmahallu.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.core.model.SettingsEntity
import app.minzmahallu.core.model.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {

    @Query("SELECT * FROM users ORDER BY username COLLATE NOCASE ASC")
    fun observeAll(): Flow<List<UserEntity>>

    @Query("SELECT * FROM users ORDER BY username COLLATE NOCASE ASC")
    suspend fun all(): List<UserEntity>

    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun byId(id: Long): UserEntity?

    @Query("SELECT * FROM users WHERE username = :username COLLATE NOCASE LIMIT 1")
    suspend fun byUsername(username: String): UserEntity?

    @Query("SELECT COUNT(*) FROM users")
    suspend fun count(): Int

    /**
     * The publicly-known seeded placeholder administrator, if it is still the
     * only account. Mirrors `auth.service.ts`: an install whose only account
     * is one of these hashes must go through Initial Setup instead of
     * accepting a password anyone who read the desktop source knows.
     */
    @Query(
        """
        SELECT * FROM users WHERE id = 1 AND username = 'admin'
          AND password_hash IN (:seededHashes) LIMIT 1
        """,
    )
    suspend fun seededAdministrator(seededHashes: List<String>): UserEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(user: UserEntity): Long

    @Update
    suspend fun update(user: UserEntity)

    @Query("DELETE FROM users WHERE id = :id")
    suspend fun delete(id: Long)

    @Query(
        """
        UPDATE users SET failed_attempts = :attempts, is_locked = :locked,
          locked_until = :lockedUntil, updated_at = :now
        WHERE id = :id
        """,
    )
    suspend fun recordFailedAttempt(id: Long, attempts: Int, locked: Int, lockedUntil: String?, now: String)

    @Query(
        """
        UPDATE users SET last_login_at = :now, failed_attempts = 0, is_locked = 0,
          locked_until = NULL, updated_at = :now
        WHERE id = :id
        """,
    )
    suspend fun recordSuccessfulLogin(id: Long, now: String)

    @Query(
        """
        UPDATE users SET password_hash = :hash, password_salt = :salt,
          must_change_pwd = 0, failed_attempts = 0, is_locked = 0,
          locked_until = NULL, updated_at = :now
        WHERE id = :id
        """,
    )
    suspend fun setPassword(id: Long, hash: String, salt: String, now: String)

    @Query("UPDATE users SET is_locked = :locked, updated_at = :now WHERE id = :id")
    suspend fun setLocked(id: Long, locked: Int, now: String)
}

@Dao
interface SettingsDao {

    @Query("SELECT * FROM settings WHERE id = 1")
    fun observe(): Flow<SettingsEntity?>

    @Query("SELECT * FROM settings WHERE id = 1")
    suspend fun get(): SettingsEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(settings: SettingsEntity)
}

@Dao
interface AuditDao {

    @Query(
        """
        SELECT * FROM audit_log
        WHERE (:search IS NULL OR username LIKE '%' || :search || '%'
               OR action LIKE '%' || :search || '%'
               OR description LIKE '%' || :search || '%'
               OR module LIKE '%' || :search || '%')
          AND (:action IS NULL OR :action = 'All' OR action = :action)
          AND (:module IS NULL OR :module = 'All' OR module = :module)
        ORDER BY created_at DESC, id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        action: String?,
        module: String?,
        limit: Int,
        offset: Int,
    ): List<AuditEntry>

    @Query(
        """
        SELECT COUNT(*) FROM audit_log
        WHERE (:search IS NULL OR username LIKE '%' || :search || '%'
               OR action LIKE '%' || :search || '%'
               OR description LIKE '%' || :search || '%'
               OR module LIKE '%' || :search || '%')
          AND (:action IS NULL OR :action = 'All' OR action = :action)
          AND (:module IS NULL OR :module = 'All' OR module = :module)
        """,
    )
    suspend fun count(search: String?, action: String?, module: String?): Int

    @Query("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<AuditEntry>

    @Query("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<AuditEntry>>

    @Query("SELECT DISTINCT module FROM audit_log WHERE module IS NOT NULL AND module != '' ORDER BY module")
    suspend fun modules(): List<String>

    @Query("SELECT COUNT(*) FROM audit_log")
    suspend fun count(): Int

    @Query("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1")
    suspend fun lastHash(): String?

    @Insert
    suspend fun insert(entry: AuditEntry): Long
}

@Dao
interface HistoryDao {

    @Query(
        """
        SELECT * FROM record_history
        WHERE entity_type = :entityType AND entity_id = :entityId
        ORDER BY changed_at DESC, id DESC
        LIMIT :limit
        """,
    )
    suspend fun forEntity(entityType: String, entityId: Long, limit: Int = 200): List<app.minzmahallu.core.model.RecordHistory>

    @Insert
    suspend fun insert(entry: app.minzmahallu.core.model.RecordHistory): Long
}
