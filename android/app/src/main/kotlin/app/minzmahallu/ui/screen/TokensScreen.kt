package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.token.TokenRepository
import app.minzmahallu.core.model.TokenEvent
import app.minzmahallu.core.model.TokenStats
import app.minzmahallu.core.model.TokenWithFamily
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.MahalluButtonSize
import app.minzmahallu.core.ui.component.MahalluButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.RecordRow
import app.minzmahallu.core.ui.component.SearchBar
import app.minzmahallu.core.ui.component.StatusPill
import app.minzmahallu.core.ui.component.chart.StackedBar
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CodeText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import app.minzmahallu.ui.common.RegisterListViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Tokens — `src/pages/Tokens.tsx`.
 *
 * Two jobs live here: generate a token per family for an event, and collect it
 * at the door. Collection by four-character code is the fast path, because the
 * volunteer at the distribution point has a queue and no keyboard.
 */
@Composable
fun TokensScreen(
    onOpenDrawer: () -> Unit,
    onOpenEvents: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: TokensViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val events by viewModel.events.collectAsStateWithLifecycle()
    val stats by viewModel.stats.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        ModuleListScreen(
            title = "Tokens",
            subtitle = events.find { it.id == viewModel.eventId.value }?.eventName
                ?: "${state.total} token(s)",
            eyebrow = "registers",
            items = state.rows,
            loading = state.loading,
            search = state.search,
            onSearchChange = viewModel::onSearch,
            onOpenDrawer = onOpenDrawer,
            filters = listOf("All", "GENERATED", "ISSUED", "COLLECTED", "CANCELLED"),
            activeFilter = state.filter,
            onFilterChange = viewModel::onFilter,
            trailing = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MahalluButton(
                        onClick = onOpenEvents,
                        variant = ButtonVariant.Secondary,
                        size = ButtonSize.Small,
                        text = "Events",
                    )
                    MahalluButton(
                        onClick = viewModel::generateAll,
                        size = ButtonSize.Small,
                        text = "Generate",
                        enabled = viewModel.eventId.value != null && state.canWrite,
                    )
                }
            },
            onRefresh = viewModel::refresh,
            emptyTitle = "No tokens",
            emptyBody = "Pick an event, then generate a token for every family.",
        ) { row, _ ->
            val t = row.token
            RecordRow(
                title = row.houseName.orEmpty().ifBlank { row.familyNumber.orEmpty() },
                subtitle = listOfNotNull(row.ward, row.eventName).joinToString(" · ").ifBlank { null },
                status = t.status,
                amount = null,
                onClick = { viewModel.collect(t.id, row) },
                leading = {
                    Column {
                        CodeText(text = t.tokenCode)
                    }
                },
            )
        }
    }

    stats?.let { s ->
        Card(title = "Collection progress", modifier = Modifier.padding(20.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Eyebrow("collected")
                    AppText(
                        text = "${s.collected} of ${s.total}",
                        style = MahalluTheme.type.subtitle,
                        color = colors.textPrimary,
                    )
                }
                AppText(
                    text = "${s.rate}%",
                    style = MahalluTheme.type.amountSmall,
                    color = colors.accent,
                )
            }
            Spacer(Modifier.height(14.dp))
            StackedBar(
                segments = listOf(
                    s.collected.toDouble() to colors.accent,
                    s.remaining.toDouble() to colors.lineStrong,
                ),
            )
        }
    }
}

/** The token events list — `src/pages/Tokens.tsx`'s management tab. */
@Composable
fun TokenEventsScreen(
    onBack: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: TokenEventsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Token events",
        subtitle = "${state.events.size} event(s)",
        eyebrow = "registers",
        items = state.events,
        loading = state.loading,
        search = "",
        onSearchChange = {},
        onOpenDrawer = onBack,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "New event",
        onRefresh = viewModel::refresh,
        emptyTitle = "No events",
        emptyBody = "Create an Iftar, ration or relief-kit distribution to start issuing tokens.",
    ) { event, _ ->
        RecordRow(
            title = event.eventName,
            subtitle = listOfNotNull(
                IstDate.fmtDdMmYyyy(event.eventDate),
                event.eventTime?.takeIf { it.isNotBlank() },
                event.venue?.takeIf { it.isNotBlank() },
            ).joinToString(" · ").ifBlank { null },
            status = event.status,
            onClick = { viewModel.openEdit(event) },
        )
    }
}

data class TokenEventUiState(
    val events: List<TokenEvent> = emptyList(),
    val loading: Boolean = true,
    val canWrite: Boolean = false,
    val busy: Boolean = false,
)

@HiltViewModel
class TokensViewModel @Inject constructor(
    private val tokens: TokenRepository,
    sessions: SessionController,
) : RegisterListViewModel<TokenWithFamily>(
    sessions = sessions,
    module = RoleAccess.Module.Tokens,
    filters = listOf("All", "GENERATED", "ISSUED", "COLLECTED", "CANCELLED"),
) {

    private val _events = MutableStateFlow<List<TokenEvent>>(emptyList())
    val events: StateFlow<List<TokenEvent>> = _events.asStateFlow()

    private val _stats = MutableStateFlow<TokenStats?>(null)
    val stats: StateFlow<TokenStats?> = _stats.asStateFlow()

    /** The event the list is filtered to; the most recent one by default. */
    val eventId = MutableStateFlow<Long?>(null)

    init {
        viewModelScope.launch {
            val list = runCatching { tokens.events() }.getOrDefault(emptyList())
            _events.value = list
            if (eventId.value == null) eventId.value = list.maxByOrNull { it.eventDate }?.id
            refreshStats()
        }
    }

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<TokenWithFamily> = tokens.page(
        eventId = eventId.value,
        status = filter,
        search = search,
        page = page,
        pageSize = pageSize,
    )

    private fun refreshStats() {
        viewModelScope.launch {
            val id = eventId.value ?: return@launch
            _stats.value = runCatching { tokens.stats(id) }.getOrNull()
        }
    }

    /** One token per family for the current event; families that already have
     *  one are skipped, which is what makes this safe to press twice. */
    fun generateAll() {
        val id = eventId.value ?: return
        patch { copy(busy = true) }
        viewModelScope.launch {
            runCatching { tokens.familiesWithoutTokens(id).map { it.id } }.onSuccess { ids ->
                runCatching { tokens.generate(id, ids) }
                patch { copy(busy = false) }
                refresh()
                refreshStats()
            }.onFailure {
                patch { copy(busy = false) }
            }
        }
    }

    fun collect(tokenId: Long, row: TokenWithFamily) {
        patch { copy(busy = true) }
        viewModelScope.launch {
            runCatching { tokens.collect(tokenId) }
                .onSuccess {
                    patch { copy(busy = false) }
                    refresh()
                    refreshStats()
                }
                .onFailure { patch { copy(busy = false) } }
        }
    }
}

@HiltViewModel
class TokenEventsViewModel @Inject constructor(
    private val tokens: TokenRepository,
    sessions: SessionController,
) : ViewModel() {

    data class Editor(val open: Boolean = false, val draft: TokenEventDraft = TokenEventDraft())

    private val _state = MutableStateFlow(TokenEventUiState())
    val state: StateFlow<TokenEventUiState> = _state.asStateFlow()

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(canWrite = role != null && RoleAccess.canWrite(role, RoleAccess.Module.Tokens))
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching { tokens.events() }
                .onSuccess { list -> _state.update { it.copy(events = list, loading = false) } }
                .onFailure { _state.update { current -> current.copy(loading = false) } }
        }
    }

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(event: TokenEvent) {
        _editor.value = Editor(
            open = true,
            draft = TokenEventDraft(
                id = event.id,
                eventName = event.eventName,
                eventType = event.eventType,
                eventDate = event.eventDate,
                eventTime = event.eventTime.orEmpty(),
                venue = event.venue.orEmpty(),
                description = event.description.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    inline fun edit(crossinline transform: TokenEventDraft.() -> TokenEventDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val d = _editor.value.draft
        if (d.eventName.isBlank()) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val input = app.minzmahallu.core.domain.token.TokenEventInput(
                eventName = d.eventName.trim(),
                eventType = d.eventType,
                eventDate = d.eventDate,
                eventTime = d.eventTime.trim(),
                venue = d.venue.trim(),
                description = d.description.trim(),
            )
            runCatching {
                if (d.id == null) tokens.createEvent(input) else tokens.updateEvent(d.id, input)
            }.onSuccess {
                _state.update { current -> current.copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure {
                _state.update { current -> current.copy(busy = false) }
            }
        }
    }

    /**
     * Deleting an event removes its tokens too, so the repository refuses until
     * the event date has passed — a distribution that has not happened yet can
     * still be corrected rather than destroyed.
     */
    fun askDelete(event: TokenEvent) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            runCatching { tokens.removeEvent(event.id, "deleted from the app") }
                .onSuccess { refresh() }
            _state.update { current -> current.copy(busy = false) }
        }
    }
}

data class TokenEventDraft(
    val id: Long? = null,
    val eventName: String = "",
    val eventType: String = "general",
    val eventDate: String = IstDate.today(),
    val eventTime: String = "",
    val venue: String = "",
    val description: String = "",
)
