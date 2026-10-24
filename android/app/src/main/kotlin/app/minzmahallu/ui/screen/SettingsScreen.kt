package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.PasswordPolicy
import app.minzmahallu.core.common.SubscriptionFrequency
import app.minzmahallu.core.domain.settings.SettingsPatch
import app.minzmahallu.core.domain.settings.SettingsRepository
import app.minzmahallu.core.model.SettingsEntity
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.MahalluButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SettingRow
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.i18n.Language
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Settings — `src/pages/Settings.tsx`.
 *
 * Three groups, in the desktop's order: the mahallu's identity (which drives
 * every printed document), the subscription plan (which drives the roll-forward
 * arithmetic), and device preferences that live in DataStore rather than in the
 * shared database.
 */
@Composable
fun SettingsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    if (state.loading) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(Gutters.screen),
        ) {
            ListSkeleton(rows = 4)
        }
        return
    }

    val s = state.settings ?: SettingsEntity()

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = Gutters.screen,
            end = Gutters.screen,
            top = 12.dp,
            bottom = 60.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding()) {
                ScreenHeader(
                    title = "Settings",
                    eyebrow = "office",
                    subtitle = s.mahalluName,
                    back = onOpenDrawer,
                )
            }
        }

        item {
            Card(title = "Mahallu", eyebrow = "printed on every document") {
                MahalluTextField(
                    value = state.draft.mahalluName,
                    onValueChange = viewModel::onName,
                    label = "Name (English)",
                )
                Spacer(Modifier.height(12.dp))
                MahalluTextField(
                    value = state.draft.address.orEmpty(),
                    onValueChange = viewModel::onAddress,
                    label = "Address",
                    singleLine = false,
                    minLines = 2,
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PhoneField(
                        value = state.draft.phone.orEmpty(),
                        onValueChange = viewModel::onPhone,
                        label = "Phone",
                        modifier = Modifier.weight(1f),
                    )
                    MahalluTextField(
                        value = state.draft.receiptPrefix,
                        onValueChange = viewModel::onPrefix,
                        label = "Receipt prefix",
                        supporting = "A–Z, up to 5",
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MahalluTextField(
                        value = state.draft.village.orEmpty(),
                        onValueChange = viewModel::onVillage,
                        label = "Village",
                        modifier = Modifier.weight(1f),
                    )
                    MahalluTextField(
                        value = state.draft.panchayath.orEmpty(),
                        onValueChange = viewModel::onPanchayath,
                        label = "Panchayath",
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MahalluTextField(
                        value = state.draft.wakfRegNo.orEmpty(),
                        onValueChange = viewModel::onWakf,
                        label = "Wakf reg. no.",
                        modifier = Modifier.weight(1f),
                    )
                    MahalluTextField(
                        value = state.draft.affiliationNumber.orEmpty(),
                        onValueChange = viewModel::onAffiliation,
                        label = "Affiliation no.",
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(18.dp))
                MahalluButton(
                    onClick = viewModel::saveIdentity,
                    text = "Save mahallu details",
                    enabled = !state.saving,
                    loading = state.saving,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item {
            Card(title = "Subscription plan", eyebrow = "drives the monthly roll-forward") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AmountField(
                        value = state.draft.monthlyAmount,
                        onValueChange = viewModel::onMonthly,
                        label = "Monthly",
                        modifier = Modifier.weight(1f),
                    )
                    AmountField(
                        value = state.draft.quarterlyAmount,
                        onValueChange = viewModel::onQuarterly,
                        label = "Quarterly",
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(14.dp))
                app.minzmahallu.ui.screen.EnumField(
                    label = "Frequency",
                    value = state.draft.frequency,
                    options = SubscriptionFrequency.entries.map { it.name },
                    onSelect = viewModel::onFrequency,
                )
                Spacer(Modifier.height(18.dp))
                MahalluButton(
                    onClick = viewModel::savePlan,
                    variant = ButtonVariant.Secondary,
                    text = "Save plan",
                    enabled = !state.saving,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item {
            Card(title = "This device", eyebrow = "not shared with the desktop") {
                SettingRow(
                    title = "Malayalam interface",
                    subtitle = "മലയാളത്തിൽ കാണിക്കുക",
                    trailing = {
                        Toggle(
                            checked = state.language == Language.Malayalam,
                            onCheckedChange = viewModel::toggleLanguage,
                        )
                    },
                )
                SettingRow(
                    title = "Follow the system theme",
                    subtitle = "otherwise the choice below is used",
                    trailing = {
                        Toggle(
                            checked = state.followSystemTheme,
                            onCheckedChange = { viewModel.setTheme(state.darkTheme, it) },
                        )
                    },
                )
                SettingRow(
                    title = "Dark theme",
                    subtitle = if (state.followSystemTheme) "controlled by the system" else "applied now",
                    trailing = {
                        Toggle(
                            checked = state.darkTheme,
                            onCheckedChange = { viewModel.setTheme(it, state.followSystemTheme) },
                            enabled = !state.followSystemTheme,
                        )
                    },
                )
                SettingRow(
                    title = "Reduce motion",
                    subtitle = "shortens every animation in the app",
                    trailing = {
                        Toggle(
                            checked = state.motionReduced,
                            onCheckedChange = viewModel::setMotionReduced,
                        )
                    },
                )
            }
        }

        item {
            Card(title = "Security", eyebrow = "this account") {
                PasswordField(
                    value = state.newPassword,
                    onValueChange = viewModel::onNewPassword,
                    label = "New password",
                    showStrength = true,
                    error = state.passwordError,
                )
                Spacer(Modifier.height(14.dp))
                MahalluButton(
                    onClick = viewModel::changePassword,
                    variant = ButtonVariant.Secondary,
                    text = "Change password",
                    enabled = PasswordPolicy.isValid(state.newPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.fingerprint != null) {
                    Spacer(Modifier.height(18.dp))
                    DetailRow("Device fingerprint", state.fingerprint)
                    AppText(
                        text = "Certificate QR codes are signed with a key held on this device. " +
                            "Changing devices invalidates codes already issued.",
                        style = MahalluTheme.type.caption,
                        color = colors.textFaint,
                    )
                }
            }
        }
    }
}

data class SettingsDraft(
    val mahalluName: String = "",
    val address: String? = null,
    val phone: String? = null,
    val receiptPrefix: String = "",
    val village: String? = null,
    val panchayath: String? = null,
    val wakfRegNo: String? = null,
    val affiliationNumber: String? = null,
    val monthlyAmount: String = "100",
    val quarterlyAmount: String = "300",
    val frequency: String = "Monthly",
)

data class SettingsUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val settings: SettingsEntity? = null,
    val draft: SettingsDraft = SettingsDraft(),
    val language: Language = Language.English,
    val darkTheme: Boolean = false,
    val followSystemTheme: Boolean = true,
    val motionReduced: Boolean = false,
    val newPassword: String = "",
    val passwordError: String? = null,
    val fingerprint: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: SettingsRepository,
    private val auth: app.minzmahallu.core.domain.auth.AuthRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            val prefs = sessions.state.first()
            _state.update {
                it.copy(
                    language = prefs.language,
                    darkTheme = prefs.darkTheme,
                    followSystemTheme = prefs.followSystemTheme,
                    motionReduced = prefs.motionReduced,
                )
            }
        }
    }

    private fun load() {
        viewModelScope.launch {
            val row = runCatching { settings.get() }.getOrNull()
            _state.update {
                it.copy(
                    loading = false,
                    settings = row,
                    fingerprint = row?.deviceFingerprint,
                    draft = SettingsDraft(
                        mahalluName = row?.mahalluName.orEmpty(),
                        address = row?.address,
                        phone = row?.phone,
                        receiptPrefix = row?.receiptPrefix.orEmpty(),
                        village = row?.village,
                        panchayath = row?.panchayath,
                        wakfRegNo = row?.wakfRegNo,
                        affiliationNumber = row?.affiliationNumber,
                        monthlyAmount = (row?.subscriptionMonthlyAmount ?: 100.0).toString(),
                        quarterlyAmount = (row?.subscriptionQuarterlyAmount ?: 300.0).toString(),
                        frequency = row?.subscriptionFrequency ?: "Monthly",
                    ),
                )
            }
        }
    }

    fun onName(value: String) = _state.update { it.copy(draft = it.draft.copy(mahalluName = value)) }
    fun onAddress(value: String) = _state.update { it.copy(draft = it.draft.copy(address = value)) }
    fun onPhone(value: String) = _state.update { it.copy(draft = it.draft.copy(phone = value)) }

    fun onPrefix(value: String) = _state.update {
        it.copy(
            draft = it.draft.copy(
                receiptPrefix = app.minzmahallu.core.common.DocNumber.sanitizePrefix(value, "RC"),
            ),
        )
    }

    fun onVillage(value: String) = _state.update { it.copy(draft = it.draft.copy(village = value)) }
    fun onPanchayath(value: String) = _state.update { it.copy(draft = it.draft.copy(panchayath = value)) }
    fun onWakf(value: String) = _state.update { it.copy(draft = it.draft.copy(wakfRegNo = value)) }
    fun onAffiliation(value: String) = _state.update { it.copy(draft = it.draft.copy(affiliationNumber = value)) }

    fun onMonthly(value: String) = _state.update {
        it.copy(draft = it.draft.copy(monthlyAmount = app.minzmahallu.core.ui.component.sanitizeAmount(value)))
    }

    fun onQuarterly(value: String) = _state.update {
        it.copy(draft = it.draft.copy(quarterlyAmount = app.minzmahallu.core.ui.component.sanitizeAmount(value)))
    }

    fun onFrequency(value: String) = _state.update { it.copy(draft = it.draft.copy(frequency = value)) }

    fun saveIdentity() {
        val d = _state.value.draft
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            runCatching {
                settings.save(
                    SettingsPatch(
                        mahalluName = d.mahalluName.trim(),
                        address = d.address,
                        phone = d.phone,
                        receiptPrefix = d.receiptPrefix,
                        village = d.village,
                        panchayath = d.panchayath,
                        wakfRegNo = d.wakfRegNo,
                        affiliationNumber = d.affiliationNumber,
                    ),
                )
            }
            sessions.setMahalluName(d.mahalluName.trim(), "")
            _state.update { it.copy(saving = false) }
            load()
        }
    }

    fun savePlan() {
        val d = _state.value.draft
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            runCatching {
                settings.save(
                    SettingsPatch(
                        subscriptionMonthlyAmount = d.monthlyAmount.toDoubleOrNull(),
                        subscriptionQuarterlyAmount = d.quarterlyAmount.toDoubleOrNull(),
                        subscriptionFrequency = SubscriptionFrequency.from(d.frequency),
                    ),
                )
            }
            _state.update { it.copy(saving = false) }
            load()
        }
    }

    fun toggleLanguage(enabled: Boolean) {
        viewModelScope.launch {
            val language = if (enabled) Language.Malayalam else Language.English
            sessions.setLanguage(language)
            _state.update { it.copy(language = language) }
        }
    }

    fun setTheme(dark: Boolean, followSystem: Boolean) {
        viewModelScope.launch {
            sessions.setTheme(dark, followSystem)
            _state.update { it.copy(darkTheme = dark, followSystemTheme = followSystem) }
        }
    }

    fun setMotionReduced(reduced: Boolean) {
        viewModelScope.launch {
            sessions.setMotionReduced(reduced)
            _state.update { it.copy(motionReduced = reduced) }
        }
    }

    fun onNewPassword(value: String) {
        val violation = PasswordPolicy.violation(value)
        _state.update {
            it.copy(
                newPassword = value,
                passwordError = when (violation) {
                    is app.minzmahallu.core.common.PasswordViolation.TooShort -> "At least 8 characters"
                    is app.minzmahallu.core.common.PasswordViolation.NotComplex ->
                        "Needs an uppercase letter, a lowercase letter, a number and a symbol"
                    null -> null
                },
            )
        }
    }

    fun changePassword() {
        val actor = auth.current ?: return
        val password = _state.value.newPassword
        if (!PasswordPolicy.isValid(password)) return
        viewModelScope.launch {
            runCatching { auth.changePassword(actor.id, password) }
                .onSuccess { _state.update { it.copy(newPassword = "", passwordError = null) } }
                .onFailure { error ->
                    _state.update { current ->
                        current.copy(passwordError = error.message?.takeIf(String::isNotBlank))
                    }
                }
        }
    }
}
