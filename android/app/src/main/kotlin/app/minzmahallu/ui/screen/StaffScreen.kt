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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.PaymentFrequency
import app.minzmahallu.core.common.PaymentMethod
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.people.SalaryInput
import app.minzmahallu.core.domain.people.StaffInput
import app.minzmahallu.core.domain.people.StaffRepository
import app.minzmahallu.core.model.StaffEntity
import app.minzmahallu.core.model.StaffPaymentWithStaff
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.ui.common.SectionTitle
import app.minzmahallu.core.ui.component.SheetFooter
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
 * Staff — `src/pages/Staff.tsx`.
 *
 * Two tabs on the desktop, two sheets here: the staff register, and the salary
 * ledger. Paying a salary writes an expense to the unified ledger, and paying
 * the same person twice for one month is refused by the repository rather than
 * silently double-booked.
 */
@Composable
fun StaffScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: StaffViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()
    val payroll by viewModel.payroll.collectAsStateWithLifecycle()
    val salaries by viewModel.salaries.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Staff",
        subtitle = "${state.total} on the payroll",
        eyebrow = "people",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Active", "On leave", "Resigned", "Archived"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "New staff",
        trailing = {
            app.minzmahallu.core.ui.component.MahalluButton(
                onClick = viewModel::openPayroll,
                variant = app.minzmahallu.core.ui.component.ButtonVariant.Secondary,
                size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                text = "Salaries",
            )
        },
        onRefresh = viewModel::refresh,
        emptyTitle = "No staff",
        emptyBody = "Add the Imam, Muazzin and other paid employees.",
    ) { row, _ ->
        RecordRow(
            title = row.name,
            code = row.staffCode,
            subtitle = listOfNotNull(
                row.role,
                app.minzmahallu.core.common.Phone.pretty10(row.phone),
            ).joinToString(" · ").ifBlank { null },
            status = if (row.archiveState != 0) "Archived" else row.status,
            amount = row.salary,
            amountLabel = row.paymentFrequency.lowercase(),
            dimmed = row.status != "Active",
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new record" else "edit record",
            title = if (d.id == null) "Add staff" else d.name,
            footer = {
                SheetFooter(
                    primaryLabel = if (d.id == null) "Create" else "Save",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = d.name.isNotBlank(),
                    busy = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = d.name,
                onValueChange = { viewModel.edit { copy(name = it) } },
                label = "Name",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                EnumField(
                    label = "Role",
                    value = d.role,
                    options = viewModel.roles.value,
                    onSelect = { viewModel.edit { copy(role = it) } },
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.idNumber,
                    onValueChange = { viewModel.edit { copy(idNumber = it) } },
                    label = "ID number",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            PhoneField(
                value = d.phone,
                onValueChange = { viewModel.edit { copy(phone = it) } },
                label = "Phone",
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AmountField(
                    value = d.salary,
                    onValueChange = { viewModel.edit { copy(salary = it) } },
                    label = "Salary",
                    modifier = Modifier.weight(1f),
                )
                EnumField(
                    label = "Frequency",
                    value = d.frequency,
                    options = PaymentFrequency.entries.map { it.wire },
                    onSelect = { viewModel.edit { copy(frequency = it) } },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.joinedDate,
                onValueChange = { viewModel.edit { copy(joinedDate = it) } },
                label = "Joined",
                supporting = "yyyy-mm-dd",
            )
        }
    }

    if (payroll.open) {
        BottomSheet(
            onDismiss = viewModel::closePayroll,
            eyebrow = "salary ledger",
            title = "Pay a salary",
            subtitle = "booked as an expense in the unified ledger",
            footer = {
                SheetFooter(
                    primaryLabel = "Record payment",
                    onPrimary = viewModel::paySalary,
                    onSecondary = viewModel::closePayroll,
                    primaryEnabled = payroll.staffId != null &&
                        (payroll.amount.toDoubleOrNull() ?: 0.0) > 0.0,
                    busy = state.busy,
                )
            },
        ) {
            EnumField(
                label = "Staff",
                value = payroll.staffName,
                options = state.rows.map { it.name },
                onSelect = { name -> viewModel.selectStaff(state.rows.firstOrNull { it.name == name }) },
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = payroll.month.toString(),
                    onValueChange = { viewModel.onPayroll { copy(month = it.toIntOrNull() ?: 1) } },
                    label = "Month",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = payroll.year.toString(),
                    onValueChange = { viewModel.onPayroll { copy(year = it.toIntOrNull() ?: IstDate.now().year) } },
                    label = "Year",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            AmountField(
                value = payroll.amount,
                onValueChange = { viewModel.onPayroll { copy(amount = it) } },
                label = "Amount paid",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            EnumField(
                label = "Method",
                value = payroll.method,
                options = listOf("Cash", "UPI", "Bank", "Cheque"),
                onSelect = { viewModel.onPayroll { copy(method = it) } },
            )
            if (salaries.isNotEmpty()) {
                SectionTitle("recent payments")
                salaries.take(8).forEach { payment ->
                    DetailRow(
                        label = "${payment.payment.periodMonth}/${payment.payment.periodYear}",
                        value = "${payment.staffName.orEmpty()} · ₹" +
                            app.minzmahallu.core.common.IndianGrouping.formatAmount(payment.payment.amount),
                    )
                }
            }
        }
    }
}

data class StaffDraft(
    val id: Long? = null,
    val name: String = "",
    val role: String = "Staff",
    val idNumber: String = "",
    val phone: String = "",
    val salary: String = "",
    val frequency: String = PaymentFrequency.Monthly.wire,
    val joinedDate: String = IstDate.today(),
)

data class PayrollPrompt(
    val open: Boolean = false,
    val staffId: Long? = null,
    val staffName: String = "",
    val month: Int = IstDate.now().monthValue,
    val year: Int = IstDate.now().year,
    val amount: String = "",
    val method: String = "Cash",
)

@HiltViewModel
class StaffViewModel @Inject constructor(
    private val staff: StaffRepository,
    sessions: SessionController,
) : RegisterListViewModel<StaffEntity>(
    sessions = sessions,
    module = RoleAccess.Module.Staff,
    filters = listOf("All", "Active", "On leave", "Resigned", "Archived"),
) {

    data class Editor(val open: Boolean = false, val draft: StaffDraft = StaffDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    private val _payroll = MutableStateFlow(PayrollPrompt())
    val payroll: StateFlow<PayrollPrompt> = _payroll.asStateFlow()

    private val _salaries = MutableStateFlow<List<StaffPaymentWithStaff>>(emptyList())
    val salaries: StateFlow<List<StaffPaymentWithStaff>> = _salaries.asStateFlow()

    val roles = MutableStateFlow(listOf("Imam", "Muazzin", "Teacher", "Cleaner", "Staff"))

    init {
        viewModelScope.launch {
            roles.value = runCatching { staff.roles() }.getOrDefault(roles.value)
        }
    }

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<StaffEntity> = staff.page(
        search = search,
        status = filter?.takeIf { it != "Archived" },
        showArchived = filter == "Archived",
        page = page,
        pageSize = pageSize,
    )

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: StaffEntity) {
        _editor.value = Editor(
            open = true,
            draft = StaffDraft(
                id = row.id,
                name = row.name,
                role = row.role,
                idNumber = row.idNumber.orEmpty(),
                phone = row.phone.orEmpty(),
                salary = row.salary.toString(),
                frequency = row.paymentFrequency,
                joinedDate = row.joinedDate.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    fun edit(transform: StaffDraft.() -> StaffDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun openPayroll() {
        _payroll.value = PayrollPrompt(open = true)
        viewModelScope.launch {
            _salaries.value = runCatching {
                staff.paymentPage(staffId = null, year = null, status = null, page = 1, pageSize = 20).rows
            }.getOrDefault(emptyList())
        }
    }

    fun closePayroll() {
        _payroll.value = PayrollPrompt()
        patch { copy(error = null) }
    }

    fun selectStaff(row: StaffEntity?) {
        if (row == null) return
        _payroll.update {
            it.copy(
                staffId = row.id,
                staffName = row.name,
                amount = if (it.amount.isBlank()) row.salary.toString() else it.amount,
            )
        }
    }

    fun onPayroll(transform: PayrollPrompt.() -> PayrollPrompt) {
        _payroll.update(transform)
    }

    fun save() {
        val d = _editor.value.draft
        if (d.name.isBlank()) return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = StaffInput(
                name = d.name.trim(),
                role = d.role,
                idNumber = d.idNumber.ifBlank { null },
                phone = d.phone,
                joinedDate = d.joinedDate.ifBlank { null },
                salary = d.salary.toDoubleOrNull() ?: 0.0,
                paymentFrequency = wireTo(d.frequency, PaymentFrequency.Monthly),
            )
            runCatching {
                if (d.id == null) staff.create(input) else staff.update(d.id, input)
            }.onSuccess {
                patch { copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure { error ->
                patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
            }
        }
    }

    fun paySalary() {
        val p = _payroll.value
        val staffId = p.staffId ?: return
        val amount = p.amount.toDoubleOrNull() ?: 0.0
        if (amount <= 0.0) {
            patch { copy(error = "Enter an amount") }
            return
        }
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching {
                staff.paySalary(
                    SalaryInput(
                        staffId = staffId,
                        periodMonth = p.month,
                        periodYear = p.year,
                        amount = amount,
                        paymentMethod = wireTo(p.method, PaymentMethod.Cash),
                    ),
                )
            }.onSuccess {
                patch { copy(busy = false) }
                openPayroll()
            }.onFailure { error ->
                // A duplicate month is the common failure; surface it verbatim.
                patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
            }
        }
    }
}
