-- Subscription configuration. Additive only: never deletes or rewrites existing family/member/financial data.
ALTER TABLE settings ADD COLUMN subscription_frequency TEXT NOT NULL DEFAULT 'Monthly';
