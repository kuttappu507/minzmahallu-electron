package app.minzmahallu.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import app.minzmahallu.core.model.AssetEntity
import app.minzmahallu.core.model.DonationCategory
import app.minzmahallu.core.model.DonationEntity
import app.minzmahallu.core.model.DonationWithCategory
import app.minzmahallu.core.model.LedgerAccount
import app.minzmahallu.core.model.SubscriptionEntity
import app.minzmahallu.core.model.SubscriptionPayment
import app.minzmahallu.core.model.SubscriptionPaymentWithFamily
import app.minzmahallu.core.model.SubscriptionPlan
import app.minzmahallu.core.model.SubscriptionWithFamily
import app.minzmahallu.core.model.TransactionEntity
import app.minzmahallu.core.model.TransactionWithRefs

/**
 * The recurring subscription account (one row per family) plus its
 * append-only payment ledger.
 */
@Dao
interface SubscriptionDao {

    @Query(
        """
        SELECT s.*, f.family_number, f.house_name,
          (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name,
          (SELECT sp.amount FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS month_cash,
          (SELECT sp.arrears_cleared FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS month_arrears_cleared,
          (SELECT sp.advance_added FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS month_advance_added,
          (SELECT sp.receipt_sent_at FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS wa_sent_at,
          (SELECT sp.receipt_delivered_at FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS wa_delivered_at,
          (SELECT sp.receipt_resends FROM subscription_payments sp
             WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
               AND sp.status = 'Active' LIMIT 1) AS wa_resends
        FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id
        WHERE (:search IS NULL OR s.receipt_number LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.family_number LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR :status = 'All Status' OR s.status = :status)
          AND (:approval IS NULL OR s.approval_status = :approval)
        ORDER BY s.payment_date IS NULL, s.payment_date DESC, s.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        status: String?,
        approval: String?,
        limit: Int,
        offset: Int,
    ): List<SubscriptionWithFamily>

    @Query(
        """
        SELECT COUNT(*) FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id
        WHERE (:search IS NULL OR s.receipt_number LIKE '%' || :search || '%'
               OR f.house_name LIKE '%' || :search || '%'
               OR f.family_number LIKE '%' || :search || '%')
          AND (:status IS NULL OR :status = 'All' OR :status = 'All Status' OR s.status = :status)
          AND (:approval IS NULL OR s.approval_status = :approval)
        """,
    )
    suspend fun count(search: String?, status: String?, approval: String?): Int

    @Query("SELECT * FROM subscriptions WHERE id = :id")
    suspend fun byId(id: Long): SubscriptionEntity?

    @Query("SELECT * FROM subscriptions WHERE family_id = :familyId LIMIT 1")
    suspend fun byFamily(familyId: Long): SubscriptionEntity?

    @Query("SELECT * FROM subscriptions ORDER BY id")
    suspend fun all(): List<SubscriptionEntity>

    @Query("SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY name")
    suspend fun plans(): List<SubscriptionPlan>

    @Query("SELECT * FROM subscription_plans WHERE frequency = :frequency AND is_active = 1 ORDER BY id LIMIT 1")
    suspend fun planFor(frequency: String): SubscriptionPlan?

    @Query(
        """
        SELECT COALESCE(SUM(MAX(0, MAX(0, amount - amount_paid) + COALESCE(arrears,0) - COALESCE(advance,0))), 0)
        FROM subscriptions WHERE family_id = :familyId AND status IN ('Pending','Partial','Overdue')
        """,
    )
    suspend fun familyBalance(familyId: Long): Double

    /** TRUE pending across every account — arrears + uncovered month − own advance. */
    @Query(
        """
        SELECT COALESCE(SUM(MAX(0, MAX(0, amount - amount_paid) + COALESCE(arrears,0) - COALESCE(advance,0))), 0)
        FROM subscriptions WHERE status IN ('Pending','Partial','Overdue')
        """,
    )
    suspend fun totalPending(): Double

    @Query("SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE status = 'Active'")
    suspend fun totalCollected(): Double

    @Query("SELECT receipt_number FROM subscription_payments WHERE receipt_number IS NOT NULL AND receipt_number != ''")
    suspend fun ledgerReceiptNumbers(): List<String>

    /**
     * Records that a subscription receipt went out on WhatsApp.
     *
     * The list on the WhatsApp screen reads `wa_sent_at`, which is a correlated
     * subquery over this column, so without this write the queue could never
     * move from "not sent" to "sent". It targets the payment the receipt
     * belongs to, identified through the subscription.
     */
    @Query(
        """
        UPDATE subscription_payments
        SET receipt_sent_at = :at, whatsapp_msg_id = :msgId
        WHERE subscription_id = :subscriptionId AND status = 'Active'
        """,
    )
    suspend fun markSubscriptionReceiptSent(subscriptionId: Long, at: String, msgId: String?)

    @Query("SELECT receipt_number FROM subscriptions WHERE receipt_number IS NOT NULL AND receipt_number != ''")
    suspend fun legacyReceiptNumbers(): List<String>

    /** Families whose current month the advance settled with no cash at all. */
    @Query(
        """
        SELECT s.id, s.family_id, f.family_number, f.house_name,
          (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name,
          s.amount, s.period_start
        FROM subscriptions s JOIN families f ON f.id = s.family_id
        WHERE s.advance_covered = 1 AND s.status = 'Paid'
          AND COALESCE(f.status, 'Active') = 'Active'
          AND NOT EXISTS (
            SELECT 1 FROM subscription_payments sp
            WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start
              AND sp.status = 'Active' AND sp.receipt_sent_at IS NOT NULL)
        ORDER BY f.family_number
        """,
    )
    suspend fun advanceReady(): List<AdvanceReadyRow>

    /** Accounts carrying past-month debt — what `markOverdue` flags. */
    @Query(
        """
        UPDATE subscriptions SET status = 'Overdue', updated_at = :now
        WHERE status IN ('Pending','Partial') AND COALESCE(arrears,0) > 0.004
        """,
    )
    suspend fun markOverdue(now: String): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(subscription: SubscriptionEntity): Long

    @Update
    suspend fun update(subscription: SubscriptionEntity)

    @Query("UPDATE subscriptions SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query(
        """
        UPDATE subscriptions SET pending_amount_paid = NULL, pending_payment_method = NULL,
          pending_payment_date = NULL WHERE id = :id
        """,
    )
    suspend fun clearParkedPayment(id: Long)

    @Query("DELETE FROM subscriptions WHERE id = :id")
    suspend fun delete(id: Long)

    // ------------------------------------------------------------ the ledger

    @Query(
        """
        SELECT * FROM subscription_payments
        WHERE subscription_id = :subscriptionId AND period_start = :periodStart
        LIMIT 1
        """,
    )
    suspend fun ledgerRowForPeriod(subscriptionId: Long, periodStart: String?): SubscriptionPayment?

    @Query(
        """
        SELECT * FROM subscription_payments
        WHERE subscription_id = :subscriptionId AND period_start = :periodStart
          AND status = 'Active' LIMIT 1
        """,
    )
    suspend fun activeLedgerRowForPeriod(subscriptionId: Long, periodStart: String?): SubscriptionPayment?

    @Query(
        """
        SELECT sp.*, f.family_number, f.house_name,
          (SELECT m.name FROM members m WHERE m.id = sp.member_id) AS member_name
        FROM subscription_payments sp LEFT JOIN families f ON f.id = sp.family_id
        WHERE sp.family_id = :familyId
        ORDER BY COALESCE(sp.period_start, '') DESC, sp.id DESC LIMIT :limit
        """,
    )
    suspend fun paymentHistory(familyId: Long, limit: Int = 60): List<SubscriptionPaymentWithFamily>

    @Query("SELECT * FROM subscription_payments WHERE id = :id")
    suspend fun paymentById(id: Long): SubscriptionPayment?

    @Query("SELECT verification_code FROM donations WHERE verification_code IS NOT NULL AND verification_code != ''")
    suspend fun donationVerificationCodes(): List<String>

    @Query(
        """
        SELECT COALESCE(SUM(amount), 0) FROM subscription_payments
        WHERE status = 'Active' AND strftime('%Y-%m', COALESCE(payment_date, period_start)) = :month
        """,
    )
    suspend fun collectedInMonth(month: String): Double

    @Query(
        """
        SELECT COUNT(*) FROM subscription_payments
        WHERE status = 'Active' AND amount > 0 AND date(payment_date) = :day
        """,
    )
    suspend fun receiptCountOn(day: String): Int

    @Query("SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE status = 'Active' AND amount > 0")
    suspend fun collectionsTotal(): Double

    @Insert
    suspend fun insertPayment(payment: SubscriptionPayment): Long

    @Update
    suspend fun updatePayment(payment: SubscriptionPayment)

    @Query("UPDATE subscription_payments SET status = 'Cancelled', updated_at = :now WHERE id = :id")
    suspend fun cancelPayment(id: Long, now: String)

    @Query(
        """
        UPDATE subscription_payments SET receipt_generated_at = :at WHERE id = :id
        """,
    )
    suspend fun markReceiptGenerated(id: Long, at: String)

    @Query("UPDATE subscription_payments SET receipt_sent_at = :at, whatsapp_msg_id = :msgId WHERE id = :id")
    suspend fun markReceiptSent(id: Long, at: String, msgId: String?)

    @Query("UPDATE subscription_payments SET receipt_delivered_at = :at WHERE id = :id")
    suspend fun markReceiptDelivered(id: Long, at: String)

    @Query(
        """
        SELECT COALESCE(SUM(amount), 0) FROM subscription_payments
        WHERE status = 'Active' AND amount > 0
          AND strftime('%Y-%m', payment_date) = :month
        """,
    )
    suspend fun collectionsInMonth(month: String): Double
}

data class AdvanceReadyRow(
    val id: Long,
    @androidx.room.ColumnInfo(name = "family_id") val familyId: Long,
    @androidx.room.ColumnInfo(name = "family_number") val familyNumber: String?,
    @androidx.room.ColumnInfo(name = "house_name") val houseName: String?,
    @androidx.room.ColumnInfo(name = "member_name") val memberName: String?,
    val amount: Double,
    @androidx.room.ColumnInfo(name = "period_start") val periodStart: String?,
)

@Dao
interface DonationDao {

    @Query(
        """
        SELECT d.*, c.name AS category_name, f.family_number, f.house_name
        FROM donations d
          LEFT JOIN donation_categories c ON c.id = d.category_id
          LEFT JOIN families f ON f.id = d.family_id
        WHERE (:search IS NULL OR d.donor_name LIKE '%' || :search || '%'
               OR d.receipt_number LIKE '%' || :search || '%'
               OR d.donor_phone LIKE '%' || :search || '%')
          AND (:category IS NULL OR :category = 'All' OR c.name = :category)
          AND (:approval IS NULL OR d.approval_status = :approval)
          AND (:from IS NULL OR d.donation_date >= :from)
          AND (:to IS NULL OR d.donation_date <= :to)
        ORDER BY d.donation_date DESC, d.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        category: String?,
        approval: String?,
        from: String?,
        to: String?,
        limit: Int,
        offset: Int,
    ): List<DonationWithCategory>

    @Query(
        """
        SELECT COUNT(*) FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id
        WHERE (:search IS NULL OR d.donor_name LIKE '%' || :search || '%'
               OR d.receipt_number LIKE '%' || :search || '%'
               OR d.donor_phone LIKE '%' || :search || '%')
          AND (:category IS NULL OR :category = 'All' OR c.name = :category)
          AND (:approval IS NULL OR d.approval_status = :approval)
          AND (:from IS NULL OR d.donation_date >= :from)
          AND (:to IS NULL OR d.donation_date <= :to)
        """,
    )
    suspend fun count(
        search: String?,
        category: String?,
        approval: String?,
        from: String?,
        to: String?,
    ): Int

    @Query("SELECT * FROM donations WHERE id = :id")
    suspend fun byId(id: Long): DonationEntity?

    @Query("SELECT receipt_number FROM donations WHERE receipt_number IS NOT NULL AND receipt_number != ''")
    suspend fun receiptNumbers(): List<String>

    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM donations
        WHERE strftime('%Y-%m', donation_date) = :month
          AND (approval_status IS NULL OR approval_status = 'approved')
        """,
    )
    suspend fun totalInMonth(month: String): Double

    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM donations
        WHERE date(donation_date) = :day
          AND (approval_status IS NULL OR approval_status = 'approved')
        """,
    )
    suspend fun totalOnDay(day: String): Double

    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM donations
        WHERE approval_status IS NULL OR approval_status = 'approved'
        """,
    )
    suspend fun totalAll(): Double

    @Query(
        """
        SELECT COUNT(*) FROM donations
        WHERE date(donation_date) = :day
          AND (approval_status IS NULL OR approval_status = 'approved')
        """,
    )
    suspend fun countOnDay(day: String): Int

    /** A donor's running total — the "member balance" panel on the form. */
    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM donations
        WHERE (approval_status IS NULL OR approval_status = 'approved')
          AND ((:familyId IS NOT NULL AND family_id = :familyId)
               OR (:memberId IS NOT NULL AND member_id = :memberId))
        """,
    )
    suspend fun donorTotal(familyId: Long?, memberId: Long?): Double

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(donation: DonationEntity): Long

    @Update
    suspend fun update(donation: DonationEntity)

    @Query("UPDATE donations SET approval_status = :status WHERE id = :id")
    suspend fun setApproval(id: Long, status: String)

    @Query("UPDATE donations SET receipt_generated_at = :at WHERE id = :id")
    suspend fun markReceiptGenerated(id: Long, at: String)

    @Query("UPDATE donations SET receipt_sent_at = :at, whatsapp_msg_id = :msgId WHERE id = :id")
    suspend fun markReceiptSent(id: Long, at: String, msgId: String?)

    @Query("UPDATE donations SET receipt_delivered_at = :at WHERE id = :id")
    suspend fun markReceiptDelivered(id: Long, at: String)

    @Query("DELETE FROM donations WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("SELECT * FROM donation_categories WHERE is_active = 1 ORDER BY name")
    suspend fun categories(): List<DonationCategory>

    @Query("SELECT * FROM donation_categories ORDER BY name")
    suspend fun categoriesAll(): List<DonationCategory>

    @Query("SELECT * FROM donation_categories WHERE id = :id")
    suspend fun categoryById(id: Long): DonationCategory?

    @Insert
    suspend fun insertCategory(category: DonationCategory): Long

    @Update
    suspend fun updateCategory(category: DonationCategory)

    @Query("UPDATE donation_categories SET is_active = :active WHERE id = :id")
    suspend fun setCategoryActive(id: Long, active: Int)

    @Query("SELECT COUNT(*) FROM donations WHERE category_id = :id")
    suspend fun categoryUsage(id: Long): Int

    @Query("DELETE FROM donation_categories WHERE id = :id")
    suspend fun deleteCategory(id: Long)
}

@Dao
interface LedgerDao {

    @Query(
        """
        SELECT t.*, u.username AS created_by_name, a.name AS asset_name,
          la.name AS account_name, la.code AS account_code
        FROM transactions t
          LEFT JOIN users u ON u.id = t.created_by
          LEFT JOIN assets a ON a.id = t.asset_id
          LEFT JOIN ledger_accounts la ON la.id = t.account_id
        WHERE (t.status IS NULL OR t.status != 'Void' OR :includeVoid = 1)
          AND (:search IS NULL OR t.description LIKE '%' || :search || '%'
               OR t.receipt_number LIKE '%' || :search || '%'
               OR t.transaction_ref LIKE '%' || :search || '%'
               OR t.voucher_no LIKE '%' || :search || '%'
               OR t.bill_no LIKE '%' || :search || '%'
               OR t.payee LIKE '%' || :search || '%'
               OR t.category LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR t.type = :type)
          AND (:from IS NULL OR t.txn_date >= :from)
          AND (:to IS NULL OR t.txn_date <= :to)
        ORDER BY t.txn_date DESC, t.id DESC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(
        search: String?,
        type: String?,
        from: String?,
        to: String?,
        includeVoid: Int,
        limit: Int,
        offset: Int,
    ): List<TransactionWithRefs>

    @Query(
        """
        SELECT COUNT(*) FROM transactions t
        WHERE (t.status IS NULL OR t.status != 'Void' OR :includeVoid = 1)
          AND (:search IS NULL OR t.description LIKE '%' || :search || '%'
               OR t.receipt_number LIKE '%' || :search || '%'
               OR t.transaction_ref LIKE '%' || :search || '%'
               OR t.voucher_no LIKE '%' || :search || '%'
               OR t.bill_no LIKE '%' || :search || '%'
               OR t.payee LIKE '%' || :search || '%'
               OR t.category LIKE '%' || :search || '%')
          AND (:type IS NULL OR :type = 'All' OR t.type = :type)
          AND (:from IS NULL OR t.txn_date >= :from)
          AND (:to IS NULL OR t.txn_date <= :to)
        """,
    )
    suspend fun count(search: String?, type: String?, from: String?, to: String?, includeVoid: Int): Int

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun byId(id: Long): TransactionEntity?

    @Query("SELECT receipt_number FROM transactions WHERE receipt_number IS NOT NULL AND receipt_number != ''")
    suspend fun receiptNumbers(): List<String>

    @Query("SELECT MAX(id) FROM transactions")
    suspend fun maxId(): Long?

    @Query("SELECT * FROM ledger_accounts WHERE is_active = 1 ORDER BY type, code")
    suspend fun accounts(): List<LedgerAccount>

    @Query("SELECT * FROM ledger_accounts WHERE id = :id")
    suspend fun accountById(id: Long): LedgerAccount?

    @Query("SELECT * FROM assets WHERE id = :id")
    suspend fun assetById(id: Long): AssetEntity?

    /** The duplicate-bill warning: same bill number already entered elsewhere. */
    @Query(
        """
        SELECT id, txn_date, description, amount FROM transactions
        WHERE bill_no = :billNo AND type = 'Expense' AND id != :excludeId
          AND (status IS NULL OR status != 'Void')
        ORDER BY id DESC LIMIT 1
        """,
    )
    suspend fun duplicateBill(billNo: String, excludeId: Long): DuplicateBill?

    @Query("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type = 'Income' AND (status IS NULL OR status != 'Void')")
    suspend fun totalIncome(): Double

    @Query("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type = 'Expense' AND (status IS NULL OR status != 'Void')")
    suspend fun totalExpense(): Double

    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM transactions
        WHERE type = 'Income' AND (status IS NULL OR status != 'Void')
          AND strftime('%Y-%m', txn_date) = :month
        """,
    )
    suspend fun incomeInMonth(month: String): Double

    @Query(
        """
        SELECT COALESCE(SUM(amount),0) FROM transactions
        WHERE type = 'Expense' AND (status IS NULL OR status != 'Void')
          AND strftime('%Y-%m', txn_date) = :month
        """,
    )
    suspend fun expenseInMonth(month: String): Double

    @Insert
    suspend fun insert(transaction: TransactionEntity): Long

    @Update
    suspend fun update(transaction: TransactionEntity)

    @Query(
        """
        UPDATE transactions SET status = 'Void', voided_at = :at, voided_by = :by,
          void_reason = :reason, updated_at = :at
        WHERE id = :id
        """,
    )
    // Named markVoid, not void: Room writes this DAO's implementation in Java,
    // where `void` is a keyword, so a method by that name cannot be overridden
    // and javac rejects the generated class.
    suspend fun markVoid(id: Long, reason: String, at: String, by: Long?)
}

data class DuplicateBill(
    val id: Long,
    @androidx.room.ColumnInfo(name = "txn_date") val txnDate: String?,
    val description: String?,
    val amount: Double,
)

@Dao
interface AssetDao {

    @Query(
        """
        SELECT * FROM assets
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR asset_code LIKE '%' || :search || '%'
               OR location LIKE '%' || :search || '%'
               OR tenant_name LIKE '%' || :search || '%')
          AND (:category IS NULL OR :category = 'All' OR category = :category)
          AND (:status IS NULL OR :status = 'All' OR status = :status)
        ORDER BY asset_code ASC
        LIMIT :limit OFFSET :offset
        """,
    )
    suspend fun page(search: String?, category: String?, status: String?, limit: Int, offset: Int): List<AssetEntity>

    @Query(
        """
        SELECT COUNT(*) FROM assets
        WHERE (:search IS NULL OR name LIKE '%' || :search || '%'
               OR asset_code LIKE '%' || :search || '%'
               OR location LIKE '%' || :search || '%'
               OR tenant_name LIKE '%' || :search || '%')
          AND (:category IS NULL OR :category = 'All' OR category = :category)
          AND (:status IS NULL OR :status = 'All' OR status = :status)
        """,
    )
    suspend fun count(search: String?, category: String?, status: String?): Int

    @Query("SELECT * FROM assets WHERE id = :id")
    suspend fun byId(id: Long): AssetEntity?

    @Query("SELECT * FROM assets ORDER BY asset_code ASC")
    suspend fun options(): List<AssetEntity>

    @Query("SELECT COALESCE(SUM(acquisition_cost),0) FROM assets")
    suspend fun acquisitionTotal(): Double

    @Query("SELECT COALESCE(SUM(current_value),0) FROM assets")
    suspend fun currentTotal(): Double

    @Query("SELECT COALESCE(SUM(monthly_rent),0) FROM assets WHERE income_generating = 1")
    suspend fun monthlyRentTotal(): Double

    @Query("SELECT COUNT(*) FROM assets")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(asset: AssetEntity): Long

    @Update
    suspend fun update(asset: AssetEntity)

    @Query("DELETE FROM assets WHERE id = :id")
    suspend fun delete(id: Long)
}
