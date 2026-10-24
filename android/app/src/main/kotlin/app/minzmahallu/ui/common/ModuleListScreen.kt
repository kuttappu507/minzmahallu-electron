package app.minzmahallu.ui.common

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.component.EmptyState
import app.minzmahallu.core.ui.component.FilterChip
import app.minzmahallu.core.ui.component.FloatingActionButton
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SearchBar
import app.minzmahallu.core.ui.foundation.AppIcon
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme

/**
 * Universal list template with fluid UX:
 * - Search and category chips pinned cleanly
 * - Vector FAB for addition with fluid expand
 * - Clean elevation, spacing and empty state
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
    error: String? = null,
    itemKey: ((T) -> Any)? = null,
    emptyMessage: String = "No records found",
    emptySubtext: String = "Tap the plus button below to create the first record.",
    rowContent: @Composable (T) -> Unit,
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
                SearchBar(
                    value = search,
                    onSearchChange = onSearchChange,
                    placeholder = "Search $title…",
                )

                if (filters.isNotEmpty() && onFilterChange != null) {
                    Spacer(Modifier.height(10.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(end = 12.dp),
                    ) {
                        item {
                            FilterChip(
                                label = "All",
                                selected = activeFilter == null,
                                onClick = { onFilterChange(null) },
                            )
                        }
                        items(filters.size) { index ->
                            val filter = filters[index]
                            FilterChip(
                                label = filter,
                                selected = activeFilter == filter,
                                onClick = { onFilterChange(filter) },
                            )
                        }
                    }
                }
            }

            // Body list or loading
            if (loading) {
                Column(Modifier.padding(horizontal = Gutters.screen, vertical = 12.dp)) {
                    ListSkeleton(rows = 6)
                }
            } else if (items.isEmpty()) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(Gutters.screen),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        title = emptyMessage,
                        subtitle = emptySubtext,
                        actionLabel = if (canCreate) createLabel else null,
                        onAction = onCreate,
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    contentPadding = PaddingValues(
                        start = Gutters.screen,
                        end = Gutters.screen,
                        top = 8.dp,
                        bottom = 96.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    itemsIndexed(
                        items = items,
                        key = if (itemKey != null) { _, item -> itemKey(item) } else null,
                    ) { _, item ->
                        rowContent(item)
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
