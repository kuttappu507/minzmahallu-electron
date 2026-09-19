-- V037: role-based pending-approval workflow
--
-- Permission model requested by the mahallu:
--   * Administrator + Secretary: full power — everything they enter takes
--     effect immediately.
--   * Member: can VIEW everything and ADD donations / subscriptions, but the
--     entry stays PENDING until the secretary or admin approves it — only
--     then is it accounted.
--   * Staff: member powers + may add nikah, death, families, members —
--     important records likewise need admin approval to take effect.
--
-- New rows created by Member/Staff accounts get approval_status='pending';
-- rows created by Administrator/Secretary (and ALL pre-existing rows) are
-- 'approved'. Pending rows are excluded from every financial aggregate and
-- appear in the admin's Approvals queue until approved or rejected.

ALTER TABLE donations     ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE subscriptions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE members       ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE families      ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE marriages     ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE deaths        ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';

-- A Member/Staff may record the first payment together with a subscription;
-- the payment is NOT applied (no receipt, no money counted) until approval.
-- These columns carry the intended payment until an admin approves.
ALTER TABLE subscriptions ADD COLUMN pending_amount_paid REAL;
ALTER TABLE subscriptions ADD COLUMN pending_payment_method TEXT;
ALTER TABLE subscriptions ADD COLUMN pending_payment_date TEXT;

CREATE INDEX IF NOT EXISTS idx_donations_pending     ON donations(approval_status)     WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending ON subscriptions(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_members_pending       ON members(approval_status)       WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_families_pending      ON families(approval_status)      WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_marriages_pending     ON marriages(approval_status)     WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_deaths_pending        ON deaths(approval_status)        WHERE approval_status = 'pending';
