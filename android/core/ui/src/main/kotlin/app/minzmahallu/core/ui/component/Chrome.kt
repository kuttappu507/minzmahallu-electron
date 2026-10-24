package app.minzmahallu.core.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.tint

/**
 * The app chrome: the search field every list opens with, the toast that
 * confirms each write, and the navigation items.
 */

/** The search field. Debouncing belongs to the ViewModel, not here. */
@Composable
fun SearchBar(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search…",
    onClear: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = MahalluTheme.colors
    val shape = RoundedCornerShape(Shapes.pill)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surfaceRaised)
            .border(1.dp, colors.line, shape)
            .padding(start = 16.dp, end = 6.dp, top = 11.dp, bottom = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(16.dp)
                .background(colors.textFaint.copy(alpha = 0.35f), CircleShape),
        )
        Spacer(Modifier.width(11.dp))
        Box(Modifier.weight(1f)) {
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = MahalluTheme.type.body.copy(color = colors.textPrimary),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(colors.accent),
                decorationBox = { inner ->
                    if (value.isEmpty()) {
                        AppText(
                            text = placeholder,
                            style = MahalluTheme.type.body,
                            color = colors.textFaint,
                            maxLines = 1,
                        )
                    }
                    inner()
                },
            )
        }
        if (value.isNotEmpty() && onClear != null) {
            IconButton(
                onClick = onClear,
                size = 32.dp,
                icon = {
                    AppText(
                        text = "clear",
                        style = MahalluTheme.type.micro,
                        color = colors.textFaint,
                    )
                },
            )
        }
        if (trailing != null) trailing()
    }
}

/**
 * Toasts.
 *
 * The desktop app's toasts slide up from the bottom-right; on a phone they
 * slide up from above the navigation bar and stack. Each one carries its
 * lifetime in [Toast] and dismisses itself.
 */
data class Toast(
    val message: String,
    val tone: ToastTone = ToastTone.Info,
    val id: Long = System.nanoTime(),
    val detail: String? = null,
    val actionLabel: String? = null,
    val onAction: (() -> Unit)? = null,
)

enum class ToastTone { Info, Success, Warning, Danger }

@Composable
fun ToastTone.color(): Color = when (this) {
    ToastTone.Info -> MahalluTheme.colors.info
    ToastTone.Success -> MahalluTheme.colors.accent
    ToastTone.Warning -> MahalluTheme.colors.warning
    ToastTone.Danger -> MahalluTheme.colors.danger
}

/** The toast stack. [toasts] is oldest-first; the newest sits at the bottom. */
@Composable
fun ToastStack(
    toasts: List<Toast>,
    onDismiss: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        toasts.takeLast(3).forEach { toast ->
            ToastCard(toast = toast, onDismiss = { onDismiss(toast.id) })
        }
    }
}

@Composable
private fun ToastCard(toast: Toast, onDismiss: () -> Unit) {
    val colors = MahalluTheme.colors
    val tone = toast.tone.color()
    var visible by remember(toast.id) { mutableStateOf(true) }
    LaunchedEffect(toast.id) {
        delay(3600)
        visible = false
        delay(260)
        onDismiss()
    }
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(Motion.emphasized(360)) { it } + fadeIn(),
        exit = slideOutVertically(Motion.emphasized(220)) { it / 2 } + fadeOut(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Shapes.lg))
                .background(colors.surfaceRaised)
                .border(1.dp, tone.copy(alpha = 0.35f), RoundedCornerShape(Shapes.lg))
                .padding(start = 4.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.width(4.dp).height(38.dp).background(tone))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                AppText(
                    text = toast.message,
                    style = MahalluTheme.type.bodyStrong,
                    color = colors.textPrimary,
                )
                if (toast.detail != null) {
                    Spacer(Modifier.height(2.dp))
                    AppText(
                        text = toast.detail,
                        style = MahalluTheme.type.caption,
                        color = colors.textSecondary,
                    )
                }
            }
            if (toast.actionLabel != null && toast.onAction != null) {
                Spacer(Modifier.width(12.dp))
                MahalluButton(
                    onClick = toast.onAction,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Small,
                    text = toast.actionLabel,
                )
            }
        }
    }
}

/**
 * A navigation destination — the home grid, the drawer and the overflow menu
 * all read from the same list so a module can never appear in one and not the
 * other.
 */
data class NavItem(
    val route: String,
    val title: String,
    val titleMl: String,
    val tint: ModuleTint,
    val glyph: String,
    val badge: Int = 0,
)

/** A tile in the module grid on Home. */
@Composable
fun ModuleTile(
    item: NavItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    malayalam: Boolean = false,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.93f)
    val shape = RoundedCornerShape(Shapes.lg)
    Column(
        modifier
            .scale(scale)
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.line, shape)
            .pressHighlight(press, shape, colors.tint(item.tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(14.dp),
    ) {
        IconPlate(tint = item.tint, size = 42.dp) {
            AppText(
                text = item.glyph,
                style = MahalluTheme.type.title,
                color = colors.tint(item.tint),
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(12.dp))
        AppText(
            text = if (malayalam) item.titleMl else item.title,
            style = MahalluTheme.type.bodyStrong,
            color = colors.textPrimary,
            maxLines = 2,
        )
        if (item.badge > 0) {
            Spacer(Modifier.height(8.dp))
            Pill(text = "${item.badge} pending", color = colors.warning)
        }
    }
}

/** The screen header: eyebrow, title, and a trailing slot. */
@Composable
fun ScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    back: (() -> Unit)? = null,
) {
    val colors = MahalluTheme.colors
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (back != null) {
            IconButton(
                onClick = back,
                size = 38.dp,
                icon = {
                    AppText(
                        text = "back",
                        style = MahalluTheme.type.label,
                        color = colors.textSecondary,
                    )
                },
            )
            Spacer(Modifier.width(8.dp))
        }
        Column(Modifier.weight(1f)) {
            if (eyebrow != null) Eyebrow(eyebrow)
            AppText(
                text = title,
                style = MahalluTheme.type.headline,
                color = colors.textPrimary,
                maxLines = 2,
            )
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                AppText(
                    text = subtitle,
                    style = MahalluTheme.type.body,
                    color = colors.textSecondary,
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(12.dp))
            trailing()
        }
    }
}
