package app.minzmahallu.core.ui.foundation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RadialGradientShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/**
 * Counts a number up to [target] from wherever it currently is.
 *
 * This is the single most-used piece of motion in the app: every money figure
 * and counter on the dashboard arrives by counting, which tells the user the
 * number is *live* rather than printed.
 */
@Composable
fun rememberCountUp(target: Double, durationMs: Int = 720): Double {
    val scale = MahalluTheme.motionScale
    val animatable = remember { Animatable(target.toFloat()) }
    LaunchedEffect(target, scale) {
        if (scale <= 0f) {
            animatable.snapTo(target.toFloat())
            return@LaunchedEffect
        }
        animatable.animateTo(
            targetValue = target.toFloat(),
            animationSpec = Motion.emphasized((durationMs * scale).toInt().coerceAtLeast(1)),
        )
    }
    return animatable.value.toDouble()
}

/**
 * Stop-motion digit flip.
 *
 * Rather than sliding between values, the display steps through whole numbers
 * at a fixed frame rate — the mechanical feel of a flip clock or an airport
 * board. Used for the clock on the dashboard and for token counters at the door.
 */
@Composable
fun stopMotionInt(
    target: Int,
    framesPerSecond: Int = 24,
    maxDurationMs: Int = 900,
): Int {
    var shown by remember { mutableIntStateOf(target) }
    LaunchedEffect(target) {
        if (shown == target) return@LaunchedEffect
        val from = shown
        val delta = target - from
        val steps = (maxDurationMs / (1000 / framesPerSecond)).coerceIn(2, 24)
        for (step in 1..steps) {
            shown = from + (delta * step / steps.toFloat()).roundToInt()
            delay((1000L / framesPerSecond))
        }
        shown = target
    }
    return shown
}

/**
 * A ticker that flips between values on an interval — the rotating "today at a
 * glance" line on the dashboard.
 */
@Composable
fun <T> rememberTicker(items: List<T>, intervalMs: Long = 3600): T? {
    if (items.isEmpty()) return null
    var index by remember { mutableIntStateOf(0) }
    LaunchedEffect(items.size, intervalMs) {
        while (true) {
            delay(intervalMs)
            index = (index + 1) % items.size
        }
    }
    return items[index.coerceIn(0, items.lastIndex)]
}

/**
 * The aurora wash behind the app.
 *
 * Three large, very soft radial gradients drift slowly across the canvas. They
 * are deliberately low-contrast and slow: the effect is that the background is
 * *alive*, not that something is moving. In dark mode the same wash reads as
 * light leaking into a dark room.
 */
@Composable
fun AuroraBackground(
    modifier: Modifier = Modifier,
    intensity: Float = 1f,
) {
    val colors = MahalluTheme.colors
    val transition = rememberInfiniteTransition(label = "aurora")
    val drift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(24000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "aurora-drift",
    )
    val breathe by transition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(11000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "aurora-breathe",
    )

    val alpha = (if (colors.isDark) 0.30f else 0.20f) * intensity
    Box(
        modifier
            .fillMaxSize()
            .background(colors.canvasGradient)
            .drawWithCache {
                val w = size.width
                val h = size.height
                val first = ShaderBrush(
                    RadialGradientShader(
                        colors = listOf(colors.accent.copy(alpha = alpha), Color.Transparent),
                        center = Offset(w * (0.12f + 0.10f * drift), h * 0.04f),
                        radius = w * 0.85f * breathe,
                    ),
                )
                val second = ShaderBrush(
                    RadialGradientShader(
                        colors = listOf(colors.gold.copy(alpha = alpha * 0.7f), Color.Transparent),
                        center = Offset(w * (0.92f - 0.08f * drift), h * 0.18f),
                        radius = w * 0.7f * breathe,
                    ),
                )
                val third = ShaderBrush(
                    RadialGradientShader(
                        colors = listOf(colors.violet.copy(alpha = alpha * 0.5f), Color.Transparent),
                        center = Offset(w * 0.5f, h * (0.98f - 0.05f * drift)),
                        radius = w * 0.9f,
                    ),
                )
                onDrawBehind {
                    drawRect(first)
                    drawRect(second)
                    drawRect(third)
                }
            },
    )
}

/**
 * A soft glow behind a floating element (the FAB, the primary card). Cheaper
 * than a real shadow and reads better on both themes.
 */
@Composable
fun Glow(
    modifier: Modifier = Modifier,
    color: Color? = null,
    radius: Dp = 90.dp,
    alpha: Float = 0.35f,
) {
    val tint = color ?: MahalluTheme.colors.accent
    Box(
        modifier
            .size(radius * 2)
            .background(
                Brush.radialGradient(
                    colors = listOf(tint.copy(alpha = alpha), Color.Transparent),
                ),
            )
            .blur(radius / 3),
    )
}

/** The hairline separator used inside cards and lists. */
@Composable
fun Hairline(
    modifier: Modifier = Modifier,
    color: Color? = null,
    thickness: Dp = 1.dp,
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(thickness)
            .background(color ?: MahalluTheme.colors.line),
    )
}

/** Vertical hairline, for the split stat rows. */
@Composable
fun VerticalHairline(
    modifier: Modifier = Modifier,
    color: Color? = null,
    height: Dp = 38.dp,
) {
    Box(
        modifier
            .width(1.dp)
            .height(height)
            .background(color ?: MahalluTheme.colors.line),
    )
}
