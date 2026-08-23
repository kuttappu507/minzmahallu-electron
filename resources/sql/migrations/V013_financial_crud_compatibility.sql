-- V013: complete SQLite compatibility for current module CRUD.
-- The subscription amount column is present in schema.sql and is conditionally
-- ensured at connection startup for older existing databases.
ALTER TABLE donations ADD COLUMN updated_at TEXT;
ALTER TABLE transactions ADD COLUMN transaction_ref TEXT;
ALTER TABLE transactions ADD COLUMN updated_at TEXT;
ALTER TABLE audit_log ADD COLUMN metadata TEXT;

UPDATE transactions SET transaction_ref = reference WHERE transaction_ref IS NULL;
