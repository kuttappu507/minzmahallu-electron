package app.minzmahallu.ui.nav

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.minzmahallu.core.common.AuthRoutes
import app.minzmahallu.MainIntent
import app.minzmahallu.MainUiState
import app.minzmahallu.core.common.Route
import app.minzmahallu.ui.screen.AccountingScreen
import app.minzmahallu.ui.screen.ApprovalsScreen
import app.minzmahallu.ui.screen.AssetsScreen
import app.minzmahallu.ui.screen.AuditScreen
import app.minzmahallu.ui.screen.BackupScreen
import app.minzmahallu.ui.screen.CertificatesScreen
import app.minzmahallu.ui.screen.CommitteeScreen
import app.minzmahallu.ui.screen.DashboardScreen
import app.minzmahallu.ui.screen.DeathsScreen
import app.minzmahallu.ui.screen.DonationsScreen
import app.minzmahallu.ui.screen.FamiliesScreen
import app.minzmahallu.ui.screen.FamilyDetailScreen
import app.minzmahallu.ui.screen.LoginScreen
import app.minzmahallu.ui.screen.MarriagesScreen
import app.minzmahallu.ui.screen.MemberDetailScreen
import app.minzmahallu.ui.screen.MembersScreen
import app.minzmahallu.ui.screen.ReportsScreen
import app.minzmahallu.ui.screen.SettingsScreen
import app.minzmahallu.ui.screen.SetupScreen
import app.minzmahallu.ui.screen.StaffScreen
import app.minzmahallu.ui.screen.SubscriptionsScreen
import app.minzmahallu.ui.screen.TokenEventsScreen
import app.minzmahallu.ui.screen.TokensScreen
import app.minzmahallu.ui.screen.UsersScreen
import app.minzmahallu.ui.screen.WelfareScreen
import app.minzmahallu.ui.screen.WhatsAppScreen

/**
 * The navigation graph — 22 module routes plus the two auth screens, matching
 * `src/App.tsx` route for route.
 *
 * Transitions are directional: pushing a detail screen slides it in from the
 * right, popping slides it back out. That is the one cue a phone user needs to
 * know which way they are moving through the data, and it replaces the
 * desktop's sidebar-highlight feedback.
 */
@Composable
fun AppNavGraph(
    navController: NavHostController,
    state: MainUiState,
    onIntent: (MainIntent) -> Unit,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Unauthenticated users are pushed to login (or first-run setup); a
    // back-gesture from there would otherwise leave an empty shell on screen.
    val signedIn = state.signedIn
    LaunchedEffect(signedIn) {
        val current = navController.currentDestination?.route
        val onAuth = current == AuthRoutes.LOGIN || current == AuthRoutes.SETUP
        when {
            !signedIn && !onAuth -> navController.navigate(AuthRoutes.LOGIN) {
                popUpTo(0) { inclusive = true }
            }
            signedIn && onAuth -> navController.navigate(Route.Dashboard.path) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = if (signedIn) Route.Dashboard.path else AuthRoutes.LOGIN,
        modifier = modifier,
        enterTransition = { slideIn() },
        exitTransition = { fadeOut(tween(160)) },
        popEnterTransition = { fadeIn(tween(200)) },
        popExitTransition = { slideOut() },
    ) {
        composable(AuthRoutes.LOGIN) {
            LoginScreen(onSignedIn = { onIntent(MainIntent.ShowToast("Welcome back")) })
        }
        composable(AuthRoutes.SETUP) {
            SetupScreen(onComplete = { onIntent(MainIntent.ShowToast("Administrator created")) })
        }

        composable(Route.Dashboard.path) {
            DashboardScreen(
                onOpenDrawer = onOpenDrawer,
                onNavigate = { route -> navController.navigate(route) },
                onIntent = onIntent,
            )
        }

        composable(Route.Families.path) {
            FamiliesScreen(
                onOpenDrawer = onOpenDrawer,
                onOpenFamily = { id -> navController.navigate(Route.familyDetail(id)) },
                onIntent = onIntent,
            )
        }
        composable(
            route = Route.FamilyDetail.path,
            arguments = listOf(navArgument("familyId") { type = NavType.LongType }),
        ) { entry ->
            FamilyDetailScreen(
                familyId = entry.longArg("familyId"),
                onBack = { navController.popBackStack() },
                onOpenMember = { id -> navController.navigate(Route.memberDetail(id)) },
                onIntent = onIntent,
            )
        }

        composable(Route.Members.path) {
            MembersScreen(
                onOpenDrawer = onOpenDrawer,
                onOpenMember = { id -> navController.navigate(Route.memberDetail(id)) },
                onIntent = onIntent,
            )
        }
        composable(
            route = Route.MemberDetail.path,
            arguments = listOf(navArgument("memberId") { type = NavType.LongType }),
        ) { entry ->
            MemberDetailScreen(
                memberId = entry.longArg("memberId"),
                onBack = { navController.popBackStack() },
                onOpenFamily = { id -> navController.navigate(Route.familyDetail(id)) },
                onIntent = onIntent,
            )
        }

        composable(Route.Staff.path) {
            StaffScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Committee.path) {
            CommitteeScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Subscriptions.path) {
            SubscriptionsScreen(
                onOpenDrawer = onOpenDrawer,
                onOpenFamily = { id -> navController.navigate(Route.familyDetail(id)) },
                onIntent = onIntent,
            )
        }
        composable(Route.Donations.path) {
            DonationsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.WhatsApp.path) {
            WhatsAppScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Accounting.path) {
            AccountingScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Assets.path) {
            AssetsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Marriages.path) {
            MarriagesScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Deaths.path) {
            DeathsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Welfare.path) {
            WelfareScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Certificates.path) {
            CertificatesScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Tokens.path) {
            TokensScreen(
                onOpenDrawer = onOpenDrawer,
                onOpenEvents = { navController.navigate(Route.TokenEvents.path) },
                onIntent = onIntent,
            )
        }
        composable(Route.TokenEvents.path) {
            TokenEventsScreen(
                onBack = { navController.popBackStack() },
                onIntent = onIntent,
            )
        }
        composable(Route.Reports.path) {
            ReportsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Approvals.path) {
            ApprovalsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Settings.path) {
            SettingsScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Users.path) {
            UsersScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Audit.path) {
            AuditScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
        composable(Route.Backup.path) {
            BackupScreen(onOpenDrawer = onOpenDrawer, onIntent = onIntent)
        }
    }
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.slideIn() =
    slideInHorizontally(tween(320)) { it / 5 } + fadeIn(tween(260))

private fun AnimatedContentTransitionScope<NavBackStackEntry>.slideOut() =
    slideOutHorizontally(tween(260)) { it / 5 } + fadeOut(tween(200))

private fun NavBackStackEntry.longArg(key: String): Long =
    arguments?.getLong(key) ?: 0L
