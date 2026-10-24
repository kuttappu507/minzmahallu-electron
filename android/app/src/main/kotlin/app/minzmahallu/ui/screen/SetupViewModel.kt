package app.minzmahallu.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.common.DocNumber
import app.minzmahallu.i18n.localizedError
import app.minzmahallu.core.common.PasswordPolicy
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.settings.SettingsRepository
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SetupUiState(
    val step: Int = 1,
    val mahalluName: String = "",
    val mahalluNameMl: String = "",
    val prefix: String = "",
    val prefixHint: String = "",
    val username: String = "",
    val usernameError: String? = null,
    val fullName: String = "",
    val password: String = "",
    val passwordError: String? = null,
    val confirm: String = "",
    val confirmError: String? = null,
    val monthlyAmount: String = "100",
    val frequency: String = "Monthly",
    val busy: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
) {
    val accountReady: Boolean
        get() = username.length >= 3 &&
            fullName.isNotBlank() &&
            PasswordPolicy.isValid(password) &&
            password == confirm
}

/**
 * First-run setup.
 *
 * The receipt prefix is derived live from the mahallu's initials so the
 * operator can see, before committing, that "Minz Mahallu Sunnath Jamaath"
 * will produce `MMSJ/26/09/001` rather than guessing at it afterwards.
 */
@HiltViewModel
class SetupViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val settings: SettingsRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(SetupUiState())
    val state: StateFlow<SetupUiState> = _state.asStateFlow()

    fun onName(value: String) {
        val initials = DocNumber.mahalluInitials(value)
        _state.update {
            it.copy(
                mahalluName = value,
                prefix = if (it.prefix.isBlank()) initials else it.prefix,
                prefixHint = previewHint(value),
            )
        }
    }

    fun onNameMl(value: String) = _state.update { it.copy(mahalluNameMl = value) }

    fun onPrefix(value: String) = _state.update {
        it.copy(
            prefix = DocNumber.sanitizePrefix(value, DocNumber.mahalluInitials(it.mahalluName)),
            prefixHint = previewHint(it.mahalluName),
        )
    }

    fun onUsername(value: String) {
        val violation = PasswordPolicy.usernameError(value)
        _state.update {
            it.copy(
                username = value,
                usernameError = when (violation) {
                    is app.minzmahallu.core.common.UsernameViolation.Length ->
                        "3–32 characters"
                    is app.minzmahallu.core.common.UsernameViolation.Characters ->
                        "Letters, numbers, dot, underscore or hyphen only"
                    null -> null
                },
            )
        }
    }

    fun onFullName(value: String) = _state.update { it.copy(fullName = value) }

    fun onPassword(value: String) {
        val violation = PasswordPolicy.violation(value)
        _state.update {
            it.copy(
                password = value,
                passwordError = when (violation) {
                    is app.minzmahallu.core.common.PasswordViolation.TooShort ->
                        "At least 8 characters"
                    is app.minzmahallu.core.common.PasswordViolation.NotComplex ->
                        missingParts(violation)
                    null -> null
                },
                confirmError = if (it.confirm.isNotEmpty() && it.confirm != value) {
                    "Passwords do not match"
                } else {
                    null
                },
            )
        }
    }

    fun onConfirm(value: String) = _state.update {
        it.copy(
            confirm = value,
            confirmError = if (value.isNotEmpty() && value != it.password) {
                "Passwords do not match"
            } else {
                null
            },
        )
    }

    fun onMonthly(value: String) = _state.update {
        it.copy(monthlyAmount = app.minzmahallu.core.ui.component.sanitizeAmount(value))
    }

    fun onFrequency(value: String) = _state.update { it.copy(frequency = value) }

    fun next() {
        val snapshot = _state.value
        when (snapshot.step) {
            1 -> if (snapshot.mahalluName.isNotBlank()) {
                _state.update { it.copy(step = 2) }
            }
            2 -> if (snapshot.accountReady) _state.update { it.copy(step = 3) }
        }
    }

    fun back() = _state.update { it.copy(step = (it.step - 1).coerceAtLeast(1)) }

    fun finish() {
        val snapshot = _state.value
        if (snapshot.busy || !snapshot.accountReady) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching {
                auth.createInitialAdministrator(
                    username = snapshot.username,
                    fullName = snapshot.fullName,
                    password = snapshot.password,
                )
            }.onSuccess { session ->
                runCatching {
                    settings.save(
                        app.minzmahallu.core.domain.settings.SettingsPatch(
                            mahalluName = snapshot.mahalluName,
                            receiptPrefix = snapshot.prefix.ifBlank { null },
                            subscriptionMonthlyAmount = snapshot.monthlyAmount.toDoubleOrNull(),
                            subscriptionFrequency = app.minzmahallu.core.common.SubscriptionFrequency
                                .from(snapshot.frequency),
                        ),
                    )
                }
                sessions.begin(session)
                sessions.setMahalluName(snapshot.mahalluName, snapshot.mahalluNameMl)
                _state.update { it.copy(busy = false, done = true) }
            }.onFailure { error ->
                _state.update { it.copy(busy = false, error = localizedError(error)) }
            }
        }
    }

    private fun missingParts(
        violation: app.minzmahallu.core.common.PasswordViolation.NotComplex,
    ): String = buildList {
        if (violation.needsUpper) add("an uppercase letter")
        if (violation.needsLower) add("a lowercase letter")
        if (violation.needsDigit) add("a number")
        if (violation.needsSpecial) add("a special character")
    }.joinToString(prefix = "Also needs ", postfix = ".")

    private fun previewHint(name: String): String {
        val initials = DocNumber.mahalluInitials(name)
        return if (initials.isBlank()) {
            "Leave blank to derive from the name"
        } else {
            "A receipt would be numbered $initials/26/09/001"
        }
    }
}
