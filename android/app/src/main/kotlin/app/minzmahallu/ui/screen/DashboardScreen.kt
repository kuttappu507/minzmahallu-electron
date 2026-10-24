package app.minzmahallu.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.IndianGrouping
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.HeroPanel
import app.minzmahallu.core.ui.component.IconPlate
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.ModuleTile
import app.minzmahallu.core.ui.component.RecordRow
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.Surface
import app.minzmahallu.core.ui.component.chart.ChartPoint
import app.minzmahallu.core.ui.component.chart.DonutChart
import app.minzmahallu.core.ui.component.chart.DonutLegend
import app.minzmahallu.core.ui.component.chart.DonutSlice
import app.minzmahallu.core.ui.component.chart.LineChart
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CountedInt
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.foundation.Hairline
import app.minzmahallu.core.ui.foundation.VerticalHairline
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.tint
import app.minzmahallu.ui.shell.Navigation

/**
 * The dashboard — a port of `src/pages/Dashboard.tsx`.
 *
 * Same content in the same order: greeting, the balance hero, the four
 * headline counters, today at a glance, the trailing-month collection trend,
 * the income-versus-expense split, the alert strip, recent activity, and the
 * module grid. Every figure comes from the unified ledger exactly as the
 * desktop's does, so the two builds cannot disagree about the balance.
 */
@Composable
fun DashboardScreen(
    onOpenDrawer: () -> Unit,
    onNavigate: (String) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    if (state.loading) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(Gutters.screen),
        ) {
            ListSkeleton(rows = 5)
        }
        return
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = Gutters.screen,
            end = Gutters.screen,
            top = 12.dp,
            bottom = 110.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding()) {
                ScreenHeader(
                    title = state.greeting,
                    eyebrow = state.mahalluName,
                    subtitle = IstDate.todayDisplay(),
                    back = onOpenDrawer,
                )
            }
        }

        item {
            HeroPanel {
                Eyebrow("fund balance")
                Spacer(Modifier.height(6.dp))
                Amount(
                    value = state.balance,
                    style = MahalluTheme.type.display,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth()) {
                    BalanceCell(
                        label = "collected this month",
                        value = state.summary.monthlyCollection,
                        color = colors.accent,
                        modifier = Modifier.weight(1f),
                    )
                    VerticalHairline()
                    BalanceCell(
                        label = "pending dues",
                        value = state.summary.pendingDues,
                        color = colors.gold,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(
                    label = "families",
                    count = state.summary.totalFamilies,
                    tint = ModuleTint.Teal,
                    modifier = Modifier.weight(1f),
                    onClick = { onNavigate(Route.Families.path) },
                )
                StatCard(
                    label = "members",
                    count = state.summary.totalMembers,
                    tint = ModuleTint.Cyan,
                    modifier = Modifier.weight(1f),
                    onClick = { onNavigate(Route.Members.path) },
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(
                    label = "donations this month",
                    amount = state.summary.monthlyDonations,
                    tint = ModuleTint.Gold,
                    modifier = Modifier.weight(1f),
                    onClick = { onNavigate(Route.Donations.path) },
                )
                StatCard(
                    label = "welfare beneficiaries",
                    count = state.summary.welfareBeneficiaries,
                    tint = ModuleTint.Rose,
                    modifier = Modifier.weight(1f),
                    onClick = { onNavigate(Route.Welfare.path) },
                )
            }
        }

        item {
            Card(title = "Today at a glance") {
                GlanceRow("receipts issued", count = state.glance.receiptsToday, amount = null)
                Hairline(Modifier.padding(vertical = 10.dp))
                GlanceRow("donations", count = null, amount = state.glance.donationsToday)
                Hairline(Modifier.padding(vertical = 10.dp))
                GlanceRow("welfare pending", count = state.glance.welfarePending, amount = null)
                Hairline(Modifier.padding(vertical = 10.dp))
                GlanceRow("fund balance", count = null, amount = state.glance.fundBalance)
            }
        }

        if (state.collections.isNotEmpty()) {
            item {
                Card(title = "Collections", eyebrow = "last ${state.collections.size} months") {
                    LineChart(
                        points = state.collections.map {
                            ChartPoint(
                                label = IstDate.monthShort(it.month, state.malayalam),
                                value = it.amount,
                            )
                        },
                        height = 180.dp,
                    )
                }
            }
        }

        if (state.incomeExpense.isNotEmpty()) {
            item {
                Card(title = "Income vs expense", eyebrow = "unified ledger") {
                    val income = state.incomeExpense.sumOf { it.income }
                    val expense = state.incomeExpense.sumOf { it.expense }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DonutChart(
                            slices = listOf(
                                DonutSlice("Income", income, colors.accent),
                                DonutSlice("Expense", expense, colors.danger),
                            ),
                            centreLabel = "net",
                            centreValue = "₹" + IndianGrouping.formatAmount(income - expense),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(18.dp))
                        Column(Modifier.weight(1.1f)) {
                            DonutLegend(
                                slices = listOf(
                                    DonutSlice("Income", income, colors.accent),
                                    DonutSlice("Expense", expense, colors.danger),
                                ),
                            )
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                    Eyebrow("by month")
                    Spacer(Modifier.height(10.dp))
                    LineChart(
                        points = state.incomeExpense.map {
                            ChartPoint(IstDate.monthShort(it.month, state.malayalam), it.income)
                        },
                        secondaryLine = state.incomeExpense.map { it.expense },
                        height = 170.dp,
                    )
                }
            }
        }

        if (state.alerts.isNotEmpty()) {
            item {
                Card(title = "Needs attention") {
                    state.alerts.forEachIndexed { index, alert ->
                        if (index > 0) Spacer(Modifier.height(10.dp))
                        RecordRow(
                            title = alertTitle(alert.type),
                            subtitle = alertSubtitle(alert.type, alert.count),
                            status = "pending",
                            onClick = { onNavigate(routeFor(alert.destination)) },
                        )
                    }
                }
            }
        }

        if (state.recent.isNotEmpty()) {
            item {
                Card(
                    title = "Recent activity",
                    trailing = {
                        AppText(
                            text = "full log",
                            style = MahalluTheme.type.label,
                            color = colors.accent,
                        )
                    },
                ) {
                    state.recent.forEachIndexed { index, entry ->
                        if (index > 0) Hairline(Modifier.padding(vertical = 9.dp))
                        Row(Modifier.fillMaxWidth()) {
                            Column(Modifier.weight(1f)) {
                                AppText(
                                    text = entry.description ?: entry.action,
                                    style = MahalluTheme.type.body,
                                    color = colors.textPrimary,
                                    maxLines = 2,
                                )
                                AppText(
                                    text = listOfNotNull(entry.username, entry.module)
                                        .joinToString(" · "),
                                    style = MahalluTheme.type.micro,
                                    color = colors.textFaint,
                                    maxLines = 1,
                                )
                            }
                            Spacer(Modifier.width(10.dp))
                            AppText(
                                text = IstDate.fmtDateTime(entry.createdAt),
                                style = MahalluTheme.type.micro,
                                color = colors.textFaint,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }

        item { Eyebrow("modules") }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Navigation.home.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { item ->
                            ModuleTile(
                                item = item,
                                onClick = { onNavigate(item.route) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun GlanceRow(label: String, count: Int?, amount: Double?) {
    val colors = MahalluTheme.colors
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AppText(
            text = label,
            style = MahalluTheme.type.body,
            color = colors.textSecondary,
            modifier = Modifier.weight(1f),
        )
        if (amount != null) {
            Amount(value = amount, style = MahalluTheme.type.amountSmall)
        } else {
            CountedInt(value = count ?: 0, style = MahalluTheme.type.amountSmall)
        }
    }
}

@Composable
private fun BalanceCell(
    label: String,
    value: Double,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(start = 16.dp)) {
        Eyebrow(label)
        Spacer(Modifier.height(4.dp))
        Amount(value = value, style = MahalluTheme.type.subtitle, color = color)
    }
}

@Composable
private fun StatCard(
    label: String,
    tint: ModuleTint,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
    amount: Double? = null,
) {
    val colors = MahalluTheme.colors
    Surface(
        modifier = modifier,
        onClick = onClick,
        contentPadding = PaddingValues(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconPlate(tint = tint, size = 36.dp) {
                Box(
                    Modifier
                        .width(10.dp)
                        .height(10.dp)
                        .background(colors.tint(tint), CircleShape),
                )
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Eyebrow(label)
                if (count != null) {
                    CountedInt(value = count, style = MahalluTheme.type.subtitle)
                } else if (amount != null) {
                    Amount(value = amount, style = MahalluTheme.type.subtitle)
                }
            }
        }
    }
}

/** Alert copy — the desktop builds these strings in the dashboard service. */
private fun alertTitle(type: String): String = when (type) {
    "committee_ending" -> "Committee terms ending"
    "subscriptions_overdue" -> "Overdue subscriptions"
    "welfare_pending" -> "Welfare requests pending"
    "receipt_gaps" -> "Gaps in the receipt sequence"
    else -> type
}

private fun alertSubtitle(type: String, count: Int): String = when (type) {
    "committee_ending" -> "$count term(s) end within 30 days"
    "subscriptions_overdue" -> "$count family(ies) have not paid"
    "welfare_pending" -> "$count request(s) awaiting a decision"
    "receipt_gaps" -> "$count number(s) missing — check for manual edits"
    else -> "$count item(s)"
}

private fun routeFor(destination: app.minzmahallu.core.domain.dashboard.Destination): String =
    when (destination) {
        app.minzmahallu.core.domain.dashboard.Destination.Subscriptions -> Route.Subscriptions.path
        app.minzmahallu.core.domain.dashboard.Destination.Donations -> Route.Donations.path
        app.minzmahallu.core.domain.dashboard.Destination.Welfare -> Route.Welfare.path
        app.minzmahallu.core.domain.dashboard.Destination.Accounting -> Route.Accounting.path
        app.minzmahallu.core.domain.dashboard.Destination.Committee -> Route.Committee.path
        app.minzmahallu.core.domain.dashboard.Destination.Assets -> Route.Assets.path
        app.minzmahallu.core.domain.dashboard.Destination.Approvals -> Route.Approvals.path
        app.minzmahallu.core.domain.dashboard.Destination.Dashboard -> Route.Dashboard.path
    }
