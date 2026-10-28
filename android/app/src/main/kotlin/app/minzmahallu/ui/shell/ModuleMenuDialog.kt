package app.minzmahallu.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Logout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.minzmahallu.R
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.ui.component.NavItem
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.leaf
import app.minzmahallu.core.ui.theme.tint
import app.minzmahallu.core.ui.theme.tintBed

/**
 * Android Native Modal Menu Popup Dialog.
 *
 * Replaces the old slide-drawer with an elegant, centered floating card popup dialog.
 * Features tactile 3-column grid tiles, glass contours, category sections,
 * and quick-profile signout.
 */
@Composable
fun ModuleMenuDialog(
    visible: Boolean,
    onDismiss: () -> Unit,
    currentRoute: String?,
    mahalluName: String,
    operatorName: String,
    role: String,
    pendingApprovals: Int,
    malayalam: Boolean,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    if (!visible) return

    val colors = MahalluTheme.colors

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.scrim)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                )
                .padding(horizontal = 16.dp, vertical = 24.dp)
                .statusBarsPadding()
                .navigationBarsPadding(),
            contentAlignment = Alignment.Center,
        ) {
            // Elevated Popup Card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.88f)
                    .clip(RoundedCornerShape(28.dp))
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
                        Brush.verticalGradient(
                            listOf(
                                colors.accent.copy(alpha = 0.35f),
                                colors.line,
                            ),
                        ),
                        RoundedCornerShape(28.dp),
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { /* block outside dismiss */ },
                    )
                    .padding(20.dp),
            ) {
                // Header with Mahallu branding & close button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .size(42.dp)
                            .clip(leaf(large = 14.dp, small = 6.dp))
                            .background(
                                Brush.linearGradient(
                                    listOf(Color(0xFF095950), Color(0xFF0E9C8D)),
                                ),
                            )
                            .border(1.dp, colors.gold.copy(alpha = 0.5f), leaf(large = 14.dp, small = 6.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.logo_white),
                            contentDescription = "Mahallu Mark",
                            modifier = Modifier.size(24.dp),
                        )
                    }

                    Spacer(Modifier.width(12.dp))

                    Column(Modifier.weight(1f)) {
                        AppText(
                            text = mahalluName.ifBlank { "Minz Mahallu" },
                            style = MahalluTheme.type.subtitle,
                            color = colors.textPrimary,
                            maxLines = 1,
                        )
                        AppText(
                            text = "All Modules & Features",
                            style = MahalluTheme.type.micro,
                            color = colors.textSecondary,
                            maxLines = 1,
                        )
                    }

                    // Close round button
                    val closeInteraction = remember { MutableInteractionSource() }
                    val closePress = rememberPressState(closeInteraction)
                    val closeScale = animatePressScale(closePress.pressed, held = 0.88f)
                    Box(
                        modifier = Modifier
                            .scale(closeScale)
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(colors.surfaceSunken)
                            .border(1.dp, colors.line, CircleShape)
                            .clickable(
                                interactionSource = closeInteraction,
                                indication = null,
                                onClick = onDismiss,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        AppIcon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "Close",
                            size = 18.dp,
                            tint = colors.textSecondary,
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Scrollable Grid of All Modules
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(top = 2.dp, bottom = 12.dp),
                ) {
                    Navigation.sections.forEach { (sectionName, items) ->
                        item(span = { GridItemSpan(3) }) {
                            Eyebrow(
                                text = sectionName.uppercase(),
                                modifier = Modifier.padding(start = 4.dp, top = 12.dp, bottom = 6.dp),
                                color = colors.accent,
                            )
                        }

                        items(items) { item ->
                            val badge = if (item.route == Route.Approvals.path) pendingApprovals else item.badge
                            val isSelected = currentRoute == item.route
                            MenuTile(
                                item = item,
                                selected = isSelected,
                                badge = badge,
                                malayalam = malayalam,
                                onClick = {
                                    onDismiss()
                                    onNavigate(item.route)
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Bottom Operator Bar with Sign Out
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(colors.surfaceSunken)
                        .border(1.dp, colors.line, RoundedCornerShape(16.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(colors.accentSoft),
                        contentAlignment = Alignment.Center,
                    ) {
                        AppText(
                            text = operatorName.take(1).uppercase().ifBlank { "A" },
                            style = MahalluTheme.type.label,
                            color = colors.accentDeep,
                        )
                    }

                    Spacer(Modifier.width(10.dp))

                    Column(Modifier.weight(1f)) {
                        AppText(
                            text = operatorName.ifBlank { "Administrator" },
                            style = MahalluTheme.type.bodyStrong,
                            color = colors.textPrimary,
                            maxLines = 1,
                        )
                        AppText(
                            text = role.ifBlank { "Admin" },
                            style = MahalluTheme.type.micro,
                            color = colors.accent,
                            maxLines = 1,
                        )
                    }

                    val signoutInteraction = remember { MutableInteractionSource() }
                    val signoutPress = rememberPressState(signoutInteraction)
                    val signoutScale = animatePressScale(signoutPress.pressed, held = 0.92f)
                    Row(
                        modifier = Modifier
                            .scale(signoutScale)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.danger.copy(alpha = 0.12f))
                            .clickable(
                                interactionSource = signoutInteraction,
                                indication = null,
                                onClick = {
                                    onDismiss()
                                    onSignOut()
                                },
                            )
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AppIcon(
                            imageVector = Icons.Filled.Logout,
                            contentDescription = "Sign Out",
                            size = 14.dp,
                            tint = colors.danger,
                        )
                        Spacer(Modifier.width(4.dp))
                        AppText(
                            text = "Sign Out",
                            style = MahalluTheme.type.caption,
                            color = colors.danger,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MenuTile(
    item: NavItem,
    selected: Boolean,
    badge: Int,
    malayalam: Boolean,
    onClick: () -> Unit,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.94f)
    val tileShape = RoundedCornerShape(16.dp)

    val tileBg = if (selected) colors.tintBed(item.tint) else colors.surfaceRaised
    val borderColor = if (selected) colors.tint(item.tint) else colors.line

    Column(
        modifier = Modifier
            .scale(scale)
            .clip(tileShape)
            .background(tileBg)
            .border(1.dp, borderColor, tileShape)
            .pressHighlight(press, tileShape, colors.tint(item.tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(vertical = 12.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            Box(
                Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(colors.tintBed(item.tint))
                    .border(1.dp, colors.tint(item.tint).copy(alpha = 0.35f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                AppText(
                    text = item.glyph,
                    style = MahalluTheme.type.title.copy(fontSize = 17.sp),
                    color = colors.tint(item.tint),
                )
            }
            if (badge > 0) {
                Box(
                    Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(colors.accent),
                    contentAlignment = Alignment.Center,
                ) {
                    AppText(
                        text = if (badge > 9) "9+" else badge.toString(),
                        style = MahalluTheme.type.micro.copy(fontSize = 9.sp),
                        color = Color.White,
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        AppText(
            text = if (malayalam) item.titleMl else item.title,
            style = MahalluTheme.type.caption,
            color = if (selected) colors.tint(item.tint) else colors.textPrimary,
            maxLines = 1,
        )
    }
}
