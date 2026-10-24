package app.minzmahallu.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import app.minzmahallu.core.common.Role
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.domain.auth.Session
import app.minzmahallu.i18n.Language
import app.minzmahallu.i18n.stringsFor
import app.minzmahallu.i18n.Strings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The signed-in operator, and the device preferences that are not part of the
 * mahallu's business data.
 *
 * The desktop keeps its session in the SQLite `sessions` table and its UI
 * preferences in a zustand-persisted store in localStorage. This mirrors that
 * split: the *session* is authoritative in the database (so the audit trail and
 * the "who did this" column survive a reinstall of the preferences), while
 * theme, language and the motion toggle live in DataStore because they are
 * per-device rather than per-mahallu.
 */
@Singleton
class SessionController @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {

    /** What the UI needs to gate writes and address the operator. */
    data class Actor(
        val id: Long,
        val username: String,
        val fullName: String,
        val role: Role,
    )

    data class State(
        val actor: Actor? = null,
        val language: Language = Language.English,
        val darkTheme: Boolean = false,
        val followSystemTheme: Boolean = true,
        val motionReduced: Boolean = false,
        val mahalluName: String = "",
        val mahalluNameMl: String = "",
    ) {
        val strings: Strings get() = stringsFor(language)

        /** Motion scale: a Settings toggle that damps every animation at once. */
        val motionScale: Float get() = if (motionReduced) 0.35f else 1f

        val displayName: String
            get() = if (language == Language.Malayalam && mahalluNameMl.isNotBlank()) {
                mahalluNameMl
            } else {
                mahalluName
            }
    }

    val state: Flow<State> = dataStore.data
        .catch { error ->
            // A corrupt preferences file must not stop the app opening; the
            // operator's data is in Room, and defaults are a safe landing.
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { preferences ->
            State(
                actor = preferences[KEY_SESSION_USER_ID]?.let { id ->
                    Actor(
                        id = id,
                        username = preferences[KEY_SESSION_USERNAME].orEmpty(),
                        fullName = preferences[KEY_SESSION_FULL_NAME].orEmpty(),
                        role = wireTo(preferences[KEY_SESSION_ROLE], Role.Member),
                    )
                },
                language = Language.fromCode(preferences[KEY_LANGUAGE]),
                darkTheme = preferences[KEY_DARK] ?: false,
                followSystemTheme = preferences[KEY_FOLLOW_SYSTEM] ?: true,
                motionReduced = preferences[KEY_MOTION_REDUCED] ?: false,
                mahalluName = preferences[KEY_MAHALLU_NAME].orEmpty(),
                mahalluNameMl = preferences[KEY_MAHALLU_NAME_ML].orEmpty(),
            )
        }

    suspend fun current(): State = state.first()

    suspend fun begin(session: Session) {
        dataStore.edit { preferences ->
            preferences[KEY_SESSION_USER_ID] = session.id
            preferences[KEY_SESSION_USERNAME] = session.username
            preferences[KEY_SESSION_FULL_NAME] = session.fullName
            preferences[KEY_SESSION_ROLE] = session.role.wire
        }
    }

    suspend fun end() {
        dataStore.edit { preferences ->
            preferences.remove(KEY_SESSION_USER_ID)
            preferences.remove(KEY_SESSION_USERNAME)
            preferences.remove(KEY_SESSION_FULL_NAME)
            preferences.remove(KEY_SESSION_ROLE)
        }
    }

    suspend fun setLanguage(language: Language) {
        dataStore.edit { it[KEY_LANGUAGE] = language.code }
    }

    suspend fun setTheme(dark: Boolean, followSystem: Boolean) {
        dataStore.edit {
            it[KEY_DARK] = dark
            it[KEY_FOLLOW_SYSTEM] = followSystem
        }
    }

    suspend fun setMotionReduced(reduced: Boolean) {
        dataStore.edit { it[KEY_MOTION_REDUCED] = reduced }
    }

    suspend fun setMahalluName(name: String, nameMl: String) {
        dataStore.edit {
            it[KEY_MAHALLU_NAME] = name
            it[KEY_MAHALLU_NAME_ML] = nameMl
        }
    }

    /** Session idle timeout, in minutes; 0 disables it. Mirrors the desktop. */
    suspend fun setIdleTimeoutMinutes(minutes: Int) {
        dataStore.edit { it[KEY_IDLE_TIMEOUT] = minutes }
    }

    suspend fun idleTimeoutMinutes(): Int = dataStore.data.first()[KEY_IDLE_TIMEOUT] ?: 15

    private companion object {
        val KEY_SESSION_USER_ID = longPreferencesKey("session_user_id")
        val KEY_SESSION_USERNAME = stringPreferencesKey("session_username")
        val KEY_SESSION_FULL_NAME = stringPreferencesKey("session_full_name")
        val KEY_SESSION_ROLE = stringPreferencesKey("session_role")
        val KEY_LANGUAGE = stringPreferencesKey("language")
        val KEY_DARK = booleanPreferencesKey("dark_theme")
        val KEY_FOLLOW_SYSTEM = booleanPreferencesKey("follow_system_theme")
        val KEY_MOTION_REDUCED = booleanPreferencesKey("motion_reduced")
        val KEY_MAHALLU_NAME = stringPreferencesKey("mahallu_name")
        val KEY_MAHALLU_NAME_ML = stringPreferencesKey("mahallu_name_ml")
        val KEY_IDLE_TIMEOUT = intPreferencesKey("idle_timeout_minutes")
    }
}
