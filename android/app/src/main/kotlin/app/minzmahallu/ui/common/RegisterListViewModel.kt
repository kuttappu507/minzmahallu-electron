package app.minzmahallu.ui.common

import androidx.lifecycle.ViewModel
import app.minzmahallu.i18n.localizedError
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.session.SessionController
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The behaviour every list module shares.
 *
 * `src/hooks/useList.ts` does four things: hold the rows, debounce the search
 * by 350 ms, drop the "All" filter, and expose a `refetch`. Rather than
 * re-implementing that in fourteen view models — and getting one of them
 * subtly different — the modules share this base and supply only their query.
 */
abstract class RegisterListViewModel<Row : Any>(
    private val sessions: SessionController,
    private val module: RoleAccess.Module,
    private val filters: List<String>,
    private val pageSize: Int = 50,
) : ViewModel() {

    data class ListState<Row>(
        val rows: List<Row> = emptyList(),
        val total: Int = 0,
        val loading: Boolean = true,
        val search: String = "",
        val filter: String = "All",
        val canWrite: Boolean = false,
        val busy: Boolean = false,
        val error: String? = null,
        val notice: String? = null,
    )

    private val _state = MutableStateFlow(ListState<Row>(filter = filters.first()))
    val listState: StateFlow<ListState<Row>> = _state.asStateFlow()

    private var searchJob: Job? = null

    /** The module's own query. Called on the view model's scope. */
    protected abstract suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<Row>

    /** An extra narrowing pass for filters the SQL cannot express. */
    protected open fun narrow(rows: List<Row>, filter: String): List<Row> = rows

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(canWrite = role != null && RoleAccess.canWrite(role, module))
            }
        }
        refresh()
    }

    fun onSearch(value: String) {
        _state.update { it.copy(search = value) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            load()
        }
    }

    fun onFilter(value: String?) {
        _state.update { it.copy(filter = value ?: filters.first()) }
        load()
    }

    fun refresh() = load()

    protected fun patch(transform: ListState<Row>.() -> ListState<Row>) =
        _state.update(transform)

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                query(
                    search = snapshot.search.trim().ifBlank { null },
                    // The desktop drops `familyId === "All"` before querying;
                    // same idea here for the status filter.
                    filter = snapshot.filter.takeIf { it != filters.first() },
                    page = 1,
                    pageSize = pageSize,
                )
            }.onSuccess { page ->
                val rows = snapshot.filter.let { narrow(page.rows, it) }
                _state.update {
                    it.copy(
                        rows = rows,
                        total = if (rows.size == page.rows.size) page.total else rows.size,
                        loading = false,
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(loading = false, error = localizedError(error).takeIf(String::isNotBlank))
                }
            }
        }
    }
}
