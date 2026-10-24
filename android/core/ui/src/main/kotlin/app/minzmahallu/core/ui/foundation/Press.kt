package app.minzmahallu.core.ui.foundation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * The app's own press feedback.
 *
 * Material's ripple is deliberately not used. Instead a press does two things
 * at once — the whole surface scales down a hair (so the control feels like a
 * physical key) and a soft radial highlight expands from the touch point and
 * fades. It reads as one gesture rather than an overlay drawn on top.
 */
class PressState {
    var pressed by mutableStateOf(false)
        internal set
    var origin by mutableStateOf(Offset.Zero)
        internal set
    internal val expand = Animatable(0f)
}

/**
 * Watches an [InteractionSource] and reports press/release, driving both the
 * scale and the expanding highlight.
 */
@Composable
fun rememberPressState(interactionSource: InteractionSource): PressState {
    val state = remember { PressState() }
    LaunchedEffect(interactionSource) {
        interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is PressInteraction.Press -> {
                    state.origin = interaction.pressPosition
                    state.pressed = true
                    state.expand.snapTo(0f)
                }

                is PressInteraction.Release -> {
                    state.pressed = false
                    state.expand.animateTo(1f, animationSpec = releaseSpec())
                }

                is PressInteraction.Cancel -> {
                    state.pressed = false
                    state.expand.animateTo(1f, animationSpec = releaseSpec())
                }
            }
        }
    }
    return state
}

private fun releaseSpec() = androidx.compose.animation.core.tween<Float>(durationMillis = 520)

/** Scale applied to a control while it is held. Small on purpose. */
@Composable
fun animatePressScale(pressed: Boolean, rest: Float = 1f, held: Float = 0.965f): Float {
    val scale by animateFloatAsState(
        targetValue = if (pressed) held else rest,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.snappy(),
        label = "press-scale",
    )
    return scale
}

/**
 * Draws the expanding highlight, clipped to [shape] so it never bleeds outside
 * the control. Combined with [animatePressScale] this is the whole feedback
 * language for every tappable surface in the app.
 */
fun Modifier.pressHighlight(state: PressState, shape: Shape, color: Color, maxRadius: Dp = 220.dp): Modifier =
    drawWithContent {
        drawContent()
        val progress = state.expand.value
        if (progress <= 0.001f) return@drawWithContent
        val path = outlinePath(shape, size.width, size.height, layoutDirection, this)
        clipPath(path) {
            drawCircle(
                color = color.copy(alpha = (1f - progress) * 0.24f),
                radius = maxRadius.toPx() * progress,
                center = state.origin,
            )
        }
    }

/** A continuously-shimmering highlight, used by skeleton loaders. */
fun Modifier.sweepHighlight(progress: Float, color: Color, widthFraction: Float = 0.45f): Modifier =
    drawWithContent {
        drawContent()
        val w = size.width
        val bandWidth = w * widthFraction
        val center = (progress * (w + bandWidth)) - bandWidth / 2f
        clipRect {
            drawRect(
                brush = androidx.compose.ui.graphics.Brush.horizontalGradient(
                    colors = listOf(
                        Color.Transparent,
                        color,
                        Color.Transparent,
                    ),
                    startX = center - bandWidth / 2f,
                    endX = center + bandWidth / 2f,
                ),
            )
        }
    }

internal fun outlinePath(
    shape: Shape,
    width: Float,
    height: Float,
    layoutDirection: LayoutDirection,
    density: Density,
): Path {
    val outline = shape.createOutline(androidx.compose.ui.geometry.Size(width, height), layoutDirection, density)
    return Path().apply {
        when (outline) {
            is Outline.Rounded -> addRoundRect(outline.roundRect)
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Generic -> addPath(outline.path)
        }
        close()
    }
}

/** Convenience: an InteractionSource that is stable across recompositions. */
@Composable
fun rememberInteractionSource(): MutableInteractionSource = remember { MutableInteractionSource() }
