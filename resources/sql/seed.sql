-- MMS Seed Data
-- ============================================================================
-- Only FUNCTIONAL base configuration lives here (admin account, settings row,
-- one extra subscription plan). All demo/record data is provided by migration
-- V032 (fresh complete dataset, every column filled) — no mock families,
-- members, donations or transactions are seeded here anymore.
-- ============================================================================
PRAGMA foreign_keys = OFF;

INSERT OR IGNORE INTO users (id, username, full_name, password_hash, password_salt, role, is_active, must_change_pwd)
VALUES (1, 'admin', 'System Administrator',
    'pbkdf2_sha256$200000$zRLKI0xyc2sYKBzQaWXl6w==$qHO4yvos81/Oah+ECzVbh1ZHPz3rEhRHOJT2criWCPg=',
    'zRLKI0xyc2sYKBzQaWXl6w==',
    'Administrator', 1, 0);

INSERT OR IGNORE INTO settings (id, mahallu_name, theme, language, currency_symbol) VALUES (1, 'Minz Mahallu', 'light', 'en', '₹');

-- schema.sql already inserts default subscription plans via INSERT OR IGNORE.
-- Add an extra 'Special' plan not in the schema defaults:
INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount, description) VALUES
('Special Subscription','OneTime',0,'Special one-time contribution');

-- schema.sql already inserts default ledger accounts and donation categories
-- via INSERT OR IGNORE — no extra seed accounts needed.
