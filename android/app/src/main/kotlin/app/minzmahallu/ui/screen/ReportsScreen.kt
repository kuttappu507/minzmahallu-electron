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
import app.minzmahallu.core.common.IndianGrouping
import app.minzmahallu.core.domain.dashboard.DashboardRepository
import app.minzmahallu.core.domain.finance.AccountingRepository
import app.minzmahallu.core.domain.finance.UnifiedSummary
import app.minzmahallu.core.domain.subscription.SubscriptionRepository
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.MahalluButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.FilterChip
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.chart.BarChart
import app.minzmahallu.core.ui.component.chart.ChartPoint
import app.minzmahallu.core.ui.component.chart.LineChart
import app.minzmahallu.core.ui.foundation.Amount
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
 * Reports — `src/pages/Reports.tsx`.
 *
 * The desktop builds .xlsx workbooks with exceljs; here the same figures are
 * rendered on screen and exported through the shared document writer. The
 * period presets are the desktop's, so a report means the same thing on both.
 */
@Composable
fun ReportsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: ReportsViewModel = hiltViewModel(),
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
                    title = "Reports",
                    eyebrow = "office",
                    subtitle = state.preset.replace('_', ' '),
                    back = onOpenDrawer,
                )
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReportsScreenPresets.forEach { preset ->
                        FilterChip(
                            text = preset.replace('_', ' '),
                            selected = state.preset == preset,
                            onClick = { viewModel.setPreset(preset) },
                        )
                    }
                }
            }
        }

        item {
            Card(title = "Summary", eyebrow = "unified ledger") {
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Eyebrow("income")
                        Amount(value = state.summary.income, style = MahalluTheme.type.amountSmall, color = colors.accent)
                    }
                    Column(Modifier.weight(1f)) {
                        Eyebrow("expense")
                        Amount(value = state.summary.expense, style = MahalluTheme.type.amountSmall, color = colors.danger)
                    }
                }
                Spacer(Modifier.height(14.dp))
                DetailRow("Balance", "₹${IndianGrouping.formatAmount(state.summary.balance)}")
                DetailRow(
                    "Subscriptions outstanding",
                    "₹${IndianGrouping.formatAmount(state.outstanding)}",
                )
                DetailRow("Subscriptions collected", "₹${IndianGrouping.formatAmount(state.collected)}")
                Spacer(Modifier.height(16.dp))
                MahalluButton(
                    onClick = viewModel::export,
                    variant = ButtonVariant.Secondary,
                    text = if (state.exporting) "Preparing…" else "Export workbook",
                    enabled = !state.exporting,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.exportNote != null) {
                    Spacer(Modifier.height(10.dp))
                    AppText(
                        text = state.exportNote.orEmpty(),
                        style = MahalluTheme.type.caption,
                        color = colors.textSecondary,
                    )
                }
            }
        }

        if (state.collections.isNotEmpty()) {
            item {
                Card(title = "Collections by month", eyebrow = "subscriptions") {
                    BarChart(points = state.collections, height = 190.dp)
                }
            }
        }

        if (state.donations.isNotEmpty()) {
            item {
                Card(title = "Donations by month") {
                    BarChart(
                        points = state.donations,
                        height = 190.dp,
                        barColor = colors.gold,
                    )
                }
            }
        }

        if (state.incomeExpense.isNotEmpty()) {
            item {
                Card(title = "Income vs expense", eyebrow = "trailing months") {
                    LineChart(
                        points = state.incomeExpense.map {
                            ChartPoint(IstDate.monthShort(it.month), it.income)
                        },
                        secondaryLine = state.incomeExpense.map { it.expense },
                        height = 190.dp,
                    )
                }
            }
        }
    }
}

/** The desktop's period presets, minus the custom range (a date picker job). */
private val ReportsScreenPresets = listOf(
    "all", "this_month", "last_month", "this_quarter", "this_year", "last_year",
)

data class ReportsUiState(
    val preset: String = "this_year",
    val summary: UnifiedSummary = UnifiedSummary(0.0, 0.0, 0.0, 0.0, 0.0),
    val outstanding: Double = 0.0,
    val collected: Double = 0.0,
    val collections: List<ChartPoint> = emptyList(),
    val donations: List<ChartPoint> = emptyList(),
    val incomeExpense: List<app.minzmahallu.core.domain.dashboard.IncomeExpensePoint> = emptyList(),
    val exporting: Boolean = false,
    val exportNote: String? = null,
)

@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val accounting: AccountingRepository,
    private val dashboard: DashboardRepository,
    private val subscriptions: SubscriptionRepository,
    sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(ReportsUiState())
    val state: StateFlow<ReportsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun setPreset(preset: String) {
        _state.update { it.copy(preset = preset, exportNote = null) }
        load()
    }

    private fun load() {
        val preset = _state.value.preset
        viewModelScope.launch {
            val summary = runCatching { accounting.unifiedSummary(preset) }
                .getOrDefault(UnifiedSummary(0.0, 0.0, 0.0, 0.0, 0.0))
            val collections = runCatching { dashboard.monthlyCollections(12) }.getOrDefault(emptyList())
            val donations = runCatching { dashboard.monthlyDonations(12) }.getOrDefault(emptyList())
            val incomeExpense = runCatching { dashboard.incomeVsExpense(12) }.getOrDefault(emptyList())
            _state.update {
                it.copy(
                    summary = summary,
                    outstanding = runCatching { subscriptions.totalPending() }.getOrDefault(0.0),
                    collected = runCatching { subscriptions.totalCollected() }.getOrDefault(0.0),
                    collections = collections.map { point ->
                        ChartPoint(IstDate.monthShort(point.month), point.amount)
                    },
                    donations = donations.map { point ->
                        ChartPoint(IstDate.monthShort(point.month), point.amount)
                    },
                    incomeExpense = incomeExpense,
                )
            }
        }
    }

    /**
     * Writes the workbook and hands it to the share sheet.
     *
     * The .xlsx is built directly as a zip of SpreadsheetML parts rather than
     * through Apache POI, whose desktop footprint does not belong on a phone —
     * see `app/minzmahallu/export/XlsxWriter.kt`.
     */
    fun export() {
        _state.update { it.copy(exporting = true, exportNote = null) }
        viewModelScope.launch {
            val result = runCatching {
                app.minzmahallu.export.XlsxWriter.write(
                    fileName = "minzmahallu-${_state.value.preset}-${IstDate.today()}.xlsx",
                    sheets = listOf(
                        app.minzmahallu.export.Sheet(
                            name = "Summary",
                            headers = listOf("Item", "Amount"),
                            rows = listOf(
                                listOf("Income", _state.value.summary.income.toString()),
                                listOf("Expense", _state.value.summary.expense.toString()),
                                listOf("Balance", _state.value.summary.balance.toString()),
                                listOf("Subscriptions outstanding", _state.value.outstanding.toString()),
                                listOf("Subscriptions collected", _state.value.collected.toString()),
                            ),
                        ),
                        app.minzmahallu.export.Sheet(
                            name = "Collections",
                            headers = listOf("Month", "Amount"),
                            rows = _state.value.collections.map { listOf(it.label, it.value.toString()) },
                        ),
                        app.minzmahallu.export.Sheet(
                            name = "Donations",
                            headers = listOf("Month", "Amount"),
                            rows = _state.value.donations.map { listOf(it.label, it.value.toString()) },
                        ),
                    ),
                )
            }
            result.onSuccess { file ->
                _state.update {
                    it.copy(exporting = false, exportNote = "ready to share: ${file.name}")
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(exporting = false, exportNote = error.message ?: "export failed")
                }
            }
        }
    }
}
