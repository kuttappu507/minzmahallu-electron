package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.registers.MarriageInput
import app.minzmahallu.core.domain.registers.MarriageRepository
import app.minzmahallu.core.model.MarriageEntity
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.ui.common.SectionTitle
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

/** The marriage register — `src/pages/Marriages.tsx`. */
@Composable
fun MarriagesScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: MarriagesViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Marriages",
        subtitle = "${state.total} nikah(s) recorded",
        eyebrow = "registers",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "This year", "Last year"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openCreate,
        createLabel = "Record nikah",
        onRefresh = viewModel::refresh,
        emptyTitle = "No marriages recorded",
        emptyBody = "Record a nikah and its certificate can be issued from here.",
    ) { row, _ ->
        RecordRow(
            title = "${row.brideName} & ${row.groomName}",
            code = row.marriageNumber,
            subtitle = listOfNotNull(
                IstDate.fmtDdMmYyyy(row.nikahDate),
                row.place?.takeIf { it.isNotBlank() },
            ).joinToString(" · ").ifBlank { null },
            status = if (row.approvalStatus == "pending") "Pending" else null,
            onClick = { viewModel.openEdit(row) },
        )
    }

    val editor = viewModel.editor.collectAsStateWithLifecycle().value
    if (editor.open) {
        val draft = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (draft.id == null) "new record" else "edit record",
            title = if (draft.id == null) "Record nikah" else draft.marriageNumber.orEmpty(),
            footer = {
                SheetFooter(
                    primaryLabel = if (draft.id == null) "Save" else "Update",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = draft.brideName.isNotBlank() && draft.groomName.isNotBlank(),
                    busy = state.busy,
                )
            },
        ) {
            SectionTitle("bride")
            MahalluTextField(
                value = draft.brideName,
                onValueChange = { viewModel.edit { copy(brideName = it) } },
                label = "Bride's name",
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = draft.brideFather,
                    onValueChange = { viewModel.edit { copy(brideFather = it) } },
                    label = "Father's name",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = draft.brideAddress,
                    onValueChange = { viewModel.edit { copy(brideAddress = it) } },
                    label = "Address",
                    modifier = Modifier.weight(1f),
                )
            }

            SectionTitle("groom")
            MahalluTextField(
                value = draft.groomName,
                onValueChange = { viewModel.edit { copy(groomName = it) } },
                label = "Groom's name",
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = draft.groomFather,
                    onValueChange = { viewModel.edit { copy(groomFather = it) } },
                    label = "Father's name",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = draft.groomAddress,
                    onValueChange = { viewModel.edit { copy(groomAddress = it) } },
                    label = "Address",
                    modifier = Modifier.weight(1f),
                )
            }

            SectionTitle("ceremony")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = draft.nikahDate,
                    onValueChange = { viewModel.edit { copy(nikahDate = it) } },
                    label = "Nikah date",
                    supporting = "yyyy-mm-dd",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = draft.mahar,
                    onValueChange = { viewModel.edit { copy(mahar = it) } },
                    label = "Mahar",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = draft.place,
                onValueChange = { viewModel.edit { copy(place = it) } },
                label = "Place",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = draft.witnesses.joinToString(", "),
                onValueChange = { raw ->
                    viewModel.edit { copy(witnesses = raw.split(",").map { it.trim() }.filter { it.isNotBlank() }) }
                },
                label = "Witnesses",
                supporting = "separate with commas — up to four are printed",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = draft.remarks,
                onValueChange = { viewModel.edit { copy(remarks = it) } },
                label = "Remarks",
                singleLine = false,
                minLines = 2,
            )
        }
    }
}

data class MarriageDraft(
    val id: Long? = null,
    val marriageNumber: String? = null,
    val brideName: String = "",
    val brideFather: String = "",
    val brideAddress: String = "",
    val groomName: String = "",
    val groomFather: String = "",
    val groomAddress: String = "",
    val witnesses: List<String> = emptyList(),
    val mahar: String = "",
    val nikahDate: String = IstDate.today(),
    val place: String = "",
    val remarks: String = "",
)

@HiltViewModel
class MarriagesViewModel @Inject constructor(
    private val marriages: MarriageRepository,
    sessions: SessionController,
) : RegisterListViewModel<MarriageEntity>(
    sessions = sessions,
    module = RoleAccess.Module.Marriages,
    filters = listOf("All", "This year", "Last year"),
) {

    /** The editor is part of the same state stream, so the sheet recomposes
     *  with the row it is editing rather than holding a parallel copy. */
    data class Editor(val open: Boolean = false, val draft: MarriageDraft = MarriageDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<MarriageEntity> {
        // The register is filtered by nikah year, which the desktop does with a
        // date range rather than a status column.
        val year = when (filter) {
            "This year" -> IstDate.now().year
            "Last year" -> IstDate.now().year - 1
            else -> null
        }
        return marriages.page(
            search = search,
            from = year?.let { "$it-01-01" },
            to = year?.let { "$it-12-31" },
            page = page,
            pageSize = pageSize,
        )
    }

    fun openCreate() {
        _editor.value = Editor(open = true, draft = MarriageDraft())
    }

    fun openEdit(row: MarriageEntity) {
        val next = MarriageDraft(
            id = row.id,
            marriageNumber = row.marriageNumber,
            brideName = row.brideName,
            brideFather = row.brideFather.orEmpty(),
            brideAddress = row.brideAddress.orEmpty(),
            groomName = row.groomName,
            groomFather = row.groomFather.orEmpty(),
            groomAddress = row.groomAddress.orEmpty(),
            witnesses = listOfNotNull(row.witness1, row.witness2, row.witness3, row.witness4),
            mahar = row.mahar.orEmpty(),
            nikahDate = row.nikahDate,
            place = row.place.orEmpty(),
            remarks = row.remarks.orEmpty(),
        )
        _editor.value = Editor(open = true, draft = next)
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    inline fun edit(crossinline transform: MarriageDraft.() -> MarriageDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val snapshot = _editor.value.draft
        if (snapshot.brideName.isBlank() || snapshot.groomName.isBlank()) return
        patch { copy(busy = true) }
        viewModelScope.launch {
            val input = MarriageInput(
                brideName = snapshot.brideName.trim(),
                brideFather = snapshot.brideFather.trim(),
                brideAddress = snapshot.brideAddress.trim(),
                groomName = snapshot.groomName.trim(),
                groomFather = snapshot.groomFather.trim(),
                groomAddress = snapshot.groomAddress.trim(),
                witnesses = snapshot.witnesses.take(4),
                mahar = snapshot.mahar.trim(),
                nikahDate = snapshot.nikahDate,
                place = snapshot.place.trim(),
                remarks = snapshot.remarks.trim(),
            )
            runCatching {
                if (snapshot.id == null) marriages.create(input) else marriages.update(snapshot.id, input)
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
