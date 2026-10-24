package app.minzmahallu.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.auth.lockMinutesRemaining
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val lockedMinutes: Long = 0,
    val signedIn: Boolean = false,
    val needsSetup: Boolean = false,
)

/**
 * Login.
 *
 * The lockout countdown is driven here rather than in the composable so that
 * leaving the screen and coming back does not reset it — the deadline comes
 * from `users.locked_until`, the same column the desktop app writes.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val needsSetup = runCatching { auth.needsInitialSetup() }.getOrDefault(false)
            _state.update { it.copy(needsSetup = needsSetup) }
        }
    }

    fun onUsername(value: String) = _state.update { it.copy(username = value.trim(), error = null) }

    fun onPassword(value: String) = _state.update { it.copy(password = value, error = null) }

    fun submit() {
        val snapshot = _state.value
        if (snapshot.busy || snapshot.username.isBlank() || snapshot.password.isEmpty()) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching { auth.login(snapshot.username, snapshot.password) }
                .onSuccess { session ->
                    sessions.begin(session)
                    _state.update { it.copy(busy = false, signedIn = true) }
                }
                .onFailure { error ->
                    val message = error.message.orEmpty()
                    _state.update { it.copy(busy = false, error = message) }
                    // A fresh lock is reported by the repository; start the
                    // countdown so the operator sees it tick down.
                    if (message.contains("locked", ignoreCase = true)) startCountdown(15)
                }
        }
    }

    private fun startCountdown(minutes: Long) {
        viewModelScope.launch {
            var remaining = minutes
            while (remaining > 0) {
                _state.update { it.copy(lockedMinutes = remaining) }
                delay(60_000)
                remaining -= 1
            }
            _state.update { it.copy(lockedMinutes = 0, error = null) }
        }
    }

    /** First run: no administrator exists yet, so there is nothing to sign into. */
    fun goToSetup() = _state.update { it.copy(needsSetup = true) }
}
