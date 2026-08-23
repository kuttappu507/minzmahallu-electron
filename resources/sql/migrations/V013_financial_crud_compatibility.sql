-- V013: complete SQLite compatibility for current module CRUD.
-- These columns are additive and preserve all existing records.
ALTER TABLE settings ADD COLUMN subscription_monthly_amount REAL NOT NULL DEFAULT 100;
ALTER TABLE donations ADD COLUMN updated_at TEXT;
ALTER TABLE transactions ADD COLUMN transaction_ref TEXT;
ALTER TABLE transactions ADD COLUMN updated_at TEXT;
ALTER TABLE audit_log ADD COLUMN metadata TEXT;

-- Backfill transaction_ref from the original schema's reference field.
UPDATE transactions SET transaction_ref = reference WHERE transaction_ref IS NULL;
