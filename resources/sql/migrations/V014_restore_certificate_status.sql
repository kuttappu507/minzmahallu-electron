-- V014: V012 recreated certificates to add NOC and accidentally omitted the
-- status column used by the certificate issuance service.
ALTER TABLE certificates ADD COLUMN status TEXT NOT NULL DEFAULT 'Issued';
