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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.tint

/**
 * Filter chip — pill-shaped toggle for status/category filters.
 */
@Composable
fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    badge: Int = 0,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed)
    val shape = RoundedCornerShape(Shapes.pill)
    Row(
        modifier = modifier
            .scale(scale)
            .clip(shape)
            .background(if (selected) colors.accent else colors.surfaceRaised)
            .border(1.dp, if (selected) colors.accent else colors.line, shape)
            .pressHighlight(press, shape, colors.accentSoft)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppText(
            text = label,
            style = MahalluTheme.type.label,
            color = if (selected) colors.onAccent else colors.textPrimary,
            maxLines = 1,
        )
        if (badge > 0) {
            Spacer(Modifier.width(6.dp))
            Box(
                Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(if (selected) colors.onAccent.copy(alpha = 0.22f) else colors.accentWash),
                contentAlignment = Alignment.Center,
            ) {
                AppText(
                    text = badge.toString(),
                    style = MahalluTheme.type.micro,
                    color = if (selected) colors.onAccent else colors.accent,
                )
            }
        }
    }
}

/**
 * Search input field with search icon and clear button.
 */
@Composable
fun SearchBar(
    value: String,
    onSearchChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search…",
    onClear: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = MahalluTheme.colors
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surfaceRaised)
            .border(1.dp, colors.line, shape)
            .padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(
            imageVector = Icons.Filled.Search,
            contentDescription = "Search",
            size = 18.dp,
            tint = colors.textFaint,
        )
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f)) {
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onSearchChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = MahalluTheme.type.body.copy(color = colors.textPrimary),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(colors.accent),
                decorationBox = { inner ->
                    if (value.isEmpty()) {
                        AppText(
                            text = placeholder,
                            style = MahalluTheme.type.body,
                            color = colors.textFaint,
                            maxLines = 1,
                        )
                    }
                    inner()
                },
            )
        }
        if (value.isNotEmpty()) {
            IconButton(
                onClick = {
                    onSearchChange("")
                    onClear?.invoke()
                },
                size = 28.dp,
                icon = {
                    AppIcon(
                        imageVector = Icons.Filled.Clear,
                        contentDescription = "Clear search",
                        size = 16.dp,
                        tint = colors.textFaint,
                    )
                },
            )
        }
        if (trailing != null) {
            Spacer(Modifier.width(6.dp))
            trailing()
        }
    }
}

/**
 * Beautiful ScreenHeader with Drawer Menu icon and proper hierarchy.
 */
@Composable
fun ScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    back: (() -> Unit)? = null,
    isDrawer: Boolean = true,
) {
    val colors = MahalluTheme.colors
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (back != null) {
            IconButton(
                onClick = back,
                size = 40.dp,
                icon = {
                    AppIcon(
                        imageVector = if (isDrawer) Icons.Filled.Menu else Icons.Filled.ArrowBack,
                        contentDescription = if (isDrawer) "Open menu" else "Back",
                        size = 22.dp,
                        tint = colors.textPrimary,
                    )
                },
            )
            Spacer(Modifier.width(10.dp))
        }
        Column(Modifier.weight(1f)) {
            if (eyebrow != null) {
                Eyebrow(eyebrow, color = colors.accent)
                Spacer(Modifier.height(2.dp))
            }
            AppText(
                text = title,
                style = MahalluTheme.type.headline,
                color = colors.textPrimary,
                maxLines = 1,
            )
            if (subtitle != null) {
                Spacer(Modifier.height(2.dp))
                AppText(
                    text = subtitle,
                    style = MahalluTheme.type.caption,
                    color = colors.textSecondary,
                    maxLines = 1,
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(10.dp))
            trailing()
        }
    }
}

/**
 * Dashboard & module shortcut card.
 */
@Composable
fun ModuleTile(
    item: NavItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    malayalam: Boolean = false,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed)
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier
            .scale(scale)
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.line, shape)
            .pressHighlight(press, shape, colors.tint(item.tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconPlate(tint = item.tint, size = 36.dp) {
                AppText(
                    text = item.glyph,
                    style = MahalluTheme.type.bodyStrong,
                    color = colors.tint(item.tint),
                )
            }
            if (item.badge > 0) {
                Pill(text = "${item.badge} pending", color = colors.warning)
            }
        }
        Spacer(Modifier.height(14.dp))
        AppText(
            text = if (malayalam) item.titleMl else item.title,
            style = MahalluTheme.type.bodyStrong,
            color = colors.textPrimary,
            maxLines = 1,
        )
        AppText(
            text = item.route.replaceFirstChar { it.uppercase() },
            style = MahalluTheme.type.micro,
            color = colors.textFaint,
            maxLines = 1,
        )
    }
}

data class NavItem(
    val route: String,
    val title: String,
    val titleMl: String,
    val tint: ModuleTint,
    val glyph: String,
    val badge: Int = 0,
)
