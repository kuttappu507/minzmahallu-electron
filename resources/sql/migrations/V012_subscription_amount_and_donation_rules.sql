-- V012: configurable monthly subscription amount and durable donation categories
-- Existing installations receive the new setting without losing any data.
ALTER TABLE settings ADD COLUMN subscription_monthly_amount REAL NOT NULL DEFAULT 100;
UPDATE settings SET subscription_monthly_amount = COALESCE((SELECT default_amount FROM subscription_plans WHERE frequency = 'Monthly' AND is_active = 1 ORDER BY id LIMIT 1), 100)
WHERE subscription_monthly_amount IS NULL OR subscription_monthly_amount = 0;

-- One subscription per active family per billing month is enforced by the service layer.
-- Keep historical subscription rows untouched.
