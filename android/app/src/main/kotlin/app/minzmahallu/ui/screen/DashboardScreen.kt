package app.minzmahallu.ui.screen

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.R
import app.minzmahallu.core.common.IndianGrouping
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.domain.dashboard.DashboardAlert
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.HeroPanel
import app.minzmahallu.core.ui.component.IconPlate
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.CountedInt
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.foundation.VerticalHairline
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.leaf
import app.minzmahallu.core.ui.theme.tint

/**
 * Focused Executive Dashboard:
 * Presents only essential data cleanly without clutter:
 * - Mahallu name & friendly greeting header
 * - Net Fund Balance & monthly collections / pending dues summary
 * - Primary quick actions (Collect dues, New receipt)
 * - 4 core register metrics (Families, Members, Welfare, Marriages)
 * - High-priority alerts if any
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
            ListSkeleton(rows = 4)
        }
        return
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(intensity = 0.65f)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = Gutters.screen,
                end = Gutters.screen,
                top = 10.dp,
                bottom = 90.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
        // Official Brand Top Bar
        item {
            Column(Modifier.statusBarsPadding()) {
                ScreenHeader(
                    title = state.greeting,
                    eyebrow = state.mahalluName.ifBlank { "Minz Mahallu" },
                    subtitle = IstDate.todayDisplay(),
                    back = onOpenDrawer,
                    isDrawer = true,
                    trailing = {
                        Box(
                            Modifier
                                .size(42.dp)
                                .clip(leaf(large = 16.dp, small = 8.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(Color(0xFF095950), Color(0xFF0E9C8D)),
                                    ),
                                )
                                .border(1.dp, colors.gold.copy(alpha = 0.4f), leaf(large = 16.dp, small = 8.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.logo_white),
                                contentDescription = "Logo",
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    },
                )
            }
        }

        // Fund Balance Hero Card
        item {
            HeroPanel {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Eyebrow("NET FUND BALANCE")
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(Shapes.pill))
                            .background(colors.accentSoft)
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        AppText(
                            text = "LIVE LEDGER • v2.7.3",
                            style = MahalluTheme.type.micro,
                            color = colors.accent,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Amount(
                    value = state.balance,
                    style = MahalluTheme.type.display,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth()) {
                    BalanceCell(
                        label = "Collected this month",
                        value = state.summary.monthlyCollection,
                        color = colors.accent,
                        modifier = Modifier.weight(1f),
                    )
                    VerticalHairline(Modifier.height(44.dp).padding(horizontal = 14.dp))
                    BalanceCell(
                        label = "Pending dues",
                        value = state.summary.pendingDues,
                        color = colors.danger,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        // Quick Actions Row
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                QuickActionButton(
                    label = "Subscriptions",
                    subtext = "Collect dues",
                    tint = ModuleTint.Green,
                    icon = {
                        AppIcon(
                            imageVector = Icons.Filled.Receipt,
                            contentDescription = "Subscriptions",
                            tint = colors.tint(ModuleTint.Green),
                        )
                    },
                    onClick = { onNavigate(Route.Subscriptions.path) },
                    modifier = Modifier.weight(1f),
                )
                QuickActionButton(
                    label = "Donations",
                    subtext = "New receipt",
                    tint = ModuleTint.Gold,
                    icon = {
                        AppIcon(
                            imageVector = Icons.Filled.VolunteerActivism,
                            contentDescription = "Donations",
                            tint = colors.tint(ModuleTint.Gold),
                        )
                    },
                    onClick = { onNavigate(Route.Donations.path) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Essential Core Register Counters
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatCard(
                    title = "Families",
                    count = state.summary.totalFamilies,
                    tint = ModuleTint.Teal,
                    onClick = { onNavigate(Route.Families.path) },
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    title = "Members",
                    count = state.summary.totalMembers,
                    tint = ModuleTint.Cyan,
                    onClick = { onNavigate(Route.Members.path) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatCard(
                    title = "Welfare",
                    count = state.summary.welfareBeneficiaries,
                    tint = ModuleTint.Rose,
                    onClick = { onNavigate(Route.Welfare.path) },
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    title = "Marriages",
                    count = state.summary.marriagesThisYear,
                    tint = ModuleTint.Violet,
                    onClick = { onNavigate(Route.Marriages.path) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Today At A Glance (Essential daily metrics)
        state.glance?.let { glance ->
            item {
                Card {
                    Eyebrow("TODAY AT A GLANCE")
                    Spacer(Modifier.height(14.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        GlanceFigure("Receipts", glance.receiptsToday.toString(), colors.accent)
                        GlanceFigure("Donations", glance.donationsToday.toString(), colors.gold)
                        GlanceFigure("Pending", glance.welfarePending.toString(), colors.danger)
                        GlanceFigure(
                            "Balance",
                            "₹" + IndianGrouping.format(Math.round(glance.fundBalance)),
                            colors.textPrimary,
                        )
                    }
                }
            }
        }

        // Actionable System Alerts Banner
        if (state.alerts.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.alerts.forEach { alert ->
                        AlertStrip(alert = alert, onNavigate = onNavigate)
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun BalanceCell(
    label: String,
    value: Double,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        AppText(
            text = label.uppercase(),
            style = MahalluTheme.type.micro,
            color = MahalluTheme.colors.textFaint,
        )
        Spacer(Modifier.height(4.dp))
        Amount(
            value = value,
            style = MahalluTheme.type.headline,
            color = color,
        )
    }
}

@Composable
private fun QuickActionButton(
    label: String,
    subtext: String,
    tint: ModuleTint,
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed)
    val shape = RoundedCornerShape(18.dp)

    Row(
        modifier = modifier
            .scale(scale)
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        colors.surfaceRaised,
                        colors.surface,
                    ),
                ),
            )
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        colors.tint(tint).copy(alpha = 0.35f),
                        colors.line,
                    ),
                ),
                shape,
            )
            .pressHighlight(press, shape, colors.tint(tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconPlate(tint = tint, size = 40.dp, content = icon)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            AppText(
                text = label,
                style = MahalluTheme.type.bodyStrong,
                color = colors.textPrimary,
                maxLines = 1,
            )
            AppText(
                text = subtext,
                style = MahalluTheme.type.micro,
                color = colors.textSecondary,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun StatCard(
    title: String,
    count: Int,
    tint: ModuleTint,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed)
    val shape = RoundedCornerShape(18.dp)

    Column(
        modifier = modifier
            .scale(scale)
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        colors.surfaceRaised,
                        colors.surface,
                    ),
                ),
            )
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        colors.tint(tint).copy(alpha = 0.35f),
                        colors.line,
                    ),
                ),
                shape,
            )
            .pressHighlight(press, shape, colors.tint(tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconPlate(tint = tint, size = 32.dp) {
                Box(Modifier.size(10.dp).background(colors.tint(tint), CircleShape))
            }
            AppIcon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                size = 18.dp,
                tint = colors.textFaint,
            )
        }
        Spacer(Modifier.height(14.dp))
        CountedInt(
            value = count,
            style = MahalluTheme.type.display,
            color = colors.textPrimary,
            stopMotion = true,
        )
        Spacer(Modifier.height(2.dp))
        AppText(
            text = title,
            style = MahalluTheme.type.caption,
            color = colors.textSecondary,
        )
    }
}

@Composable
private fun GlanceFigure(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        AppText(text = value, style = MahalluTheme.type.title, color = color)
        Spacer(Modifier.height(2.dp))
        AppText(text = label, style = MahalluTheme.type.micro, color = MahalluTheme.colors.textFaint)
    }
}

@Composable
private fun AlertStrip(alert: DashboardAlert, onNavigate: (String) -> Unit) {
    val colors = MahalluTheme.colors
    val route = when (alert.destination) {
        app.minzmahallu.core.domain.dashboard.Destination.Subscriptions -> Route.Subscriptions.path
        app.minzmahallu.core.domain.dashboard.Destination.Donations -> Route.Donations.path
        app.minzmahallu.core.domain.dashboard.Destination.Welfare -> Route.Welfare.path
        app.minzmahallu.core.domain.dashboard.Destination.Accounting -> Route.Accounting.path
        app.minzmahallu.core.domain.dashboard.Destination.Committee -> Route.Committee.path
        app.minzmahallu.core.domain.dashboard.Destination.Assets -> Route.Assets.path
        app.minzmahallu.core.domain.dashboard.Destination.Approvals -> Route.Approvals.path
        app.minzmahallu.core.domain.dashboard.Destination.Dashboard -> Route.Dashboard.path
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.warning.copy(alpha = 0.12f))
            .border(1.dp, colors.warning.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
            .clickable { onNavigate(route) }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(
            imageVector = Icons.Filled.Notifications,
            contentDescription = "Alert",
            size = 20.dp,
            tint = colors.warning,
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            AppText(
                text = "${alert.count} ${alert.type}",
                style = MahalluTheme.type.bodyStrong,
                color = colors.textPrimary,
            )
            AppText(
                text = "Tap to review",
                style = MahalluTheme.type.micro,
                color = colors.textSecondary,
            )
        }
        AppIcon(
            imageVector = Icons.Filled.ChevronRight,
            contentDescription = null,
            size = 18.dp,
            tint = colors.textFaint,
        )
    }
}
