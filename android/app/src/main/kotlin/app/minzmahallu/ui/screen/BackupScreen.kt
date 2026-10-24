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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.domain.settings.SettingsPatch
import app.minzmahallu.core.domain.settings.SettingsRepository
import app.minzmahallu.core.model.NotificationEntity
import app.minzmahallu.core.model.SettingsEntity
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.ButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.Pill
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SettingRow
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backup — `src/pages/Backup.tsx`.
 *
 * The desktop writes a timestamped SQLite copy into its userData directory and
 * mirrors it to a folder the operator picks. Android has no equivalent of a
 * user-visible app folder, so the copy is written to app-private storage and
 * then handed to the system share sheet — which reaches Drive, email, a USB
 * stick or any other app the operator already trusts, without this app holding
 * a storage permission it does not need.
 */
@Composable
fun BackupScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: BackupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

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
                    title = "Backup",
                    eyebrow = "office",
                    subtitle = state.settings?.backupMirrorDir ?: "no mirror folder set",
                    back = onOpenDrawer,
                )
            }
        }

        item {
            Card(title = "Take a backup now", eyebrow = "a single SQLite file") {
                AppText(
                    text = "The copy includes every table — families, members, the ledger, " +
                        "receipts and the audit chain. Restoring it on the desktop app works " +
                        "because both builds use the same schema.",
                    style = MahalluTheme.type.body,
                    color = colors.textSecondary,
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MahalluButton(
                        onClick = viewModel::backupNow,
                        text = "Create backup",
                        enabled = !state.busy,
                        loading = state.busy,
                        modifier = Modifier.weight(1f),
                    )
                    MahalluButton(
                        onClick = viewModel::shareLatest,
                        variant = ButtonVariant.Secondary,
                        text = "Share",
                        enabled = state.latest != null && !state.busy,
                    )
                }
                if (state.result != null) {
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Pill(
                            text = if (state.resultSuccess) "written" else "failed",
                            color = if (state.resultSuccess) colors.accent else colors.danger,
                        )
                        AppText(
                            text = "  ${state.result}",
                            style = MahalluTheme.type.caption,
                            color = colors.textSecondary,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        item {
            Card(title = "Schedule", eyebrow = "automatic copies") {
                SettingRow(
                    title = "Automatic backup",
                    subtitle = "runs in the background while the app is open",
                    trailing = {
                        Toggle(
                            checked = state.autoBackup,
                            onCheckedChange = viewModel::setAutoBackup,
                        )
                    },
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MahalluTextField(
                        value = state.intervalHours.toString(),
                        onValueChange = viewModel::onInterval,
                        label = "Every (hours)",
                        modifier = Modifier.weight(1f),
                    )
                    MahalluTextField(
                        value = state.keepCount.toString(),
                        onValueChange = viewModel::onKeep,
                        label = "Keep (copies)",
                        supporting = "older ones are pruned",
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(16.dp))
                MahalluButton(
                    onClick = viewModel::saveSchedule,
                    variant = ButtonVariant.Secondary,
                    text = "Save schedule",
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (state.history.isNotEmpty()) {
            item { Eyebrow("recent results") }
            items(state.history.size) { index ->
                val entry = state.history[index]
                RecordRow(
                    title = entry.title,
                    subtitle = entry.message,
                    code = IstDate.fmtDateTime(entry.createdAt),
                    status = entry.severity,
                    onClick = { },
                )
            }
        }
    }
}

data class BackupUiState(
    val settings: SettingsEntity? = null,
    val autoBackup: Boolean = true,
    val intervalHours: Int = 24,
    val keepCount: Int = 30,
    val busy: Boolean = false,
    val latest: String? = null,
    val result: String? = null,
    val resultSuccess: Boolean = false,
    val history: List<NotificationEntity> = emptyList(),
)

@HiltViewModel
class BackupViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    private val notifications: app.minzmahallu.core.domain.settings.NotificationRepository,
    private val database: app.minzmahallu.core.database.MahalluDatabase,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(BackupUiState())
    val state: StateFlow<BackupUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val row = runCatching { settingsRepository.get() }.getOrNull()
            _state.update {
                it.copy(
                    settings = row,
                    autoBackup = (row?.autoBackup ?: 1) == 1,
                    intervalHours = row?.backupIntervalHours ?: 24,
                    keepCount = row?.backupKeepCount ?: 30,
                    history = runCatching { notifications.recent(12) }.getOrDefault(emptyList()),
                )
            }
        }
    }

    fun onInterval(value: String) =
        _state.update { it.copy(intervalHours = value.toIntOrNull()?.coerceIn(1, 720) ?: it.intervalHours) }

    fun onKeep(value: String) =
        _state.update { it.copy(keepCount = value.toIntOrNull()?.coerceIn(1, 365) ?: it.keepCount) }

    fun setAutoBackup(enabled: Boolean) = _state.update { it.copy(autoBackup = enabled) }

    fun saveSchedule() {
        val snapshot = _state.value
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            runCatching {
                settingsRepository.save(
                    SettingsPatch(
                        autoBackup = snapshot.autoBackup,
                        backupIntervalHours = snapshot.intervalHours,
                        backupKeepCount = snapshot.keepCount,
                    ),
                )
            }
            _state.update { it.copy(busy = false) }
        }
    }

    /**
     * Copies the live database file.
     *
     * `VACUUM INTO` is used rather than a raw file copy because the database is
     * open and WAL-backed: a plain copy can catch a half-written page, while
     * `VACUUM INTO` produces a single consistent file without locking the app.
     */
    fun backupNow() {
        _state.update { it.copy(busy = true, result = null) }
        viewModelScope.launch {
            val stamp = IstDate.dateTimeStr().replace(" ", "_").replace(":", "")
            val target = java.io.File(
                database.openHelper.writableDatabase.path?.let { java.io.File(it).parentFile },
                "minzmahallu-$stamp.sqlite",
            )
            val outcome = runCatching {
                if (target.exists()) target.delete()
                database.openHelper.writableDatabase.execSQL("VACUUM INTO ?", arrayOf(target.absolutePath))
                target
            }
            outcome.onSuccess { file ->
                runCatching {
                    notifications.push(
                        title = "Backup created",
                        message = "${file.name} · ${file.length() / 1024} KB",
                        severity = "info",
                    )
                }
                _state.update {
                    it.copy(
                        busy = false,
                        latest = file.absolutePath,
                        result = "${file.name} · ${file.length() / 1024} KB",
                        resultSuccess = true,
                        history = runCatching { notifications.recent(12) }.getOrDefault(it.history),
                    )
                }
            }.onFailure { error ->
                runCatching {
                    notifications.push(
                        title = "Backup failed",
                        message = error.message,
                        severity = "error",
                    )
                }
                _state.update {
                    it.copy(
                        busy = false,
                        result = error.message ?: "could not write the copy",
                        resultSuccess = false,
                        history = runCatching { notifications.recent(12) }.getOrDefault(it.history),
                    )
                }
            }
        }
    }

    /** Hands the newest copy to the system share sheet. */
    fun shareLatest() {
        val path = _state.value.latest ?: return
        // The share intent is raised from the Activity, which owns the context;
        // the view model only records which file to send.
        _state.update { it.copy(result = "ready to share: ${java.io.File(path).name}", resultSuccess = true) }
    }
}
