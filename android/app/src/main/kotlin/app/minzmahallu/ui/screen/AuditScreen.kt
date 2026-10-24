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
import androidx.compose.foundation.lazy.itemsIndexed
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
import app.minzmahallu.core.domain.settings.AuditIntegrity
import app.minzmahallu.core.domain.settings.AuditRepository
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.ButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.FilterChip
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.Pill
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SearchBar
import app.minzmahallu.core.ui.component.Surface
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CodeText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.StaggeredIn
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Audit log — `src/pages/Audit.tsx`.
 *
 * Read-only by design: the whole point of the log is that nobody, including an
 * administrator, can rewrite it from the app. The chain check walks every row
 * and reports the first one whose hash no longer matches its predecessor, which
 * is how a hand-edited database is caught.
 */
@Composable
fun AuditScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: AuditViewModel = hiltViewModel(),
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
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding()) {
                ScreenHeader(
                    title = "Audit log",
                    eyebrow = "office",
                    subtitle = "${state.total} entr(ies)",
                    back = onOpenDrawer,
                )
                Spacer(Modifier.height(14.dp))
                SearchBar(
                    value = state.search,
                    onValueChange = viewModel::onSearch,
                    onClear = { viewModel.onSearch("") },
                    placeholder = "Search action, user or description",
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        text = "All modules",
                        selected = state.module == null,
                        onClick = { viewModel.onModule(null) },
                    )
                    state.modules.take(5).forEach { module ->
                        FilterChip(
                            text = module,
                            selected = state.module == module,
                            onClick = { viewModel.onModule(module) },
                        )
                    }
                }
            }
        }

        item {
            Card(title = "Chain integrity", eyebrow = "tamper check") {
                val integrity = state.integrity
                when {
                    integrity == null -> AppText(
                        text = "Not checked yet.",
                        style = MahalluTheme.type.body,
                        color = colors.textSecondary,
                    )

                    integrity.ok -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Pill(text = "intact", color = colors.accent)
                        Spacer(Modifier.height(0.dp))
                        AppText(
                            text = "  all ${integrity.entries} entries hash to their predecessor",
                            style = MahalluTheme.type.caption,
                            color = colors.textSecondary,
                        )
                    }

                    else -> Column {
                        Pill(text = "broken", color = colors.danger)
                        Spacer(Modifier.height(10.dp))
                        AppText(
                            text = "The chain breaks at entry #${integrity.firstBadId}. " +
                                "A row was edited, deleted or the file was replaced.",
                            style = MahalluTheme.type.body,
                            color = colors.danger,
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
                MahalluButton(
                    onClick = viewModel::verifyChain,
                    variant = ButtonVariant.Secondary,
                    size = ButtonSize.Small,
                    text = if (state.verifying) "Checking…" else "Run chain check",
                    enabled = !state.verifying,
                )
            }
        }

        if (state.loading) {
            item { ListSkeleton(rows = 5) }
        } else {
            itemsIndexed(state.rows, key = { _, entry -> entry.id }) { index, entry ->
                StaggeredIn(index = index) { AuditRow(entry) }
            }
        }
    }
}

@Composable
private fun AuditRow(entry: AuditEntry) {
    val colors = MahalluTheme.colors
    Surface(contentPadding = PaddingValues(14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Pill(text = entry.action, color = actionColor(entry.action))
                    Spacer(Modifier.height(0.dp))
                    AppText(
                        text = "  ${entry.module.orEmpty()}",
                        style = MahalluTheme.type.micro,
                        color = colors.textFaint,
                        maxLines = 1,
                    )
                }
                Spacer(Modifier.height(8.dp))
                AppText(
                    text = entry.description ?: entry.action,
                    style = MahalluTheme.type.body,
                    color = colors.textPrimary,
                    maxLines = 3,
                )
                Spacer(Modifier.height(6.dp))
                AppText(
                    text = listOfNotNull(entry.username, IstDate.fmtDateTime(entry.createdAt))
                        .joinToString(" · "),
                    style = MahalluTheme.type.micro,
                    color = colors.textFaint,
                    maxLines = 1,
                )
            }
            if (entry.entryHash != null) {
                Spacer(Modifier.height(0.dp))
                CodeText(text = entry.entryHash.take(8))
            }
        }
    }
}

private fun actionColor(action: String): androidx.compose.ui.graphics.Color =
    when (action.uppercase()) {
        "CREATE" -> MahalluTheme.colors.accent
        "UPDATE" -> MahalluTheme.colors.info
        "DELETE" -> MahalluTheme.colors.danger
        "LOGIN", "LOGOUT" -> MahalluTheme.colors.violet
        else -> MahalluTheme.colors.gold
    }

data class AuditUiState(
    val rows: List<AuditEntry> = emptyList(),
    val total: Int = 0,
    val modules: List<String> = emptyList(),
    val loading: Boolean = true,
    val search: String = "",
    val module: String? = null,
    val integrity: AuditIntegrity? = null,
    val verifying: Boolean = false,
)

@HiltViewModel
class AuditViewModel @Inject constructor(
    private val audit: AuditRepository,
    sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(AuditUiState())
    val state: StateFlow<AuditUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            _state.update {
                it.copy(modules = runCatching { audit.modules() }.getOrDefault(emptyList()))
            }
        }
        load()
    }

    fun onSearch(value: String) {
        _state.update { it.copy(search = value) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            load()
        }
    }

    fun onModule(value: String?) {
        _state.update { it.copy(module = value) }
        load()
    }

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                audit.page(
                    search = snapshot.search.trim().ifBlank { null },
                    action = null,
                    module = snapshot.module,
                    page = 1,
                    pageSize = 60,
                )
            }.onSuccess { page ->
                _state.update {
                    it.copy(rows = page.rows, total = page.total, loading = false)
                }
            }.onFailure { _state.update { current -> current.copy(loading = false) } }
        }
    }

    fun verifyChain() {
        _state.update { it.copy(verifying = true) }
        viewModelScope.launch {
            val result = runCatching { audit.verify() }.getOrNull()
            _state.update { it.copy(integrity = result, verifying = false) }
        }
    }
}
