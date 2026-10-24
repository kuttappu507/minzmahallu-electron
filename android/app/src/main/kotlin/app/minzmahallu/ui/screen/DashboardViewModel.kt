package app.minzmahallu.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.domain.dashboard.DashboardAlert
import app.minzmahallu.core.domain.dashboard.DashboardRepository
import app.minzmahallu.core.domain.dashboard.DashboardSummary
import app.minzmahallu.core.domain.dashboard.IncomeExpensePoint
import app.minzmahallu.core.domain.dashboard.MonthPoint
import app.minzmahallu.core.domain.dashboard.TodayGlance
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.i18n.Language
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val loading: Boolean = true,
    val greeting: String = "Good day",
    val mahalluName: String = "",
    val malayalam: Boolean = false,
    val balance: Double = 0.0,
    val summary: DashboardSummary = DashboardSummary(0, 0, 0.0, 0.0, 0.0, 0, 0, 0),
    val glance: TodayGlance = TodayGlance(0, 0.0, 0, 0.0),
    val collections: List<MonthPoint> = emptyList(),
    val incomeExpense: List<IncomeExpensePoint> = emptyList(),
    val alerts: List<DashboardAlert> = emptyList(),
    val recent: List<AuditEntry> = emptyList(),
)

/**
 * The dashboard's data.
 *
 * The six queries are independent, so they run concurrently — on a phone the
 * difference between serial and parallel here is the difference between a
 * screen that takes 400 ms and one that takes 120 ms.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val dashboard: DashboardRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val prefs = sessions.state.first()
            _state.update {
                it.copy(
                    greeting = greetingFor(IstDate.greetingKey()),
                    mahalluName = prefs.displayName,
                    malayalam = prefs.language == Language.Malayalam,
                )
            }
            runCatching {
                coroutineScopeAll()
            }.onSuccess {
                _state.update { current -> current.copy(loading = false) }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }

    private suspend fun coroutineScopeAll() = kotlinx.coroutines.coroutineScope {
        val balance = async { dashboard.balance() }
        val summary = async { dashboard.summary() }
        val glance = async { dashboard.todayAtGlance() }
        val collections = async { dashboard.monthlyCollections(12) }
        val incomeExpense = async { dashboard.incomeVsExpense(6) }
        val alerts = async { dashboard.alerts() }
        val recent = async { dashboard.recentActivity(8) }

        _state.update {
            it.copy(
                balance = balance.await(),
                summary = summary.await(),
                glance = glance.await(),
                collections = collections.await(),
                incomeExpense = incomeExpense.await(),
                alerts = alerts.await(),
                recent = recent.await(),
                loading = false,
            )
        }
    }

    private fun greetingFor(key: app.minzmahallu.core.common.Greeting): String = when (key) {
        app.minzmahallu.core.common.Greeting.MORNING -> "Good morning"
        app.minzmahallu.core.common.Greeting.AFTERNOON -> "Good afternoon"
        app.minzmahallu.core.common.Greeting.EVENING -> "Good evening"
        app.minzmahallu.core.common.Greeting.NIGHT -> "Good night"
    }
}
