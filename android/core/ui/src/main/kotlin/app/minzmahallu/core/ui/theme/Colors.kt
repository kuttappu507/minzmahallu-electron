package app.minzmahallu.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The MMS palette.
 *
 * It carries the desktop app's identity — a calm teal as the working accent and
 * a deep gold for official documents — but pushes it further for a phone:
 * surfaces are layered rather than flat, and each module keeps the tint the
 * desktop gave it (`t-em`, `t-sky`, `t-vio`, …) so a user who knows the office
 * system recognises the sections at a glance.
 */

// --------------------------------------------------------------------- light

private val LightCanvas = Color(0xFFF6F8FA)
private val LightCanvasDeep = Color(0xFFEDF2F6)
private val LightSurface = Color(0xFFFFFFFF)
private val LightSurfaceRaised = Color(0xFFFCFDFE)
private val LightSurfaceSunken = Color(0xFFF0F4F8)
private val LightLine = Color(0xFFE4EBF1)
private val StrongLine = Color(0xFFCBD6E2)
private val InkPrimary = Color(0xFF0D1824)
private val InkSecondary = Color(0xFF4A5C6F)
private val InkFaint = Color(0xFF8394A6)
private val TealLight = Color(0xFF0D9488)
private val TealLightDeep = Color(0xFF096C63)
private val TealLightSoft = Color(0xFFE6F6F4)
private val GoldLight = Color(0xFFB47D08)
private val GoldLightSoft = Color(0xFFFCF5E3)
private val SkyLight = Color(0xFF2563EB)
private val RoseLight = Color(0xFFE11D48)
private val AmberLight = Color(0xFFD97706)
private val VioletLight = Color(0xFF7C5CE6)

// ---------------------------------------------------------------------- dark

private val DarkCanvas = Color(0xFF070B10)
private val DarkCanvasDeep = Color(0xFF03060A)
private val DarkSurface = Color(0xFF101720)
private val DarkSurfaceRaised = Color(0xFF16202C)
private val DarkSurfaceSunken = Color(0xFF0A1017)
private val DarkLine = Color(0xFF1F2B37)
private val DarkLineStrong = Color(0xFF2D3D4E)
private val InkPrimaryDark = Color(0xFFEBF1F7)
private val InkSecondaryDark = Color(0xFFA1B3C6)
private val InkFaintDark = Color(0xFF677A91)
private val TealDark = Color(0xFF2DD4BF)
private val TealDarkDeep = Color(0xFF14B8A6)
private val TealDarkSoft = Color(0xFF0A2E2A)
private val GoldDark = Color(0xFFFBBF24)
private val GoldDarkSoft = Color(0xFF352608)
private val SkyDark = Color(0xFF60A5FA)
private val RoseDark = Color(0xFFFB7185)
private val AmberDark = Color(0xFFFBBF24)
private val VioletDark = Color(0xFFA78BFA)

@Immutable
data class MahalluColors(
    val isDark: Boolean,
    /** App background — the canvas the aurora washes over. */
    val canvas: Color,
    val canvasDeep: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val line: Color,
    val lineStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textFaint: Color,
    /** The working accent: primary actions, selection, focus. */
    val accent: Color,
    val accentDeep: Color,
    val accentSoft: Color,
    /** Official documents, certificates, register headers. */
    val gold: Color,
    val goldSoft: Color,
    val info: Color,
    val danger: Color,
    val warning: Color,
    val violet: Color,
    /** Text drawn on top of [accent]. */
    val onAccent: Color,
    val onDanger: Color,
    val scrim: Color,
) {
    /** A soft wash of the accent, for hero panels and selected rows. */
    val accentWash: Brush
        get() = Brush.linearGradient(
            listOf(accent.copy(alpha = if (isDark) 0.28f else 0.14f), Color.Transparent),
        )

    val surfaceGradient: Brush
        get() = Brush.verticalGradient(listOf(surfaceRaised, surface))

    val canvasGradient: Brush
        get() = Brush.verticalGradient(listOf(canvasDeep, canvas))
}

val LightColors = MahalluColors(
    isDark = false,
    canvas = LightCanvas,
    canvasDeep = LightCanvasDeep,
    surface = LightSurface,
    surfaceRaised = LightSurfaceRaised,
    surfaceSunken = LightSurfaceSunken,
    line = LightLine,
    lineStrong = StrongLine,
    textPrimary = InkPrimary,
    textSecondary = InkSecondary,
    textFaint = InkFaint,
    accent = TealLight,
    accentDeep = TealLightDeep,
    accentSoft = TealLightSoft,
    gold = GoldLight,
    goldSoft = GoldLightSoft,
    info = SkyLight,
    danger = RoseLight,
    warning = AmberLight,
    violet = VioletLight,
    onAccent = Color.White,
    onDanger = Color.White,
    scrim = Color(0x66101B27),
)

val DarkColors = MahalluColors(
    isDark = true,
    canvas = DarkCanvas,
    canvasDeep = DarkCanvasDeep,
    surface = DarkSurface,
    surfaceRaised = DarkSurfaceRaised,
    surfaceSunken = DarkSurfaceSunken,
    line = DarkLine,
    lineStrong = DarkLineStrong,
    textPrimary = InkPrimaryDark,
    textSecondary = InkSecondaryDark,
    textFaint = InkFaintDark,
    accent = TealDark,
    accentDeep = TealDarkDeep,
    accentSoft = TealDarkSoft,
    gold = GoldDark,
    goldSoft = GoldDarkSoft,
    info = SkyDark,
    danger = RoseDark,
    warning = AmberDark,
    violet = VioletDark,
    onAccent = Color(0xFF04120F),
    onDanger = Color(0xFF2A0410),
    scrim = Color(0xB304070C),
)

/**
 * Module tints — the same eight the desktop stylesheet defines, so Families is
 * teal and Accounting is sky on both platforms.
 */
enum class ModuleTint { Teal, Sky, Cyan, Blue, Violet, Gold, Rose, Green }

fun MahalluColors.tint(tint: ModuleTint): Color = when (tint) {
    ModuleTint.Teal -> accent
    ModuleTint.Sky -> if (isDark) Color(0xFF79A9FF) else Color(0xFF2563EB)
    ModuleTint.Cyan -> if (isDark) Color(0xFF4FD1E8) else Color(0xFF0A93B8)
    ModuleTint.Blue -> if (isDark) Color(0xFF8AA6FF) else Color(0xFF4C6FE8)
    ModuleTint.Violet -> violet
    ModuleTint.Gold -> gold
    ModuleTint.Rose -> danger
    ModuleTint.Green -> if (isDark) Color(0xFF63D69A) else Color(0xFF17A35A)
}

/** A translucent bed for a module tint — icons, tile backgrounds, chart fills. */
fun MahalluColors.tintBed(tint: ModuleTint): Color = tint(tint).copy(alpha = if (isDark) 0.16f else 0.12f)

val LocalColors = staticCompositionLocalOf { LightColors }
