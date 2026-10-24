package app.minzmahallu.ui.screen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.minzmahallu.core.domain.certificate.CertificateRepository
import app.minzmahallu.core.domain.family.FamilyRepository
import app.minzmahallu.core.domain.subscription.SubscriptionRepository
import app.minzmahallu.core.model.CertificateEntity
import app.minzmahallu.core.model.FamilyEntity
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.model.SubscriptionPayment
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FamilyDetailUiState(
    val loading: Boolean = true,
    val family: FamilyEntity? = null,
    val members: List<MemberEntity> = emptyList(),
    val payments: List<SubscriptionPayment> = emptyList(),
    val certificates: List<CertificateEntity> = emptyList(),
    val due: Double = 0.0,
    val paid: Double = 0.0,
)

/**
 * A family's own page.
 *
 * `due` comes from the subscription row's own arrears/advance arithmetic and
 * `paid` from the sum of its payment history, so the stacked bar on the hero
 * panel is the same picture the desktop shows in the collection dialog.
 */
@HiltViewModel
class FamilyDetailViewModel @Inject constructor(
    private val families: FamilyRepository,
    private val subscriptions: SubscriptionRepository,
    private val certificates: CertificateRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(FamilyDetailUiState())
    val state: StateFlow<FamilyDetailUiState> = _state.asStateFlow()

    fun load(familyId: Long) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            runCatching {
                kotlinx.coroutines.coroutineScope {
                    val family = async { families.byId(familyId) }
                    val members = async { families.membersOf(familyId) }
                    val history = async { subscriptions.paymentsHistory(familyId) }
                    val due = async { subscriptions.familyBalance(familyId) }
                    val docs = async { certificates.forFamily(familyId) }

                    val payments = history.await()
                    _state.update {
                        it.copy(
                            loading = false,
                            family = family.await(),
                            members = members.await().sortedWith(headsFirst()),
                            payments = payments.map { row -> row.payment },
                            certificates = docs.await(),
                            due = due.await().coerceAtLeast(0.0),
                            paid = payments.sumOf { row -> row.payment.amount },
                        )
                    }
                }
            }.onFailure {
                _state.update { current -> current.copy(loading = false) }
            }
        }
    }

    /** The head leads, then everyone else in the order they were added. */
    private fun headsFirst(): Comparator<MemberEntity> =
        compareByDescending<MemberEntity> { it.isHead }.thenBy { it.id }
}
