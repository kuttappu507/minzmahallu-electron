package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.registers.DeathInput
import app.minzmahallu.core.domain.registers.DeathRepository
import app.minzmahallu.core.model.DeathWithFamily
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

/** The death register — `src/pages/Deaths.tsx`. */
@Composable
fun DeathsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: DeathsViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Deaths",
        subtitle = "${state.total} record(s)",
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
        createLabel = "Record death",
        onRefresh = viewModel::refresh,
        emptyTitle = "No records",
        emptyBody = "The register is empty.",
    ) { row, _ ->
        RecordRow(
            title = row.death.deceasedName,
            code = row.death.deathNumber,
            subtitle = listOfNotNull(
                IstDate.fmtDdMmYyyy(row.death.dateOfDeath),
                row.death.age?.let { "$it yrs" },
                row.houseName ?: row.familyNumber,
            ).joinToString(" · ").ifBlank { null },
            status = if (row.death.approvalStatus == "pending") "Pending" else null,
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new record" else "edit record",
            title = if (d.id == null) "Record death" else d.deathNumber.orEmpty(),
            footer = {
                SheetFooter(
                    primaryLabel = if (d.id == null) "Save" else "Update",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = d.deceasedName.isNotBlank(),
                    busy = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = d.deceasedName,
                onValueChange = { viewModel.edit { copy(deceasedName = it) } },
                label = "Name of the deceased",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.fatherName,
                    onValueChange = { viewModel.edit { copy(fatherName = it) } },
                    label = "Father's name",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.age?.toString().orEmpty(),
                    onValueChange = { viewModel.edit { copy(age = it.toIntOrNull()) } },
                    label = "Age",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.dateOfDeath,
                    onValueChange = { viewModel.edit { copy(dateOfDeath = it) } },
                    label = "Date of death",
                    supporting = "yyyy-mm-dd",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.burialDate,
                    onValueChange = { viewModel.edit { copy(burialDate = it) } },
                    label = "Burial date",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            EnumField(
                label = "Gender",
                value = d.gender,
                options = listOf("Male", "Female"),
                onSelect = { viewModel.edit { copy(gender = it) } },
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.placeOfDeath,
                onValueChange = { viewModel.edit { copy(placeOfDeath = it) } },
                label = "Place of death",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.burialPlace,
                onValueChange = { viewModel.edit { copy(burialPlace = it) } },
                label = "Burial place",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.causeOfDeath,
                onValueChange = { viewModel.edit { copy(causeOfDeath = it) } },
                label = "Cause of death",
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.address,
                onValueChange = { viewModel.edit { copy(address = it) } },
                label = "Address",
                singleLine = false,
                minLines = 2,
            )
        }
    }
}

data class DeathDraft(
    val id: Long? = null,
    val deathNumber: String? = null,
    val deceasedName: String = "",
    val fatherName: String = "",
    val age: Int? = null,
    val gender: String = "Male",
    val dateOfDeath: String = IstDate.today(),
    val burialDate: String = "",
    val placeOfDeath: String = "",
    val burialPlace: String = "",
    val causeOfDeath: String = "",
    val address: String = "",
)

@HiltViewModel
class DeathsViewModel @Inject constructor(
    private val deaths: DeathRepository,
    sessions: SessionController,
) : RegisterListViewModel<DeathWithFamily>(
    sessions = sessions,
    module = RoleAccess.Module.Deaths,
    filters = listOf("All", "This year", "Last year"),
) {

    data class Editor(val open: Boolean = false, val draft: DeathDraft = DeathDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<DeathWithFamily> {
        val year = when (filter) {
            "This year" -> IstDate.now().year
            "Last year" -> IstDate.now().year - 1
            else -> null
        }
        return deaths.page(
            search = search,
            from = year?.let { "$it-01-01" },
            to = year?.let { "$it-12-31" },
            page = page,
            pageSize = pageSize,
        )
    }

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: DeathWithFamily) {
        val e = row.death
        _editor.value = Editor(
            open = true,
            draft = DeathDraft(
                id = e.id,
                deathNumber = e.deathNumber,
                deceasedName = e.deceasedName,
                fatherName = e.fatherName.orEmpty(),
                age = e.age,
                gender = e.gender ?: "Male",
                dateOfDeath = e.dateOfDeath,
                burialDate = e.burialDate.orEmpty(),
                placeOfDeath = e.placeOfDeath.orEmpty(),
                burialPlace = e.burialPlace.orEmpty(),
                causeOfDeath = e.causeOfDeath.orEmpty(),
                address = e.address.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    inline fun edit(crossinline transform: DeathDraft.() -> DeathDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val d = _editor.value.draft
        if (d.deceasedName.isBlank()) return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = DeathInput(
                deceasedName = d.deceasedName.trim(),
                fatherName = d.fatherName.trim(),
                age = d.age,
                gender = app.minzmahallu.core.common.wireTo<app.minzmahallu.core.common.Gender>(
                    d.gender,
                    app.minzmahallu.core.common.Gender.Male,
                ),
                dateOfDeath = d.dateOfDeath,
                burialDate = d.burialDate.ifBlank { null },
                placeOfDeath = d.placeOfDeath.trim(),
                burialPlace = d.burialPlace.trim(),
                causeOfDeath = d.causeOfDeath.trim(),
                address = d.address.trim(),
            )
            runCatching {
                if (d.id == null) deaths.create(input) else deaths.update(d.id, input)
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
