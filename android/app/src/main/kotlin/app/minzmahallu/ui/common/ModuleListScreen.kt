package app.minzmahallu.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.component.EmptyState
import app.minzmahallu.core.ui.component.FilterChip
import app.minzmahallu.core.ui.component.FloatingActionButton
import app.minzmahallu.core.ui.component.IconButton
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SearchBar
import app.minzmahallu.core.ui.component.statusColor
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CodeText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes
import kotlinx.coroutines.delay

/**
 * Universal list template with fluid UX:
 * - Search and category chips pinned cleanly
 * - Vector FAB for addition with fluid expand
 * - Staggered entrance animations
 * - Full signature backwards-compatibility with all existing screens
 */
@Composable
fun <T : Any> ModuleListScreen(
    title: String,
    subtitle: String?,
    items: List<T>,
    loading: Boolean,
    search: String,
    onSearchChange: (String) -> Unit,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    filters: List<String> = emptyList(),
    activeFilter: String? = null,
    onFilterChange: ((String?) -> Unit)? = null,
    canCreate: Boolean = false,
    onCreate: (() -> Unit)? = null,
    createLabel: String = "New",
    trailing: (@Composable () -> Unit)? = null,
    emptyTitle: String = "Nothing here yet",
    emptyBody: String = "Records you add will appear here.",
    onRefresh: (() -> Unit)? = null,
    row: @Composable (T, Int) -> Unit,
) {
    val colors = MahalluTheme.colors
    val listState = rememberLazyListState()

    Box(modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Sticky top header + search
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(colors.canvas)
                    .statusBarsPadding()
                    .padding(horizontal = Gutters.screen, vertical = 8.dp),
            ) {
                ScreenHeader(
                    title = title,
                    eyebrow = eyebrow,
                    subtitle = subtitle,
                    trailing = trailing,
                    back = onOpenDrawer,
                    isDrawer = true,
                )

                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) {
                        SearchBar(
                            value = search,
                            onSearchChange = onSearchChange,
                            placeholder = "Search $title…",
                            onClear = { onSearchChange("") },
                        )
                    }
                    if (onRefresh != null) {
                        Spacer(Modifier.width(8.dp))
                        IconButton(
                            onClick = onRefresh,
                            size = 40.dp,
                            icon = {
                                AppIcon(
                                    imageVector = Icons.Filled.Refresh,
                                    contentDescription = "Refresh",
                                    size = 20.dp,
                                    tint = colors.textSecondary,
                                )
                            },
                        )
                    }
                }

                if (filters.isNotEmpty() && onFilterChange != null) {
                    Spacer(Modifier.height(10.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(end = 12.dp),
                    ) {
                        itemsIndexed(filters) { _, filter ->
                            FilterChip(
                                label = filter,
                                selected = filter == (activeFilter ?: filters.first()),
                                onClick = {
                                    onFilterChange(if (filter == activeFilter) null else filter)
                                },
                            )
                        }
                    }
                }
            }

            // Body list or loading
            when {
                loading -> ListSkeleton(rows = 6, modifier = Modifier.padding(Gutters.screen))

                items.isEmpty() -> EmptyState(
                    headline = emptyTitle,
                    detail = emptyBody,
                    modifier = Modifier.fillMaxSize(),
                )

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = Gutters.screen,
                        end = Gutters.screen,
                        top = 8.dp,
                        bottom = if (canCreate) 96.dp else 24.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    itemsIndexed(items, key = { index, _ -> index }) { index, item ->
                        StaggeredIn(index = index) { row(item, index) }
                    }
                }
            }
        }

        // Floating Action Button
        if (canCreate && onCreate != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = 24.dp),
            ) {
                FloatingActionButton(
                    onClick = onCreate,
                    icon = {
                        AppIcon(
                            imageVector = Icons.Filled.Add,
                            contentDescription = createLabel,
                            size = 24.dp,
                            tint = colors.onAccent,
                        )
                    },
                    expandedLabel = createLabel,
                    expanded = !listState.isScrollInProgress,
                )
            }
        }
    }
}

/**
 * Entry animation for a list row: each item rises and fades in a little after
 * the one above it.
 */
@Composable
fun StaggeredIn(index: Int, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(Motion.stagger(index.coerceAtMost(11), 34).toLong())
        visible = true
    }
    val offset by animateDpAsState(
        targetValue = if (visible) 0.dp else 14.dp,
        animationSpec = Motion.emphasizedIn(420),
        label = "row-rise",
    )
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = Motion.emphasized(360),
        label = "row-fade",
    )
    Box(Modifier.offset(y = offset).alpha(alpha)) { content() }
}

/**
 * Rich card row used across all module registers: title, subtitle, status pill, amount.
 */
@Composable
fun RecordRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    code: String? = null,
    status: String? = null,
    amount: Double? = null,
    amountLabel: String? = null,
    amountColor: androidx.compose.ui.graphics.Color? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    dimmed: Boolean = false,
) {
    val colors = MahalluTheme.colors
    app.minzmahallu.core.ui.component.Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(Shapes.md),
        onClick = onClick,
        contentPadding = PaddingValues(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) {
                leading()
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                AppText(
                    text = title,
                    style = MahalluTheme.type.bodyStrong,
                    color = if (dimmed) colors.textFaint else colors.textPrimary,
                    maxLines = 1,
                )
                if (code != null) {
                    Spacer(Modifier.height(2.dp))
                    CodeText(text = code)
                }
                if (subtitle != null) {
                    Spacer(Modifier.height(3.dp))
                    AppText(
                        text = subtitle,
                        style = MahalluTheme.type.caption,
                        color = colors.textSecondary,
                        maxLines = 2,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                if (amount != null) {
                    Amount(
                        value = amount,
                        style = MahalluTheme.type.amountSmall,
                        color = amountColor ?: colors.textPrimary,
                    )
                    if (amountLabel != null) {
                        AppText(
                            text = amountLabel,
                            style = MahalluTheme.type.micro,
                            color = colors.textFaint,
                            maxLines = 1,
                        )
                    }
                }
                if (status != null) {
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = status,
                        style = MahalluTheme.type.micro,
                        color = statusColor(status),
                        maxLines = 1,
                    )
                }
                if (trailing != null) trailing()
            }
        }
    }
}

/** DetailRow: key-value line used across every detail screen. */
@Composable
fun DetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    emphasise: Boolean = false,
) {
    val colors = MahalluTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .padding(vertical = 9.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Eyebrow(text = label, modifier = Modifier.width(120.dp))
        Spacer(Modifier.width(12.dp))
        AppText(
            text = value.ifBlank { "—" },
            style = if (emphasise) MahalluTheme.type.bodyStrong else MahalluTheme.type.body,
            color = colors.textPrimary,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Section title inside a detail screen. */
@Composable
fun SectionTitle(
    text: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier
            .fillMaxWidth()
            .padding(top = 8.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Eyebrow(text = text, modifier = Modifier.weight(1f))
        if (trailing != null) trailing()
    }
}
