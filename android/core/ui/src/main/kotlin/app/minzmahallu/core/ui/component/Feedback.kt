package app.minzmahallu.core.ui.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.sweepHighlight
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes

/**
 * The loading spinner.
 *
 * Two arcs on different speeds rather than a single rotating ring: the outer
 * arc sweeps at a constant rate while the inner one eases, so the indicator
 * has a sense of momentum instead of looking like a rotating texture.
 */
@Composable
fun Spinner(
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    color: Color? = null,
    strokeWidth: Dp = 2.4.dp,
) {
    val tint = color ?: MahalluTheme.colors.accent
    val transition = rememberInfiniteTransition(label = "spinner")
    val outer by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart),
        label = "spinner-outer",
    )
    val inner by transition.animateFloat(
        initialValue = 360f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1700, easing = LinearEasing), RepeatMode.Restart),
        label = "spinner-inner",
    )
    Canvas(modifier.size(size)) {
        val stroke = strokeWidth.toPx()
        val inset = stroke / 2f
        val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
        rotate(outer) {
            drawArc(
                color = tint,
                startAngle = 0f,
                sweepAngle = 120f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        rotate(inner) {
            drawArc(
                color = tint.copy(alpha = 0.38f),
                startAngle = 0f,
                sweepAngle = 60f,
                useCenter = false,
                topLeft = Offset(inset + stroke * 1.6f, inset + stroke * 1.6f),
                size = Size(arcSize.width - stroke * 3.2f, arcSize.height - stroke * 3.2f),
                style = Stroke(width = stroke * 0.8f, cap = StrokeCap.Round),
            )
        }
    }
}

/**
 * A determinate progress bar with a rounded track and a gradient fill that
 * springs to its new value — used for update downloads and bulk WhatsApp sends.
 */
@Composable
fun ProgressBar(
    progress: Float,
    modifier: Modifier = Modifier,
    color: Color? = null,
    track: Color? = null,
    height: Dp = 8.dp,
) {
    val fill = color ?: MahalluTheme.colors.accent
    val bed = track ?: MahalluTheme.colors.surfaceSunken
    val clamped = progress.coerceIn(0f, 1f)
    val animated by androidx.compose.animation.core.animateFloatAsState(
        targetValue = clamped,
        animationSpec = Motion.springy(),
        label = "progress",
    )
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(percent = 50))
            .background(bed),
    ) {
        Box(
            Modifier
                .fillMaxWidth(animated)
                .height(height)
                .clip(RoundedCornerShape(percent = 50))
                .background(Brush.horizontalGradient(listOf(fill.copy(alpha = 0.7f), fill))),
        )
    }
}

/**
 * Skeleton placeholder. The shimmer band sweeps across continuously so a list
 * that is still loading reads as "working" rather than "broken".
 */
@Composable
fun Skeleton(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(Shapes.sm),
) {
    val colors = MahalluTheme.colors
    val transition = rememberInfiniteTransition(label = "shimmer")
    val sweep by transition.animateFloat(
        initialValue = -0.4f,
        targetValue = 1.4f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmer-sweep",
    )
    Box(
        modifier
            .clip(shape)
            .background(colors.surfaceSunken)
            .sweepHighlight(sweep, colors.surfaceRaised.copy(alpha = if (colors.isDark) 0.5f else 0.9f)),
    )
}

/** A whole list skeleton — the standard loading state for every register. */
@Composable
fun ListSkeleton(
    modifier: Modifier = Modifier,
    rows: Int = 8,
    showAvatar: Boolean = true,
) {
    Column(modifier.padding(vertical = 8.dp)) {
        repeat(rows) { index ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (showAvatar) {
                    Skeleton(Modifier.size(42.dp), CircleShape)
                    Spacer(Modifier.width(14.dp))
                }
                Column(Modifier.weight(1f)) {
                    Skeleton(
                        Modifier
                            .fillMaxWidth(0.62f - (index % 3) * 0.09f)
                            .height(13.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    Skeleton(
                        Modifier
                            .fillMaxWidth(0.4f + (index % 4) * 0.08f)
                            .height(10.dp),
                    )
                }
            }
        }
    }
}

/** A centred spinner with a label — the state used while a secure action runs. */
@Composable
fun LoadingPanel(
    label: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spinner(size = 30.dp)
        Spacer(Modifier.height(16.dp))
        AppText(text = label, style = MahalluTheme.type.label, color = MahalluTheme.colors.textSecondary)
    }
}

/** An empty state with an icon slot, headline and an optional action. */
@Composable
fun EmptyState(
    headline: String,
    modifier: Modifier = Modifier,
    detail: String? = null,
    icon: (@Composable () -> Unit)? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val colors = MahalluTheme.colors
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Box(
                Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .background(colors.accent.copy(alpha = if (colors.isDark) 0.14f else 0.1f)),
                contentAlignment = Alignment.Center,
            ) { icon() }
            Spacer(Modifier.height(20.dp))
        }
        AppText(
            text = headline,
            style = MahalluTheme.type.subtitle,
            color = colors.textPrimary,
            align = androidx.compose.ui.text.style.TextAlign.Center,
        )
        if (detail != null) {
            Spacer(Modifier.height(8.dp))
            AppText(
                text = detail,
                style = MahalluTheme.type.body,
                color = colors.textSecondary,
                align = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
        if (action != null) {
            Spacer(Modifier.height(22.dp))
            action()
        }
    }
}

/** Indeterminate bar for short background work (a refresh, a save). */
@Composable
fun IndeterminateBar(
    modifier: Modifier = Modifier,
    color: Color? = null,
    track: Color? = null,
) {
    val fill = color ?: MahalluTheme.colors.accent
    val bed = track ?: MahalluTheme.colors.surfaceSunken
    val transition = rememberInfiniteTransition(label = "indet")
    val head by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1300, easing = Motion.Emphasized), RepeatMode.Restart),
        label = "indet-head",
    )
    val width by transition.animateFloat(
        initialValue = 0.18f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(tween(650), RepeatMode.Reverse),
        label = "indet-width",
    )
    Canvas(modifier.fillMaxWidth().height(4.dp)) {
        val radius = size.height / 2f
        drawRoundRect(color = bed, cornerRadius = CornerRadius(radius, radius))
        val span = size.width * width
        // The band travels the track and wraps, so the bar never appears stuck.
        val travel = (head * (size.width + span)) - span
        drawRoundRect(
            color = fill,
            topLeft = Offset(travel, 0f),
            size = Size(span, size.height),
            cornerRadius = CornerRadius(radius, radius),
        )
    }
}
