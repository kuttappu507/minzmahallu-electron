package app.minzmahallu.core.ui.foundation

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.common.IndianGrouping
import app.minzmahallu.core.ui.theme.MahalluTheme

/**
 * The app's text primitive.
 *
 * Every string in the UI goes through here, so there is exactly one place where
 * the type scale, colour and overflow rules are applied — and a future change
 * (optical sizing, a Malayalam line-height tweak) lands everywhere at once
 * instead of in a hundred call sites.
 *
 * `style` and `color` are nullable rather than defaulted because a `@Composable`
 * getter cannot appear in a default parameter value; `null` means "take it from
 * the theme".
 */
@Composable
fun AppText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle? = null,
    color: Color? = null,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    onTextLayout: ((TextLayoutResult) -> Unit)? = null,
) {
    val theme = MahalluTheme.type
    val colors = MahalluTheme.colors
    BasicText(
        text = text,
        modifier = modifier,
        style = (style ?: theme.body)
            .merge(color = color ?: colors.textPrimary)
            // merge() rejects a null TextAlign, and null here means "inherit
            // whatever the style already says", so leave it out entirely.
            .let { base -> if (align != null) base.merge(textAlign = align) else base },
        maxLines = maxLines,
        overflow = overflow,
        softWrap = softWrap,
        onTextLayout = onTextLayout,
    )
}

/** Rich-text variant for the few places that need inline styling. */
@Composable
fun AppText(
    text: AnnotatedString,
    modifier: Modifier = Modifier,
    style: TextStyle? = null,
    color: Color? = null,
    align: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    val theme = MahalluTheme.type
    val colors = MahalluTheme.colors
    BasicText(
        text = text,
        modifier = modifier,
        style = (style ?: theme.body)
            .merge(color = color ?: colors.textPrimary)
            .let { base -> if (align != null) base.merge(textAlign = align) else base },
        maxLines = maxLines,
        overflow = overflow,
    )
}

/** Small, wide-tracked section label — "HOUSEHOLD", "ACTIVITY", "LEDGER". */
@Composable
fun Eyebrow(
    text: String,
    modifier: Modifier = Modifier,
    color: Color? = null,
) {
    val colors = MahalluTheme.colors
    AppText(
        text = text.uppercase(),
        style = MahalluTheme.type.eyebrow,
        color = color ?: colors.textFaint,
        modifier = modifier,
        maxLines = 1,
    )
}

/**
 * A money figure rendered with tabular numerals and Indian grouping.
 *
 * `animate` counts the value up from its previous state, which is what makes
 * the dashboard feel alive without a single decoration.
 */
@Composable
fun Amount(
    value: Double,
    modifier: Modifier = Modifier,
    symbol: String = "₹",
    style: TextStyle? = null,
    color: Color? = null,
    animate: Boolean = true,
) {
    val shown = if (animate) rememberCountUp(value) else value
    AppText(
        text = symbol + IndianGrouping.formatAmount(shown),
        style = style ?: MahalluTheme.type.amount,
        color = color ?: MahalluTheme.colors.textPrimary,
        modifier = modifier,
        maxLines = 1,
    )
}

/** A plain integer, counted up — member counts, token stats, badge numbers. */
@Composable
fun CountedInt(
    value: Int,
    modifier: Modifier = Modifier,
    style: TextStyle? = null,
    color: Color? = null,
    suffix: String = "",
) {
    val shown = rememberCountUp(value.toDouble())
    AppText(
        text = IndianGrouping.format(shown.toLong()) + suffix,
        style = style ?: MahalluTheme.type.amount,
        color = color ?: MahalluTheme.colors.textPrimary,
        modifier = modifier,
        maxLines = 1,
    )
}

/** A receipt / certificate number, always in the code face with tracking. */
@Composable
fun CodeText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color? = null,
) {
    AppText(
        text = text,
        style = MahalluTheme.type.code,
        color = color ?: MahalluTheme.colors.accentDeep,
        modifier = modifier,
        maxLines = 1,
    )
}

/** Convenience gutters, so screens don't hardcode spacing. */
object Gutters {
    val screen = 20.dp
    val card = 18.dp
    val list = 20.dp
    val between = 14.dp

    fun Modifier.screenPadding(): Modifier = this.padding(horizontal = screen)
}
