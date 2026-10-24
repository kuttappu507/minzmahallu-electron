package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.domain.certificate.CertificateRepository
import app.minzmahallu.core.domain.finance.DonationRepository
import app.minzmahallu.core.domain.member.MemberRepository
import app.minzmahallu.core.model.CertificateEntity
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.core.ui.component.DetailRow
import app.minzmahallu.core.ui.component.HeroPanel
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.RecordRow
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.core.ui.component.SectionTitle
import app.minzmahallu.core.ui.component.StatusPill
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * A single member: identity, family link, lifetime donations and the documents
 * issued to them. The phone equivalent of expanding a row in the desktop's
 * Members table.
 */
@Composable
fun MemberDetailScreen(
    memberId: Long,
    onBack: () -> Unit,
    onOpenFamily: (Long) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: MemberDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(memberId) { viewModel.load(memberId) }

    if (state.loading || state.member == null) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(Gutters.screen),
        ) {
            ListSkeleton(rows = 4)
        }
        return
    }

    val member = state.member!!
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = Gutters.screen,
            end = Gutters.screen,
            top = 12.dp,
            bottom = 40.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding()) {
                ScreenHeader(
                    title = member.name,
                    eyebrow = member.memberCode,
                    subtitle = state.familyLabel,
                    back = onBack,
                    trailing = {
                        StatusPill(
                            when {
                                member.archiveState != 0 -> "Archived"
                                else -> member.status
                            },
                        )
                    },
                )
            }
        }

        item {
            HeroPanel(tint = ModuleTint.Cyan) {
                Eyebrow("lifetime donations")
                Spacer(Modifier.height(6.dp))
                Amount(
                    value = state.donationTotal,
                    style = MahalluTheme.type.display,
                    color = colors.textPrimary,
                )
                if (state.member?.isHead == 1) {
                    Spacer(Modifier.height(12.dp))
                    AppText(
                        text = "head of the household",
                        style = MahalluTheme.type.label,
                        color = colors.textSecondary,
                    )
                }
            }
        }

        item {
            Card(
                title = "Member",
                trailing = {
                    if (member.familyId > 0) {
                        AppText(
                            text = "open family",
                            style = MahalluTheme.type.label,
                            color = colors.accent,
                            modifier = Modifier.padding(4.dp),
                        )
                    }
                },
            ) {
                DetailRow("Code", member.memberCode.orEmpty())
                DetailRow("Relationship", member.relationship.orEmpty())
                DetailRow("Gender", member.gender)
                DetailRow("Age", member.age?.let { "$it years" }.orEmpty())
                DetailRow("Date of birth", IstDate.fmtDdMmYyyy(member.dateOfBirth))
                DetailRow("Blood group", member.bloodGroup.orEmpty())
                DetailRow("Marital status", member.maritalStatus.orEmpty())
                DetailRow("Occupation", member.occupation.orEmpty())
                DetailRow("Education", member.education.orEmpty())
                DetailRow("Mobile", Phone.pretty10(member.mobile))
                DetailRow("Email", member.email.orEmpty())
                DetailRow("Nationality", member.nationality)
                DetailRow("Address", member.address.orEmpty())
                if (member.archiveState != 0) {
                    DetailRow("Archived", IstDate.fmtDdMmYyyy(member.archivedAt))
                    DetailRow("Reason", member.archiveReason.orEmpty())
                }
                DetailRow("Registered", IstDate.fmtDdMmYyyy(member.createdAt))
            }
        }

        if (state.certificates.isNotEmpty()) {
            item { SectionTitle("documents (${state.certificates.size})") }
            items(state.certificates.size) { index ->
                val certificate = state.certificates[index]
                RecordRow(
                    title = certificate.type,
                    code = certificate.certificateNumber,
                    subtitle = "issued ${IstDate.fmtDdMmYyyy(certificate.issuedDate)}",
                    status = certificate.status,
                    onClick = { },
                )
            }
        }
    }
}

data class MemberDetailUiState(
    val loading: Boolean = true,
    val member: MemberEntity? = null,
    val familyLabel: String? = null,
    val donationTotal: Double = 0.0,
    val certificates: List<CertificateEntity> = emptyList(),
)

@HiltViewModel
class MemberDetailViewModel @Inject constructor(
    private val members: MemberRepository,
    private val families: app.minzmahallu.core.domain.family.FamilyRepository,
    private val donations: DonationRepository,
    private val certificates: CertificateRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MemberDetailUiState())
    val state: StateFlow<MemberDetailUiState> = _state.asStateFlow()

    fun load(memberId: Long) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                kotlinx.coroutines.coroutineScope {
                    val member = async { members.byId(memberId) }
                    val total = async { donations.donorTotal(null, memberId) }
                    val docs = async { certificates.forMember(memberId) }
                    val row = member.await()
                    val family = async {
                        runCatching { families.byId(row.familyId) }.getOrNull()
                    }
                    Triple(row, total.await() to docs.await(), family.await())
                }
            }.onSuccess { (member, totals, family) ->
                val (total, docs) = totals
                _state.update {
                    it.copy(
                        loading = false,
                        member = member,
                        familyLabel = family?.let { row ->
                            listOfNotNull(
                                row.familyNumber,
                                row.houseName?.takeIf(String::isNotBlank),
                            ).joinToString(" · ")
                        },
                        donationTotal = total,
                        certificates = docs,
                    )
                }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }
}
