package app.minzmahallu.core.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * Motion.
 *
 * One spring per job rather than a bag of ad-hoc durations: everything that
 * moves in the app is either *springy* (interactive, follows the finger) or
 * *eased* (declarative, the system telling the user something changed). Mixing
 * the two is what makes an app feel inconsistent even when every individual
 * animation looks fine.
 */
object Motion {

    /** Standard interactive spring — list items, sheets, the nav indicator. */
    fun <T> springy(visibilityThreshold: T? = null): FiniteAnimationSpec<T> = spring(
        dampingRatio = 0.72f,
        stiffness = Spring.StiffnessMediumLow,
        visibilityThreshold = visibilityThreshold,
    )

    /** Snappy spring — presses, chips, toggles, small state flips. */
    fun <T> snappy(): FiniteAnimationSpec<T> = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    /** Slow, heavy settle — the hero cards landing after login. */
    fun <T> settle(): FiniteAnimationSpec<T> = spring(
        dampingRatio = 0.85f,
        stiffness = Spring.StiffnessLow,
    )

    /** Declarative easings, named for the job they do. */
    val Emphasized: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EmphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val EmphasizedAccelerate: Easing = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)
    val Standard: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    fun <T> emphasized(durationMs: Int = 420): FiniteAnimationSpec<T> = tween(durationMs, easing = Emphasized)
    fun <T> emphasizedIn(durationMs: Int = 500): FiniteAnimationSpec<T> = tween(durationMs, easing = EmphasizedDecelerate)
    fun <T> emphasizedOut(durationMs: Int = 300): FiniteAnimationSpec<T> = tween(durationMs, easing = EmphasizedAccelerate)

    /**
     * Stop-motion stepping.
     *
     * A `keyframes`-free way to get a discrete, frame-by-frame feel — the
     * flip-clock digits and the ticker use it so the value *jumps* between
     * states instead of sliding, which is the whole point of stop motion.
     */
    fun stepped(steps: Int): Easing = Easing { fraction ->
        val index = (fraction * steps).toInt().coerceIn(0, steps)
        index.toFloat() / steps
    }

    /** Stagger for list/grid entrances — each item is 34 ms behind the last. */
    fun stagger(index: Int, perItemMs: Int = 34, baseMs: Int = 0): Int = baseMs + index * perItemMs
}

/**
 * Shapes.
 *
 * Deliberately *not* Material's corner scheme: the app uses a small set of
 * large, consistent radii plus one signature asymmetric shape ([squircle] /
 * [Leaf]) that gives cards and the FAB a distinct silhouette.
 */
object Shapes {
    val xs = 8.dp
    val sm = 12.dp
    val md = 18.dp
    val lg = 24.dp
    val xl = 32.dp
    val pill = 999.dp
}

/**
 * A "leaf" corner treatment: two opposite corners rounded hard, the other two
 * barely at all. Used on hero panels and the primary FAB so the app has a
 * silhouette of its own instead of uniformly rounded rectangles.
 */
class LeafShape(
    private val large: Dp = 28.dp,
    private val small: Dp = 10.dp,
    private val flipped: Boolean = false,
) : Shape {
    override fun createOutline(size: androidx.compose.ui.geometry.Size, layoutDirection: LayoutDirection, density: Density) =
        with(density) {
            val l = large.toPx()
            val s = small.toPx()
            val path = androidx.compose.ui.graphics.Path().apply {
                if (!flipped) {
                    moveTo(0f, s)
                    quadraticBezierTo(0f, 0f, s, 0f)
                    lineTo(size.width - l, 0f)
                    quadraticBezierTo(size.width, 0f, size.width, l)
                    lineTo(size.width, size.height - s)
                    quadraticBezierTo(size.width, size.height, size.width - s, size.height)
                    lineTo(l, size.height)
                    quadraticBezierTo(0f, size.height, 0f, size.height - l)
                } else {
                    moveTo(l, 0f)
                    quadraticBezierTo(0f, 0f, 0f, l)
                    lineTo(0f, size.height - s)
                    quadraticBezierTo(0f, size.height, s, size.height)
                    lineTo(size.width - s, size.height)
                    quadraticBezierTo(size.width, size.height, size.width, size.height - s)
                    lineTo(size.width, l)
                    quadraticBezierTo(size.width, 0f, size.width - l, 0f)
                }
                close()
            }
            androidx.compose.ui.graphics.Outline.Generic(path)
        }
}

/** Signature asymmetric panel shape. */
fun leaf(large: Dp = 28.dp, small: Dp = 10.dp, flipped: Boolean = false): Shape = LeafShape(large, small, flipped)

/** Elevation, expressed as shadow + border because Compose shadows alone read flat. */
@Immutable
data class Elevation(val dp: Dp, val borderAlpha: Float)

object Elevations {
    val None = Elevation(0.dp, 0f)
    val Card = Elevation(2.dp, 0.5f)
    val Raised = Elevation(8.dp, 0.35f)
    val Overlay = Elevation(24.dp, 0.2f)
}

val LocalElevation = staticCompositionLocalOf { Elevations.Card }

/** Soft radial glow used behind heroes and the FAB — the app's ambient light. */
fun glowOffsets(): List<Offset> = listOf(
    Offset(0.12f, 0.05f),
    Offset(0.85f, 0.2f),
    Offset(0.5f, 0.95f),
)
