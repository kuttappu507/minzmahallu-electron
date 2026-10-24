package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.finance.DonationInput
import app.minzmahallu.core.domain.finance.DonationRepository
import app.minzmahallu.core.model.DonationWithCategory
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Donations — a port of `src/pages/Donations.tsx`.
 *
 * A donation auto-generates its receipt unless the operator opts out, and once
 * `receipt_generated_at` is set the row is locked: the desktop refuses the
 * edit and so does this screen.
 */
@Composable
fun DonationsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: DonationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    ModuleListScreen(
        title = "Donations",
        subtitle = "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(state.monthTotal)} this month",
        eyebrow = "money",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = state.categories.map { it.name }.let { listOf("All") + it },
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "New donation",
        onRefresh = viewModel::refresh,
        emptyTitle = "No donations recorded",
        emptyBody = "Record a donation and its receipt is generated in the same step.",
    ) { row, _ ->
        RecordRow(
            title = row.donation.donorName.ifBlank { "Anonymous" },
            code = row.donation.receiptNumber,
            subtitle = listOfNotNull(
                row.categoryName,
                IstDate.fmtDdMmYyyy(row.donation.donationDate),
                row.donation.paymentMethod,
            ).joinToString(" · "),
            status = when {
                row.donation.receiptGeneratedAt != null -> "Receipt"
                else -> row.donation.status
            },
            amount = row.donation.amount,
            dimmed = row.donation.receiptGeneratedAt != null,
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (state.editorOpen) {
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (state.draft.id == null) "new record" else "edit record",
            title = if (state.draft.id == null) "Record donation" else state.draft.receiptNumber.orEmpty(),
            subtitle = if (state.locked) "receipt generated — this entry is frozen" else null,
            footer = {
                if (!state.locked) {
                    SheetFooter(
                        primaryLabel = if (state.draft.id == null) "Save" else "Update",
                        onPrimary = viewModel::save,
                        onSecondary = viewModel::closeEditor,
                        primaryEnabled = (state.draft.amount.toDoubleOrNull() ?: 0.0) > 0.0,
                        busy = state.busy,
                    )
                }
            },
        ) {
            MahalluTextField(
                value = state.draft.donorName,
                onValueChange = { viewModel.onDraft { copy(donorName = it) } },
                label = "Donor name",
                error = state.error,
                supporting = "leave blank for an anonymous donation",
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AmountField(
                    value = state.draft.amount,
                    onValueChange = { viewModel.onDraft { copy(amount = it) } },
                    label = "Amount",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = state.draft.date,
                    onValueChange = { viewModel.onDraft { copy(date = it) } },
                    label = "Date",
                    supporting = "yyyy-mm-dd",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(14.dp))
            EnumField(
                label = "Category",
                value = state.draft.category,
                options = state.categories.map { it.name }.ifEmpty { listOf("General") },
                onSelect = { viewModel.onDraft { copy(category = it) } },
            )
            Spacer(Modifier.height(14.dp))
            EnumField(
                label = "Payment method",
                value = state.draft.method,
                options = listOf("Cash", "UPI", "Bank", "Cheque"),
                onSelect = { viewModel.onDraft { copy(method = it) } },
            )
            Spacer(Modifier.height(14.dp))
            PhoneField(
                value = state.draft.donorPhone,
                onValueChange = { viewModel.onDraft { copy(donorPhone = it) } },
                label = "Donor phone",
                supporting = "used for the WhatsApp receipt",
            )
            Spacer(Modifier.height(14.dp))
            MahalluTextField(
                value = state.draft.purpose,
                onValueChange = { viewModel.onDraft { copy(purpose = it) } },
                label = "Purpose",
                singleLine = false,
                minLines = 2,
            )
        }
    }
}

data class DonationDraft(
    val id: Long? = null,
    val receiptNumber: String? = null,
    val donorName: String = "",
    val donorPhone: String = "",
    val amount: String = "",
    val date: String = IstDate.today(),
    val category: String = "General",
    val method: String = "Cash",
    val purpose: String = "",
)

data class DonationsUiState(
    val rows: List<DonationWithCategory> = emptyList(),
    val total: Int = 0,
    val monthTotal: Double = 0.0,
    val categories: List<app.minzmahallu.core.model.DonationCategory> = emptyList(),
    val loading: Boolean = true,
    val search: String = "",
    val filter: String = "All",
    val canWrite: Boolean = false,
    val editorOpen: Boolean = false,
    val locked: Boolean = false,
    val draft: DonationDraft = DonationDraft(),
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class DonationsViewModel @Inject constructor(
    private val donations: DonationRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(DonationsUiState())
    val state: StateFlow<DonationsUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(
                    canWrite = role != null && RoleAccess.canWrite(role, RoleAccess.Module.Donations),
                    categories = runCatching { donations.categories() }.getOrDefault(emptyList()),
                )
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

    fun onFilter(value: String?) {
        _state.update { it.copy(filter = value ?: "All") }
        load()
    }

    fun refresh() = load()

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                val page = donations.page(
                    search = snapshot.search,
                    category = snapshot.filter.takeIf { it != "All" },
                    page = 1,
                    pageSize = 50,
                )
                Triple(page, donations.totalInMonth(IstDate.month()), 0)
            }.onSuccess { (page, monthTotal, _) ->
                _state.update {
                    it.copy(
                        rows = page.rows,
                        total = page.total,
                        monthTotal = monthTotal,
                        loading = false,
                    )
                }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }

    fun openCreate() = _state.update {
        it.copy(
            editorOpen = true,
            locked = false,
            error = null,
            draft = DonationDraft(
                category = it.categories.firstOrNull()?.name ?: "General",
            ),
        )
    }

    fun openEdit(row: DonationWithCategory) {
        val d = row.donation
        _state.update {
            it.copy(
                editorOpen = true,
                locked = d.receiptGeneratedAt != null,
                error = null,
                draft = DonationDraft(
                    id = d.id,
                    receiptNumber = d.receiptNumber,
                    donorName = d.donorName,
                    donorPhone = d.donorPhone.orEmpty(),
                    amount = d.amount.toString(),
                    date = d.donationDate.orEmpty(),
                    category = row.categoryName ?: "General",
                    method = d.paymentMethod ?: "Cash",
                    purpose = d.purpose.orEmpty(),
                ),
            )
        }
    }

    fun closeEditor() = _state.update { it.copy(editorOpen = false, error = null) }

    fun onDraft(transform: DonationDraft.() -> DonationDraft) {
        _state.update { it.copy(draft = transform(it.draft), error = null) }
    }

    fun save() {
        val draft = _state.value.draft
        val amount = draft.amount.toDoubleOrNull() ?: 0.0
        if (amount <= 0.0) {
            _state.update { it.copy(error = "Enter an amount") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val categories = _state.value.categories
            val categoryId = categories.firstOrNull { it.name == draft.category }?.id
                ?: categories.firstOrNull()?.id
                ?: 0L
            val input = DonationInput(
                donorName = draft.donorName.trim(),
                donorPhone = draft.donorPhone.trim(),
                categoryId = categoryId,
                amount = amount,
                donationDate = draft.date,
                purpose = draft.purpose,
                paymentMethod = app.minzmahallu.core.common.wireTo(
                    draft.method,
                    app.minzmahallu.core.common.PaymentMethod.Cash,
                ),
            )
            runCatching {
                if (draft.id == null) {
                    donations.create(input)
                } else {
                    // An edit needs the reason for the audit trail.
                    donations.update(draft.id, input, adminPassword = "", reason = "corrected in the app")
                }
            }.onSuccess {
                _state.update { current -> current.copy(busy = false, editorOpen = false) }
                load()
            }.onFailure { error ->
                _state.update { current -> current.copy(busy = false, error = error.message.orEmpty()) }
            }
        }
    }
}
