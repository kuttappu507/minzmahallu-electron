package app.minzmahallu.core.ui.component

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.leaf
import app.minzmahallu.core.ui.theme.tint
import app.minzmahallu.core.ui.theme.tintBed

/**
 * The base surface. Every card, panel, sheet and row in the app is this:
 * a filled shape, a hairline border, and — when tappable — the press
 * behaviour from [app.minzmahallu.core.ui.foundation.PressState].
 *
 * Compose's built-in `shadow` alone reads flat on a phone, so a card here is
 * *filled + outlined*; depth comes from the surface tone stepping up rather
 * than from a blur.
 */
@Composable
fun Surface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(Shapes.lg),
    color: Color? = null,
    border: Color? = Color.Unspecified,
    onClick: (() -> Unit)? = null,
    selected: Boolean = false,
    enabled: Boolean = true,
    contentPadding: androidx.compose.foundation.layout.PaddingValues =
        androidx.compose.foundation.layout.PaddingValues(18.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    val fill = color ?: colors.surface
    val edge = border.takeIf { it != Color.Unspecified } ?: colors.line
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale by animateFloatAsState(
        targetValue = if (onClick != null && press.pressed) 0.985f else 1f,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.snappy(),
        label = "surface-scale",
    )
    val borderColor by animateColorAsState(
        targetValue = if (selected) colors.accent else edge,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.emphasized(220),
        label = "surface-border",
    )

    val bgBrush = when {
        selected -> androidx.compose.ui.graphics.SolidColor(colors.accentSoft)
        color != null -> androidx.compose.ui.graphics.SolidColor(fill)
        else -> Brush.verticalGradient(listOf(colors.surfaceRaised, colors.surface))
    }

    Column(
        modifier
            .scale(scale)
            .clip(shape)
            .background(bgBrush)
            .then(
                if (border != Color.Unspecified) Modifier.border(
                    width = if (selected) 1.6.dp else 1.dp,
                    color = borderColor,
                    shape = shape,
                ) else Modifier
            )
            .then(
                if (onClick != null) {
                    Modifier
                        .pressHighlight(press, shape, colors.accent)
                        .clickable(
                            interactionSource = interaction,
                            indication = null,
                            enabled = enabled,
                            onClick = onClick,
                        )
                } else {
                    Modifier
                }
            )
            .padding(contentPadding),
        content = content,
    )
}

/** A card with a title row and an optional trailing slot. */
@Composable
fun Card(
    title: String? = null,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    shape: Shape = RoundedCornerShape(Shapes.lg),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier, shape = shape, onClick = onClick) {
        if (eyebrow != null) {
            Eyebrow(eyebrow)
            Spacer(Modifier.height(4.dp))
        }
        if (title != null || trailing != null) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (title != null) {
                    AppText(
                        text = title,
                        style = MahalluTheme.type.subtitle,
                        color = MahalluTheme.colors.textPrimary,
                        modifier = Modifier.weight(1f, fill = false),
                        maxLines = 1,
                    )
                }
                if (trailing != null) {
                    Spacer(Modifier.width(10.dp))
                    trailing()
                }
            }
            Spacer(Modifier.height(14.dp))
        }
        content()
    }
}

/**
 * The signature hero panel — the asymmetric "leaf" shape with a tinted wash.
 * Used for the dashboard greeting, a family's identity, a certificate header.
 */
@Composable
fun HeroPanel(
    modifier: Modifier = Modifier,
    tint: ModuleTint = ModuleTint.Teal,
    flipped: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = MahalluTheme.colors
    val shape = leaf(flipped = flipped)
    Column(
        modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        colors.tintBed(tint),
                        colors.surfaceRaised.copy(alpha = if (colors.isDark) 0.95f else 1f),
                    ),
                ),
            )
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        colors.tint(tint).copy(alpha = 0.38f),
                        colors.line,
                    ),
                ),
                shape,
            )
            .padding(22.dp),
        content = content,
    )
}

/** A module-tinted icon plate — the square-with-rounded-corners app glyph. */
@Composable
fun IconPlate(
    tint: ModuleTint,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    content: @Composable () -> Unit,
) {
    val colors = MahalluTheme.colors
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.32f))
            .background(colors.tintBed(tint))
            .border(1.dp, colors.tint(tint).copy(alpha = 0.22f), RoundedCornerShape(size * 0.32f)),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** Status pill — Paid / Pending / Overdue / Archived / Pending approval. */
@Composable
fun Pill(
    text: String,
    modifier: Modifier = Modifier,
    color: Color? = null,
    filled: Boolean = false,
    leadingDot: Boolean = true,
) {
    val colors = MahalluTheme.colors
    val tint = color ?: colors.accent
    Row(
        modifier
            .clip(RoundedCornerShape(Shapes.pill))
            .background(if (filled) tint else tint.copy(alpha = if (colors.isDark) 0.18f else 0.12f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingDot) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (filled) colors.onAccent else tint),
            )
            Spacer(Modifier.width(6.dp))
        }
        AppText(
            text = text,
            style = MahalluTheme.type.micro,
            color = if (filled) colors.onAccent else tint,
            maxLines = 1,
        )
    }
}

/**
 * The status colour mapping shared by every register, so "Paid" is green in
 * Subscriptions, Welfare and the ledger alike.
 */
@Composable
fun statusColor(status: String?): Color {
    val colors = MahalluTheme.colors
    return when (status?.lowercase()) {
        "paid", "active", "approved", "collected", "disbursed", "issued", "posted", "in use" -> colors.accent
        "pending", "partial", "generated", "issued_pending" -> colors.warning
        "overdue", "rejected", "cancelled", "void", "deceased", "archived", "expelled" -> colors.danger
        "inactive", "past", "resigned", "closed", "idle" -> colors.textFaint
        else -> colors.info
    }
}

@Composable
fun StatusPill(status: String, modifier: Modifier = Modifier) {
    Pill(text = status, modifier = modifier, color = statusColor(status))
}

/** A filter chip — the status/category selectors at the top of each list. */
@Composable
fun FilterChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.94f)
    val background by animateColorAsState(
        targetValue = if (selected) colors.accent else colors.surface,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.emphasized(220),
        label = "chip-bg",
    )
    val content by animateColorAsState(
        targetValue = if (selected) colors.onAccent else colors.textSecondary,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.emphasized(220),
        label = "chip-fg",
    )
    val shape = RoundedCornerShape(Shapes.pill)
    Row(
        modifier
            .scale(scale)
            .clip(shape)
            .background(background)
            .border(
                1.dp,
                if (selected) colors.accent else colors.line,
                shape,
            )
            .pressHighlight(press, shape, colors.accent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppText(text = text, style = MahalluTheme.type.label, color = content, maxLines = 1)
        if (count != null) {
            Spacer(Modifier.width(6.dp))
            AppText(
                text = count.toString(),
                style = MahalluTheme.type.micro,
                color = content.copy(alpha = 0.7f),
                maxLines = 1,
            )
        }
    }
}

/** The app's switch. A sliding thumb with a colour cross-fade — no Material. */
@Composable
fun Toggle(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MahalluTheme.colors
    val track by animateColorAsState(
        targetValue = when {
            !enabled -> colors.surfaceSunken
            checked -> colors.accent
            else -> colors.lineStrong
        },
        animationSpec = app.minzmahallu.core.ui.theme.Motion.emphasized(260),
        label = "toggle-track",
    )
    val thumbOffset by androidx.compose.animation.core.animateDpAsState(
        targetValue = if (checked) 22.dp else 3.dp,
        animationSpec = app.minzmahallu.core.ui.theme.Motion.springy(),
        label = "toggle-thumb",
    )
    Box(
        modifier
            .size(width = 48.dp, height = 28.dp)
            .clip(RoundedCornerShape(Shapes.pill))
            .background(track.copy(alpha = if (enabled) 1f else 0.5f))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                onClick = { onCheckedChange(!checked) },
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier
                .padding(start = thumbOffset)
                .size(22.dp)
                .clip(CircleShape)
                .background(colors.surfaceRaised),
        )
    }
}

/** A labelled settings row with a trailing control. */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(Shapes.md),
        color = Color.Transparent,
        border = null,
        onClick = onClick,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                AppText(text = title, style = MahalluTheme.type.bodyStrong, color = MahalluTheme.colors.textPrimary)
                if (subtitle != null) {
                    Spacer(Modifier.height(3.dp))
                    AppText(text = subtitle, style = MahalluTheme.type.caption, color = MahalluTheme.colors.textSecondary)
                }
            }
            if (trailing != null) {
                Spacer(Modifier.width(12.dp))
                trailing()
            }
        }
    }
}
