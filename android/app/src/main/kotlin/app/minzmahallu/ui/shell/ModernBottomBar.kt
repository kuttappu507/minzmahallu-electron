package app.minzmahallu.ui.shell

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.People
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme

/**
 * State-of-the-art floating dock navigation bar inspired by namaz-times.
 *
 * Provides instant 1-tap switching between primary hubs (Home, Money, People, All Modules popup)
 * with glassmorphism, soft emerald/teal elevation shadow, tactile spring physics, and animated glowing indicator.
 */
@Composable
fun ModernBottomBar(
    currentRoute: String?,
    onNavigate: (String) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MahalluTheme.colors
    val shape = CircleShape

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .shadow(
                    elevation = 20.dp,
                    shape = shape,
                    ambientColor = if (colors.isDark) Color.Black.copy(alpha = 0.5f) else Color(0xFF0D9488).copy(alpha = 0.16f),
                    spotColor = if (colors.isDark) Color.Black.copy(alpha = 0.6f) else Color(0xFF0D9488).copy(alpha = 0.24f),
                )
                .clip(shape)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            colors.surfaceRaised.copy(alpha = if (colors.isDark) 0.95f else 0.98f),
                            colors.surface.copy(alpha = if (colors.isDark) 0.95f else 0.98f),
                        ),
                    ),
                )
                .border(
                    1.dp,
                    if (colors.isDark) Color.White.copy(alpha = 0.12f) else Color.White.copy(alpha = 0.9f),
                    shape,
                )
                .padding(horizontal = 6.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DockItem(
                label = "Home",
                selectedIcon = Icons.Filled.Home,
                unselectedIcon = Icons.Outlined.Home,
                selected = currentRoute == Route.Dashboard.path || currentRoute == "home",
                onClick = { onNavigate(Route.Dashboard.path) },
            )
            DockItem(
                label = "Money",
                selectedIcon = Icons.Filled.AccountBalanceWallet,
                unselectedIcon = Icons.Outlined.AccountBalanceWallet,
                selected = currentRoute == Route.Subscriptions.path || currentRoute == Route.Donations.path || currentRoute == Route.Accounting.path,
                onClick = { onNavigate(Route.Subscriptions.path) },
            )
            DockItem(
                label = "People",
                selectedIcon = Icons.Filled.People,
                unselectedIcon = Icons.Outlined.People,
                selected = currentRoute == Route.Families.path || currentRoute == Route.Members.path,
                onClick = { onNavigate(Route.Families.path) },
            )
            DockItem(
                label = "More",
                selectedIcon = Icons.Filled.GridView,
                unselectedIcon = Icons.Outlined.GridView,
                selected = false,
                onClick = onOpenMenu,
            )
        }
    }
}

@Composable
private fun DockItem(
    label: String,
    selectedIcon: ImageVector,
    unselectedIcon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.92f)
    val itemShape = CircleShape

    val itemBg by animateColorAsState(
        targetValue = if (selected) colors.accentSoft else Color.Transparent,
        animationSpec = spring(stiffness = Spring.StiffnessMedium),
        label = "dock-item-bg",
    )
    val iconColor by animateColorAsState(
        targetValue = if (selected) colors.accentDeep else colors.textSecondary,
        animationSpec = tween(220),
        label = "dock-icon-color",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1.08f else 1f,
        animationSpec = spring(dampingRatio = 0.65f, stiffness = Spring.StiffnessMedium),
        label = "dock-icon-scale",
    )

    Column(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(itemShape)
            .background(itemBg)
            .pressHighlight(press, itemShape, colors.accent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 18.dp, vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Crossfade(targetState = selected, animationSpec = tween(200), label = "dock-crossfade") { isSelected ->
            AppIcon(
                imageVector = if (isSelected) selectedIcon else unselectedIcon,
                contentDescription = label,
                size = 22.dp,
                tint = iconColor,
                modifier = Modifier.graphicsLayer {
                    scaleX = iconScale
                    scaleY = iconScale
                },
            )
        }
        Spacer(Modifier.height(2.dp))
        AppText(
            text = label,
            style = MahalluTheme.type.micro.copy(letterSpacing = 0.2.sp),
            color = iconColor,
            maxLines = 1,
        )
    }
}
