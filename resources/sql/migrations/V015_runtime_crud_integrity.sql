-- V015: runtime CRUD integrity reconciliation.
-- Existing installations may have stopped at an older migration because
-- previous migration runners wrapped PRAGMA foreign_keys changes in a transaction.

-- Ensure the subscription settings used by the current UI exist.
ALTER TABLE settings ADD COLUMN subscription_frequency TEXT NOT NULL DEFAULT 'Monthly';
ALTER TABLE settings ADD COLUMN subscription_quarterly_amount REAL NOT NULL DEFAULT 300;

-- Rebuild certificates so Marriage NOC is a valid certificate type and status
-- is part of the canonical table. No application table references certificates,
-- so this rebuild is safe with foreign_keys enabled.
CREATE TABLE certificates_v015 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    certificate_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('Membership','Residence','Marriage','Death','Character','Income','NOC')),
    member_id INTEGER,
    family_id INTEGER,
    marriage_id INTEGER,
    death_id INTEGER,
    issued_to TEXT,
    issued_date TEXT NOT NULL DEFAULT (date('now')),
    issued_by INTEGER,
    qr_payload TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Issued',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL,
    FOREIGN KEY (marriage_id) REFERENCES marriages(id) ON DELETE SET NULL,
    FOREIGN KEY (death_id) REFERENCES deaths(id) ON DELETE SET NULL,
    FOREIGN KEY (issued_by) REFERENCES users(id)
);

INSERT INTO certificates_v015
(id, certificate_number, type, member_id, family_id, marriage_id, death_id, issued_to, issued_date, issued_by, qr_payload, notes, status, created_at)
SELECT id, certificate_number, type, member_id, family_id, marriage_id, issued_to, issued_date, issued_by, qr_payload, notes,
       COALESCE(status, 'Issued'), created_at
FROM certificates;

DROP TABLE certificates;
ALTER TABLE certificates_v015 RENAME TO certificates;
CREATE INDEX IF NOT EXISTS idx_cert_type ON certificates(type);
CREATE INDEX IF NOT EXISTS idx_cert_num ON certificates(certificate_number);
