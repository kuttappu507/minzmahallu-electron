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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.HeroPanel
import app.minzmahallu.core.ui.component.IconButton
import app.minzmahallu.core.ui.component.ListSkeleton
import app.minzmahallu.core.ui.component.Pill
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.ScreenHeader
import app.minzmahallu.ui.common.SectionTitle
import app.minzmahallu.core.ui.component.StatusPill
import app.minzmahallu.core.ui.component.chart.StackedBar
import app.minzmahallu.core.ui.foundation.Amount
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.CodeText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.Gutters
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.ModuleTint

/**
 * A single family: its identity, its members, its subscription ledger and the
 * documents issued to it — the phone equivalent of clicking a row in the
 * desktop's Families table.
 */
@Composable
fun FamilyDetailScreen(
    familyId: Long,
    onBack: () -> Unit,
    onOpenMember: (Long) -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: FamilyDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(familyId) { viewModel.load(familyId) }

    if (state.loading || state.family == null) {
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

    val family = state.family!!
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
                    title = family.houseName.orEmpty().ifBlank { family.familyNumber },
                    eyebrow = family.familyNumber,
                    subtitle = listOfNotNull(family.ward, family.area)
                        .filter { it.isNotBlank() }
                        .joinToString(" · ")
                        .ifBlank { null },
                    back = onBack,
                    trailing = {
                        StatusPill(family.status)
                    },
                )
            }
        }

        item {
            HeroPanel(tint = ModuleTint.Teal) {
                Eyebrow("subscription")
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
                    Amount(
                        value = state.due,
                        style = MahalluTheme.type.display,
                        color = if (state.due > 0.004) colors.gold else colors.accent,
                        modifier = Modifier.weight(1f),
                    )
                    AppText(
                        text = if (state.due > 0.004) "outstanding" else "settled",
                        style = MahalluTheme.type.label,
                        color = colors.textSecondary,
                    )
                }
                if (state.paid + state.due > 0) {
                    Spacer(Modifier.height(16.dp))
                    StackedBar(
                        segments = listOf(
                            state.paid to colors.accent,
                            state.due to colors.gold,
                        ),
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth()) {
                        AppText(
                            text = "paid ${app.minzmahallu.core.common.IndianGrouping.formatAmount(state.paid)}",
                            style = MahalluTheme.type.micro,
                            color = colors.textFaint,
                            modifier = Modifier.weight(1f),
                        )
                        AppText(
                            text = "due ${app.minzmahallu.core.common.IndianGrouping.formatAmount(state.due)}",
                            style = MahalluTheme.type.micro,
                            color = colors.textFaint,
                        )
                    }
                }
            }
        }

        item {
            Card(title = "Household") {
                DetailRow("House number", family.houseNumber.orEmpty())
                DetailRow("Ward", family.ward.orEmpty())
                DetailRow("Area", family.area.orEmpty())
                DetailRow("Address", family.address.orEmpty())
                DetailRow("PIN code", family.pincode.orEmpty())
                DetailRow("Phone", Phone.pretty10(family.phone))
                if (!family.alternativePhone.isNullOrBlank()) {
                    DetailRow("Alt. phone", Phone.pretty10(family.alternativePhone))
                }
                DetailRow(
                    "WhatsApp",
                    if (family.whatsappEnabled == 1) {
                        Phone.pretty10(family.whatsappPhone?.ifBlank { family.phone })
                    } else {
                        "disabled"
                    },
                )
                if (!family.notes.isNullOrBlank()) DetailRow("Notes", family.notes)
                DetailRow("Registered", IstDate.fmtDdMmYyyy(family.createdAt))
            }
        }

        item {
            SectionTitle("members (${state.members.size})")
        }

        items(state.members.size) { index ->
            val member = state.members[index]
            RecordRow(
                title = member.name,
                code = member.memberCode,
                subtitle = listOfNotNull(
                    member.relationship?.takeIf { it.isNotBlank() },
                    member.gender,
                    member.age?.let { "$it yrs" },
                ).joinToString(" · ").ifBlank { null },
                // archive_state is the real archived flag; `status` stays Active.
                status = when {
                    member.archiveState != 0 -> "Archived"
                    member.status == "Deceased" -> "Deceased"
                    member.isHead == 1 -> "Head"
                    else -> null
                },
                dimmed = member.status != "Active",
                onClick = { onOpenMember(member.id) },
            )
        }

        if (state.payments.isNotEmpty()) {
            item { SectionTitle("subscription payments") }
            items(state.payments.size) { index ->
                val payment = state.payments[index]
                RecordRow(
                    title = IstDate.monthLabel(payment.periodStart),
                    code = payment.receiptNumber,
                    subtitle = listOfNotNull(
                        payment.paymentMethod,
                        IstDate.fmtDdMmYyyy(payment.paymentDate),
                    ).joinToString(" · "),
                    status = payment.status,
                    amount = payment.amount,
                    onClick = { },
                )
            }
        }

        if (state.certificates.isNotEmpty()) {
            item { SectionTitle("documents") }
            items(state.certificates.size) { index ->
                val certificate = state.certificates[index]
                RecordRow(
                    title = certificate.type,
                    code = certificate.certificateNumber,
                    subtitle = listOfNotNull(
                        certificate.issuedTo,
                        "issued ${IstDate.fmtDdMmYyyy(certificate.issuedDate)}",
                    ).joinToString(" · "),
                    status = certificate.status,
                    onClick = { },
                )
            }
        }
    }
}
