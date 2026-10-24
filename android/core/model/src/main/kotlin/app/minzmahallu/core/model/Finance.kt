package app.minzmahallu.core.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * The family's subscription ACCOUNT — exactly ONE row per family (V030).
 *
 * Each period the same row is rolled forward: `amount` becomes the configured
 * rate and `amount_paid` resets. The money movements live in
 * [SubscriptionPayment], so history survives the roll. `arrears` is debt
 * carried from closed periods; `advance` is credit that pays future periods.
 */
@Entity(tableName = "subscriptions")
data class SubscriptionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "family_id") val familyId: Long,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "plan_id") val planId: Long,
    @ColumnInfo(name = "period_start") val periodStart: String? = null,
    @ColumnInfo(name = "period_end") val periodEnd: String? = null,
    @ColumnInfo(name = "amount") val amount: Double,
    @ColumnInfo(name = "amount_paid") val amountPaid: Double = 0.0,
    @ColumnInfo(name = "payment_date") val paymentDate: String? = null,
    @ColumnInfo(name = "receipt_number") val receiptNumber: String? = null,
    @ColumnInfo(name = "payment_method") val paymentMethod: String? = null,
    @ColumnInfo(name = "transaction_ref") val transactionRef: String? = null,
    @ColumnInfo(name = "status") val status: String = "Pending",
    @ColumnInfo(name = "collected_by") val collectedBy: Long? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = null,
    @ColumnInfo(name = "arrears") val arrears: Double = 0.0,
    @ColumnInfo(name = "advance") val advance: Double = 0.0,
    @ColumnInfo(name = "advance_covered") val advanceCovered: Int = 0,
    @ColumnInfo(name = "verification_code") val verificationCode: String? = null,
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "pending_amount_paid") val pendingAmountPaid: Double? = null,
    @ColumnInfo(name = "pending_payment_method") val pendingPaymentMethod: String? = null,
    @ColumnInfo(name = "pending_payment_date") val pendingPaymentDate: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

@Entity(tableName = "subscription_plans")
data class SubscriptionPlan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "frequency") val frequency: String,
    @ColumnInfo(name = "default_amount") val defaultAmount: Double = 0.0,
    @ColumnInfo(name = "is_active") val isActive: Int = 1,
    @ColumnInfo(name = "description") val description: String? = null,
)

/**
 * The append-only money ledger for subscriptions — one row per family per
 * period. Editing a payment never rewrites history: the row is marked
 * `Cancelled` and a new one is written.
 *
 * `arrearsCleared` / `advanceAdded` / `advanceUsed` remember how the cash was
 * allocated so a re-record or a cancel can roll the account back exactly.
 */
@Entity(tableName = "subscription_payments")
data class SubscriptionPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "subscription_id") val subscriptionId: Long,
    @ColumnInfo(name = "family_id") val familyId: Long,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "period_start") val periodStart: String? = null,
    @ColumnInfo(name = "period_end") val periodEnd: String? = null,
    @ColumnInfo(name = "amount") val amount: Double = 0.0,
    @ColumnInfo(name = "arrears_cleared") val arrearsCleared: Double = 0.0,
    @ColumnInfo(name = "advance_added") val advanceAdded: Double = 0.0,
    @ColumnInfo(name = "advance_used") val advanceUsed: Double = 0.0,
    @ColumnInfo(name = "receipt_number") val receiptNumber: String? = null,
    @ColumnInfo(name = "verification_code") val verificationCode: String? = null,
    @ColumnInfo(name = "payment_date") val paymentDate: String? = null,
    @ColumnInfo(name = "payment_method") val paymentMethod: String? = "Cash",
    @ColumnInfo(name = "transaction_ref") val transactionRef: String? = "",
    @ColumnInfo(name = "collected_by") val collectedBy: Long? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = "",
    @ColumnInfo(name = "status") val status: String = "Active",
    @ColumnInfo(name = "receipt_generated_at") val receiptGeneratedAt: String? = null,
    @ColumnInfo(name = "receipt_sent_at") val receiptSentAt: String? = null,
    @ColumnInfo(name = "receipt_delivered_at") val receiptDeliveredAt: String? = null,
    @ColumnInfo(name = "receipt_resends") val receiptResends: Int = 0,
    @ColumnInfo(name = "whatsapp_msg_id") val whatsappMsgId: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)

/** The account joined with the family name and the current month's ledger row. */
data class SubscriptionWithFamily(
    @androidx.room.Embedded val subscription: SubscriptionEntity,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
    @ColumnInfo(name = "member_name") val memberName: String?,
    @ColumnInfo(name = "month_cash") val monthCash: Double?,
    @ColumnInfo(name = "month_arrears_cleared") val monthArrearsCleared: Double?,
    @ColumnInfo(name = "month_advance_added") val monthAdvanceAdded: Double?,
    @ColumnInfo(name = "wa_sent_at") val waSentAt: String?,
    @ColumnInfo(name = "wa_delivered_at") val waDeliveredAt: String?,
    @ColumnInfo(name = "wa_resends") val waResends: Int?,
)

data class SubscriptionPaymentWithFamily(
    @androidx.room.Embedded val payment: SubscriptionPayment,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
    @ColumnInfo(name = "member_name") val memberName: String?,
)

@Entity(tableName = "donation_categories")
data class DonationCategory(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "description") val description: String? = null,
    @ColumnInfo(name = "is_active") val isActive: Int = 1,
)

@Entity(tableName = "donations")
data class DonationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "donor_name") val donorName: String,
    @ColumnInfo(name = "donor_phone") val donorPhone: String? = null,
    @ColumnInfo(name = "donor_address") val donorAddress: String? = null,
    @ColumnInfo(name = "family_id") val familyId: Long? = null,
    @ColumnInfo(name = "member_id") val memberId: Long? = null,
    @ColumnInfo(name = "category_id") val categoryId: Long,
    @ColumnInfo(name = "amount") val amount: Double,
    @ColumnInfo(name = "donation_date") val donationDate: String = SqlDefaults.date(),
    @ColumnInfo(name = "receipt_number") val receiptNumber: String? = null,
    @ColumnInfo(name = "verification_code") val verificationCode: String? = null,
    @ColumnInfo(name = "purpose") val purpose: String? = null,
    @ColumnInfo(name = "remarks") val remarks: String? = null,
    @ColumnInfo(name = "payment_method") val paymentMethod: String? = null,
    @ColumnInfo(name = "transaction_ref") val transactionRef: String? = null,
    @ColumnInfo(name = "received_by") val receivedBy: Long? = null,
    @ColumnInfo(name = "approval_status") val approvalStatus: String = "approved",
    @ColumnInfo(name = "receipt_generated_at") val receiptGeneratedAt: String? = null,
    @ColumnInfo(name = "receipt_sent_at") val receiptSentAt: String? = null,
    @ColumnInfo(name = "receipt_delivered_at") val receiptDeliveredAt: String? = null,
    @ColumnInfo(name = "receipt_resends") val receiptResends: Int = 0,
    @ColumnInfo(name = "whatsapp_msg_id") val whatsappMsgId: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

data class DonationWithCategory(
    @androidx.room.Embedded val donation: DonationEntity,
    @ColumnInfo(name = "category_name") val categoryName: String?,
    @ColumnInfo(name = "family_number") val familyNumber: String?,
    @ColumnInfo(name = "house_name") val houseName: String?,
)

/** The chart-of-accounts rows a manual ledger entry can be booked against. */
@Entity(tableName = "ledger_accounts")
data class LedgerAccount(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "code") val code: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "type") val type: String,
    @ColumnInfo(name = "category") val category: String? = null,
    @ColumnInfo(name = "is_active") val isActive: Int = 1,
)

/**
 * A manual income/expense entry. Never deleted — a mistake is VOIDED so the
 * receipt number stays occupied and the auditor can see both the original
 * entry and the reason.
 */
@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "txn_date") val txnDate: String = SqlDefaults.date(),
    @ColumnInfo(name = "account_id") val accountId: Long,
    @ColumnInfo(name = "type") val type: String,
    @ColumnInfo(name = "amount") val amount: Double,
    @ColumnInfo(name = "payment_method") val paymentMethod: String? = null,
    @ColumnInfo(name = "reference") val reference: String? = null,
    @ColumnInfo(name = "description") val description: String? = null,
    @ColumnInfo(name = "linked_module") val linkedModule: String? = null,
    @ColumnInfo(name = "linked_id") val linkedId: Long? = null,
    @ColumnInfo(name = "receipt_number") val receiptNumber: String? = null,
    @ColumnInfo(name = "transaction_ref") val transactionRef: String? = null,
    @ColumnInfo(name = "voucher_no") val voucherNo: String? = null,
    @ColumnInfo(name = "bill_no") val billNo: String? = null,
    @ColumnInfo(name = "payee") val payee: String? = null,
    @ColumnInfo(name = "category") val category: String? = null,
    @ColumnInfo(name = "asset_id") val assetId: Long? = null,
    @ColumnInfo(name = "status") val status: String = "Posted",
    @ColumnInfo(name = "voided_at") val voidedAt: String? = null,
    @ColumnInfo(name = "voided_by") val voidedBy: Long? = null,
    @ColumnInfo(name = "void_reason") val voidReason: String? = null,
    @ColumnInfo(name = "created_by") val createdBy: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String? = null,
)

/** A transaction joined with the names the ledger list displays. */
data class TransactionWithRefs(
    @androidx.room.Embedded val transaction: TransactionEntity,
    @ColumnInfo(name = "created_by_name") val createdByName: String?,
    @ColumnInfo(name = "asset_name") val assetName: String?,
    @ColumnInfo(name = "account_name") val accountName: String?,
    @ColumnInfo(name = "account_code") val accountCode: String?,
)

/** A building, land or rentable good on the asset register. */
@Entity(tableName = "assets")
data class AssetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "asset_code") val assetCode: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "category") val category: String = "Other",
    @ColumnInfo(name = "reference_no") val referenceNo: String? = "",
    @ColumnInfo(name = "location") val location: String? = "",
    @ColumnInfo(name = "acquisition_date") val acquisitionDate: String? = "",
    @ColumnInfo(name = "acquisition_cost") val acquisitionCost: Double = 0.0,
    @ColumnInfo(name = "current_value") val currentValue: Double = 0.0,
    @ColumnInfo(name = "status") val status: String = "In use",
    @ColumnInfo(name = "condition_note") val conditionNote: String? = "Good",
    @ColumnInfo(name = "custodian") val custodian: String? = "",
    @ColumnInfo(name = "income_generating") val incomeGenerating: Int = 0,
    @ColumnInfo(name = "tenant_name") val tenantName: String? = "",
    @ColumnInfo(name = "monthly_rent") val monthlyRent: Double = 0.0,
    @ColumnInfo(name = "agreement_start") val agreementStart: String? = "",
    @ColumnInfo(name = "agreement_end") val agreementEnd: String? = "",
    @ColumnInfo(name = "notes") val notes: String? = "",
    @ColumnInfo(name = "created_at") val createdAt: String = SqlDefaults.now(),
    @ColumnInfo(name = "updated_at") val updatedAt: String = SqlDefaults.now(),
)
