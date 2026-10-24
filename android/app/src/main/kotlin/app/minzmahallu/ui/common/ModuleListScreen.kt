package app.minzmahallu.ui.common

import androidx.compose.animation.core.animateFloatAsState
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.alpha
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.component.FloatingActionButton
import app.minzmahallu.core.ui.component.FilterChip
import app.minzmahallu.core.ui.component.IconButton
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.EmptyState
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SearchBar
import app.minzmahallu.core.ui.component.statusColor
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CodeText
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes

/**
 * The list screen every module shares.
 *
 * The desktop renders a `DataTable` with a debounced search box, a row of
 * status filters, a pager and an "add" button. On a phone the same screen is a
 * sticky header, a search field, horizontally scrolling filter chips, and a
 * lazy column of cards — one implementation, used by Families, Members, Staff,
 * Donations, Accounting, Assets, Welfare, Certificates and the registers.
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
            // The header sits on a translucent band so content scrolls under it
            // without the text ever colliding with a card.
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(colors.canvas.copy(alpha = 0.92f))
                    .statusBarsPadding()
                    .padding(horizontal = Gutters.screen, vertical = 12.dp),
            ) {
                ScreenHeader(
                    title = title,
                    eyebrow = eyebrow,
                    subtitle = subtitle,
                    back = onOpenDrawer,
                    trailing = trailing,
                )
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SearchBar(
                        value = search,
                        onValueChange = onSearchChange,
                        onClear = { onSearchChange("") },
                        modifier = Modifier.weight(1f),
                    )
                    if (onRefresh != null) {
                        Spacer(Modifier.width(8.dp))
                        IconButton(
                            onClick = onRefresh,
                            size = 42.dp,
                            icon = {
                                AppText(
                                    text = "refresh",
                                    style = MahalluTheme.type.micro,
                                    color = colors.textFaint,
                                )
                            },
                        )
                    }
                }
                if (filters.isNotEmpty() && onFilterChange != null) {
                    Spacer(Modifier.height(12.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        itemsIndexed(filters) { _, filter ->
                            FilterChip(
                                text = filter,
                                selected = filter == (activeFilter ?: filters.first()),
                                onClick = {
                                    onFilterChange(
                                        if (filter == activeFilter) null else filter,
                                    )
                                },
                            )
                        }
                    }
                }
            }

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
                        // Room for the FAB so the last card is never covered.
                        bottom = if (canCreate) 96.dp else 24.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(items, key = { index, _ -> index }) { index, item ->
                        StaggeredIn(index = index) { row(item, index) }
                    }
                }
            }
        }

        if (canCreate && onCreate != null) {
            FloatingActionButton(
                onClick = onCreate,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = 28.dp),
                icon = {
                    AppText(
                        text = "add",
                        style = MahalluTheme.type.title,
                        color = MahalluTheme.colors.onAccent,
                    )
                },
                expandedLabel = createLabel,
            )
        }
    }
}

/**
 * Entry animation for a list row: each item rises and fades in a little after
 * the one above it, which is the single change that makes a long list feel
 * composed rather than dumped.
 */
@Composable
fun StaggeredIn(index: Int, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // Only the first screenful staggers; beyond that the delay would make
        // scrolling feel sluggish rather than composed.
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
 * A list row: a title, a subtitle line, a status pill and an optional amount.
 * Every register in the app is a variation on this.
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

/** A label/value line, used across every detail screen. */
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

/** The section title inside a detail screen. */
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
