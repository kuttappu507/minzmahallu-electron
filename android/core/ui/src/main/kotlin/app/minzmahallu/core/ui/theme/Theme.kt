package app.minzmahallu.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/** Where the theme choice comes from — Settings, or the system until set. */
enum class ThemeMode { System, Light, Dark }

/**
 * The MMS theme.
 *
 * There is no MaterialTheme here and nothing depends on one: the app's own
 * [MahalluColors], [MahalluTypography] and [Elevation] are provided through
 * composition locals and read with [MahalluTheme.colors] / `.type`. That is
 * what keeps the design system free of Material's widget assumptions.
 */
@Composable
fun MahalluTheme(
    mode: ThemeMode = ThemeMode.System,
    motionScale: Float = 1f,
    content: @Composable () -> Unit,
) {
    val dark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val colors = if (dark) DarkColors else LightColors
    CompositionLocalProvider(
        LocalColors provides colors,
        LocalTypography provides AppTypography,
        LocalElevation provides Elevations.Card,
        LocalMotionScale provides motionScale.coerceIn(0f, 1f),
    ) {
        content()
    }
}

/**
 * A user-facing "reduce motion" scale. Every animation spec in the app multiplies
 * its duration by this, so a single Settings toggle can calm the whole UI down
 * (or drop it to stillness) without touching a single call site.
 */
val LocalMotionScale = androidx.compose.runtime.staticCompositionLocalOf { 1f }

object MahalluTheme {
    val colors: MahalluColors
        @Composable @ReadOnlyComposable get() = LocalColors.current

    val type: MahalluTypography
        @Composable @ReadOnlyComposable get() = LocalTypography.current

    val elevation: Elevation
        @Composable @ReadOnlyComposable get() = LocalElevation.current

    val motionScale: Float
        @Composable @ReadOnlyComposable get() = LocalMotionScale.current

    val density: Density
        @Composable @ReadOnlyComposable get() = LocalDensity.current

    val isDark: Boolean
        @Composable @ReadOnlyComposable get() = LocalColors.current.isDark
}

/** True when the UI should favour Malayalam-first phrasing. */
val LocalMalayalam = androidx.compose.runtime.staticCompositionLocalOf { false }
