package app.minzmahallu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import app.minzmahallu.core.ui.foundation.AppText
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import app.minzmahallu.ui.shell.ModernBottomBar
import app.minzmahallu.ui.shell.ModuleDrawer
import app.minzmahallu.ui.shell.ModuleMenuDialog
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

        // A previous run that died leaves its stack trace behind. Showing it is
        // the only way an operator without adb can report what actually broke.
        val crash = CrashLog.read(this)
        if (crash != null) {
            CrashLog.clear(this)
            setContent { CrashReportScreen(crash) }
            return
        }

        setContent {
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            val mode = when {
                state.session.followSystemTheme -> ThemeMode.System
                state.session.darkTheme -> ThemeMode.Dark
                else -> ThemeMode.Light
            }

            // View models localize outside composition, so the process-wide
            // language has to follow the session one.
            LaunchedEffect(state.session.language) {
                app.minzmahallu.i18n.Localizer.update(state.session.language)
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
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    AppNavGraph(
                        navController = navController,
                        state = state,
                        onIntent = events,
                        onOpenDrawer = { drawerState.open() },
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                // Show modern dock navigation bar on phones when user is authenticated
                if (!state.showDrawerAsRail && state.signedIn && currentRoute != "setup" && currentRoute != "login") {
                    ModernBottomBar(
                        currentRoute = currentRoute,
                        onNavigate = { route ->
                            events(MainIntent.Navigate(route))
                            navController.navigate(route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onOpenMenu = { drawerState.open() },
                        modifier = Modifier.navigationBarsPadding(),
                    )
                }

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

        // On phones, More menu opens as a native modal card popup dialog instead of an old side drawer
        if (!state.showDrawerAsRail) {
            ModuleMenuDialog(
                visible = drawerState.isOpen,
                onDismiss = { drawerState.close() },
                currentRoute = currentRoute,
                mahalluName = state.session.displayName,
                operatorName = state.session.actor?.fullName.orEmpty(),
                role = state.session.actor?.role?.wire.orEmpty(),
                pendingApprovals = state.pendingApprovals,
                malayalam = state.session.language == app.minzmahallu.i18n.Language.Malayalam,
                onNavigate = { route ->
                    drawerState.close()
                    events(MainIntent.Navigate(route))
                    navController.navigate(route) {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                onSignOut = {
                    drawerState.close()
                    events(MainIntent.SignOut)
                },
            )
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

/**
 * Shown instead of the app when the previous run crashed.
 *
 * Built on the same design system as the rest of the app rather than a system
 * dialog, because the whole point is that the operator can read and copy the
 * trace on the device itself — there is no adb on the office phone, and no
 * error reporting service this app talks to.
 */
@Composable
private fun CrashReportScreen(trace: String) {
    val colors = app.minzmahallu.core.ui.theme.MahalluTheme.colors
    val type = app.minzmahallu.core.ui.theme.MahalluTheme.type

    MahalluTheme(mode = ThemeMode.Light) {
        Column(
            Modifier
                .fillMaxSize()
                .background(colors.canvas)
                .statusBarsPadding()
                .padding(20.dp),
        ) {
            AppText(
                text = "The app stopped unexpectedly",
                style = type.headline,
                color = colors.danger,
            )
            Spacer(Modifier.height(6.dp))
            AppText(
                text = "The last run wrote this report. Screenshot it or copy it and send it " +
                    "to whoever maintains the app — it says exactly what failed.",
                style = type.body,
                color = colors.textSecondary,
            )
            Spacer(Modifier.height(16.dp))
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.surfaceSunken)
                    .padding(12.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                SelectionContainer {
                    AppText(
                        text = trace,
                        style = type.code,
                        color = colors.textPrimary,
                    )
                }
            }
        }
    }
}
