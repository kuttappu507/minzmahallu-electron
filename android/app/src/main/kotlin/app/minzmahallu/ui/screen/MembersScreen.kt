package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.ui.common.SectionTitle
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.ui.common.ModuleListScreen
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.member.MemberInput
import app.minzmahallu.core.domain.member.MemberRepository
import app.minzmahallu.core.model.MemberWithFamily
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

/** Members — a port of `src/pages/Members.tsx`. */
@Composable
fun MembersScreen(
    onOpenDrawer: () -> Unit,
    onOpenMember: (Long) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: MembersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Members",
        subtitle = "${state.total} member(s)",
        eyebrow = "people",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Active", "Male", "Female", "Deceased", "Archived"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = { viewModel.openCreate() },
        createLabel = "New member",
        onRefresh = viewModel::refresh,
        emptyTitle = "No members yet",
        emptyBody = "Add a family first, then its members.",
    ) { row, _ ->
        RecordRow(
            title = row.member.name,
            code = row.member.memberCode,
            subtitle = listOfNotNull(
                row.familyHouseName ?: row.familyNumber,
                row.member.relationship?.takeIf { it.isNotBlank() },
                row.member.age?.let { "$it yrs" },
            ).joinToString(" · ").ifBlank { null },
            status = when {
                row.member.archiveState != 0 -> "Archived"
                row.member.status == "Deceased" -> "Deceased"
                row.member.isHead == 1 -> "Head"
                else -> null
            },
            dimmed = row.member.status != "Active",
            onClick = { onOpenMember(row.member.id) },
        )
    }

    if (state.editorOpen) {
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (state.draft.id == null) "new record" else "edit record",
            title = if (state.draft.id == null) "Add member" else state.draft.name,
            footer = {
                SheetFooter(
                    primaryLabel = if (state.draft.id == null) "Create" else "Save",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = state.draft.name.isNotBlank() && state.draft.familyId != null,
                    loading = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = state.draft.name,
                onValueChange = { viewModel.onDraft { copy(name = it) } },
                label = "Full name",
                error = state.error,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                EnumField(
                    label = "Gender",
                    value = state.draft.gender,
                    options = listOf("Male", "Female", "Other"),
                    onSelect = { viewModel.onDraft { copy(gender = it) } },
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = state.draft.age?.toString().orEmpty(),
                    onValueChange = { viewModel.onDraft { copy(age = it.toIntOrNull()) } },
                    label = "Age",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(14.dp))
            MahalluTextField(
                value = state.draft.dateOfBirth,
                onValueChange = { viewModel.onDraft { copy(dateOfBirth = it) } },
                label = "Date of birth",
                supporting = "yyyy-mm-dd",
            )
            Spacer(Modifier.height(14.dp))
            EnumField(
                label = "Relationship to head",
                value = state.draft.relationship,
                options = listOf("Head", "Spouse", "Son", "Daughter", "Father", "Mother", "Other"),
                onSelect = { viewModel.onDraft { copy(relationship = it) } },
            )
            Spacer(Modifier.height(14.dp))
            PhoneField(
                value = state.draft.mobile,
                onValueChange = { viewModel.onDraft { copy(mobile = it) } },
                label = "Mobile",
            )
            Spacer(Modifier.height(14.dp))
            MahalluTextField(
                value = state.draft.occupation,
                onValueChange = { viewModel.onDraft { copy(occupation = it) } },
                label = "Occupation",
            )
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                    AppText(
                        text = "Head of this family",
                        style = MahalluTheme.type.bodyStrong,
                        color = MahalluTheme.colors.textPrimary,
                    )
                    AppText(
                        text = "A family can have exactly one head",
                        style = MahalluTheme.type.caption,
                        color = MahalluTheme.colors.textFaint,
                    )
                }
                Toggle(
                    checked = state.draft.isHead,
                    onCheckedChange = { viewModel.onDraft { copy(isHead = it) } },
                )
            }
        }
    }
}

/** A small labelled option picker — no Material dropdown anywhere in the app. */
@Composable
fun EnumField(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    androidx.compose.foundation.layout.Column(modifier) {
        androidx.compose.foundation.layout.Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                app.minzmahallu.core.ui.component.FilterChip(
                    text = option,
                    selected = option == value,
                    onClick = { onSelect(option) },
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        app.minzmahallu.core.ui.foundation.AppText(
            text = label,
            style = MahalluTheme.type.micro,
            color = MahalluTheme.colors.textFaint,
        )
    }
}

data class MemberDraft(
    val id: Long? = null,
    val familyId: Long? = null,
    val name: String = "",
    val gender: String = "Male",
    val age: Int? = null,
    val dateOfBirth: String = "",
    val relationship: String = "Head",
    val mobile: String = "",
    val occupation: String = "",
    val isHead: Boolean = false,
)

data class MembersUiState(
    val rows: List<MemberWithFamily> = emptyList(),
    val total: Int = 0,
    val loading: Boolean = true,
    val search: String = "",
    val filter: String = "All",
    val canWrite: Boolean = false,
    val editorOpen: Boolean = false,
    val draft: MemberDraft = MemberDraft(),
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class MembersViewModel @Inject constructor(
    private val members: MemberRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(MembersUiState())
    val state: StateFlow<MembersUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(canWrite = role != null && RoleAccess.canWrite(role, RoleAccess.Module.Members))
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
        _state.update { it.copy(filter = value ?: "All") }
        load()
    }

    fun refresh() = load()

    private fun load() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                members.page(
                    search = snapshot.search,
                    familyId = null,
                    status = when (snapshot.filter) {
                        "Deceased" -> "Deceased"
                        "Active" -> "Active"
                        else -> null
                    },
                    page = 1,
                    pageSize = 50,
                )
            }.onSuccess { page ->
                // Gender and archive state are not query parameters, so those
                // two chips narrow the returned page in memory.
                val rows = when (snapshot.filter) {
                    "Male" -> page.rows.filter { it.member.gender == "Male" }
                    "Female" -> page.rows.filter { it.member.gender == "Female" }
                    "Archived" -> page.rows.filter { it.member.archiveState != 0 }
                    else -> page.rows
                }
                _state.update {
                    it.copy(
                        rows = rows,
                        total = if (rows.size == page.rows.size) page.total else rows.size,
                        loading = false,
                    )
                }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }

    fun openCreate() = _state.update {
        it.copy(editorOpen = true, draft = MemberDraft(), error = null)
    }

    fun closeEditor() = _state.update { it.copy(editorOpen = false, error = null) }

    inline fun onDraft(crossinline transform: MemberDraft.() -> MemberDraft) {
        _state.update { it.copy(draft = transform(it.draft), error = null) }
    }

    fun save() {
        val draft = _state.value.draft
        val familyId = draft.familyId
        if (draft.name.isBlank() || familyId == null) {
            _state.update { it.copy(error = "Name and family are required") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = MemberInput(
                familyId = familyId,
                name = draft.name.trim(),
                gender = app.minzmahallu.core.common.wireTo(
                    draft.gender,
                    app.minzmahallu.core.common.Gender.Male,
                ),
                age = draft.age,
                dateOfBirth = draft.dateOfBirth.ifBlank { null },
                relationship = draft.relationship,
                mobile = draft.mobile,
                occupation = draft.occupation,
                isHead = draft.isHead,
            )
            runCatching {
                if (draft.id == null) members.create(input) else members.update(draft.id, input)
            }.onSuccess {
                _state.update { current -> current.copy(busy = false, editorOpen = false) }
                load()
            }.onFailure { error ->
                _state.update { current -> current.copy(busy = false, error = error.message.orEmpty()) }
            }
        }
    }
}
