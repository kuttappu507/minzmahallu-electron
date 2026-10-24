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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.i18n.localizedError
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.common.WelfareCategory
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.welfare.WelfareInput
import app.minzmahallu.core.domain.welfare.WelfareRepository
import app.minzmahallu.core.model.WelfareWithFamily
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.ButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SecureActionDialog
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import app.minzmahallu.ui.common.RegisterListViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Welfare — `src/pages/Welfare.tsx`.
 *
 * The full ask → approve → disburse chain is here, including the committee
 * minutes date on approval and the administrator password on disbursement,
 * because money leaving the fund is the one action the desktop protects twice.
 */
@Composable
fun WelfareScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: WelfareViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()
    val decision by viewModel.decision.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Welfare",
        subtitle = "${state.total} request(s)",
        eyebrow = "money",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Pending", "Approved", "Disbursed", "Rejected", "Closed"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "New request",
        onRefresh = viewModel::refresh,
        emptyTitle = "No welfare requests",
        emptyBody = "Assistance requests will appear here.",
    ) { row, _ ->
        val r = row.request
        RecordRow(
            title = r.applicantName,
            code = r.requestNumber,
            subtitle = listOfNotNull(
                r.category,
                row.houseName ?: row.familyNumber,
                IstDate.fmtDdMmYyyy(r.requestDate ?: r.createdAt),
            ).joinToString(" · ").ifBlank { null },
            status = r.status,
            amount = r.amountApproved ?: r.amountRequested,
            amountLabel = if (r.amountApproved != null) "approved" else "requested",
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new request" else "edit request",
            title = if (d.id == null) "Welfare request" else d.requestNumber.orEmpty(),
            footer = {
                SheetFooter(
                    primaryLabel = if (d.id == null) "Submit" else "Update",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = d.applicantName.isNotBlank() &&
                        (d.amountRequested.toDoubleOrNull() ?: 0.0) > 0.0,
                    busy = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = d.applicantName,
                onValueChange = { viewModel.edit { copy(applicantName = it) } },
                label = "Applicant",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            EnumField(
                label = "Category",
                value = d.category,
                options = WelfareCategory.entries.map { it.wire },
                onSelect = { viewModel.edit { copy(category = it) } },
            )
            Spacer(Modifier.height(12.dp))
            AmountField(
                value = d.amountRequested,
                onValueChange = { viewModel.edit { copy(amountRequested = it) } },
                label = "Amount requested",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.reason,
                onValueChange = { viewModel.edit { copy(reason = it) } },
                label = "Reason",
                singleLine = false,
                minLines = 2,
            )
        }
    }

    decision?.let { prompt ->
        BottomSheet(
            onDismiss = viewModel::closeDecision,
            eyebrow = prompt.action,
            title = prompt.applicant,
            footer = {
                SheetFooter(
                    primaryLabel = when (prompt.action) {
                        "approve" -> "Approve"
                        "disburse" -> "Disburse"
                        else -> "Reject"
                    },
                    onPrimary = viewModel::submitDecision,
                    onSecondary = viewModel::closeDecision,
                    busy = state.busy,
                )
            },
        ) {
            Card(title = "Request") {
                DetailRow("Requested", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(prompt.requested)}")
                DetailRow("Category", prompt.category)
            }
            Spacer(Modifier.height(16.dp))
            if (prompt.action == "approve") {
                AmountField(
                    value = prompt.amount,
                    onValueChange = viewModel::onDecisionAmount,
                    label = "Amount approved",
                    supporting = "the committee may approve less than was asked",
                )
                Spacer(Modifier.height(12.dp))
                MahalluTextField(
                    value = prompt.minutesDate,
                    onValueChange = viewModel::onDecisionMinutes,
                    label = "Minutes date",
                    supporting = "yyyy-mm-dd — the meeting that approved this",
                )
            }
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = prompt.reason,
                onValueChange = viewModel::onDecisionReason,
                label = if (prompt.action == "reject") "Reason for rejection" else "Note",
                singleLine = false,
                minLines = 2,
                error = state.error,
            )
            if (prompt.action == "disburse") {
                Spacer(Modifier.height(16.dp))
                app.minzmahallu.core.ui.component.PasswordField(
                    value = prompt.password,
                    onValueChange = viewModel::onDecisionPassword,
                    label = "Administrator password",
                )
                Spacer(Modifier.height(8.dp))
                AppText(
                    text = "Disbursement writes to the unified ledger as an expense.",
                    style = MahalluTheme.type.caption,
                    color = MahalluTheme.colors.textFaint,
                )
            }
        }
    }
}

data class WelfareDraft(
    val id: Long? = null,
    val requestNumber: String? = null,
    val applicantName: String = "",
    val category: String = WelfareCategory.MedicalAid.wire,
    val amountRequested: String = "",
    val reason: String = "",
)

data class WelfareDecision(
    val id: Long,
    val applicant: String,
    val category: String,
    val requested: Double,
    val action: String,
    val amount: String = "",
    val minutesDate: String = IstDate.today(),
    val reason: String = "",
    val password: String = "",
)

@HiltViewModel
class WelfareViewModel @Inject constructor(
    private val welfare: WelfareRepository,
    sessions: SessionController,
) : RegisterListViewModel<WelfareWithFamily>(
    sessions = sessions,
    module = RoleAccess.Module.Welfare,
    filters = listOf("All", "Pending", "Approved", "Disbursed", "Rejected", "Closed"),
) {

    data class Editor(val open: Boolean = false, val draft: WelfareDraft = WelfareDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    private val _decision = MutableStateFlow<WelfareDecision?>(null)
    val decision: StateFlow<WelfareDecision?> = _decision.asStateFlow()

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<WelfareWithFamily> = welfare.page(
        search = search,
        status = filter,
        category = null,
        page = page,
        pageSize = pageSize,
    )

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: WelfareWithFamily) {
        val r = row.request
        // A request that has moved past Pending is decided; the sheet shows the
        // next action in the chain instead of an edit form.
        if (r.status != "Pending") {
            _decision.value = WelfareDecision(
                id = r.id,
                applicant = r.applicantName,
                category = r.category,
                requested = r.amountApproved ?: r.amountRequested,
                action = when (r.status) {
                    "Approved" -> "disburse"
                    else -> "view"
                },
                amount = (r.amountApproved ?: r.amountRequested).toString(),
            )
            return
        }
        _editor.value = Editor(
            open = true,
            draft = WelfareDraft(
                id = r.id,
                requestNumber = r.requestNumber,
                applicantName = r.applicantName,
                category = r.category,
                amountRequested = r.amountRequested.toString(),
                reason = r.reason.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    fun closeDecision() {
        _decision.value = null
        patch { copy(error = null) }
    }

    fun edit(transform: WelfareDraft.() -> WelfareDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun onDecisionAmount(value: String) = _decision.update {
        it?.copy(amount = app.minzmahallu.core.ui.component.sanitizeAmount(value))
    }

    fun onDecisionMinutes(value: String) = _decision.update { it?.copy(minutesDate = value) }

    fun onDecisionReason(value: String) = _decision.update { it?.copy(reason = value) }

    fun onDecisionPassword(value: String) = _decision.update { it?.copy(password = value) }

    fun askDecision(row: WelfareWithFamily, action: String) {
        val r = row.request
        _decision.value = WelfareDecision(
            id = r.id,
            applicant = r.applicantName,
            category = r.category,
            requested = r.amountRequested,
            action = action,
            amount = r.amountRequested.toString(),
        )
    }

    fun save() {
        val d = _editor.value.draft
        val amount = d.amountRequested.toDoubleOrNull() ?: 0.0
        if (d.applicantName.isBlank() || amount <= 0.0) return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = WelfareInput(
                applicantName = d.applicantName.trim(),
                category = app.minzmahallu.core.common.wireTo(d.category, WelfareCategory.MedicalAid),
                amountRequested = amount,
                reason = d.reason.trim(),
            )
            runCatching {
                if (d.id == null) welfare.create(input) else welfare.update(d.id, input)
            }.onSuccess {
                patch { copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure { error ->
                patch { copy(busy = false, error = localizedError(error)?.takeIf(String::isNotBlank)) }
            }
        }
    }

    fun submitDecision() {
        val prompt = _decision.value ?: return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = when (prompt.action) {
                "approve" -> runCatching {
                    welfare.approve(
                        id = prompt.id,
                        amountApproved = prompt.amount.toDoubleOrNull() ?: prompt.requested,
                        reason = prompt.reason,
                        minutesDate = prompt.minutesDate.ifBlank { null },
                    )
                }

                "reject" -> runCatching { welfare.reject(prompt.id, prompt.reason) }

                "disburse" -> runCatching {
                    welfare.disburse(prompt.id, prompt.reason, prompt.password)
                }

                else -> Result.success(Unit)
            }
            result.onSuccess {
                patch { copy(busy = false) }
                _decision.value = null
                refresh()
            }.onFailure { error ->
                patch { copy(busy = false, error = localizedError(error)?.takeIf(String::isNotBlank)) }
            }
        }
    }
}
