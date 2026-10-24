package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.CommitteeStatus
import app.minzmahallu.core.common.CommitteeType
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.people.CommitteeInput
import app.minzmahallu.core.domain.people.CommitteeRepository
import app.minzmahallu.core.model.CommitteeMember
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import app.minzmahallu.ui.common.RegisterListViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Committee — `src/pages/Committee.tsx`. Terms ending within 30 days are flagged. */
@Composable
fun CommitteeScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: CommitteeViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Committee",
        subtitle = listOfNotNull(
            "${state.total} office bearer(s)",
            viewModel.endingSoon.value.takeIf { it > 0 }?.let { "$it term(s) ending soon" },
        ).joinToString(" · "),
        eyebrow = "people",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Active", "Past", "Resigned", "Archived"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "Add member",
        onRefresh = viewModel::refresh,
        emptyTitle = "No committee",
        emptyBody = "Record the current executive committee and their terms.",
    ) { row, _ ->
        RecordRow(
            title = row.name,
            code = row.committeeCode,
            subtitle = listOfNotNull(
                row.position,
                row.committeeType,
                row.termEnd?.let { "until ${IstDate.fmtDdMmYyyy(it)}" },
            ).joinToString(" · ").ifBlank { null },
            status = if (row.archiveState != 0) "Archived" else row.status,
            dimmed = row.status != "Active",
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new record" else "edit record",
            title = if (d.id == null) "Add to committee" else d.name,
            footer = {
                SheetFooter(
                    primaryLabel = if (d.id == null) "Create" else "Save",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = d.name.isNotBlank(),
                    busy = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = d.name,
                onValueChange = { viewModel.edit { copy(name = it) } },
                label = "Name",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                EnumField(
                    label = "Position",
                    value = d.position,
                    options = listOf("President", "Secretary", "Treasurer", "Committee Member"),
                    onSelect = { viewModel.edit { copy(position = it) } },
                    modifier = Modifier.weight(1f),
                )
                EnumField(
                    label = "Committee",
                    value = d.committeeType,
                    options = CommitteeType.entries.map { it.wire },
                    onSelect = { viewModel.edit { copy(committeeType = it) } },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            PhoneField(
                value = d.phone,
                onValueChange = { viewModel.edit { copy(phone = it) } },
                label = "Phone",
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.termStart,
                    onValueChange = { viewModel.edit { copy(termStart = it) } },
                    label = "Term start",
                    supporting = "yyyy-mm-dd",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.termEnd,
                    onValueChange = { viewModel.edit { copy(termEnd = it) } },
                    label = "Term end",
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

data class CommitteeDraft(
    val id: Long? = null,
    val name: String = "",
    val position: String = "Committee Member",
    val committeeType: String = CommitteeType.Executive.wire,
    val phone: String = "",
    val termStart: String = IstDate.today(),
    val termEnd: String = "",
)

@HiltViewModel
class CommitteeViewModel @Inject constructor(
    private val committee: CommitteeRepository,
    sessions: SessionController,
) : RegisterListViewModel<CommitteeMember>(
    sessions = sessions,
    module = RoleAccess.Module.Committee,
    filters = listOf("All", "Active", "Past", "Resigned", "Archived"),
) {

    data class Editor(val open: Boolean = false, val draft: CommitteeDraft = CommitteeDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    val endingSoon = MutableStateFlow(0)

    init {
        viewModelScope.launch {
            endingSoon.value = runCatching { committee.termsEndingSoon() }.getOrDefault(0)
        }
    }

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<CommitteeMember> = committee.page(
        search = search,
        type = null,
        status = filter?.takeIf { it != "Archived" },
        showArchived = filter == "Archived",
        page = page,
        pageSize = pageSize,
    )

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: CommitteeMember) {
        _editor.value = Editor(
            open = true,
            draft = CommitteeDraft(
                id = row.id,
                name = row.name,
                position = row.position,
                committeeType = row.committeeType,
                phone = row.phone.orEmpty(),
                termStart = row.termStart.orEmpty(),
                termEnd = row.termEnd.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    fun edit(transform: CommitteeDraft.() -> CommitteeDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val d = _editor.value.draft
        if (d.name.isBlank()) return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = CommitteeInput(
                name = d.name.trim(),
                position = d.position,
                committeeType = wireTo(d.committeeType, CommitteeType.Executive),
                phone = d.phone,
                termStart = d.termStart.ifBlank { null },
                termEnd = d.termEnd.ifBlank { null },
            )
            runCatching {
                if (d.id == null) committee.create(input) else committee.update(d.id, input)
            }.onSuccess {
                patch { copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure { error ->
                patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
            }
        }
    }
}
