package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.i18n.localizedError
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.asset.AssetInput
import app.minzmahallu.core.domain.asset.AssetRepository
import app.minzmahallu.core.domain.dashboard.AssetSummary
import app.minzmahallu.core.model.AssetEntity
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
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

/** Assets — `src/pages/Assets.tsx`. Rent-yielding assets carry their agreement dates. */
@Composable
fun AssetsScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: AssetsViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val summary by viewModel.summary.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        Card(
            title = "Asset register",
            eyebrow = "${summary.count} item(s)",
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp),
        ) {
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Eyebrow("acquisition")
                    Amount(value = summary.acquisitionTotal, style = MahalluTheme.type.amountSmall)
                }
                Column(Modifier.weight(1f)) {
                    Eyebrow("current value")
                    Amount(value = summary.currentTotal, style = MahalluTheme.type.amountSmall, color = colors.accent)
                }
            }
            if (summary.monthlyRent > 0.004) {
                Spacer(Modifier.height(12.dp))
                Eyebrow("monthly rent")
                Amount(value = summary.monthlyRent, style = MahalluTheme.type.amountSmall, color = colors.gold)
            }
        }

        ModuleListScreen(
            title = "Assets",
            subtitle = "${state.total} on the register",
            eyebrow = "money",
            items = state.rows,
            loading = state.loading,
            search = state.search,
            onSearchChange = viewModel::onSearch,
            onOpenDrawer = onOpenDrawer,
            filters = listOf("All", "In use", "Idle", "Rented out", "Under repair", "Disposed"),
            activeFilter = state.filter,
            onFilterChange = viewModel::onFilter,
            canCreate = state.canWrite,
            onCreate = viewModel::openCreate,
            createLabel = "New asset",
            onRefresh = {
                viewModel.refresh()
                viewModel.loadSummary()
            },
            emptyTitle = "No assets",
            emptyBody = "Record land, buildings and rentable goods the mahallu owns.",
        ) { row, _ ->
            RecordRow(
                title = row.name,
                code = row.assetCode,
                subtitle = listOfNotNull(
                    row.category,
                    row.location?.takeIf { it.isNotBlank() },
                    if (row.incomeGenerating == 1) "rent ₹${app.minzmahallu.core.common.IndianGrouping.formatAmount(row.monthlyRent)}/mo" else null,
                ).joinToString(" · ").ifBlank { null },
                status = row.status,
                amount = row.currentValue,
                onClick = { viewModel.openEdit(row) },
            )
        }
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new record" else "edit record",
            title = if (d.id == null) "Add asset" else d.name,
            subtitle = if (d.id == null) "an asset code is assigned automatically" else d.assetCode.orEmpty(),
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
                label = "Asset name",
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                EnumField(
                    label = "Category",
                    value = d.category,
                    options = listOf("Land", "Building", "Vehicle", "Equipment", "Furniture", "Other"),
                    onSelect = { viewModel.edit { copy(category = it) } },
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.referenceNo,
                    onValueChange = { viewModel.edit { copy(referenceNo = it) } },
                    label = "Reference no.",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.location,
                    onValueChange = { viewModel.edit { copy(location = it) } },
                    label = "Location",
                    modifier = Modifier.weight(1f),
                )
                MahalluTextField(
                    value = d.custodian,
                    onValueChange = { viewModel.edit { copy(custodian = it) } },
                    label = "Custodian",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AmountField(
                    value = d.acquisitionCost,
                    onValueChange = { viewModel.edit { copy(acquisitionCost = it) } },
                    label = "Acquisition cost",
                    modifier = Modifier.weight(1f),
                )
                AmountField(
                    value = d.currentValue,
                    onValueChange = { viewModel.edit { copy(currentValue = it) } },
                    label = "Current value",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.acquisitionDate,
                    onValueChange = { viewModel.edit { copy(acquisitionDate = it) } },
                    label = "Acquired",
                    supporting = "yyyy-mm-dd",
                    modifier = Modifier.weight(1f),
                )
                EnumField(
                    label = "Status",
                    value = d.status,
                    options = listOf("In use", "Idle", "Rented out", "Under repair", "Disposed"),
                    onSelect = { viewModel.edit { copy(status = it) } },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(16.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    AppText(
                        text = "Income generating",
                        style = MahalluTheme.type.bodyStrong,
                        color = colors.textPrimary,
                    )
                    AppText(
                        text = "shops, halls and other rentable property",
                        style = MahalluTheme.type.caption,
                        color = colors.textFaint,
                    )
                }
                Toggle(
                    checked = d.incomeGenerating,
                    onCheckedChange = { viewModel.edit { copy(incomeGenerating = it) } },
                )
            }
            if (d.incomeGenerating) {
                Spacer(Modifier.height(14.dp))
                MahalluTextField(
                    value = d.tenantName,
                    onValueChange = { viewModel.edit { copy(tenantName = it) } },
                    label = "Tenant",
                )
                Spacer(Modifier.height(12.dp))
                AmountField(
                    value = d.monthlyRent,
                    onValueChange = { viewModel.edit { copy(monthlyRent = it) } },
                    label = "Monthly rent",
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MahalluTextField(
                        value = d.agreementStart,
                        onValueChange = { viewModel.edit { copy(agreementStart = it) } },
                        label = "Agreement start",
                        modifier = Modifier.weight(1f),
                    )
                    MahalluTextField(
                        value = d.agreementEnd,
                        onValueChange = { viewModel.edit { copy(agreementEnd = it) } },
                        label = "Agreement end",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

data class AssetDraft(
    val id: Long? = null,
    val assetCode: String? = null,
    val name: String = "",
    val category: String = "Other",
    val referenceNo: String = "",
    val location: String = "",
    val custodian: String = "",
    val acquisitionDate: String = IstDate.today(),
    val acquisitionCost: String = "",
    val currentValue: String = "",
    val status: String = "In use",
    val incomeGenerating: Boolean = false,
    val tenantName: String = "",
    val monthlyRent: String = "",
    val agreementStart: String = "",
    val agreementEnd: String = "",
)

@HiltViewModel
class AssetsViewModel @Inject constructor(
    private val assets: AssetRepository,
    sessions: SessionController,
) : RegisterListViewModel<AssetEntity>(
    sessions = sessions,
    module = RoleAccess.Module.Assets,
    filters = listOf("All", "In use", "Idle", "Rented out", "Under repair", "Disposed"),
) {

    data class Editor(val open: Boolean = false, val draft: AssetDraft = AssetDraft())

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    private val _summary = MutableStateFlow(AssetSummary(0, 0.0, 0.0, 0.0))
    val summary: StateFlow<AssetSummary> = _summary.asStateFlow()

    init {
        loadSummary()
    }

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<AssetEntity> = assets.page(
        search = search,
        category = null,
        status = filter,
        page = page,
        pageSize = pageSize,
    )

    fun loadSummary() {
        viewModelScope.launch {
            _summary.value = runCatching { assets.summary() }.getOrDefault(AssetSummary(0, 0.0, 0.0, 0.0))
        }
    }

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: AssetEntity) {
        _editor.value = Editor(
            open = true,
            draft = AssetDraft(
                id = row.id,
                assetCode = row.assetCode,
                name = row.name,
                category = row.category,
                referenceNo = row.referenceNo.orEmpty(),
                location = row.location.orEmpty(),
                custodian = row.custodian.orEmpty(),
                acquisitionDate = row.acquisitionDate.orEmpty(),
                acquisitionCost = row.acquisitionCost.toString(),
                currentValue = row.currentValue.toString(),
                status = row.status,
                incomeGenerating = row.incomeGenerating == 1,
                tenantName = row.tenantName.orEmpty(),
                monthlyRent = row.monthlyRent.toString(),
                agreementStart = row.agreementStart.orEmpty(),
                agreementEnd = row.agreementEnd.orEmpty(),
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
    }

    fun edit(transform: AssetDraft.() -> AssetDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val d = _editor.value.draft
        if (d.name.isBlank()) return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val input = AssetInput(
                name = d.name.trim(),
                category = d.category,
                referenceNo = d.referenceNo.trim(),
                location = d.location.trim(),
                acquisitionDate = d.acquisitionDate,
                acquisitionCost = d.acquisitionCost.toDoubleOrNull() ?: 0.0,
                currentValue = d.currentValue.toDoubleOrNull() ?: 0.0,
                status = d.status,
                custodian = d.custodian.trim(),
                incomeGenerating = d.incomeGenerating,
                tenantName = d.tenantName.trim(),
                monthlyRent = d.monthlyRent.toDoubleOrNull() ?: 0.0,
                agreementStart = d.agreementStart,
                agreementEnd = d.agreementEnd,
            )
            runCatching {
                if (d.id == null) assets.create(input) else assets.update(d.id, input)
            }.onSuccess {
                patch { copy(busy = false) }
                _editor.value = Editor()
                refresh()
                loadSummary()
            }.onFailure { error ->
                patch { copy(busy = false, error = localizedError(error)?.takeIf(String::isNotBlank)) }
            }
        }
    }
}
