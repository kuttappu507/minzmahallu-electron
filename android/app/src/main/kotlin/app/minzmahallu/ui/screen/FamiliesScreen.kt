package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.ui.component.AmountField
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.ConfirmDialog
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.ui.common.SectionTitle
import app.minzmahallu.core.ui.component.SecureActionDialog
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.ui.common.ModuleListScreen

/**
 * Families — a port of `src/pages/Families.tsx`.
 *
 * The desktop's dialog-based CRUD becomes a bottom sheet, and the
 * search/filter/pagination trio from `useList` becomes the shared list screen's
 * search field, status chips and paged lazy column.
 */
@Composable
fun FamiliesScreen(
    onOpenDrawer: () -> Unit,
    onOpenFamily: (Long) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: FamiliesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Families",
        subtitle = "${state.total} household(s)",
        eyebrow = "people",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Active", "Inactive", "Archived"),
        activeFilter = state.statusFilter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = { viewModel.openCreate() },
        createLabel = "New family",
        onRefresh = viewModel::refresh,
        emptyTitle = "No families yet",
        emptyBody = "Add the first household to start recording members and subscriptions.",
    ) { row, _ ->
        RecordRow(
            title = row.family.houseName.orEmpty().ifBlank { row.family.familyNumber },
            code = row.family.familyNumber,
            subtitle = listOfNotNull(
                row.headName,
                row.memberCount.takeIf { it > 0 }?.let { "$it member(s)" },
                row.family.ward?.takeIf { it.isNotBlank() },
            ).joinToString(" · ").ifBlank { null },
            status = if (row.family.status == "Archived") "Archived" else null,
            amount = row.dueAmount?.takeIf { it > 0.004 },
            amountLabel = "due",
            amountColor = MahalluTheme.colors.gold,
            dimmed = row.family.status != "Active",
            onClick = { onOpenFamily(row.family.id) },
        )
    }

    if (state.editorOpen) {
        FamilyEditorSheet(state = state, viewModel = viewModel)
    }

    state.secureAction?.let { action ->
        SecureActionDialog(
            onDismiss = viewModel::cancelSecure,
            onVerify = { viewModel.confirmSecure(it) },
            title = action.title,
            reason = action.reason,
            error = state.secureError,
            loading = state.busy,
        )
    }

    state.confirm?.let { confirm ->
        ConfirmDialog(
            onDismiss = viewModel::cancelConfirm,
            onConfirm = { viewModel.runConfirm() },
            title = confirm.title,
            message = confirm.message,
            confirmLabel = confirm.label,
            destructive = confirm.destructive,
        )
    }
}

@Composable
private fun FamilyEditorSheet(state: FamiliesUiState, viewModel: FamiliesViewModel) {
    val draft = state.draft
    BottomSheet(
        onDismiss = viewModel::closeEditor,
        eyebrow = if (draft.id == null) "new record" else "edit record",
        title = if (draft.id == null) "Add family" else draft.houseName,
        subtitle = draft.id?.let { state.editingNumber },
        footer = {
            SheetFooter(
                primaryLabel = if (draft.id == null) "Create" else "Save",
                onPrimary = viewModel::save,
                onSecondary = viewModel::closeEditor,
                primaryEnabled = draft.houseName.isNotBlank(),
                busy = state.busy,
            )
        },
    ) {
        MahalluTextField(
            value = draft.houseName,
            onValueChange = { viewModel.onDraft { copy(houseName = it) } },
            label = "House name",
            error = state.error,
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MahalluTextField(
                value = draft.houseNumber,
                onValueChange = { viewModel.onDraft { copy(houseNumber = it) } },
                label = "House number",
                modifier = Modifier.weight(1f),
            )
            MahalluTextField(
                value = draft.ward,
                onValueChange = { viewModel.onDraft { copy(ward = it) } },
                label = "Ward",
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = draft.area,
            onValueChange = { viewModel.onDraft { copy(area = it) } },
            label = "Area / locality",
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = draft.address,
            onValueChange = { viewModel.onDraft { copy(address = it) } },
            label = "Address",
            singleLine = false,
            minLines = 2,
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MahalluTextField(
                value = draft.pincode,
                onValueChange = { viewModel.onDraft { copy(pincode = it.filter(Char::isDigit).take(6)) } },
                label = "PIN code",
                modifier = Modifier.weight(1f),
            )
            PhoneField(
                value = draft.phone,
                onValueChange = { viewModel.onDraft { copy(phone = it) } },
                label = "Phone",
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(14.dp))
        PhoneField(
            value = draft.altPhone,
            onValueChange = { viewModel.onDraft { copy(altPhone = it) } },
            label = "Alternative phone",
        )

        SectionTitle("WhatsApp")
        PhoneField(
            value = draft.whatsappPhone,
            onValueChange = { viewModel.onDraft { copy(whatsappPhone = it) } },
            label = "WhatsApp number",
            supporting = if (Phone.isComplete10(draft.whatsappPhone)) {
                "Receipts go to 91${draft.whatsappPhone}"
            } else {
                "10 digits; defaults to the phone above when left blank"
            },
        )
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                AppText(
                    text = "Send receipts by WhatsApp",
                    style = MahalluTheme.type.bodyStrong,
                    color = MahalluTheme.colors.textPrimary,
                )
                AppText(
                    text = "Turn off for families without WhatsApp",
                    style = MahalluTheme.type.caption,
                    color = MahalluTheme.colors.textFaint,
                )
            }
            Toggle(
                checked = draft.whatsappEnabled,
                onCheckedChange = { viewModel.onDraft { copy(whatsappEnabled = it) } },
            )
        }

        SectionTitle("Notes")
        MahalluTextField(
            value = draft.notes,
            onValueChange = { viewModel.onDraft { copy(notes = it) } },
            label = "Notes",
            singleLine = false,
            minLines = 2,
        )
    }
}
