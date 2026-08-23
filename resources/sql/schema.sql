-- ============================================================================
-- Mahallu Management System (MMS) - SQLite Database Schema
-- Version: 1.0.0
-- Engine: SQLite 3.35+ (required for RETURNING clause)
-- ============================================================================
-- This script creates the full production schema in dependency order.
-- It is idempotent: each CREATE uses IF NOT EXISTS.
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA encoding = 'UTF-8';

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
);
INSERT OR IGNORE INTO schema_version (version, description) VALUES (1, 'Initial production schema v1.0.0');

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Administrator','President','Secretary','Treasurer','Imam','Staff','Auditor')),
    email TEXT, phone TEXT, is_active INTEGER NOT NULL DEFAULT 1, is_locked INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_login_at TEXT,
    must_change_pwd INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 0, UNIQUE(role, module, action)
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mahallu_name TEXT NOT NULL DEFAULT 'Minz Mahallu Management', address TEXT, phone TEXT, email TEXT,
    logo_path TEXT, seal_path TEXT, financial_year_start TEXT NOT NULL DEFAULT '04-01', currency_symbol TEXT NOT NULL DEFAULT '₹',
    subscription_monthly_amount REAL NOT NULL DEFAULT 100,
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')), language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ml')),
    backup_dir TEXT, auto_backup INTEGER NOT NULL DEFAULT 1, backup_interval_hours INTEGER NOT NULL DEFAULT 24,
    receipt_prefix TEXT NOT NULL DEFAULT 'RCP', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT, family_number TEXT NOT NULL UNIQUE, house_name TEXT, house_number TEXT, ward TEXT,
    area TEXT, address TEXT, pincode TEXT, phone TEXT, alternative_phone TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Archived')), notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_families_ward ON families(ward);
CREATE INDEX IF NOT EXISTS idx_families_status ON families(status);
CREATE INDEX IF NOT EXISTS idx_families_house ON families(house_name);

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, member_code TEXT UNIQUE, photo_path TEXT,
    name TEXT NOT NULL, arabic_name TEXT, gender TEXT NOT NULL CHECK (gender IN ('Male','Female','Other')),
    date_of_birth TEXT, age INTEGER, blood_group TEXT, occupation TEXT, education TEXT,
    marital_status TEXT CHECK (marital_status IN ('Single','Married','Divorced','Widowed')),
    mobile TEXT, email TEXT, nationality TEXT NOT NULL DEFAULT 'Indian', address TEXT, emergency_contact TEXT,
    relationship TEXT, is_head INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Deceased')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_members_family ON members(family_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_mobile ON members(mobile);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    frequency TEXT NOT NULL CHECK (frequency IN ('Monthly','Yearly','OneTime')),
    default_amount REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, description TEXT
);
INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount) VALUES
 ('Monthly Subscription','Monthly',100),('Yearly Subscription','Yearly',1200),('Special Subscription','OneTime',0);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, member_id INTEGER, plan_id INTEGER NOT NULL,
    period_start TEXT, period_end TEXT, amount REAL NOT NULL, amount_paid REAL NOT NULL DEFAULT 0, payment_date TEXT,
    receipt_number TEXT UNIQUE, payment_method TEXT CHECK (payment_method IN ('Cash','Cheque','UPI','Bank Transfer','Card','Other')),
    transaction_ref TEXT, status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid','Pending','Overdue','Partial')),
    collected_by INTEGER, remarks TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE RESTRICT, FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id), FOREIGN KEY (collected_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_subs_family ON subscriptions(family_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subs_period ON subscriptions(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_subs_receipt ON subscriptions(receipt_number);

CREATE TABLE IF NOT EXISTS donation_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT, is_active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO donation_categories (name) VALUES ('General Donation'),('Masjid Donation'),('Building Fund'),('Education Fund'),('Medical Fund');

CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, donor_name TEXT NOT NULL, donor_phone TEXT, donor_address TEXT,
    family_id INTEGER, member_id INTEGER, category_id INTEGER NOT NULL, amount REAL NOT NULL,
    donation_date TEXT NOT NULL DEFAULT (date('now')), receipt_number TEXT UNIQUE, purpose TEXT, remarks TEXT,
    payment_method TEXT CHECK (payment_method IN ('Cash','Cheque','UPI','Bank Transfer','Card','Other')), received_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES donation_categories(id), FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL, FOREIGN KEY (received_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_don_date ON donations(donation_date);
CREATE INDEX IF NOT EXISTS idx_don_category ON donations(category_id);
CREATE INDEX IF NOT EXISTS idx_don_donor ON donations(donor_name);

-- The remaining module tables are kept in the production schema used by existing releases.
CREATE TABLE IF NOT EXISTS ledger_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('Income','Expense','Asset','Liability')), category TEXT, is_active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, txn_date TEXT NOT NULL DEFAULT (date('now')), account_id INTEGER NOT NULL, type TEXT NOT NULL CHECK (type IN ('Income','Expense')), amount REAL NOT NULL, payment_method TEXT, reference TEXT, description TEXT, linked_module TEXT, linked_id INTEGER, receipt_number TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
