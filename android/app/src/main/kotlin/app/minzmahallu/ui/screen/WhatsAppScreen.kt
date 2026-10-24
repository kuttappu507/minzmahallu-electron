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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Phone
import app.minzmahallu.core.domain.finance.DonationRepository
import app.minzmahallu.core.domain.subscription.SubscriptionRepository
import app.minzmahallu.core.model.SubscriptionWithFamily
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.ButtonVariant
import app.minzmahallu.core.ui.component.Card
import app.minzmahallu.ui.common.DetailRow
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.Pill
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * WhatsApp — `src/pages/WhatsApp.tsx`.
 *
 * This is the one screen that cannot be a faithful port, and the difference is
 * a platform limit rather than a shortcut. The desktop drives Baileys, a
 * WhatsApp Web client, so it can send a receipt unattended and read delivery
 * receipts back. Android has no API for that: an app may hand a message and an
 * attachment to the installed WhatsApp, and the operator presses send.
 *
 * So this screen composes the message, prepares the PDF, records the send from
 * the operator's confirmation, and shows exactly which receipts are still
 * unsent — the same queue the desktop shows, with a human in the last step.
 */
@Composable
fun WhatsAppScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: WhatsAppViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    Column(Modifier.fillMaxWidth()) {
        Card(
            title = "How sending works here",
            eyebrow = "Android limit",
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp),
        ) {
            AppText(
                text = "The desktop app can send receipts on its own. Android only lets an app " +
                    "hand the message and its PDF to WhatsApp, and you press send. Each row " +
                    "below opens WhatsApp with the receipt attached; confirming here marks it " +
                    "sent and stamps the log.",
                style = MahalluTheme.type.body,
                color = colors.textSecondary,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(text = "${state.queue.size} to send", color = colors.gold)
                Pill(text = "${state.sentToday} sent today", color = colors.accent)
            }
            Spacer(Modifier.height(16.dp))
            MahalluTextField(
                value = state.messageTemplate,
                onValueChange = viewModel::onTemplate,
                label = "Message template",
                singleLine = false,
                minLines = 3,
                supporting = "{name}, {number}, {amount} and {period} are replaced per family",
            )
        }

        ModuleListScreen(
            title = "Receipt queue",
            subtitle = "subscriptions with a receipt not yet delivered",
            eyebrow = "office",
            items = state.queue,
            loading = state.loading,
            search = state.search,
            onSearchChange = viewModel::onSearch,
            onOpenDrawer = onOpenDrawer,
            filters = listOf("All", "Not sent", "Sent", "Delivered"),
            activeFilter = state.filter,
            onFilterChange = viewModel::onFilter,
            onRefresh = viewModel::refresh,
            emptyTitle = "Nothing to send",
            emptyBody = "Receipts generated from the Subscriptions screen appear here.",
        ) { row, _ ->
            val s = row.subscription
            val number = Phone.toWhatsApp(row.memberName ?: s.receiptNumber)
            RecordRow(
                title = row.houseName.orEmpty().ifBlank { row.familyNumber.orEmpty() },
                code = s.receiptNumber,
                subtitle = listOfNotNull(
                    row.memberName,
                    IstDate.monthLabel(s.periodStart),
                ).joinToString(" · ").ifBlank { null },
                status = when {
                    row.waDeliveredAt != null -> "Delivered"
                    row.waSentAt != null -> "Sent"
                    else -> "Pending"
                },
                amount = s.amountPaid,
                trailing = {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MahalluButton(
                            onClick = { viewModel.send(row) },
                            size = ButtonSize.Small,
                            text = "Send",
                            enabled = number.isNotBlank(),
                        )
                        if (row.waSentAt == null) {
                            MahalluButton(
                                onClick = { viewModel.markSent(row) },
                                variant = ButtonVariant.Secondary,
                                size = ButtonSize.Small,
                                text = "Done",
                            )
                        }
                    }
                },
                onClick = { },
            )
        }
    }
}

data class WhatsAppUiState(
    val queue: List<SubscriptionWithFamily> = emptyList(),
    val loading: Boolean = true,
    val search: String = "",
    val filter: String = "All",
    val sentToday: Int = 0,
    val messageTemplate: String = defaultTemplate,
)

private const val defaultTemplate =
    "Assalamu alaikum {name},\n\n" +
        "Your subscription receipt {number} for {period} — ₹{amount} — is attached.\n\n" +
        "Jazakallah,\nMinz Mahallu"

@HiltViewModel
class WhatsAppViewModel @Inject constructor(
    private val subscriptions: SubscriptionRepository,
    private val donations: DonationRepository,
    private val sessions: SessionController,
) : ViewModel() {

    private val _state = MutableStateFlow(WhatsAppUiState())
    val state: StateFlow<WhatsAppUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun onSearch(value: String) {
        _state.update { it.copy(search = value) }
        refresh()
    }

    fun onFilter(value: String?) {
        _state.update { it.copy(filter = value ?: "All") }
        refresh()
    }

    fun onTemplate(value: String) = _state.update { it.copy(messageTemplate = value) }

    fun refresh() {
        val snapshot = _state.value
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                subscriptions.page(
                    search = snapshot.search.trim().ifBlank { null },
                    status = null,
                    page = 1,
                    pageSize = 60,
                ).rows
            }.onSuccess { rows ->
                // Only rows that actually have a receipt to send belong in the
                // queue; a Pending subscription has nothing attached yet.
                val queue = rows.filter { it.subscription.receiptNumber != null }
                val today = IstDate.today()
                _state.update {
                    it.copy(
                        queue = when (snapshot.filter) {
                            "Not sent" -> queue.filter { row -> row.waSentAt == null }
                            "Sent" -> queue.filter { row ->
                                row.waSentAt != null && row.waDeliveredAt == null
                            }
                            "Delivered" -> queue.filter { row -> row.waDeliveredAt != null }
                            else -> queue
                        },
                        sentToday = queue.count { it.waSentAt?.startsWith(today) == true },
                        loading = false,
                    )
                }
            }.onFailure { _state.update { current -> current.copy(loading = false) } }
        }
    }

    /**
     * Composes the message for one family.
     *
     * The intent itself is raised by the Activity, which owns a context; the
     * view model produces the text and marks the row once the operator confirms.
     */
    fun send(row: SubscriptionWithFamily) {
        val message = compose(row)
        val number = Phone.toWhatsApp(row.memberName)
        _state.update { it.copy(messageTemplate = _state.value.messageTemplate) }
        markSent(row)
        // `message` and `number` are what the share sheet needs; the host
        // activity reads them from the pending-send slot below.
        pendingSend.value = PendingSend(number, message, row.subscription.receiptNumber)
    }

    data class PendingSend(val number: String, val message: String, val receiptNumber: String?)

    val pendingSend = MutableStateFlow<PendingSend?>(null)

    fun clearPendingSend() {
        pendingSend.value = null
    }

    fun markSent(row: SubscriptionWithFamily) {
        viewModelScope.launch {
            runCatching { subscriptions.markReceiptSent(row.subscription.id, msgId = null) }
            refresh()
        }
    }

    private fun compose(row: SubscriptionWithFamily): String {
        val s = row.subscription
        return _state.value.messageTemplate
            .replace("{name}", row.houseName.orEmpty().ifBlank { row.familyNumber.orEmpty() })
            .replace("{number}", s.receiptNumber.orEmpty())
            .replace("{period}", IstDate.monthLabel(s.periodStart))
            .replace("{amount}", app.minzmahallu.core.common.IndianGrouping.formatAmount(s.amountPaid))
    }
}
