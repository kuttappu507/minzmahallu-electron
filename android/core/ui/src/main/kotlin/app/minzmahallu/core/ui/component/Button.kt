package app.minzmahallu.core.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Shapes

enum class ButtonVariant { Primary, Secondary, Ghost, Danger, Gold }

enum class ButtonSize { Small, Medium, Large }

/**
 * The app's button.
 *
 * One component, five intents, three sizes — and the press behaviour described
 * in [app.minzmahallu.core.ui.foundation.PressState]: the surface scales down
 * and a highlight expands from the finger. Nothing here comes from Material.
 */
@Composable
fun MahalluButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    size: ButtonSize = ButtonSize.Medium,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    shape: Shape = RoundedCornerShape(Shapes.md),
    fullWidth: Boolean = false,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed && enabled)

    val spec = buttonColors(variant, colors)
    val disabledAlpha = 0.42f
    val contentAlpha = if (enabled) 1f else disabledAlpha

    Row(
        modifier = modifier
            .then(if (fullWidth) Modifier.fillMaxWidth() else Modifier)
            .scale(scale)
            .clip(shape)
            .then(
                if (spec.gradient != null) Modifier.background(spec.gradient)
                else Modifier.background(spec.background.copy(alpha = contentAlpha))
            )
            .then(
                if (spec.border != null) {
                    Modifier.border(1.dp, spec.border.copy(alpha = if (enabled) 1f else disabledAlpha), shape)
                } else {
                    Modifier
                }
            )
            .pressHighlight(press, shape, spec.highlight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled && !loading,
                role = Role.Button,
                onClick = onClick,
            )
            .defaultMinSize(minHeight = size.minHeight, minWidth = if (fullWidth) 0.dp else 96.dp)
            .padding(size.contentPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        AnimatedVisibility(visible = loading, enter = fadeIn(), exit = fadeOut()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spinner(size = size.iconSize, color = spec.foreground)
                Spacer(Modifier.width(10.dp))
            }
        }
        if (!loading && leadingIcon != null) {
            Box(Modifier.size(size.iconSize), contentAlignment = Alignment.Center) { leadingIcon() }
            Spacer(Modifier.width(10.dp))
        }
        AppText(
            text = text,
            style = if (size == ButtonSize.Small) MahalluTheme.type.label else MahalluTheme.type.bodyStrong,
            color = spec.foreground.copy(alpha = contentAlpha),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!loading && trailingIcon != null) {
            Spacer(Modifier.width(10.dp))
            Box(Modifier.size(size.iconSize), contentAlignment = Alignment.Center) { trailingIcon() }
        }
    }
}

/** Icon-only button — row actions, toolbars, the token collection keypad. */
@Composable
fun IconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
    variant: ButtonVariant = ButtonVariant.Ghost,
    size: Dp = 40.dp,
    enabled: Boolean = true,
    shape: Shape = RoundedCornerShape(Shapes.sm),
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed && enabled)
    val spec = buttonColors(variant, colors)
    Box(
        modifier = modifier
            .size(size)
            .scale(scale)
            .clip(shape)
            .background(
                if (variant == ButtonVariant.Ghost) Color.Transparent
                else spec.background.copy(alpha = if (enabled) 1f else 0.42f),
            )
            .then(
                if (spec.border != null && variant != ButtonVariant.Ghost) {
                    Modifier.border(1.dp, spec.border, shape)
                } else {
                    Modifier
                }
            )
            .pressHighlight(press, shape, spec.highlight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box(contentAlignment = Alignment.Center) { icon() }
    }
}

/** A round, floating primary action — the app's FAB. */
@Composable
fun FloatingActionButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
    expandedLabel: String? = null,
    expanded: Boolean = false,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed)
    val shape = RoundedCornerShape(Shapes.lg)
    Row(
        modifier = modifier
            .scale(scale)
            .clip(shape)
            .background(
                Brush.linearGradient(listOf(colors.accent, colors.accentDeep)),
            )
            .pressHighlight(press, shape, Color.White)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .height(56.dp)
            .padding(horizontal = if (expanded && expandedLabel != null) 20.dp else 0.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(if (expanded && expandedLabel != null) 24.dp else 56.dp),
            contentAlignment = Alignment.Center,
        ) { icon() }
        AnimatedVisibility(visible = expanded && expandedLabel != null, enter = fadeIn(), exit = fadeOut()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(12.dp))
                AppText(
                    text = expandedLabel.orEmpty(),
                    style = MahalluTheme.type.bodyStrong,
                    color = colors.onAccent,
                    maxLines = 1,
                )
            }
        }
    }
}

private class ButtonSpec(
    val background: Color,
    val foreground: Color,
    val border: Color?,
    val highlight: Color,
    val gradient: Brush?,
)

@Composable
private fun buttonColors(variant: ButtonVariant, colors: app.minzmahallu.core.ui.theme.MahalluColors): ButtonSpec =
    when (variant) {
        ButtonVariant.Primary -> ButtonSpec(
            background = colors.accent,
            foreground = colors.onAccent,
            border = null,
            highlight = Color.White,
            gradient = Brush.linearGradient(listOf(colors.accent, colors.accentDeep)),
        )

        ButtonVariant.Secondary -> ButtonSpec(
            background = colors.surfaceRaised,
            foreground = colors.textPrimary,
            border = colors.lineStrong,
            highlight = colors.accent,
            gradient = null,
        )

        ButtonVariant.Ghost -> ButtonSpec(
            background = Color.Transparent,
            foreground = colors.accentDeep,
            border = null,
            highlight = colors.accent,
            gradient = null,
        )

        ButtonVariant.Danger -> ButtonSpec(
            background = colors.danger,
            foreground = colors.onDanger,
            border = null,
            highlight = Color.White,
            gradient = null,
        )

        ButtonVariant.Gold -> ButtonSpec(
            background = colors.gold,
            foreground = if (colors.isDark) Color(0xFF2A1F04) else Color.White,
            border = null,
            highlight = Color.White,
            gradient = Brush.linearGradient(listOf(colors.gold, colors.gold.copy(alpha = 0.82f))),
        )
    }

private val ButtonSize.minHeight: Dp
    get() = when (this) {
        ButtonSize.Small -> 36.dp
        ButtonSize.Medium -> 46.dp
        ButtonSize.Large -> 54.dp
    }

private val ButtonSize.contentPadding: PaddingValues
    get() = when (this) {
        ButtonSize.Small -> PaddingValues(horizontal = 14.dp, vertical = 8.dp)
        ButtonSize.Medium -> PaddingValues(horizontal = 20.dp, vertical = 12.dp)
        ButtonSize.Large -> PaddingValues(horizontal = 24.dp, vertical = 15.dp)
    }

private val ButtonSize.iconSize: Dp
    get() = when (this) {
        ButtonSize.Small -> 16.dp
        ButtonSize.Medium -> 18.dp
        ButtonSize.Large -> 20.dp
    }
