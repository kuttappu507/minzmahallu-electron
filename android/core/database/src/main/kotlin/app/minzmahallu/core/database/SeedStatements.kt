package app.minzmahallu.core.database

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

        // Demo administrator placeholder: seeded with known hash so that on a fresh install,
        // if user tries to login with admin / admin123 BEFORE initial setup, it is either replaced
        // during setup or recognized.
        """
        INSERT OR IGNORE INTO users (id, username, full_name, password_hash, password_salt, role, is_active, is_locked, failed_attempts, must_change_pwd)
        VALUES (1, 'admin', 'System Administrator',
          'pbkdf2_sha256${'$'}200000${'$'}c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=${'$'}dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=',
          'c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=', 'Administrator', 1, 0, 0, 1)
        """.trimIndent(),
    )
}
