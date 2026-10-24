package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.ApprovalKind
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.approvals.ApprovalsRepository
import app.minzmahallu.core.domain.approvals.PendingEntry
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.EmptyState
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.StaggeredIn
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Approvals — `src/pages/Approvals.tsx`.
 *
 * Entries raised by a Member or a Staff account land here and stay inert until
 * an Administrator or Secretary acts. Approving a subscription replays its
 * parked amount through the normal allocation; rejecting deletes the row, which
 * is why the reason is mandatory.
 */
@Composable
fun ApprovalsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: ApprovalsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val reject by viewModel.reject.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        Column(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = Gutters.screen, vertical = 12.dp),
        ) {
            ScreenHeader(
                title = "Approvals",
                eyebrow = "office",
                subtitle = if (state.entries.isEmpty()) {
                    "nothing waiting"
                } else {
                    "${state.entries.size} entr(ies) waiting for a decision"
                },
                back = onOpenDrawer,
            )
        }

        when {
            state.loading -> ListSkeleton(rows = 4, modifier = Modifier.padding(Gutters.screen))

            !state.canApprove -> EmptyState(
                title = "Read only for your role",
                body = "Only an Administrator or Secretary can approve or reject pending entries.",
                modifier = Modifier.fillMaxWidth().padding(Gutters.screen),
            )

            state.entries.isEmpty() -> EmptyState(
                title = "Queue is clear",
                body = "Entries raised by Member and Staff accounts appear here.",
                modifier = Modifier.fillMaxWidth().padding(Gutters.screen),
            )

            else -> Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Gutters.screen),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                state.entries.forEachIndexed { index, entry ->
                    StaggeredIn(index = index) {
                        RecordRow(
                            title = entry.title,
                            subtitle = listOf(entry.kind.wire, entry.detail)
                                .filter { it.isNotBlank() }
                                .joinToString(" · "),
                            code = IstDate.fmtDateTime(entry.createdAt),
                            status = "Pending",
                            amount = entry.amount,
                            trailing = {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    app.minzmahallu.core.ui.component.MahalluButton(
                                        onClick = { viewModel.approve(entry) },
                                        size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                                        text = "Approve",
                                        enabled = state.canApprove && !state.busy,
                                    )
                                    app.minzmahallu.core.ui.component.MahalluButton(
                                        onClick = { viewModel.askReject(entry) },
                                        variant = app.minzmahallu.core.ui.component.ButtonVariant.Danger,
                                        size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                                        text = "Reject",
                                        enabled = state.canApprove && !state.busy,
                                    )
                                }
                            },
                            onClick = { },
                        )
                    }
                }
            }
        }
    }

    reject?.let { prompt ->
        BottomSheet(
            onDismiss = viewModel::closeReject,
            eyebrow = "reject entry",
            title = prompt.title,
            subtitle = "rejecting deletes the pending row",
            footer = {
                SheetFooter(
                    primaryLabel = "Reject",
                    onPrimary = viewModel::submitReject,
                    onSecondary = viewModel::closeReject,
                    primaryEnabled = prompt.reason.isNotBlank(),
                    loading = state.busy,
                )
            },
        ) {
            Card(title = "Entry") {
                DetailRow("Module", prompt.kind.wire)
                DetailRow("Detail", prompt.detail)
                DetailRow("Raised", IstDate.fmtDateTime(prompt.createdAt))
                if (prompt.amount != null) {
                    Amount(value = prompt.amount, style = MahalluTheme.type.amountSmall)
                }
            }
            Spacer(Modifier.height(16.dp))
            MahalluTextField(
                value = prompt.reason,
                onValueChange = viewModel::onRejectReason,
                label = "Reason",
                singleLine = false,
                minLines = 2,
                supporting = "recorded in the audit log",
                error = state.error,
            )
        }
    }
}

data class ApprovalsUiState(
    val entries: List<PendingEntry> = emptyList(),
    val loading: Boolean = true,
    val canApprove: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ApprovalsViewModel @Inject constructor(
    private val approvals: ApprovalsRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(ApprovalsUiState())
    val state: StateFlow<ApprovalsUiState> = _state.asStateFlow()

    private val _reject = MutableStateFlow<PendingEntry?>(null)
    val reject: StateFlow<PendingEntry?> = _reject.asStateFlow()

    private var rejectReason = MutableStateFlow("")

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update { it.copy(canApprove = RoleAccess.canApprove(role)) }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching { approvals.list() }
                .onSuccess { list -> _state.update { it.copy(entries = list, loading = false) } }
                .onFailure { _state.update { current -> current.copy(loading = false) } }
        }
    }

    fun approve(entry: PendingEntry) {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching { approvals.approve(entry.kind, entry.id) }
                .onSuccess {
                    _state.update { current -> current.copy(busy = false) }
                    refresh()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(busy = false, error = error.message?.takeIf(String::isNotBlank))
                    }
                }
        }
    }

    fun askReject(entry: PendingEntry) {
        rejectReason.value = ""
        _reject.value = entry
    }

    fun closeReject() {
        _reject.value = null
        _state.update { it.copy(error = null) }
    }

    fun onRejectReason(value: String) {
        rejectReason.value = value
    }

    fun submitReject() {
        val entry = _reject.value ?: return
        val reason = rejectReason.value.trim()
        if (reason.isBlank()) {
            _state.update { it.copy(error = "A reason is required") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching { approvals.reject(entry.kind, entry.id, reason) }
                .onSuccess {
                    _state.update { current -> current.copy(busy = false) }
                    _reject.value = null
                    refresh()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(busy = false, error = error.message?.takeIf(String::isNotBlank))
                    }
                }
        }
    }
}
