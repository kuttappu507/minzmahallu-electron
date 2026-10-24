package app.minzmahallu.core.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes

/**
 * The bottom sheet.
 *
 * This is the single most important surface in the app: every create and edit
 * form in all sixteen modules lives in one. It is drag-to-dismiss, has a grab
 * handle, and pads itself above the keyboard so a form never hides its own
 * submit button.
 *
 * It is built by hand rather than with Material's `ModalBottomSheet`, because
 * the sheet needs to sit above the aurora background with a dim that fades in
 * step with the travel, and because the corner treatment is the app's own.
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
    maxHeightFraction: Float = 0.92f,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    val density = LocalDensity.current
    var heightPx by remember { mutableFloatStateOf(0f) }
    var dragOffset by remember { mutableFloatStateOf(0f) }

    androidx.compose.animation.AnimatedVisibility(
        visible = true,
        enter = androidx.compose.animation.fadeIn(Motion.emphasized(220)),
        exit = androidx.compose.animation.fadeOut(Motion.emphasized(160)),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(colors.scrim)
                .pointerInput(Unit) { detectVerticalDragGestures { _, _ -> onDismiss() } },
        )
    }

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Column(
            Modifier
                .fillMaxWidth()
                .onSizeChanged { heightPx = it.height.toFloat() }
                .pointerInput(heightPx) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            if (dragOffset > heightPx * 0.28f) onDismiss()
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
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(colors.surface)
                .border(
                    1.dp,
                    colors.line,
                    RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                )
                .imePadding()
                .navigationBarsPadding(),
        ) {
            // Grab handle.
            Box(
                Modifier
                    .padding(top = 10.dp, bottom = 4.dp)
                    .align(Alignment.CenterHorizontally)
                    .width(42.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(Shapes.pill))
                    .background(colors.lineStrong),
            )

            if (title != null || eyebrow != null) {
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
                            Spacer(Modifier.height(4.dp))
                            AppText(
                                text = subtitle,
                                style = MahalluTheme.type.caption,
                                color = colors.textSecondary,
                            )
                        }
                    }
                    if (headerTrailing != null) {
                        Spacer(Modifier.width(12.dp))
                        headerTrailing()
                    }
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 22.dp, vertical = 8.dp),
                content = content,
            )

            if (footer != null) {
                Spacer(Modifier.height(6.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(colors.surfaceRaised)
                        .border(1.dp, colors.line, RoundedCornerShape(0.dp))
                        .padding(horizontal = 22.dp, vertical = 16.dp),
                    content = footer,
                )
            }
        }
    }
}

/**
 * A centred dialog. Used for confirmations, the secure-action password prompt
 * and the few decisions that must not be dismissed by a swipe.
 */
@Composable
fun Dialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    title: String,
    eyebrow: String? = null,
    tone: Color? = null,
    actions: @Composable RowScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    val accent = tone ?: colors.accent
    Box(
        modifier
            .fillMaxSize()
            .background(colors.scrim)
            .pointerInput(Unit) { detectTapGestures(onTap = { onDismiss() }) },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = 420.dp)
                .padding(28.dp)
                .clip(RoundedCornerShape(Shapes.xl))
                .background(colors.surface)
                .border(1.dp, colors.line, RoundedCornerShape(Shapes.xl))
                .padding(24.dp),
        ) {
            if (eyebrow != null) {
                Eyebrow(eyebrow, color = accent)
                Spacer(Modifier.height(6.dp))
            }
            AppText(
                text = title,
                style = MahalluTheme.type.title,
                color = colors.textPrimary,
            )
            Spacer(Modifier.height(12.dp))
            Column(Modifier.fillMaxWidth(), content = content)
            Spacer(Modifier.height(22.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
                content = actions,
            )
        }
    }
}

/**
 * The confirm-delete dialog. It carries the record's name into the message so
 * the operator can see exactly what they are about to remove.
 */
@Composable
fun ConfirmDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    title: String,
    message: String,
    confirmLabel: String = "Delete",
    modifier: Modifier = Modifier,
    destructive: Boolean = true,
) {
    val colors = MahalluTheme.colors
    Dialog(
        onDismiss = onDismiss,
        title = title,
        tone = if (destructive) colors.danger else colors.accent,
        eyebrow = if (destructive) "cannot be undone" else null,
        modifier = modifier,
        actions = {
            MahalluButton(
                onClick = onDismiss,
                variant = ButtonVariant.Ghost,
                text = "Cancel",
            )
            MahalluButton(
                onClick = onConfirm,
                variant = if (destructive) ButtonVariant.Danger else ButtonVariant.Primary,
                text = confirmLabel,
            )
        },
    ) {
        AppText(
            text = message,
            style = MahalluTheme.type.body,
            color = colors.textSecondary,
        )
    }
}

/**
 * The secure-action dialog: destructive master-data operations require the
 * administrator's password to be re-entered first.
 *
 * Mirrors the desktop `SecureActionDialog`. The password is never held in a
 * ViewModel — it goes straight to the verification lambda and is dropped.
 */
@Composable
fun SecureActionDialog(
    onDismiss: () -> Unit,
    onVerify: (String) -> Unit,
    title: String,
    reason: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    busy: Boolean = false,
) {
    var password by remember { androidx.compose.runtime.mutableStateOf("") }
    val colors = MahalluTheme.colors
    Dialog(
        onDismiss = onDismiss,
        title = title,
        eyebrow = "administrator re-authentication",
        tone = colors.danger,
        modifier = modifier,
        actions = {
            MahalluButton(onClick = onDismiss, variant = ButtonVariant.Ghost, text = "Cancel")
            MahalluButton(
                onClick = { onVerify(password) },
                variant = ButtonVariant.Danger,
                text = "Confirm",
                enabled = password.isNotEmpty() && !busy,
            )
        },
    ) {
        AppText(
            text = reason,
            style = MahalluTheme.type.body,
            color = colors.textSecondary,
        )
        Spacer(Modifier.height(18.dp))
        PasswordField(
            value = password,
            onValueChange = { password = it },
            label = "Your password",
            error = error,
        )
    }
}

/** Small helper for the many two-button footers in edit forms. */
@Composable
fun SheetFooter(
    primaryLabel: String,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
    secondaryLabel: String = "Cancel",
    onSecondary: (() -> Unit)? = null,
    primaryEnabled: Boolean = true,
    busy: Boolean = false,
) {
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onSecondary != null) {
            MahalluButton(
                onClick = onSecondary,
                variant = ButtonVariant.Ghost,
                text = secondaryLabel,
                modifier = Modifier.weight(1f),
                size = ButtonSize.Large,
            )
        }
        MahalluButton(
            onClick = onPrimary,
            text = primaryLabel,
            enabled = primaryEnabled,
            loading = busy,
            modifier = Modifier.weight(1.4f),
            size = ButtonSize.Large,
        )
    }
}
