package app.minzmahallu.core.domain.finance

import app.minzmahallu.core.common.ApprovalStatus
import app.minzmahallu.core.common.DocNumber
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Money
import app.minzmahallu.core.common.LedgerType
import app.minzmahallu.core.common.PaymentMethod
import app.minzmahallu.core.common.ReceiptKind
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.DonationCategory
import app.minzmahallu.core.model.DonationEntity
import app.minzmahallu.core.model.DonationWithCategory
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DonationRepository @Inject constructor(
    private val dao: DonationDao,
    private val settings: SettingsDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        category: String?,
        from: String? = null,
        to: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
        includePending: Boolean = false,
    ): PagedList<DonationWithCategory> {
        val q = search?.trim()?.ifBlank { null }
        val approval = if (includePending) ApprovalStatus.Pending.wire else null
        val rows = dao.page(q, category, approval, from, to, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, category, approval, from, to)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): DonationEntity = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun categories(): List<DonationCategory> = dao.categories()

    suspend fun categoriesAll(): List<DonationCategory> = dao.categoriesAll()

    suspend fun totalInMonth(month: String): Double = dao.totalInMonth(month)

    suspend fun totalOnDay(day: String): Double = dao.totalOnDay(day)

    suspend fun donorTotal(familyId: Long?, memberId: Long?): Double = dao.donorTotal(familyId, memberId)

    suspend fun create(input: DonationInput): CreatedDonation {
        val actor = auth.requireActor()
        if (input.donorName.isBlank()) fail(ErrorKeys.VALIDATION, "donor name")
        Money.error(input.amount.toString())?.let { fail(ErrorKeys.VALIDATION, "amount") }

        val date = input.donationDate ?: IstDate.today()
        val receipt = input.receiptNumber?.trim()?.ifBlank { null } ?: nextReceiptNumber(date)
        val pending = RoleAccess.createsPending(actor.role)

        val id = dao.insert(
            DonationEntity(
                donorName = input.donorName.trim(),
                donorPhone = input.donorPhone.trim().ifBlank { null },
                donorAddress = input.donorAddress.trim().ifBlank { null },
                familyId = input.familyId,
                memberId = input.memberId,
                categoryId = input.categoryId,
                amount = input.amount,
                donationDate = date,
                receiptNumber = receipt,
                purpose = input.purpose.trim().ifBlank { null },
                remarks = input.remarks.trim().ifBlank { null },
                paymentMethod = input.paymentMethod.wire,
                transactionRef = input.transactionRef.trim().ifBlank { null },
                receivedBy = actor.id,
                approvalStatus = if (pending) ApprovalStatus.Pending.wire else ApprovalStatus.Approved.wire,
            ),
        )
        auth.log(
            actor.id, actor.username, "CREATE", "donations", id,
            "Donation ${input.amount} from ${input.donorName.trim()} — receipt $receipt" +
                if (pending) " (awaiting approval)" else "",
        )
        return CreatedDonation(id, receipt, pending)
    }

    /**
     * Edit a donation — refused outright once a receipt exists for it. The copy
     * the donor already holds must keep matching the register in every field,
     * so a wrong donation is cancelled and recorded fresh instead.
     */
    suspend fun update(id: Long, input: DonationInput, adminPassword: String, reason: String) {
        val actor = auth.verifyAdminPassword(adminPassword, "DONATION_EDIT", reason)
        val existing = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (existing.receiptGeneratedAt != null) fail(ErrorKeys.RECEIPT_FROZEN)
        Money.error(input.amount.toString())?.let { fail(ErrorKeys.VALIDATION, "amount") }
        dao.update(
            existing.copy(
                donorName = input.donorName.trim(),
                donorPhone = input.donorPhone.trim().ifBlank { null },
                donorAddress = input.donorAddress.trim().ifBlank { null },
                familyId = input.familyId,
                memberId = input.memberId,
                categoryId = input.categoryId,
                amount = input.amount,
                donationDate = input.donationDate ?: existing.donationDate,
                purpose = input.purpose.trim().ifBlank { null },
                remarks = input.remarks.trim().ifBlank { null },
                paymentMethod = input.paymentMethod.wire,
                transactionRef = input.transactionRef.trim().ifBlank { null },
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
        auth.log(actor.id, actor.username, "UPDATE", "donations", id, "Donation edited: $reason")
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "DONATION_DELETE", reason)
        val existing = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (existing.receiptGeneratedAt != null) fail(ErrorKeys.RECEIPT_FROZEN)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "donations", id, "Donation deleted: ${reason.trim()}")
    }

    /** Records that the receipt PDF was produced — this is what freezes the row. */
    suspend fun markReceiptGenerated(id: Long) {
        dao.markReceiptGenerated(id, IstDate.dateTimeStr())
    }

    suspend fun markReceiptSent(id: Long, msgId: String?) = dao.markReceiptSent(id, IstDate.dateTimeStr(), msgId)

    suspend fun markReceiptDelivered(id: Long) = dao.markReceiptDelivered(id, IstDate.dateTimeStr())

    // ------------------------------------------------------------- categories

    suspend fun createCategory(name: String, description: String): Long {
        val actor = auth.requireActor()
        if (name.isBlank()) fail(ErrorKeys.VALIDATION, "category name")
        val id = dao.insertCategory(DonationCategory(name = name.trim(), description = description.trim().ifBlank { null }))
        auth.log(actor.id, actor.username, "CREATE", "donations", id, "Donation category '${name.trim()}' added")
        return id
    }

    suspend fun updateCategory(id: Long, name: String, description: String) {
        val category = dao.categoryById(id) ?: fail(ErrorKeys.NOT_FOUND)
        dao.updateCategory(category.copy(name = name.trim(), description = description.trim().ifBlank { null }))
    }

    suspend fun setCategoryActive(id: Long, active: Boolean) = dao.setCategoryActive(id, if (active) 1 else 0)

    /** A category in use cannot be deleted — its donations would lose their label. */
    suspend fun removeCategory(id: Long) {
        if (dao.categoryUsage(id) > 0) fail(ErrorKeys.CATEGORY_IN_USE)
        dao.deleteCategory(id)
    }

    private suspend fun nextReceiptNumber(date: String): String {
        val config = settings.get()
        val prefix = DocNumber.mahalluPrefix(config?.receiptPrefix, config?.mahalluName)
        return DocNumber.nextReceiptNumber(
            dateStr = date,
            kind = ReceiptKind.Donation,
            mahalluPrefix = prefix,
            existingNumbers = dao.receiptNumbers(),
        )
    }
}

data class DonationInput(
    val donorName: String,
    val donorPhone: String = "",
    val donorAddress: String = "",
    val familyId: Long? = null,
    val memberId: Long? = null,
    val categoryId: Long,
    val amount: Double,
    val donationDate: String? = null,
    val receiptNumber: String? = null,
    val purpose: String = "",
    val remarks: String = "",
    val paymentMethod: PaymentMethod = PaymentMethod.Cash,
    val transactionRef: String = "",
)

data class CreatedDonation(val id: Long, val receiptNumber: String, val awaitingApproval: Boolean)
