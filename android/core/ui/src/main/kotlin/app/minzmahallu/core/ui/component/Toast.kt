package app.minzmahallu.core.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes
import kotlinx.coroutines.delay

/**
 * Modern non-intrusive Toast notifications.
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
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
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
                .clip(RoundedCornerShape(14.dp))
                .background(colors.surfaceRaised)
                .border(1.dp, tone.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                .padding(start = 4.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.width(4.dp).height(36.dp).clip(RoundedCornerShape(2.dp)).background(tone))
            Spacer(Modifier.width(12.dp))
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
                Spacer(Modifier.width(10.dp))
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
