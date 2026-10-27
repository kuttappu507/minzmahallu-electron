package app.minzmahallu.ui.shell

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.People
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion

/**
 * State-of-the-art floating dock navigation bar.
 *
 * Provides instant 1-tap switching between primary core hubs (Home, Money, People, All Modules)
 * without opening the drawer on every action.
 * Styled with modern glassmorphism, spring physics, and animated glowing pills.
 */
@Composable
fun ModernBottomBar(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MahalluTheme.colors
    val shape = RoundedCornerShape(28.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            colors.surfaceRaised.copy(alpha = if (colors.isDark) 0.94f else 0.98f),
                            colors.surface.copy(alpha = if (colors.isDark) 0.94f else 0.98f),
                        ),
                    ),
                )
                .border(
                    1.dp,
                    Brush.verticalGradient(
                        listOf(
                            colors.accent.copy(alpha = 0.25f),
                            colors.line,
                        ),
                    ),
                    shape,
                )
                .padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DockItem(
                label = "Home",
                icon = Icons.Filled.Home,
                selected = currentRoute == Route.Dashboard.path || currentRoute == "home",
                onClick = { onNavigate(Route.Dashboard.path) },
            )
            DockItem(
                label = "Money",
                icon = Icons.Filled.AccountBalanceWallet,
                selected = currentRoute == Route.Subscriptions.path || currentRoute == Route.Donations.path || currentRoute == Route.Accounting.path,
                onClick = { onNavigate(Route.Subscriptions.path) },
            )
            DockItem(
                label = "People",
                icon = Icons.Filled.People,
                selected = currentRoute == Route.Families.path || currentRoute == Route.Members.path,
                onClick = { onNavigate(Route.Families.path) },
            )
            DockItem(
                label = "Menu",
                icon = Icons.Filled.Menu,
                selected = false,
                onClick = onOpenMenu,
            )
        }
    }
}

@Composable
private fun DockItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.92f)
    val itemShape = RoundedCornerShape(20.dp)

    val itemBg by animateColorAsState(
        targetValue = if (selected) colors.accentSoft else Color.Transparent,
        animationSpec = Motion.emphasized(220),
        label = "dock-item-bg",
    )
    val iconColor by animateColorAsState(
        targetValue = if (selected) colors.accent else colors.textSecondary,
        animationSpec = Motion.emphasized(220),
        label = "dock-icon-color",
    )

    Column(
        modifier = Modifier
            .scale(scale)
            .clip(itemShape)
            .background(itemBg)
            .pressHighlight(press, itemShape, colors.accent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AppIcon(
            imageVector = icon,
            contentDescription = label,
            size = 22.dp,
            tint = iconColor,
        )
        Spacer(Modifier.height(3.dp))
        AppText(
            text = label,
            style = MahalluTheme.type.micro,
            color = iconColor,
            maxLines = 1,
        )
    }
}
