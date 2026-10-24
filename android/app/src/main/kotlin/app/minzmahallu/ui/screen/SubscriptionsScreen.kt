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
import app.minzmahallu.core.common.SubscriptionFrequency
import app.minzmahallu.core.domain.subscription.PaymentReceipt
import app.minzmahallu.core.domain.subscription.SubscriptionRepository
import app.minzmahallu.core.model.SubscriptionWithFamily
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.ui.common.SectionTitle
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.component.chart.StackedBar
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint
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
 * Subscriptions — a port of `src/pages/Subscriptions.tsx`, the largest page in
 * the desktop app.
 *
 * The three operations that matter are all here: roll the register forward to
 * the current period, take a payment against a family, and see exactly how a
 * payment was allocated between arrears, the current month and advance.
 */
@Composable
fun SubscriptionsScreen(
    onOpenDrawer: () -> Unit,
    onOpenFamily: (Long) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: SubscriptionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        ModuleListScreen(
            title = "Subscriptions",
            subtitle = "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(state.totalPending)} outstanding",
            eyebrow = "money",
            items = state.rows,
            loading = state.loading,
            search = state.search,
            onSearchChange = viewModel::onSearch,
            onOpenDrawer = onOpenDrawer,
            filters = listOf("All", "Pending", "Paid", "Partial", "Overdue"),
            activeFilter = state.filter,
            onFilterChange = viewModel::onFilter,
            onRefresh = viewModel::refresh,
            trailing = {
                app.minzmahallu.core.ui.component.MahalluButton(
                    onClick = viewModel::rollForward,
                    variant = app.minzmahallu.core.ui.component.ButtonVariant.Secondary,
                    size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                    text = "Roll",
                    loading = state.rolling,
                )
            },
            emptyTitle = "No subscriptions yet",
            emptyBody = "Create a subscription for a family, then roll the register forward each period.",
        ) { row, _ ->
            val s = row.subscription
            RecordRow(
                title = row.houseName.orEmpty().ifBlank { row.familyNumber.orEmpty() },
                code = row.familyNumber,
                subtitle = listOfNotNull(
                    "${IstDate.monthLabel(s.periodStart)}",
                    if (s.arrears > 0.004) "arrears ${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.arrears)}" else null,
                    if (s.advance > 0.004) "advance ${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.advance)}" else null,
                ).joinToString(" · "),
                status = s.status,
                amount = s.amount - s.amountPaid,
                amountLabel = "due",
                amountColor = if (s.status == "Paid") colors.accent else colors.gold,
                onClick = { viewModel.openPayment(row) },
            )
        }
    }

    state.paymentTarget?.let { target ->
        PaymentSheet(state = state, target = target, viewModel = viewModel)
    }

    state.receipt?.let { receipt ->
        ReceiptSheet(receipt = receipt, onClose = viewModel::closeReceipt)
    }
}

@Composable
private fun PaymentSheet(
    state: SubscriptionsUiState,
    target: SubscriptionWithFamily,
    viewModel: SubscriptionsViewModel,
) {
    val colors = MahalluTheme.colors
    val s = target.subscription
    val due = (s.arrears + (s.amount - s.amountPaid)).coerceAtLeast(0.0) - s.advance

    BottomSheet(
        onDismiss = viewModel::closePayment,
        eyebrow = "collect payment",
        title = target.houseName.orEmpty().ifBlank { target.familyNumber.orEmpty() },
        subtitle = target.familyNumber,
        footer = {
            SheetFooter(
                primaryLabel = "Record payment",
                onPrimary = viewModel::submitPayment,
                onSecondary = viewModel::closePayment,
                primaryEnabled = (state.payAmount.toDoubleOrNull() ?: 0.0) > 0.0,
                busy = state.busy,
            )
        },
    ) {
        Card(title = "Position") {
            DetailRow("Current period", IstDate.monthLabel(s.periodStart))
            DetailRow("Monthly rate", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.amount)}")
            DetailRow("Paid so far", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.amountPaid)}")
            DetailRow("Arrears", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.arrears)}")
            DetailRow("Advance", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(s.advance)}")
            if (s.advanceCovered == 1) {
                DetailRow("Advance covered", "this period is already paid from advance")
            }
            Spacer(Modifier.height(12.dp))
            StackedBar(
                segments = listOf(
                    s.amountPaid to colors.accent,
                    (s.amount - s.amountPaid).coerceAtLeast(0.0) to colors.gold,
                ),
            )
        }
        Spacer(Modifier.height(18.dp))

        AmountField(
            value = state.payAmount,
            onValueChange = viewModel::onPayAmount,
            label = "Amount received",
            supporting = "outstanding ₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(due.coerceAtLeast(0.0))}",
            error = state.error,
        )
        Spacer(Modifier.height(14.dp))
        EnumField(
            label = "Payment method",
            value = state.payMethod,
            options = listOf("Cash", "UPI", "Bank", "Cheque"),
            onSelect = viewModel::onPayMethod,
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.payRef,
            onValueChange = viewModel::onPayRef,
            label = "Transaction reference",
            supporting = "UPI id, cheque number — optional",
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.payRemarks,
            onValueChange = viewModel::onPayRemarks,
            label = "Remarks",
            singleLine = false,
            minLines = 2,
        )
    }
}

@Composable
private fun ReceiptSheet(receipt: PaymentReceipt, onClose: () -> Unit) {
    val colors = MahalluTheme.colors
    BottomSheet(
        onDismiss = onClose,
        eyebrow = "receipt",
        title = receipt.receiptNumber,
        subtitle = receipt.status.wire,
        footer = {
            SheetFooter(
                primaryLabel = "Done",
                onPrimary = onClose,
                onSecondary = null,
            )
        },
    ) {
        Column {
            Eyebrow("allocation")
            Spacer(Modifier.height(10.dp))
            DetailRow("Amount paid", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(receipt.amountPaid)}")
            DetailRow("To current period", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(receipt.monthPaid)}")
            DetailRow("Arrears cleared", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(receipt.arrears)}")
            DetailRow("Advance balance", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(receipt.advance)}")
            DetailRow("Still due", "₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(receipt.dueTotal)}")
            Spacer(Modifier.height(12.dp))
            AppText(
                text = "Once a receipt has been generated for a payment, that row is frozen — " +
                    "correcting it needs a new entry, not an edit.",
                style = MahalluTheme.type.caption,
                color = colors.textFaint,
            )
        }
    }
}

data class SubscriptionsUiState(
    val rows: List<SubscriptionWithFamily> = emptyList(),
    val total: Int = 0,
    val totalPending: Double = 0.0,
    val loading: Boolean = true,
    val rolling: Boolean = false,
    val search: String = "",
    val filter: String = "All",
    val paymentTarget: SubscriptionWithFamily? = null,
    val payAmount: String = "",
    val payMethod: String = "Cash",
    val payRef: String = "",
    val payRemarks: String = "",
    val receipt: PaymentReceipt? = null,
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class SubscriptionsViewModel @Inject constructor(
    private val subscriptions: SubscriptionRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(SubscriptionsUiState())
    val state: StateFlow<SubscriptionsUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init {
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
                val page = subscriptions.page(
                    search = snapshot.search,
                    status = snapshot.filter.takeIf { it != "All" },
                    page = 1,
                    pageSize = 50,
                )
                page to subscriptions.totalPending()
            }.onSuccess { (page, pending) ->
                _state.update {
                    it.copy(
                        rows = page.rows,
                        total = page.total,
                        totalPending = pending,
                        loading = false,
                    )
                }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }

    /** Bring every family's row up to the current period. */
    fun rollForward() {
        _state.update { it.copy(rolling = true) }
        viewModelScope.launch {
            runCatching { subscriptions.ensureCurrentPeriod() }
                .onSuccess { _state.update { current -> current.copy(rolling = false) }; load() }
                .onFailure { _state.update { current -> current.copy(rolling = false) } }
        }
    }

    fun openPayment(row: SubscriptionWithFamily) {
        val due = (row.subscription.arrears + row.subscription.amount - row.subscription.amountPaid)
            .coerceAtLeast(0.0)
        _state.update {
            it.copy(
                paymentTarget = row,
                payAmount = if (due > 0) due.toString() else "",
                payMethod = "Cash",
                payRef = "",
                payRemarks = "",
                error = null,
            )
        }
    }

    fun closePayment() = _state.update { it.copy(paymentTarget = null, error = null) }

    fun onPayAmount(value: String) = _state.update {
        it.copy(payAmount = app.minzmahallu.core.ui.component.sanitizeAmount(value), error = null)
    }

    fun onPayMethod(value: String) = _state.update { it.copy(payMethod = value) }

    fun onPayRef(value: String) = _state.update { it.copy(payRef = value) }

    fun onPayRemarks(value: String) = _state.update { it.copy(payRemarks = value) }

    fun submitPayment() {
        val snapshot = _state.value
        val target = snapshot.paymentTarget ?: return
        val amount = snapshot.payAmount.toDoubleOrNull() ?: 0.0
        if (amount <= 0.0) {
            _state.update { it.copy(error = "Enter an amount") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching {
                subscriptions.applyPayment(
                    id = target.subscription.id,
                    amountPaid = amount,
                    paymentMethod = app.minzmahallu.core.common.wireTo(
                        snapshot.payMethod,
                        app.minzmahallu.core.common.PaymentMethod.Cash,
                    ),
                    transactionRef = snapshot.payRef,
                    remarks = snapshot.payRemarks,
                )
            }.onSuccess { receipt ->
                _state.update {
                    it.copy(busy = false, paymentTarget = null, receipt = receipt)
                }
                load()
            }.onFailure { error ->
                _state.update { current -> current.copy(busy = false, error = error.message.orEmpty()) }
            }
        }
    }

    fun closeReceipt() = _state.update { it.copy(receipt = null) }
}
