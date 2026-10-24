package app.minzmahallu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.minzmahallu.core.ui.component.ToastStack
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ThemeMode
import app.minzmahallu.i18n.LocalStrings
import app.minzmahallu.core.ui.theme.LocalMalayalam
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.nav.AppNavGraph
import app.minzmahallu.ui.shell.DrawerHeader
import app.minzmahallu.ui.shell.ModuleDrawer
import app.minzmahallu.ui.shell.Navigation
import dagger.hilt.android.AndroidEntryPoint

/**
 * The single activity.
 *
 * One activity, one Compose tree, edge-to-edge behind translucent system bars —
 * the aurora background is meant to run under the status bar, which is the
 * cheapest way to make the app feel like it fills the device rather than
 * sitting in a letterbox.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Draw under both bars; the palette below is re-applied on theme change.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
            navigationBarStyle = SystemBarStyle.auto(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
        )
        super.onCreate(savedInstanceState)

        setContent {
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            val mode = when {
                state.session.followSystemTheme -> ThemeMode.System
                state.session.darkTheme -> ThemeMode.Dark
                else -> ThemeMode.Light
            }

            MahalluTheme(mode = mode, motionScale = state.session.motionScale) {
                val malayalam = state.session.language == app.minzmahallu.i18n.Language.Malayalam
                androidx.compose.runtime.CompositionLocalProvider(
                    LocalStrings provides state.session.strings,
                    LocalMalayalam provides malayalam,
                ) {
                    AppRoot(state = state, events = viewModel::onIntent)
                }
            }
        }
    }
}

/** The whole app, below the theme. */
@Composable
private fun AppRoot(
    state: MainUiState,
    events: (MainIntent) -> Unit,
) {
    val colors = app.minzmahallu.core.ui.theme.MahalluTheme.colors
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val drawerState = rememberDrawerState()

    Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxSize()) {
            // The drawer is a permanent rail on tablets and landscape, and a
            // sliding panel on a phone in portrait.
            if (state.showDrawerAsRail) {
                Column(Modifier.width(280.dp).fillMaxSize()) {
                    DrawerHeader(
                        mahalluName = state.session.displayName,
                        operatorName = state.session.actor?.fullName.orEmpty(),
                        role = state.session.actor?.role?.wire.orEmpty(),
                        onSignOut = { events(MainIntent.SignOut) },
                    )
                    ModuleDrawer(
                        currentRoute = currentRoute,
                        pendingApprovals = state.pendingApprovals,
                        malayalam = state.session.language == app.minzmahallu.i18n.Language.Malayalam,
                        onNavigate = { route ->
                            events(MainIntent.Navigate(route))
                            navController.navigate(route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Column(Modifier.weight(1f).fillMaxSize()) {
                AppNavGraph(
                    navController = navController,
                    state = state,
                    onIntent = events,
                    onOpenDrawer = { drawerState.open() },
                    modifier = Modifier.weight(1f),
                )

                // Toasts sit above the content and above the navigation bar,
                // which is where the desktop puts them (bottom-right).
                Box(
                    Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    ToastStack(
                        toasts = state.toasts,
                        onDismiss = { id -> events(MainIntent.DismissToast(id)) },
                    )
                }
            }
        }

        // The phone drawer slides over the content.
        androidx.compose.animation.AnimatedVisibility(
            visible = drawerState.isOpen,
            enter = androidx.compose.animation.fadeIn() +
                androidx.compose.animation.slideInHorizontally { -it / 3 },
            exit = androidx.compose.animation.fadeOut() +
                androidx.compose.animation.slideOutHorizontally { -it / 3 },
        ) {
            Row(Modifier.fillMaxSize()) {
                Column(
                    Modifier
                        .width(292.dp)
                        .fillMaxSize()
                        .navigationBarsPadding(),
                ) {
                    DrawerHeader(
                        mahalluName = state.session.displayName,
                        operatorName = state.session.actor?.fullName.orEmpty(),
                        role = state.session.actor?.role?.wire.orEmpty(),
                        onSignOut = {
                            drawerState.close()
                            events(MainIntent.SignOut)
                        },
                    )
                    ModuleDrawer(
                        currentRoute = currentRoute,
                        pendingApprovals = state.pendingApprovals,
                        malayalam = state.session.language == app.minzmahallu.i18n.Language.Malayalam,
                        onNavigate = { route ->
                            drawerState.close()
                            navController.navigate(route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .background(colors.scrim)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { drawerState.close() },
                )
            }
        }
    }
}

/**
 * Drawer visibility. Kept as a tiny observable rather than a library so the
 * rail/panel switch is explicit in [AppRoot].
 */
@Composable
private fun rememberDrawerState(): DrawerState = remember { DrawerState() }

class DrawerState {
    var isOpen: Boolean by mutableStateOf(false)
        private set

    fun open() {
        isOpen = true
    }

    fun close() {
        isOpen = false
    }
}
