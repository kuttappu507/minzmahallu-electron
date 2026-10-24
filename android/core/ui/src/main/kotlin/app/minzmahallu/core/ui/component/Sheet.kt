package app.minzmahallu.core.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes

/**
 * Modern fluid BottomSheet.
 *
 * Fixed keyboard avoidance:
 * 1. The sheet outer container handles `imePadding()` and `navigationBarsPadding()` cleanly.
 * 2. Capped at 90% of screen height so content never shoots off the top.
 * 3. Form fields live inside a vertical scroll that automatically shrinks and scrolls smoothly when
 *    the virtual keyboard appears.
 * 4. The action footer remains docked and visible above the keyboard.
 */
@Composable
fun BottomSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    eyebrow: String? = null,
    subtitle: String? = null,
    headerTrailing: (@Composable () -> Unit)? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    maxHeightFraction: Float = 0.90f,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    val screenHeight = LocalConfiguration.current.screenHeightDp.dp
    var heightPx by remember { mutableFloatStateOf(0f) }
    var dragOffset by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        // Scrim backdrop
        Box(
            Modifier
                .fillMaxSize()
                .background(colors.scrim)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
        )

        // Sheet card
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = screenHeight * maxHeightFraction)
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .onSizeChanged { heightPx = it.height.toFloat() }
                .pointerInput(heightPx) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            if (dragOffset > heightPx * 0.25f) onDismiss()
                            dragOffset = 0f
                        },
                        onDragCancel = { dragOffset = 0f },
                    ) { change, amount ->
                        if (amount > 0) {
                            change.consume()
                            dragOffset += amount
                        }
                    }
                }
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(colors.surface)
                .border(
                    1.dp,
                    colors.line,
                    RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                ),
        ) {
            // Drag handle
            Box(
                Modifier
                    .padding(top = 10.dp, bottom = 4.dp)
                    .align(Alignment.CenterHorizontally)
                    .width(40.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(Shapes.pill))
                    .background(colors.lineStrong),
            )

            // Sheet Title & Header
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    if (eyebrow != null) Eyebrow(eyebrow)
                    if (title != null) {
                        AppText(
                            text = title,
                            style = MahalluTheme.type.title,
                            color = colors.textPrimary,
                        )
                    }
                    if (subtitle != null) {
                        Spacer(Modifier.height(2.dp))
                        AppText(
                            text = subtitle,
                            style = MahalluTheme.type.caption,
                            color = colors.textSecondary,
                        )
                    }
                }

                if (headerTrailing != null) {
                    headerTrailing()
                } else {
                    IconButton(
                        onClick = onDismiss,
                        size = 36.dp,
                        icon = {
                            AppIcon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = "Close sheet",
                                size = 18.dp,
                                tint = colors.textSecondary,
                            )
                        },
                    )
                }
            }

            // Scrollable Form Body
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 22.dp, vertical = 8.dp),
                content = content,
            )

            // Docked action footer
            if (footer != null) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(colors.surfaceRaised)
                        .border(1.dp, colors.line, RoundedCornerShape(0.dp))
                        .padding(horizontal = 22.dp, vertical = 14.dp),
                    content = footer,
                )
            }
        }
    }
}

/**
 * Centered dialog for decisions, confirmation and credentials verification.
 */
@Composable
fun Dialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(colors.scrim)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
        )
        Column(
            Modifier
                .padding(24.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(colors.surface)
                .border(1.dp, colors.line, RoundedCornerShape(22.dp))
                .padding(22.dp),
            content = content,
        )
    }
}
