-- Subscription configuration. Additive only: never deletes or rewrites existing family/member/financial data.
ALTER TABLE settings ADD COLUMN subscription_frequency TEXT NOT NULL DEFAULT 'Monthly';
INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount, description, is_active) VALUES ('Quarterly Subscription','Quarterly',0,'Automatic quarterly household subscription',1);
INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount, description, is_active) VALUES ('Monthly Subscription','Monthly',0,'Automatic monthly household subscription',1);
