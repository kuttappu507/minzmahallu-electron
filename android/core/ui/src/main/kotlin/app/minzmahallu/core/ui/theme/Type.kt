package app.minzmahallu.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import app.minzmahallu.core.ui.R

/**
 * Typography.
 *
 * Two families, mirroring the desktop's split: **Poppins** for Latin text,
 * numerals and codes, and **Anek Malayalam** for Malayalam. The desktop had to
 * fight Chromium's per-character font matching to keep Latin in Poppins while
 * Malayalam fell through to Anek; on Android the same effect is achieved by
 * making the Malayalam family first in the list — Compose picks the first
 * family that can render each run of text.
 */
val PoppinsFamily = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

/**
 * Malayalam falls back to the platform's own Malayalam face.
 *
 * The desktop ships Anek Malayalam, but only as a variable WOFF2, and Android
 * cannot consume WOFF2 — it needs TTF/OTF. Rather than bundle nothing and
 * pretend, this points at the system family, which on every Android that
 * supports Malayalam is a Noto face designed for the script. Dropping the four
 * static Anek TTFs into `res/font/` and restoring them here is a drop-in
 * upgrade; see core/ui/FONTS.md.
 */
val MalayalamFamily = FontFamily.Default

/**
 * Poppins for Latin, numerals and codes, with Malayalam resolved by font
 * fallback: Compose walks the list per run of text, so a Poppins face that
 * carries no Malayalam glyphs hands those characters to the platform face.
 *
 * The desktop had to invert this order to defeat Chromium's per-character
 * matching. Android does not need that, and keeping Poppins first is what
 * preserves the look — Latin text stays in the brand face instead of being
 * rendered by whichever system font happens to come first.
 */
val AppFontFamily = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

/**
 * Tabular figures for money and codes. Money that jitters sideways as digits
 * change (1,00,000 → 99,999) is unreadable in a ledger, so every amount in the
 * app uses this family.
 */
val NumericFontFamily = FontFamily(
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_regular, FontWeight.Normal),
)

private val tight = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.Both,
)

@Immutable
data class MahalluTypography(
    val display: TextStyle,
    val headline: TextStyle,
    val title: TextStyle,
    val subtitle: TextStyle,
    val body: TextStyle,
    val bodyStrong: TextStyle,
    val label: TextStyle,
    val caption: TextStyle,
    val micro: TextStyle,
    /** Big money figures on the dashboard and receipts. */
    val amount: TextStyle,
    val amountSmall: TextStyle,
    /** Receipt numbers, codes, QR payloads. */
    val code: TextStyle,
    /** Section eyebrows — small, wide-tracked, uppercase. */
    val eyebrow: TextStyle,
)

private fun style(
    size: TextUnit,
    weight: FontWeight,
    lineHeight: TextUnit,
    tracking: TextUnit = 0.sp,
    family: FontFamily = AppFontFamily,
) = TextStyle(
    fontFamily = family,
    fontSize = size,
    fontWeight = weight,
    lineHeight = lineHeight,
    letterSpacing = tracking,
    lineHeightStyle = tight,
)

val AppTypography = MahalluTypography(
    display = style(34.sp, FontWeight.Bold, 40.sp, (-0.8).sp),
    headline = style(26.sp, FontWeight.Bold, 32.sp, (-0.5).sp),
    title = style(20.sp, FontWeight.SemiBold, 26.sp, (-0.2).sp),
    subtitle = style(16.sp, FontWeight.SemiBold, 22.sp),
    body = style(15.sp, FontWeight.Normal, 22.sp),
    bodyStrong = style(15.sp, FontWeight.SemiBold, 22.sp),
    label = style(13.sp, FontWeight.Medium, 18.sp),
    caption = style(12.sp, FontWeight.Normal, 16.sp),
    micro = style(11.sp, FontWeight.Medium, 14.sp),
    amount = style(30.sp, FontWeight.Bold, 34.sp, (-0.6).sp, NumericFontFamily),
    amountSmall = style(17.sp, FontWeight.SemiBold, 22.sp, NumericFontFamily),
    code = style(13.sp, FontWeight.Medium, 18.sp, (0.4).sp, NumericFontFamily),
    eyebrow = style(11.sp, FontWeight.SemiBold, 14.sp, (1.4).sp),
)

val LocalTypography = staticCompositionLocalOf { AppTypography }
