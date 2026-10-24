package app.minzmahallu.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.family.FamilyInput
import app.minzmahallu.core.domain.family.FamilyRepository
import app.minzmahallu.core.model.FamilyWithStats
import app.minzmahallu.session.SessionController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The editor's working copy of a family. */
data class FamilyDraft(
    val id: Long? = null,
    val houseName: String = "",
    val houseNumber: String = "",
    val ward: String = "",
    val area: String = "",
    val address: String = "",
    val pincode: String = "",
    val phone: String = "",
    val altPhone: String = "",
    val notes: String = "",
    val whatsappPhone: String = "",
    val whatsappEnabled: Boolean = true,
)

data class SecurePrompt(val title: String, val reason: String, val onVerified: (String) -> Unit)

data class ConfirmPrompt(
    val title: String,
    val message: String,
    val label: String = "Confirm",
    val destructive: Boolean = false,
    val action: () -> Unit,
)

data class FamiliesUiState(
    val rows: List<FamilyWithStats> = emptyList(),
    val total: Int = 0,
    val loading: Boolean = true,
    val search: String = "",
    val statusFilter: String = "All",
    val canWrite: Boolean = false,
    val editorOpen: Boolean = false,
    val editingNumber: String? = null,
    val draft: FamilyDraft = FamilyDraft(),
    val busy: Boolean = false,
    val error: String? = null,
    val secureAction: SecurePrompt? = null,
    val secureError: String? = null,
    val confirm: ConfirmPrompt? = null,
)

/**
 * Families.
 *
 * Search is debounced by 350 ms, exactly like `src/hooks/useList.ts`, so
 * typing through a 4 000-household register does not fire a query per
 * keystroke.
 */
@HiltViewModel
class FamiliesViewModel @Inject constructor(
    private val families: FamilyRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(FamiliesUiState())
    val state: StateFlow<FamiliesUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(canWrite = role != null && RoleAccess.canWrite(role, RoleAccess.Module.Families))
            }
        }
        load()
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
        _state.update { it.copy(statusFilter = value ?: "All") }
        load()
    }

    fun refresh() = load()

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                families.page(
                    search = snapshot.search,
                    status = snapshot.statusFilter.takeIf { it != "All" },
                    page = 1,
                    pageSize = 50,
                    includePending = false,
                )
            }.onSuccess { page ->
                _state.update {
                    it.copy(rows = page.rows, total = page.total, loading = false)
                }
            }.onFailure {
                _state.update { it.copy(loading = false) }
            }
        }
    }

    fun openCreate() {
        _state.update {
            it.copy(editorOpen = true, draft = FamilyDraft(), editingNumber = null, error = null)
        }
    }

    fun openEdit(row: FamilyWithStats) {
        val f = row.family
        _state.update {
            it.copy(
                editorOpen = true,
                editingNumber = f.familyNumber,
                error = null,
                draft = FamilyDraft(
                    id = f.id,
                    houseName = f.houseName.orEmpty(),
                    houseNumber = f.houseNumber.orEmpty(),
                    ward = f.ward.orEmpty(),
                    area = f.area.orEmpty(),
                    address = f.address.orEmpty(),
                    pincode = f.pincode.orEmpty(),
                    phone = f.phone.orEmpty(),
                    altPhone = f.alternativePhone.orEmpty(),
                    notes = f.notes.orEmpty(),
                    whatsappPhone = f.whatsappPhone.orEmpty(),
                    whatsappEnabled = f.whatsappEnabled == 1,
                ),
            )
        }
    }

    fun closeEditor() = _state.update { it.copy(editorOpen = false, error = null) }

    fun onDraft(transform: FamilyDraft.() -> FamilyDraft) {
        _state.update { it.copy(draft = transform(it.draft), error = null) }
    }

    fun save() {
        val draft = _state.value.draft
        if (draft.houseName.isBlank()) {
            _state.update { it.copy(error = "House name is required") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = FamilyInput(
                houseName = draft.houseName.trim(),
                houseNumber = draft.houseNumber.trim(),
                ward = draft.ward.trim(),
                area = draft.area.trim(),
                address = draft.address.trim(),
                pincode = draft.pincode.trim(),
                phone = draft.phone.trim(),
                altPhone = draft.altPhone.trim(),
                notes = draft.notes.trim(),
                whatsappPhone = draft.whatsappPhone.trim(),
                whatsappEnabled = draft.whatsappEnabled,
            )
            runCatching {
                if (draft.id == null) families.create(input) else families.update(draft.id, input)
            }.onSuccess {
                _state.update { it.copy(busy = false, editorOpen = false) }
                load()
            }.onFailure { error ->
                _state.update { it.copy(busy = false, error = error.message.orEmpty()) }
            }
        }
    }

    /** Archiving a family is destructive, so it needs the admin password. */
    fun archive(row: FamilyWithStats) {
        _state.update {
            it.copy(
                secureAction = SecurePrompt(
                    title = "Archive ${row.family.houseName.orEmpty()}",
                    reason = "The family and its members stop appearing in active lists and " +
                        "no new subscriptions can be raised against it. Enter the " +
                        "administrator password to continue.",
                    onVerified = { password ->
                        _state.update { current -> current.copy(busy = true, secureError = null) }
                        viewModelScope.launch {
                            runCatching {
                                families.archive(row.family.id, "Archived from the app", password)
                            }.onSuccess {
                                _state.update { c -> c.copy(busy = false, secureAction = null) }
                                load()
                            }.onFailure { error ->
                                _state.update { c ->
                                    c.copy(busy = false, secureError = error.message.orEmpty())
                                }
                            }
                        }
                    },
                ),
            )
        }
    }

    fun cancelSecure() = _state.update { it.copy(secureAction = null, secureError = null, busy = false) }

    fun confirmSecure(password: String) {
        _state.value.secureAction?.onVerified?.invoke(password)
    }

    fun askConfirm(prompt: ConfirmPrompt) = _state.update { it.copy(confirm = prompt) }

    fun cancelConfirm() = _state.update { it.copy(confirm = null) }

    fun runConfirm() {
        val action = _state.value.confirm?.action
        _state.update { it.copy(confirm = null) }
        action?.invoke()
    }
}
