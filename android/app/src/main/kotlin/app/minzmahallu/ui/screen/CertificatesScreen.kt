package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.CertificateType
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.certificate.CertificateRepository
import app.minzmahallu.core.model.CertificateWithRefs
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.RecordRow
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

/**
 * Certificates — `src/pages/Certificates.tsx`.
 *
 * Issuing is by source record (a member code, a family number, a marriage or
 * death number) rather than by hand-typing a certificate, because the number
 * and the QR payload are derived from that record. Verification by code is
 * here too, which is what a third party uses to check a document is genuine.
 */
@Composable
fun CertificatesScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: CertificatesViewModel = hiltViewModel(),
) {
    val state by viewModel.listState.collectAsStateWithLifecycle()
    val issue by viewModel.issue.collectAsStateWithLifecycle()
    val verify by viewModel.verify.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Certificates",
        subtitle = "${state.total} issued",
        eyebrow = "registers",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All") + CertificateType.entries.map { it.wire },
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canWrite,
        onCreate = viewModel::openIssue,
        createLabel = "Issue",
        trailing = {
            app.minzmahallu.core.ui.component.MahalluButton(
                onClick = viewModel::openVerify,
                variant = app.minzmahallu.core.ui.component.ButtonVariant.Secondary,
                size = app.minzmahallu.core.ui.component.ButtonSize.Small,
                text = "Verify",
            )
        },
        onRefresh = viewModel::refresh,
        emptyTitle = "No certificates issued",
        emptyBody = "Issue a membership, residence, marriage or death certificate from here.",
    ) { row, _ ->
        val c = row.certificate
        RecordRow(
            title = c.issuedTo ?: row.memberName ?: row.houseName.orEmpty(),
            code = c.certificateNumber,
            subtitle = listOfNotNull(
                c.type,
                "issued ${IstDate.fmtDdMmYyyy(c.issuedDate)}",
                if (c.reprintCount > 0) "reprinted ${c.reprintCount}×" else null,
            ).joinToString(" · "),
            status = c.status,
            onClick = { viewModel.openDetail(row) },
        )
    }

    issue?.let { prompt ->
        BottomSheet(
            onDismiss = viewModel::closeIssue,
            eyebrow = "issue certificate",
            title = prompt.type,
            subtitle = "the number and QR code are derived from the record you name",
            footer = {
                SheetFooter(
                    primaryLabel = "Issue",
                    onPrimary = viewModel::submitIssue,
                    onSecondary = viewModel::closeIssue,
                    primaryEnabled = prompt.reference.isNotBlank(),
                    loading = state.busy,
                )
            },
        ) {
            EnumField(
                label = "Certificate type",
                value = prompt.type,
                options = CertificateType.entries.map { it.wire },
                onSelect = viewModel::onIssueType,
            )
            Spacer(Modifier.height(14.dp))
            MahalluTextField(
                value = prompt.reference,
                onValueChange = viewModel::onIssueReference,
                label = when (prompt.type) {
                    CertificateType.Membership.wire -> "Member code"
                    CertificateType.Residence.wire -> "Family number"
                    CertificateType.Marriage.wire, CertificateType.MarriageNoc.wire -> "Marriage number"
                    else -> "Death number"
                },
                supporting = prompt.hint,
                error = state.error,
                textStyle = app.minzmahallu.core.ui.theme.MahalluTheme.type.code,
            )
            if (prompt.type == CertificateType.Residence.wire) {
                Spacer(Modifier.height(12.dp))
                MahalluTextField(
                    value = prompt.issuedTo,
                    onValueChange = viewModel::onIssueTo,
                    label = "Issued to",
                )
            }
        }
    }

    verify?.let { prompt ->
        BottomSheet(
            onDismiss = viewModel::closeVerify,
            eyebrow = "verification",
            title = "Check a certificate",
            footer = {
                SheetFooter(
                    primaryLabel = "Verify",
                    onPrimary = viewModel::submitVerify,
                    onSecondary = viewModel::closeVerify,
                    primaryEnabled = prompt.code.isNotBlank(),
                    loading = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = prompt.code,
                onValueChange = viewModel::onVerifyCode,
                label = "Verification code",
                textStyle = app.minzmahallu.core.ui.theme.MahalluTheme.type.code,
            )
            prompt.result?.let { result ->
                Spacer(Modifier.height(18.dp))
                Card(title = if (result.genuine) "Genuine" else "Not verified") {
                    DetailRow("Number", result.number)
                    DetailRow("Type", result.type)
                    DetailRow("Issued to", result.issuedTo)
                    DetailRow("Issued on", result.issuedDate)
                    DetailRow("Status", result.status)
                }
            }
        }
    }
}

data class IssuePrompt(
    val type: String = CertificateType.Membership.wire,
    val reference: String = "",
    val issuedTo: String = "",
    val hint: String = "",
)

data class VerifyPrompt(
    val code: String = "",
    val result: VerifyOutcome? = null,
)

data class VerifyOutcome(
    val genuine: Boolean,
    val number: String,
    val type: String,
    val issuedTo: String,
    val issuedDate: String,
    val status: String,
)

@HiltViewModel
class CertificatesViewModel @Inject constructor(
    private val certificates: CertificateRepository,
    sessions: SessionController,
) : RegisterListViewModel<CertificateWithRefs>(
    sessions = sessions,
    module = RoleAccess.Module.Certificates,
    filters = listOf("All") + CertificateType.entries.map { it.wire },
) {

    private val _issue = MutableStateFlow<IssuePrompt?>(null)
    val issue: StateFlow<IssuePrompt?> = _issue.asStateFlow()

    private val _verify = MutableStateFlow<VerifyPrompt?>(null)
    val verify: StateFlow<VerifyPrompt?> = _verify.asStateFlow()

    override suspend fun query(
        search: String?,
        filter: String?,
        page: Int,
        pageSize: Int,
    ): PagedList<CertificateWithRefs> = certificates.page(
        search = search,
        type = filter,
        page = page,
        pageSize = pageSize,
    )

    fun openIssue() {
        _issue.value = IssuePrompt()
    }

    fun openDetail(row: CertificateWithRefs) {
        _verify.value = VerifyPrompt(
            code = row.certificate.verificationCode.orEmpty(),
            result = VerifyOutcome(
                genuine = row.certificate.status == "Issued",
                number = row.certificate.certificateNumber,
                type = row.certificate.type,
                issuedTo = row.certificate.issuedTo ?: row.memberName.orEmpty(),
                issuedDate = IstDate.fmtDdMmYyyy(row.certificate.issuedDate),
                status = row.certificate.status,
            ),
        )
    }

    fun closeIssue() {
        _issue.value = null
        patch { copy(error = null) }
    }

    fun closeVerify() {
        _verify.value = null
    }

    fun onIssueType(value: String) = _issue.update { it?.copy(type = value, reference = "") }

    fun onIssueReference(value: String) = _issue.update { it?.copy(reference = value) }

    fun onIssueTo(value: String) = _issue.update { it?.copy(issuedTo = value) }

    fun onVerifyCode(value: String) = _verify.update { it?.copy(code = value, result = null) }

    fun submitIssue() {
        val prompt = _issue.value ?: return
        patch { copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = when (prompt.type) {
                CertificateType.Membership.wire ->
                    runCatching { certificates.issueMembership(prompt.reference) }
                CertificateType.Residence.wire ->
                    runCatching { certificates.issueResidence(prompt.reference, prompt.issuedTo) }
                CertificateType.Marriage.wire ->
                    runCatching { certificates.issueMarriage(prompt.reference) }
                CertificateType.MarriageNoc.wire ->
                    runCatching { certificates.issueMarriageNoc(prompt.reference) }
                else -> runCatching { certificates.issueDeath(prompt.reference) }
            }
            result.onSuccess {
                patch { copy(busy = false) }
                _issue.value = null
                refresh()
            }.onFailure { error ->
                patch { copy(busy = false, error = error.message?.takeIf(String::isNotBlank)) }
            }
        }
    }

    fun submitVerify() {
        val code = _verify.value?.code?.trim().orEmpty()
        if (code.isBlank()) return
        patch { copy(busy = true) }
        viewModelScope.launch {
            val outcome = runCatching { certificates.verifyCode(code) }
                .map { result ->
                    when (result) {
                        is app.minzmahallu.core.domain.certificate.VerifyResult.Certificate ->
                            VerifyOutcome(
                                genuine = result.status == "Issued",
                                number = result.number,
                                type = result.type.wire,
                                issuedTo = result.issuedTo,
                                issuedDate = IstDate.fmtDdMmYyyy(result.issuedDate),
                                status = result.status +
                                    if (result.reprints > 0) " · reprinted ${result.reprints}×" else "",
                            )

                        app.minzmahallu.core.domain.certificate.VerifyResult.NotFound ->
                            VerifyOutcome(false, "—", "—", "—", "—", "no such code")
                    }
                }
                .getOrElse {
                    VerifyOutcome(false, "—", "—", "—", "—", it.message ?: "could not verify")
                }
            _verify.update { it?.copy(result = outcome) }
            patch { copy(busy = false) }
        }
    }
}
