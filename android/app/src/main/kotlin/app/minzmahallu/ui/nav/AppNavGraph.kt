package app.minzmahallu.ui.nav

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.minzmahallu.MainIntent
import app.minzmahallu.MainUiState
import app.minzmahallu.core.common.AuthRoutes
import app.minzmahallu.core.common.Route
import app.minzmahallu.ui.screen.AccountingScreen
import app.minzmahallu.ui.screen.AnimatedSplashScreen
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
 * Route graph.
 *
 * One destination per screen. Every module route maps to the same name the
 * Electron app uses so that deep links, exports and shared knowledge between
 * the desktop and Android versions stay identical.
 */
@Composable
fun AppNavGraph(
    navController: NavHostController,
    state: MainUiState,
    onIntent: (MainIntent) -> Unit,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var splashDismissed by remember { mutableStateOf(false) }

    if (!splashDismissed) {
        AnimatedSplashScreen(
            onDismiss = { splashDismissed = true },
        )
        return
    }

    val signedIn = state.signedIn
    val needsSetup = state.needsSetup

    LaunchedEffect(signedIn, needsSetup) {
        val current = navController.currentDestination?.route
        val target = when {
            signedIn -> Route.Dashboard.path
            needsSetup -> AuthRoutes.SETUP
            else -> AuthRoutes.LOGIN
        }
        if (current != target && current != null) {
            navController.navigate(target) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = when {
            signedIn -> Route.Dashboard.path
            needsSetup -> AuthRoutes.SETUP
            else -> AuthRoutes.LOGIN
        },
        modifier = modifier,
        enterTransition = { slideInHorizontally(tween(260)) { it / 4 } + fadeIn(tween(260)) },
        exitTransition = { fadeOut(tween(160)) },
        popEnterTransition = { fadeIn(tween(200)) },
        popExitTransition = { slideOutHorizontally(tween(240)) { it / 4 } + fadeOut(tween(200)) },
    ) {
        composable(AuthRoutes.LOGIN) {
            LoginScreen(
                onSignedIn = { onIntent(MainIntent.ShowToast("Welcome back")) },
                onNavigateSetup = { navController.navigate(AuthRoutes.SETUP) },
            )
        }
        composable(AuthRoutes.SETUP) {
            SetupScreen(
                onComplete = { onIntent(MainIntent.ShowToast("Administrator created")) },
                onBackToLogin = { navController.navigate(AuthRoutes.LOGIN) },
            )
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
            val familyId = entry.arguments?.getLong("familyId") ?: 0L
            FamilyDetailScreen(
                familyId = familyId,
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
            val memberId = entry.arguments?.getLong("memberId") ?: 0L
            MemberDetailScreen(
                memberId = memberId,
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
