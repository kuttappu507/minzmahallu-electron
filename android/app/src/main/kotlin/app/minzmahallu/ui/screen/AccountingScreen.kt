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
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.LedgerType
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.finance.AccountingRepository
import app.minzmahallu.core.domain.finance.LedgerInput
import app.minzmahallu.core.domain.finance.UnifiedSummary
import app.minzmahallu.core.model.LedgerAccount
import app.minzmahallu.core.model.TransactionWithRefs
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Hairline
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
 * Accounting — `src/pages/Accounting.tsx`.
 *
 * The list shows manual ledger entries only; the summary above it is the
 * *unified* ledger (manual entries + donations + subscriptions − welfare −
 * salaries), which is the same arithmetic the dashboard balance uses. A voided
 * entry stays visible and can never be edited or voided twice.
 */
@Composable
fun AccountingScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: AccountingViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val summary by viewModel.summary.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()
    val voidPrompt by viewModel.voidPrompt.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        Card(
            title = "Unified ledger",
            eyebrow = viewModel.preset.value,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Eyebrow("balance")
                    Amount(
                        value = summary.balance,
                        style = MahalluTheme.type.headline,
                        color = if (summary.balance >= 0) colors.accent else colors.danger,
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Eyebrow("income")
                    Amount(value = summary.income, style = MahalluTheme.type.amountSmall, color = colors.accent)
                }
                Column(Modifier.weight(1f)) {
                    Eyebrow("expense")
                    Amount(value = summary.expense, style = MahalluTheme.type.amountSmall, color = colors.danger)
                }
            }
            Hairline(Modifier.padding(vertical = 12.dp))
            AppText(
                text = "manual entries only: ₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(summary.manualIncome)} in, " +
                    "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(summary.manualExpense)} out",
                style = MahalluTheme.type.micro,
                color = colors.textFaint,
            )
        }

        ModuleListScreen(
            title = "Ledger",
            subtitle = "${state.total} entr(ies)",
            eyebrow = "money",
            items = state.rows,
            loading = state.loading,
            search = state.search,
            onSearchChange = viewModel::onSearch,
            onOpenDrawer = onOpenDrawer,
            filters = listOf("All", "Income", "Expense"),
            activeFilter = state.filter,
            onFilterChange = { viewModel.onFilter(it); viewModel.loadSummary() },
            canCreate = state.canWrite,
            onCreate = viewModel::openCreate,
            createLabel = "New entry",
            trailing = {
                app.minzmahallu.core.ui.component.MahalluButton(
                    onClick = viewModel::cyclePreset,
                    variant = app.minzmahallu.core.ui.component.ButtonVariant.Secondary,
                    size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                    text = viewModel.preset.value.replace('_', ' '),
                )
            },
            onRefresh = {
                viewModel.refresh()
                viewModel.loadSummary()
            },
            emptyTitle = "No ledger entries",
            emptyBody = "Donations, subscriptions, welfare and salaries post here automatically.",
        ) { row, _ ->
            val t = row.transaction
            RecordRow(
                title = t.description.orEmpty().ifBlank { row.accountName.orEmpty() },
                code = t.voucherNo ?: t.receiptNumber,
                subtitle = listOfNotNull(
                    IstDate.fmtDdMmYyyy(t.txnDate),
                    t.paymentMethod,
                    t.billNo?.takeIf { it.isNotBlank() }?.let { "bill $it" },
                ).joinToString(" · ").ifBlank { null },
                status = if (t.status == "Void") "Void" else t.type,
                amount = t.amount,
                amountColor = if (t.type == LedgerType.Income.wire) colors.accent else colors.danger,
                dimmed = t.status == "Void",
                onClick = { if (t.status != "Void") viewModel.askVoid(row) },
            )
        }
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = "manual entry",
            title = "New ledger entry",
            subtitle = "a voucher number is assigned automatically",
            footer = {
                SheetFooter(
                    primaryLabel = "Post",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = (d.amount.toDoubleOrNull() ?: 0.0) > 0.0 && d.accountId != null,
                    loading = state.busy,
                )
            },
        ) {
            EnumField(
                label = "Type",
                value = d.type,
                options = listOf(LedgerType.Income.wire, LedgerType.Expense.wire),
                onSelect = { viewModel.edit { copy(type = it) } },
            )
            Spacer(Modifier.height(12.dp))
            EnumField(
                label = "Account",
                value = d.accountName,
                options = viewModel.accounts.value.map { it.name },
                onSelect = { name ->
                    viewModel.edit {
                        copy(
                            accountName = name,
                            accountId = viewModel.accounts.value.firstOrNull { it.name == name }?.id,
                        )
                    }
                },
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AmountField(
                    value = d.amount,
                    onValueChange = { viewModel.edit { copy(amount = it) } },
                    label = "Amount",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.txnDate,
                    onValueChange = { viewModel.edit { copy(txnDate = it) } },
                    label = "Date",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.description,
                onValueChange = { viewModel.edit { copy(description = it) } },
                label = "Description",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.billNo,
                    onValueChange = { viewModel.edit { copy(billNo = it) } },
                    label = "Bill no.",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.payee,
                    onValueChange = { viewModel.edit { copy(payee = it) } },
                    label = "Payee",
                    modifier = Modifier.weight(1f),
                )
            }
            if (editor.duplicateBill != null) {
                Spacer(Modifier.height(12.dp))
                AppText(
                    text = "That bill number is already on ${editor.duplicateBill}. The desktop " +
                        "warns rather than blocks, so this entry was posted — worth a second look.",
                    style = MahalluTheme.type.caption,
                    color = colors.warning,
                )
            }
        }
    }

    voidPrompt?.let { prompt ->
        BottomSheet(
            onDismiss = viewModel::closeVoid,
            eyebrow = "void entry",
            title = prompt.voucher,
            subtitle = "the row stays in the ledger, marked void",
            footer = {
                SheetFooter(
                    primaryLabel = "Void",
                    onPrimary = viewModel::submitVoid,
                    onSecondary = viewModel::closeVoid,
                    primaryEnabled = prompt.reason.isNotBlank() && prompt.password.isNotEmpty(),
                    loading = state.busy,
                )
            },
        ) {
            Card(title = "Entry") {
                DetailRow("Amount", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(prompt.amount)}")
                DetailRow("Date", IstDate.fmtDdMmYyyy(prompt.date))
            }
            Spacer(Modifier.height(16.dp))
            MahalluTextField(
                value = prompt.reason,
                onValueChange = viewModel::onVoidReason,
                label = "Reason",
                supporting = "required, and stored on the row",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            PasswordField(
                value = prompt.password,
                onValueChange = viewModel::onVoidPassword,
                label = "Administrator password",
            )
        }
    }
}

data class LedgerDraft(
    val type: String = LedgerType.Expense.wire,
    val accountId: Long? = null,
    val accountName: String = "",
    val amount: String = "",
    val txnDate: String = IstDate.today(),
    val description: String = "",
    val billNo: String = "",
    val payee: String = "",
)

data class VoidPrompt(
    val id: Long,
    val voucher: String,
    val amount: Double,
    val date: String,
    val reason: String = "",
    val password: String = "",
)

@HiltViewModel
class AccountingViewModel @Inject constructor(
    private val accounting: AccountingRepository,
    sessions: SessionController,
) : RegisterListViewModel<TransactionWithRefs>(
    sessions = sessions,
    module = RoleAccess.Module.Accounting,
    filters = listOf("All", "Income", "Expense"),
) {

    data class Editor(
        val open: Boolean = false,
        val draft: LedgerDraft = LedgerDraft(),
        val duplicateBill: String? = null,
    )

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    private val _summary = MutableStateFlow(UnifiedSummary(0.0, 0.0, 0.0, 0.0, 0.0))
    val summary: StateFlow<UnifiedSummary> = _summary.asStateFlow()

    private val _voidPrompt = MutableStateFlow<VoidPrompt?>(null)
    val voidPrompt: StateFlow<VoidPrompt?> = _voidPrompt.asStateFlow()

    val accounts = MutableStateFlow<List<LedgerAccount>>(emptyList())

    /** The desktop's period presets, cycled by the button in the header. */
    private val presets = listOf(
        "all", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year",
    )
    val preset = MutableStateFlow("all")

    init {
        viewModelScope.launch {
            accounts.value = runCatching { accounting.accounts() }.getOrDefault(emptyList())
        }
        loadSummary()
    }

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<TransactionWithRefs> = accounting.page(
        search = search,
        type = filter,
        preset = preset.value,
        page = page,
        pageSize = pageSize,
    )

    fun cyclePreset() {
        val index = presets.indexOf(preset.value)
        preset.value = presets[(index + 1) % presets.size]
        refresh()
        loadSummary()
    }

    fun loadSummary() {
        viewModelScope.launch {
            _summary.value = runCatching { accounting.unifiedSummary(preset.value) }
                .getOrDefault(UnifiedSummary(0.0, 0.0, 0.0, 0.0, 0.0))
        }
    }

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun closeEditor() {
        _editor.value = Editor()
        patch { copy(error = null) }
    }

    inline fun edit(crossinline transform: LedgerDraft.() -> LedgerDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun onVoidReason(value: String) = _voidPrompt.update { it?.copy(reason = value) }

    fun onVoidPassword(value: String) = _voidPrompt.update { it?.copy(password = value) }

    fun askVoid(row: TransactionWithRefs) {
        val t = row.transaction
        _voidPrompt.value = VoidPrompt(
            id = t.id,
            voucher = t.voucherNo ?: t.receiptNumber ?: "#${t.id}",
            amount = t.amount,
            date = t.txnDate,
        )
    }

    fun closeVoid() {
        _voidPrompt.value = null
        patch { copy(error = null) }
    }

    fun save() {
        val d = _editor.value.draft
        val accountId = d.accountId
        val amount = d.amount.toDoubleOrNull() ?: 0.0
        if (accountId == null || amount <= 0.0) {
            patch { copy(error = "Account and amount are required") }
            return
        }
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching {
                accounting.create(
                    LedgerInput(
                        txnDate = d.txnDate,
                        accountId = accountId,
                        type = wireTo(d.type, LedgerType.Expense),
                        amount = amount,
                        description = d.description,
                        billNo = d.billNo.ifBlank { null },
                        payee = d.payee.ifBlank { null },
                    ),
                )
            }.onSuccess { created ->
                // A repeated bill number is a warning, not a failure — show it
                // and keep the sheet open so the operator can confirm.
                _editor.value = _editor.value.copy(
                    duplicateBill = created.duplicateBill?.let {
                        "#${it.id} · ${IstDate.fmtDdMmYyyy(it.txnDate)} · " +
                            "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(it.amount)}"
                    },
                )
                patch { copy(busy = false) }
                if (created.duplicateBill == null) _editor.value = Editor()
                refresh()
                loadSummary()
            }.onFailure { error ->
                patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
            }
        }
    }

    fun submitVoid() {
        val prompt = _voidPrompt.value ?: return
        if (prompt.reason.isBlank()) {
            patch { copy(error = "A reason is required") }
            return
        }
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching { accounting.void(prompt.id, prompt.reason, prompt.password) }
                .onSuccess {
                    patch { copy(busy = false) }
                    _voidPrompt.value = null
                    refresh()
                    loadSummary()
                }
                .onFailure { error ->
                    patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
                }
        }
    }
}
