package app.minzmahallu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.domain.approvals.ApprovalsRepository
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.session.SessionController
import app.minzmahallu.core.ui.component.ToastTone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Everything the shell needs, whatever screen is on top. */
data class MainUiState(
    val session: SessionController.State = SessionController.State(),
    val pendingApprovals: Int = 0,
    val toasts: List<app.minzmahallu.core.ui.component.Toast> = emptyList(),
    /** Tablets and landscape keep the drawer open as a permanent rail. */
    val showDrawerAsRail: Boolean = false,
    val signedIn: Boolean = false,
)

/** Intents the shell handles — navigation, sign-out, toasts. */
sealed interface MainIntent {
    data object SignOut : MainIntent
    data class Navigate(val route: String) : MainIntent
    data class DismissToast(val id: Long) : MainIntent
    data class ShowToast(val message: String, val detail: String? = null, val tone: ToastTone = ToastTone.Info) : MainIntent
    data class SetRail(val enabled: Boolean) : MainIntent
}

/**
 * The shell's view model.
 *
 * It owns only cross-cutting state — the session, the approval badge and the
 * toast queue. Each screen has its own view model; keeping them separate is
 * what lets a screen hold a 2 000-row list without the shell recomposing.
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val sessions: SessionController,
    private val auth: AuthRepository,
    private val approvals: ApprovalsRepository,
) : ViewModel() {

    private val rail = MutableStateFlow(false)
    private val toasts = MutableStateFlow<List<app.minzmahallu.core.ui.component.Toast>>(emptyList())

    private val pending = MutableStateFlow(0)

    val uiState: StateFlow<MainUiState> =
        combine(sessions.state, pending, rail, toasts) { session, count, isRail, queue ->
            MainUiState(
                session = session,
                pendingApprovals = count,
                toasts = queue,
                showDrawerAsRail = isRail,
                signedIn = session.actor != null,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = MainUiState(),
        )

    init {
        // The badge drives the Approvals tile and the drawer, so it is polled
        // rather than read once: another operator can post a pending entry at
        // any moment on the shared database.
        viewModelScope.launch {
            while (true) {
                runCatching { approvals.pendingCount() }
                    .onSuccess { pending.value = it }
                    // A locked or closed database must not stop the app opening.
                    .onFailure { }
                delay(20_000)
            }
        }
    }

    /** Called after any write that could create or clear a pending entry. */
    fun refreshPendingCount() {
        viewModelScope.launch {
            runCatching { approvals.pendingCount() }.onSuccess { pending.value = it }
        }
    }

    fun onIntent(intent: MainIntent) {
        when (intent) {
            is MainIntent.SignOut -> viewModelScope.launch {
                runCatching { auth.current?.let { /* session row is closed by the repo */ } }
                sessions.end()
            }

            is MainIntent.Navigate -> Unit // the NavHost performs the navigation

            is MainIntent.DismissToast ->
                toasts.value = toasts.value.filterNot { it.id == intent.id }

            is MainIntent.ShowToast -> {
                val toast = app.minzmahallu.core.ui.component.Toast(
                    message = intent.message,
                    detail = intent.detail,
                    tone = intent.tone,
                )
                toasts.value = (toasts.value + toast).takeLast(3)
                viewModelScope.launch {
                    delay(4_000)
                    toasts.value = toasts.value.filterNot { it.id == toast.id }
                }
            }

            is MainIntent.SetRail -> rail.value = intent.enabled
        }
    }
}
