package app.minzmahallu.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import app.minzmahallu.core.database.dao.AssetDao
import app.minzmahallu.core.database.dao.AuditDao
import app.minzmahallu.core.database.dao.CertificateDao
import app.minzmahallu.core.database.dao.CommitteeDao
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.HistoryDao
import app.minzmahallu.core.database.dao.LedgerDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.NotificationDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.database.dao.StaffDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.database.dao.TokenDao
import app.minzmahallu.core.database.dao.UserDao
import app.minzmahallu.core.database.dao.WelfareDao
import app.minzmahallu.core.model.AssetEntity
import app.minzmahallu.core.model.AuditEntry
import app.minzmahallu.core.model.CertificateEntity
import app.minzmahallu.core.model.CommitteeMember
import app.minzmahallu.core.model.DeathEntity
import app.minzmahallu.core.model.DonationCategory
import app.minzmahallu.core.model.DonationEntity
import app.minzmahallu.core.model.FamilyEntity
import app.minzmahallu.core.model.FamilyMove
import app.minzmahallu.core.model.LedgerAccount
import app.minzmahallu.core.model.MarriageEntity
import app.minzmahallu.core.model.MemberEntity
import app.minzmahallu.core.model.NotificationEntity
import app.minzmahallu.core.model.RecordHistory
import app.minzmahallu.core.model.SettingsEntity
import app.minzmahallu.core.model.StaffEntity
import app.minzmahallu.core.model.StaffPayment
import app.minzmahallu.core.model.SubscriptionEntity
import app.minzmahallu.core.model.SubscriptionPayment
import app.minzmahallu.core.model.SubscriptionPlan
import app.minzmahallu.core.model.TokenAssignment
import app.minzmahallu.core.model.TokenEvent
import app.minzmahallu.core.model.TransactionEntity
import app.minzmahallu.core.model.UserEntity
import app.minzmahallu.core.model.WelfareRequest

/**
 * The mahallu database.
 *
 * The schema is the Electron app's schema: same table names, same column names,
 * same CHECK-able value sets. A `mms.db` copied off the desktop application
 * (or restored from one of its `.mmbak` files) opens here without conversion,
 * and a database written here opens back on the desktop.
 */
@Database(
    entities = [
        UserEntity::class,
        SettingsEntity::class,
        AuditEntry::class,
        RecordHistory::class,
        FamilyEntity::class,
        MemberEntity::class,
        FamilyMove::class,
        StaffEntity::class,
        StaffPayment::class,
        CommitteeMember::class,
        SubscriptionEntity::class,
        SubscriptionPlan::class,
        SubscriptionPayment::class,
        DonationCategory::class,
        DonationEntity::class,
        LedgerAccount::class,
        TransactionEntity::class,
        AssetEntity::class,
        MarriageEntity::class,
        DeathEntity::class,
        WelfareRequest::class,
        CertificateEntity::class,
        TokenEvent::class,
        TokenAssignment::class,
        NotificationEntity::class,
    ],
    version = MahalluDatabase.VERSION,
    exportSchema = true,
)
abstract class MahalluDatabase : RoomDatabase() {

    abstract fun userDao(): UserDao
    abstract fun settingsDao(): SettingsDao
    abstract fun auditDao(): AuditDao
    abstract fun historyDao(): HistoryDao
    abstract fun familyDao(): FamilyDao
    abstract fun memberDao(): MemberDao
    abstract fun staffDao(): StaffDao
    abstract fun committeeDao(): CommitteeDao
    abstract fun subscriptionDao(): SubscriptionDao
    abstract fun donationDao(): DonationDao
    abstract fun ledgerDao(): LedgerDao
    abstract fun assetDao(): AssetDao
    abstract fun marriageDao(): MarriageDao
    abstract fun deathDao(): DeathDao
    abstract fun welfareDao(): WelfareDao
    abstract fun certificateDao(): CertificateDao
    abstract fun tokenDao(): TokenDao
    abstract fun notificationDao(): NotificationDao

    companion object {
        const val VERSION = 1
        const val NAME = "mms.db"

        /**
         * The two publicly-known placeholder administrator hashes from the
         * desktop demo seed. An install whose only account is one of these is
         * forced through Initial Setup rather than accepting a password that
         * anyone who read the desktop source already knows.
         */
        val SEEDED_ADMIN_HASHES = listOf(
            "pbkdf2_sha256\$200000\$c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=\$dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=",
            "pbkdf2_sha256\$200000\$zRLKI0xyc2sYKBzQaWXl6w==\$qHO4yvos81/Oah+ECzVbh1ZHPz3rEhRHOJT2criWCPg=",
        )

        fun build(context: Context): MahalluDatabase =
            Room.databaseBuilder(context, MahalluDatabase::class.java, NAME)
                // A future version bump adds a Migration here; falling back to
                // a destructive migration would silently destroy a mahallu's
                // register, which is never acceptable for this data.
                .addCallback(SeedCallback)
                .build()
    }

    /**
     * Seeds the reference rows the desktop schema ships with (`INSERT OR IGNORE`
     * in `schema.sql`): the settings row, the subscription plans, the donation
     * categories and the chart of accounts. Runs once, on first open.
     */
    private object SeedCallback : Callback() {
        override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
            SeedStatements.ALL.forEach { db.execSQL(it) }
        }
    }
}

/**
 * Plain SQL seed statements. Kept as SQL rather than Room inserts because they
 * run inside `onCreate`, before the database object is usable, and because
 * staying textually close to `resources/sql/schema.sql` keeps the two apps'
 * fresh installs identical.
 */
internal object SeedStatements {

    val ALL: List<String> = listOf(
        // settings — exactly one row, id = 1.
        """
        INSERT OR IGNORE INTO settings (id, mahallu_name, financial_year_start, currency_symbol,
          subscription_monthly_amount, subscription_frequency, subscription_quarterly_amount,
          theme, language, auto_backup, backup_interval_hours, backup_keep_count, receipt_prefix)
        VALUES (1, 'Minz Mahallu Management', '04-01', '₹', 100, 'Monthly', 300,
          'light', 'ml', 1, 24, 30, 'RCP')
        """.trimIndent(),

        """
        INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount) VALUES
          ('Monthly Subscription', 'Monthly', 100),
          ('Yearly Subscription', 'Yearly', 1200),
          ('Special Subscription', 'OneTime', 0)
        """.trimIndent(),

        """
        INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount, description, is_active)
        VALUES ('Quarterly Subscription', 'Quarterly', 300, 'Automatic quarterly household subscription', 1)
        """.trimIndent(),

        """
        INSERT OR IGNORE INTO donation_categories (name) VALUES
          ('General Donation'), ('Masjid Donation'), ('Building Fund'),
          ('Education Fund'), ('Medical Fund')
        """.trimIndent(),

        """
        INSERT OR IGNORE INTO ledger_accounts (code, name, type, category) VALUES
          ('INC-SUB',  'Subscription Income',   'Income',  'Subscription'),
          ('INC-DON',  'Donation Income',       'Income',  'Donation'),
          ('INC-RENT', 'Rent Income',           'Income',  'Rent'),
          ('INC-OTH',  'Other Income',          'Income',  'Other'),
          ('EXP-SAL',  'Salary Expense',        'Expense', 'Salary'),
          ('EXP-ELC',  'Electricity Expense',   'Expense', 'Electricity'),
          ('EXP-WAT',  'Water Expense',         'Expense', 'Water'),
          ('EXP-MAINT','Maintenance Expense',   'Expense', 'Maintenance'),
          ('EXP-WEL',  'Welfare Expense',       'Expense', 'Welfare'),
          ('EXP-OTH',  'Other Expense',         'Expense', 'Other')
        """.trimIndent(),
    )
}
