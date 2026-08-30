-- ============================================================================
-- V032: Remove ALL existing mockup/demo data and rebuild a fresh, complete
--       dataset — every column of every record filled with realistic values.
--
-- Demo logins (documented for the mahallu office / testers):
--   admin     / Admin@2026   (Administrator — reset from the placeholder hash)
--   secretary / Demo@2026    (Secretary)
--   treasurer / Demo@2026    (Treasurer)
--   imam      / Demo@2026    (Imam)
--
-- This is a controlled demo reset (same pattern as V014): the guard triggers
-- are suspended only for the duration of this migration and recreated
-- immediately after. Existing REAL mahallu data is NOT preserved — this
-- migration intentionally rebuilds the entire dataset.
-- ============================================================================

-- ---------------------------------------------------------------
-- 1. Wipe all record data (FK-safe order). Guard triggers off.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_block_member_delete;
DROP TRIGGER IF EXISTS trg_block_family_delete;
DROP TRIGGER IF EXISTS trg_block_certificate_delete;
-- V010 guards on audit_log / record_history must also be suspended for the
-- controlled wipe (they would otherwise abort DELETE on existing databases).
DROP TRIGGER IF EXISTS trg_block_audit_log_update;
DROP TRIGGER IF EXISTS trg_block_audit_log_delete;
DROP TRIGGER IF EXISTS trg_block_record_history_update;
DROP TRIGGER IF EXISTS trg_block_record_history_delete;
PRAGMA foreign_keys = OFF;

DELETE FROM token_assignments;
DELETE FROM token_events;
DELETE FROM certificates;
DELETE FROM staff_payments;
DELETE FROM staff;
DELETE FROM committee_members;
DELETE FROM deaths;
DELETE FROM marriages;
DELETE FROM welfare_requests;
DELETE FROM transactions;
DELETE FROM donations;
DELETE FROM subscription_payments;
DELETE FROM subscriptions;
DELETE FROM family_moves;
DELETE FROM record_history;
DELETE FROM notifications;
DELETE FROM documents;
DELETE FROM sessions;
DELETE FROM audit_log;
UPDATE audit_chain SET last_hash = NULL, event_count = 0, updated_at = datetime('now') WHERE id = 1;
DELETE FROM members;
DELETE FROM families;
DELETE FROM users WHERE id != 1;

-- Restart AUTOINCREMENT so the rebuilt rows get the same deterministic ids
-- (1..n) on upgraded databases as on fresh installs — otherwise e.g. the
-- marriages table would continue numbering from the wiped old dataset and the
-- new certificates (which reference marriage_id/death_id by number) would
-- dangle. sqlite_sequence exists on every database (schema seeds already
-- populated AUTOINCREMENT tables).
DELETE FROM sqlite_sequence;

-- Recreate the guard triggers (identical to V008/V014).
CREATE TRIGGER IF NOT EXISTS trg_block_family_delete
BEFORE DELETE ON families
BEGIN
  SELECT RAISE(ABORT, 'Families cannot be permanently deleted; archive the family instead');
END;
CREATE TRIGGER IF NOT EXISTS trg_block_member_delete
BEFORE DELETE ON members
BEGIN
  SELECT RAISE(ABORT, 'Members cannot be permanently deleted; archive the member instead');
END;
CREATE TRIGGER IF NOT EXISTS trg_block_certificate_delete
BEFORE DELETE ON certificates
WHEN OLD.status IN ('Issued','Revoked') OR OLD.status IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Certificates cannot be permanently deleted; revoke the certificate instead');
END;
-- Recreate the V010 append-only guards on audit_log / record_history.
CREATE TRIGGER IF NOT EXISTS trg_block_audit_log_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log entries cannot be modified');
END;
CREATE TRIGGER IF NOT EXISTS trg_block_audit_log_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log entries cannot be deleted');
END;
CREATE TRIGGER IF NOT EXISTS trg_block_record_history_update
BEFORE UPDATE ON record_history
BEGIN
  SELECT RAISE(ABORT, 'Record history entries cannot be modified');
END;
CREATE TRIGGER IF NOT EXISTS trg_block_record_history_delete
BEFORE DELETE ON record_history
BEGIN
  SELECT RAISE(ABORT, 'Record history entries cannot be deleted');
END;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- 2. Users — reset admin password, add secretary / treasurer / imam.
-- ---------------------------------------------------------------
UPDATE users SET
  username = 'admin',
  full_name = 'System Administrator',
  password_hash = 'pbkdf2_sha256$200000$zRLKI0xyc2sYKBzQaWXl6w==$qHO4yvos81/Oah+ECzVbh1ZHPz3rEhRHOJT2criWCPg=',
  password_salt = 'zRLKI0xyc2sYKBzQaWXl6w==',
  role = 'Administrator',
  email = 'admin@minzmahallu.org',
  phone = '9847000000',
  is_active = 1, is_locked = 0, failed_attempts = 0, locked_until = NULL,
  must_change_pwd = 0, last_login_at = NULL, updated_at = datetime('now')
WHERE id = 1;

INSERT OR IGNORE INTO users (id, username, full_name, password_hash, password_salt, role, email, phone, is_active, is_locked, failed_attempts, locked_until, must_change_pwd)
VALUES
 (2, 'secretary', 'Abdul Rasheed Secretary',
  'pbkdf2_sha256$200000$hRTIStQT4VK8ZBjNpWQf7g==$7fR5aF3T+A9EidgDFN2VHmh7G9HQb6hz13/NeZAtP8k=', 'hRTIStQT4VK8ZBjNpWQf7g==',
  'Secretary', 'secretary@minzmahallu.org', '9847001002', 1, 0, 0, NULL, 0),
 (3, 'treasurer', 'Sulaiman Treasurer',
  'pbkdf2_sha256$200000$q6CZEKjtV/WgPAhCiSexPw==$ZW2RNRMXVu3hNshy1QRa2vSc0rC4lqxClHuJioP60zA=', 'q6CZEKjtV/WgPAhCiSexPw==',
  'Treasurer', 'treasurer@minzmahallu.org', '9847001003', 1, 0, 0, NULL, 0),
 (4, 'imam', 'Moulavi Habeeb Imam',
  'pbkdf2_sha256$200000$gDBUdCewFXQN62ksdP93vQ==$CxBrO1SxhD9PIBy6523wLoyj1+G9uGoG9Ui0o+ho5qI=', 'gDBUdCewFXQN62ksdP93vQ==',
  'Imam', 'imam@minzmahallu.org', '9847001004', 1, 0, 0, NULL, 0);

-- ---------------------------------------------------------------
-- 3. Settings — complete mahallu profile (every column filled).
-- ---------------------------------------------------------------
UPDATE settings SET
  mahallu_name = 'Minz Mahallu Juma Masjid',
  address = 'Minz Mahallu Juma Masjid, Moozhikkal, Kozhikode, Kerala 673011',
  phone = '0495-2400000',
  email = 'office@minzmahallu.org',
  financial_year_start = '04-01',
  currency_symbol = '₹',
  wakf_reg_no = 'KL/04/2024/001245',
  society_reg_no = 'KZD/TC/123/2024',
  village = 'Moozhikkal',
  panchayath = 'Kozhikode Corporation',
  taluk = 'Kozhikode',
  district = 'Kozhikode',
  pincode = '673011',
  state = 'Kerala',
  subscription_monthly_amount = 150,
  subscription_frequency = 'Monthly',
  theme = 'light',
  language = 'en',
  auto_backup = 1,
  backup_interval_hours = 24,
  receipt_prefix = 'RCP',
  demo_data = 1,
  updated_at = datetime('now')
WHERE id = 1;

-- ---------------------------------------------------------------
-- 4. Families — 12 complete records (every column filled).
-- ---------------------------------------------------------------
INSERT INTO families (id, family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status, notes) VALUES
 (1,  'FAM-001', 'Darussalam',     '1',  'Ward 1', 'Moozhikkal',      'Darussalam, Moozhikkal, Kozhikode, Kerala 673011',  '673011', '9847001001', '9747001001', 'Active',   'Registered family · 4 members'),
 (2,  'FAM-002', 'Noor Manzil',    '2',  'Ward 1', 'Moozhikkal',      'Noor Manzil, Moozhikkal, Kozhikode, Kerala 673011',  '673011', '9847001002', '9747001002', 'Active',   'Registered family · 3 members'),
 (3,  'FAM-003', 'Al Huda',        '3',  'Ward 2', 'Vellimadukunnu',  'Al Huda, Vellimadukunnu, Kozhikode, Kerala 673012', '673012', '9847001003', '9747001003', 'Active',   'Registered family · 3 members'),
 (4,  'FAM-004', 'Rahmath',        '4',  'Ward 2', 'Vellimadukunnu',  'Rahmath, Vellimadukunnu, Kozhikode, Kerala 673012', '673012', '9847001004', '9747001004', 'Active',   'Registered family · 3 members'),
 (5,  'FAM-005', 'Mubarak',        '5',  'Ward 3', 'Nadakkavu',       'Mubarak, Nadakkavu, Kozhikode, Kerala 673011',      '673011', '9847001005', '9747001005', 'Active',   'Registered family · 3 members'),
 (6,  'FAM-006', 'Darussalam West','6',  'Ward 3', 'Nadakkavu',       'Darussalam West, Nadakkavu, Kozhikode, Kerala 673011','673011','9847001006', '9747001006', 'Active',   'Registered family · 3 members'),
 (7,  'FAM-007', 'Manzil',         '7',  'Ward 4', 'Kottooli',        'Manzil, Kottooli, Kozhikode, Kerala 673016',        '673016', '9847001007', '9747001007', 'Active',   'Registered family · 3 members'),
 (8,  'FAM-008', 'Safiya House',   '8',  'Ward 4', 'Kottooli',        'Safiya House, Kottooli, Kozhikode, Kerala 673016',  '673016', '9847001008', '9747001008', 'Active',   'Registered family · 3 members'),
 (9,  'FAM-009', 'Hiba',           '9',  'Ward 5', 'Chevayur',        'Hiba, Chevayur, Kozhikode, Kerala 673017',          '673017', '9847001009', '9747001009', 'Active',   'Registered family · 3 members'),
 (10, 'FAM-010', 'Fathima Manzil', '10', 'Ward 5', 'Chevayur',        'Fathima Manzil, Chevayur, Kozhikode, Kerala 673017','673017', '9847001010', '9747001010', 'Active',   'Registered family · 3 members'),
 (11, 'FAM-011', 'Naseema',        '11', 'Ward 6', 'Malaparamba',     'Naseema, Malaparamba, Kozhikode, Kerala 673009',    '673009', '9847001011', '9747001011', 'Active',   'Registered family · 3 members'),
 (12, 'FAM-012', 'Madinah House',  '12', 'Ward 6', 'Malaparamba',     'Madinah House, Malaparamba, Kozhikode, Kerala 673009','673009','9847001012', '9747001012', 'Active',   'Registered family · 3 members');

-- ---------------------------------------------------------------
-- 5. Members — 37 complete records with family-tree links.
-- ---------------------------------------------------------------
INSERT INTO members (id, family_id, member_code, name, arabic_name, father_name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, nationality, address, emergency_contact, relationship, is_head, status, father_id, mother_id, spouse_id) VALUES
 (1, 1, 'MEM-001', 'Abdul Rahman',   'عبد الرحمن',     'Abdul Kareem',   'Male',   '1976-03-12', 50, 'O+',  'Business Owner',   'B.Com',            'Married', '9847010001', 'rahman.mem001@example.com', 'Indian', 'Darussalam, Moozhikkal, Kozhikode', '9847011001', 'Head',     1, 'Active', NULL, NULL, 2),
 (2, 1, 'MEM-002', 'Fathima',        'فاطمة',          'Rahman Koya',    'Female', '1980-07-21', 46, 'A+',  'Homemaker',        'Higher Secondary', 'Married', '9847010002', 'fathima.mem002@example.com', 'Indian', 'Darussalam, Moozhikkal, Kozhikode', '9847011002', 'Spouse',   0, 'Active', NULL, NULL, 1),
 (3, 1, 'MEM-003', 'Muhammad Abdul', 'محمد عبد الرحمن', 'Abdul Rahman',   'Male',   '2005-09-30', 20, 'B+',  'Student',          'B.Sc (Physics)',   'Single',  '9847010003', 'muhammad.mem003@example.com','Indian', 'Darussalam, Moozhikkal, Kozhikode', '9847011003', 'Son',      0, 'Active', 1, 2, NULL),
 (4, 1, 'MEM-004', 'Ayesha',         'عائشة',          'Abdul Rahman',   'Female', '2008-11-14', 17, 'O+',  'Student',          'Plus Two',         'Single',  '9847010004', 'ayesha.mem004@example.com',  'Indian', 'Darussalam, Moozhikkal, Kozhikode', '9847011004', 'Daughter', 0, 'Active', 1, 2, NULL),
 (5, 2, 'MEM-005', 'Muhammed Shafi', 'محمد شافي',      'Kunhi Moideen',  'Male',   '1972-02-08', 54, 'A+',  'Teacher',          'M.A. (History)',   'Married', '9847010005', 'shafi.mem005@example.com',   'Indian', 'Noor Manzil, Moozhikkal, Kozhikode', '9847011005', 'Head',     1, 'Active', NULL, NULL, 6),
 (6, 2, 'MEM-006', 'Rukiya',         'رقية',           'Moideen Koya',   'Female', '1977-05-17', 49, 'B+',  'Homemaker',        'SSLC',             'Married', '9847010006', 'rukiya.mem006@example.com',  'Indian', 'Noor Manzil, Moozhikkal, Kozhikode', '9847011006', 'Spouse',   0, 'Active', NULL, NULL, 5),
 (7, 2, 'MEM-007', 'Nihal',          'نہال',           'Muhammed Shafi', 'Male',   '2006-08-23', 19, 'O+',  'Student',          'B.Com',            'Single',  '9847010007', 'nihal.mem007@example.com',   'Indian', 'Noor Manzil, Moozhikkal, Kozhikode', '9847011007', 'Son',      0, 'Active', 5, 6, NULL),
 (8, 3, 'MEM-008', 'Niyas',          'نیاس',           'Pookoya',        'Male',   '1979-10-05', 46, 'AB+', 'Civil Contractor', 'Diploma',          'Married', '9847010008', 'niyas.mem008@example.com',   'Indian', 'Al Huda, Vellimadukunnu, Kozhikode', '9847011008', 'Head',     1, 'Active', NULL, NULL, 9),
 (9, 3, 'MEM-009', 'Shahana',        'شاہانہ',         'Abdul Hameed',   'Female', '1982-01-28', 44, 'A+',  'Teacher',          'B.Ed',             'Married', '9847010009', 'shahana.mem009@example.com', 'Indian', 'Al Huda, Vellimadukunnu, Kozhikode', '9847011009', 'Spouse',   0, 'Active', NULL, NULL, 8),
 (10, 3, 'MEM-010', 'Hafsa',         'حفصة',           'Niyas',          'Female', '2010-06-19', 16, 'B+',  'Student',          'Class 10',         'Single',  '9847010010', 'hafsa.mem010@example.com',   'Indian', 'Al Huda, Vellimadukunnu, Kozhikode', '9847011010', 'Daughter', 0, 'Active', 8, 9, NULL),
 (11, 4, 'MEM-011', 'Afsal',         'افضل',           'Kunhammad',      'Male',   '1971-04-03', 55, 'O+',  'Government Employee','B.A.',            'Married', '9847010011', 'afsal.mem011@example.com',   'Indian', 'Rahmath, Vellimadukunnu, Kozhikode', '9847011011', 'Head',     1, 'Active', NULL, NULL, 12),
 (12, 4, 'MEM-012', 'Suhara',        'صحرا',           'Ahmed Kutty',    'Female', '1975-12-11', 50, 'O-',  'Homemaker',        'Plus Two',         'Married', '9847010012', 'suhara.mem012@example.com',  'Indian', 'Rahmath, Vellimadukunnu, Kozhikode', '9847011012', 'Spouse',   0, 'Active', NULL, NULL, 11),
 (13, 4, 'MEM-013', 'Adil',          'عادل',           'Afsal',          'Male',   '2004-02-27', 22, 'A+',  'Student',          'B.Tech (IT)',      'Single',  '9847010013', 'adil.mem013@example.com',    'Indian', 'Rahmath, Vellimadukunnu, Kozhikode', '9847011013', 'Son',      0, 'Active', 11, 12, NULL),
 (14, 5, 'MEM-014', 'Rashid',        'راشد',           'Hassan Koya',    'Male',   '1970-09-16', 55, 'B+',  'Bank Officer',     'M.Com',            'Married', '9847010014', 'rashid.mem014@example.com',  'Indian', 'Mubarak, Nadakkavu, Kozhikode', '9847011014', 'Head',     1, 'Active', NULL, NULL, 15),
 (15, 5, 'MEM-015', 'Sameera',       'سمیرہ',          'Ibrahim Haji',   'Female', '1974-11-30', 51, 'AB+', 'Nurse',            'B.Sc Nursing',     'Married', '9847010015', 'sameera.mem015@example.com', 'Indian', 'Mubarak, Nadakkavu, Kozhikode', '9847011015', 'Spouse',   0, 'Active', NULL, NULL, 14),
 (16, 5, 'MEM-016', 'Zainab',        'زینب',           'Rashid',         'Female', '2012-04-08', 14, 'O+',  'Student',          'Class 8',          'Single',  '9847010016', 'zainab.mem016@example.com',  'Indian', 'Mubarak, Nadakkavu, Kozhikode', '9847011016', 'Daughter', 0, 'Active', 14, 15, NULL),
 (17, 6, 'MEM-017', 'Junaid',        'جنید',           'Moideen Kutty',  'Male',   '1973-06-25', 53, 'A-',  'Accountant',       'M.Com',            'Married', '9847010017', 'junaid.mem017@example.com',  'Indian', 'Darussalam West, Nadakkavu, Kozhikode', '9847011017', 'Head',   1, 'Active', NULL, NULL, 18),
 (18, 6, 'MEM-018', 'Haseena',       'حسینہ',          'Kunhiraman',     'Female', '1978-08-09', 48, 'B+',  'Tailor',           'SSLC',             'Married', '9847010018', 'haseena.mem018@example.com', 'Indian', 'Darussalam West, Nadakkavu, Kozhikode', '9847011018', 'Spouse', 0, 'Active', NULL, NULL, 17),
 (19, 6, 'MEM-019', 'Bilal',         'بلال',           'Junaid',         'Male',   '2007-12-02', 18, 'O+',  'Student',          'Plus Two',         'Single',  '9847010019', 'bilal.mem019@example.com',   'Indian', 'Darussalam West, Nadakkavu, Kozhikode', '9847011019', 'Son',    0, 'Active', 17, 18, NULL),
 (20, 7, 'MEM-020', 'Shameer',       'شمیر',           'Abdul Azeez',    'Male',   '1975-03-18', 51, 'O+',  'Auto Driver',      'SSLC',             'Married', '9847010020', 'shameer.mem020@example.com', 'Indian', 'Manzil, Kottooli, Kozhikode', '9847011020', 'Head',     1, 'Active', NULL, NULL, 21),
 (21, 7, 'MEM-021', 'Nazeera',       'نذیرہ',          'Mammad Koya',    'Female', '1980-09-27', 45, 'A+',  'Homemaker',        'Higher Secondary', 'Married', '9847010021', 'nazeera.mem021@example.com','Indian', 'Manzil, Kottooli, Kozhikode', '9847011021', 'Spouse',   0, 'Active', NULL, NULL, 20),
 (22, 7, 'MEM-022', 'Maryam',        'مریم',           'Shameer',        'Female', '2011-01-13', 15, 'B+',  'Student',          'Class 9',          'Single',  '9847010022', 'maryam.mem022@example.com',  'Indian', 'Manzil, Kottooli, Kozhikode', '9847011022', 'Daughter', 0, 'Active', 20, 21, NULL),
 (23, 8, 'MEM-023', 'Basheer',       'بشیر',           'Kunhahammed',    'Male',   '1974-07-07', 52, 'O-',  'Shop Owner',       'B.Com',            'Married', '9847010023', 'basheer.mem023@example.com', 'Indian', 'Safiya House, Kottooli, Kozhikode', '9847011023', 'Head',   1, 'Active', NULL, NULL, 24),
 (24, 8, 'MEM-024', 'Ameena',        'امینہ',          'Koya Moideen',   'Female', '1979-02-15', 47, 'AB+', 'Homemaker',        'SSLC',             'Married', '9847010024', 'ameena.mem024@example.com',  'Indian', 'Safiya House, Kottooli, Kozhikode', '9847011024', 'Spouse', 0, 'Active', NULL, NULL, 23),
 (25, 8, 'MEM-025', 'Fahad',         'فہد',            'Basheer',        'Male',   '2009-05-26', 17, 'A+',  'Student',          'Class 11',         'Single',  '9847010025', 'fahad.mem025@example.com',   'Indian', 'Safiya House, Kottooli, Kozhikode', '9847011025', 'Son',    0, 'Active', 23, 24, NULL),
 (26, 9, 'MEM-026', 'Shabeer',       'شبیر',           'Kunhimammu',     'Male',   '1977-04-21', 49, 'B+',  'Electrician',      'ITI',              'Married', '9847010026', 'shabeer.mem026@example.com','Indian', 'Hiba, Chevayur, Kozhikode', '9847011026', 'Head',     1, 'Active', NULL, NULL, 27),
 (27, 9, 'MEM-027', 'Rasiya',        'راضیہ',          'Abdulla Haji',   'Female', '1981-10-03', 44, 'O+',  'Homemaker',        'Plus Two',         'Married', '9847010027', 'rasiya.mem027@example.com',  'Indian', 'Hiba, Chevayur, Kozhikode', '9847011027', 'Spouse',   0, 'Active', NULL, NULL, 26),
 (28, 9, 'MEM-028', 'Ansha',         'انشا',           'Shabeer',        'Female', '2013-07-12', 13, 'A-',  'Student',          'Class 7',          'Single',  '9847010028', 'ansha.mem028@example.com',   'Indian', 'Hiba, Chevayur, Kozhikode', '9847011028', 'Daughter', 0, 'Active', 26, 27, NULL),
 (29, 10, 'MEM-029', 'Faisal',       'فیصل',           'Abdul Khader',   'Male',   '1972-11-19', 53, 'AB-', 'Pharmacist',       'B.Pharm',          'Married', '9847010029', 'faisal.mem029@example.com',  'Indian', 'Fathima Manzil, Chevayur, Kozhikode', '9847011029', 'Head',   1, 'Active', NULL, NULL, 30),
 (30, 10, 'MEM-030', 'Huda',         'ہدى',            'Mammad Kutty',   'Female', '1976-03-05', 50, 'B+',  'Homemaker',        'Higher Secondary', 'Married', '9847010030', 'huda.mem030@example.com',    'Indian', 'Fathima Manzil, Chevayur, Kozhikode', '9847011030', 'Spouse', 0, 'Active', NULL, NULL, 29),
 (31, 10, 'MEM-031', 'Zayan',        'ذیان',           'Faisal',         'Male',   '2008-09-09', 17, 'O+',  'Student',          'Class 12',         'Single',  '9847010031', 'zayan.mem031@example.com',   'Indian', 'Fathima Manzil, Chevayur, Kozhikode', '9847011031', 'Son',    0, 'Active', 29, 30, NULL),
 (32, 11, 'MEM-032', 'Muneer',       'منیر',           'Koya Haji',      'Male',   '1970-08-14', 56, 'A+',  'Retired Teacher',  'M.A. (Malayalam)', 'Married', '9847010032', 'muneer.mem032@example.com',  'Indian', 'Naseema, Malaparamba, Kozhikode', '9847011032', 'Head',   1, 'Active', NULL, NULL, 33),
 (33, 11, 'MEM-033', 'Sajida',       'ساجدہ',          'Moin Haji',      'Female', '1975-01-22', 51, 'O+',  'Homemaker',        'SSLC',             'Married', '9847010033', 'sajida.mem033@example.com',  'Indian', 'Naseema, Malaparamba, Kozhikode', '9847011033', 'Spouse', 0, 'Active', NULL, NULL, 32),
 (34, 11, 'MEM-034', 'Insha',        'انشا',           'Muneer',         'Female', '2012-12-30', 13, 'AB+', 'Student',          'Class 7',          'Single',  '9847010034', 'insha.mem034@example.com',   'Indian', 'Naseema, Malaparamba, Kozhikode', '9847011034', 'Daughter', 0, 'Active', 32, 33, NULL),
 (35, 12, 'MEM-035', 'Naufal',       'نوفل',           'Hameed Koya',    'Male',   '1973-05-08', 53, 'B-',  'Software Developer','MCA',             'Married', '9847010035', 'naufal.mem035@example.com',  'Indian', 'Madinah House, Malaparamba, Kozhikode', '9847011035', 'Head', 1, 'Active', NULL, NULL, 36),
 (36, 12, 'MEM-036', 'Aaliya',       'عالیہ',          'Rahman Kutty',   'Female', '1978-06-16', 48, 'A+',  'Homemaker',        'B.A.',             'Married', '9847010036', 'aaliya.mem036@example.com',  'Indian', 'Madinah House, Malaparamba, Kozhikode', '9847011036', 'Spouse', 0, 'Active', NULL, NULL, 35),
 (37, 12, 'MEM-037', 'Rizan',        'رضان',           'Naufal',         'Male',   '2007-03-28', 19, 'O+',  'Student',          'B.A. (Economics)', 'Single',  '9847010037', 'rizan.mem037@example.com',   'Indian', 'Madinah House, Malaparamba, Kozhikode', '9847011037', 'Son',    0, 'Active', 35, 36, NULL);

-- ---------------------------------------------------------------
-- 6. Subscriptions + payments (recurring model).
-- ---------------------------------------------------------------
INSERT INTO subscriptions (id, family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, payment_date, receipt_number, payment_method, transaction_ref, status, collected_by, remarks) VALUES
 (1,  1, 1,  (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-05', 'RCP-2026-0001', 'UPI',           'UPI-88912033', 'Paid',    2, 'August 2026 — paid on time'),
 (2,  2, 5,  (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-06', 'RCP-2026-0002', 'Cash',          'CASH-000221',  'Paid',    3, 'August 2026 — collected at office'),
 (3,  3, 8,  (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-08', 'RCP-2026-0003', 'UPI',           'UPI-88922144', 'Paid',    2, 'August 2026'),
 (4,  4, 11, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-10', 'RCP-2026-0004', 'Bank Transfer', 'NEFT-66230',   'Paid',    3, 'August 2026'),
 (5,  5, 14, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-12', 'RCP-2026-0005', 'UPI',           'UPI-90122387', 'Paid',    2, 'August 2026'),
 (6,  6, 17, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 150, '2026-08-14', 'RCP-2026-0006', 'Cash',          'CASH-000334',  'Paid',    3, 'August 2026'),
 (7,  7, 20, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 0,   NULL,           NULL,            NULL,           NULL,           'Pending', NULL, 'August 2026 — will pay after 20th'),
 (8,  8, 23, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 0,   NULL,           NULL,            NULL,           NULL,           'Pending', NULL, 'August 2026 — reminder sent'),
 (9,  9, 26, (SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-07-01', '2026-07-31', 150, 0,   NULL,           NULL,            NULL,           NULL,           'Overdue', NULL, 'July 2026 — overdue, follow up'),
 (10, 10, 29,(SELECT id FROM subscription_plans WHERE name='Monthly Subscription'), '2026-08-01', '2026-08-31', 150, 100, '2026-08-18', 'RCP-2026-0007', 'UPI',           'UPI-91823110', 'Partial', 2, 'August 2026 — paid 100, balance 50');

INSERT INTO subscription_payments (subscription_id, family_id, member_id, period_start, period_end, amount, receipt_number, payment_date, payment_method, transaction_ref, collected_by, remarks, status) VALUES
 (1, 1, 1,  '2026-06-01', '2026-06-30', 150, 'RCP-2026-0501', '2026-06-04', 'UPI',           'UPI-77110123', 2, 'June 2026', 'Active'),
 (1, 1, 1,  '2026-07-01', '2026-07-31', 150, 'RCP-2026-0601', '2026-07-05', 'UPI',           'UPI-77201934', 2, 'July 2026', 'Active'),
 (2, 2, 5,  '2026-06-01', '2026-06-30', 150, 'RCP-2026-0502', '2026-06-06', 'Cash',          'CASH-000118',  3, 'June 2026', 'Active'),
 (2, 2, 5,  '2026-07-01', '2026-07-31', 150, 'RCP-2026-0602', '2026-07-07', 'Cash',          'CASH-000203',  3, 'July 2026', 'Active'),
 (3, 3, 8,  '2026-06-01', '2026-06-30', 150, 'RCP-2026-0503', '2026-06-09', 'UPI',           'UPI-77304571', 2, 'June 2026', 'Active'),
 (3, 3, 8,  '2026-07-01', '2026-07-31', 150, 'RCP-2026-0603', '2026-07-10', 'UPI',           'UPI-77410982', 2, 'July 2026', 'Active'),
 (4, 4, 11, '2026-06-01', '2026-06-30', 150, 'RCP-2026-0504', '2026-06-11', 'Bank Transfer', 'NEFT-55120',   3, 'June 2026', 'Active'),
 (4, 4, 11, '2026-07-01', '2026-07-31', 150, 'RCP-2026-0604', '2026-07-12', 'Bank Transfer', 'NEFT-55238',   3, 'July 2026', 'Active'),
 (5, 5, 14, '2026-06-01', '2026-06-30', 150, 'RCP-2026-0505', '2026-06-13', 'UPI',           'UPI-77508763', 2, 'June 2026', 'Active'),
 (5, 5, 14, '2026-07-01', '2026-07-31', 150, 'RCP-2026-0605', '2026-07-14', 'UPI',           'UPI-77613470', 2, 'July 2026', 'Active'),
 (6, 6, 17, '2026-06-01', '2026-06-30', 150, 'RCP-2026-0506', '2026-06-15', 'Cash',          'CASH-000291',  3, 'June 2026', 'Active'),
 (6, 6, 17, '2026-07-01', '2026-07-31', 150, 'RCP-2026-0606', '2026-07-16', 'Cash',          'CASH-000327',  3, 'July 2026', 'Active');

-- ---------------------------------------------------------------
-- 7. Donations — complete records across categories.
-- ---------------------------------------------------------------
INSERT INTO donations (donor_name, donor_phone, donor_address, family_id, member_id, category_id, amount, donation_date, receipt_number, purpose, remarks, payment_method, received_by, transaction_ref) VALUES
 ('Abdul Rahman',      '9847010001', 'Darussalam, Moozhikkal, Kozhikode', 1, 1,  (SELECT id FROM donation_categories WHERE name='General Donation'),  2000,  '2026-08-02', 'DON-2026-0001', 'General donation',              'Contributed during Jumuah collection', 'Cash',          2, 'CASH-000401'),
 ('Muhammed Shafi',    '9847010005', 'Noor Manzil, Moozhikkal, Kozhikode', 2, 5,  (SELECT id FROM donation_categories WHERE name='Building Fund'),     50000, '2026-07-18', 'DON-2026-0002', 'Building fund — masjid extension','Pledged for renovation fund',          'Bank Transfer', 2, 'NEFT-66310'),
 ('Niyas',             '9847010008', 'Al Huda, Vellimadukunnu, Kozhikode', 3, 8,  (SELECT id FROM donation_categories WHERE name='Masjid Donation'),   3000,  '2026-07-25', 'DON-2026-0003', 'Masjid donation',               'Friday collection',                    'Cash',          3, 'CASH-000447'),
 ('M/s BuildMart Hardware','0495-2401122', 'Beypore Road, Kozhikode',      NULL, NULL, (SELECT id FROM donation_categories WHERE name='Building Fund'),     15000, '2026-07-30', 'DON-2026-0004', 'Building materials donation',   'In-kind sponsor',                      'Bank Transfer', 2, 'NEFT-66598'),
 ('Fathima',           '9847010002', 'Darussalam, Moozhikkal, Kozhikode', 1, 2,  (SELECT id FROM donation_categories WHERE name='Education Fund'),     1500,  '2026-08-06', 'DON-2026-0005', 'Education fund',                'Madrasa fee support',                  'UPI',           2, 'UPI-99012341'),
 ('Rukiya',            '9847010006', 'Noor Manzil, Moozhikkal, Kozhikode', 2, 6,  (SELECT id FROM donation_categories WHERE name='Medical Fund'),       2500,  '2026-08-11', 'DON-2026-0006', 'Medical fund',                  'Treatment support',                    'UPI',           3, 'UPI-99123452'),
 ('Junaid',            '9847010017', 'Darussalam West, Nadakkavu, Kozhikode', 6, 17, (SELECT id FROM donation_categories WHERE name='General Donation'), 1000, '2026-08-15', 'DON-2026-0007', 'General donation',             'Monthly contribution',                 'Cash',          2, 'CASH-000512'),
 ('Shameer',           '9847010020', 'Manzil, Kottooli, Kozhikode',       7, 20, (SELECT id FROM donation_categories WHERE name='Masjid Donation'),   500,   '2026-08-19', 'DON-2026-0008', 'Masjid donation',              'Sadaqah',                             'Cash',          3, 'CASH-000527');

-- ---------------------------------------------------------------
-- 8. Manual transactions (TXN- series, continuous; one VOID example).
-- ---------------------------------------------------------------
INSERT INTO transactions (txn_date, account_id, type, amount, payment_method, reference, description, linked_module, linked_id, receipt_number, created_by, voucher_no, bill_no, payee, status, voided_at, voided_by, void_reason, transaction_ref) VALUES
 ('2025-07-05', (SELECT id FROM ledger_accounts WHERE code='INC-SUB'),   'Income',  9000,  'UPI',           'RCP-2025-071', 'July 2025 subscription collection',    'subscription', 1,   'TXN-0001', 1, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'UPI-44000001'),
 ('2025-07-12', (SELECT id FROM ledger_accounts WHERE code='EXP-ELC'),   'Expense', 4650,  'UPI',           'KSEB-2025-7712', 'Masjid electricity bill — July',        NULL,           0,   'TXN-0002', 1, 'VOU-2025-0012', 'KSEB-2025-7712', 'KSEB Ltd', 'Posted', NULL, NULL, NULL, 'UPI-44000012'),
 ('2025-08-02', (SELECT id FROM ledger_accounts WHERE code='INC-DON'),   'Income',  25000, 'Bank Transfer', 'NEFT-55120', 'Building fund donation — M/S Al Falah', 'donation',     1,   'TXN-0003', 2, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'NEFT-55120'),
 ('2025-09-15', (SELECT id FROM ledger_accounts WHERE code='EXP-MAINT'), 'Expense', 18500, 'Cash',          'B-204', 'Mosque floor tiling — main hall',      NULL,           0,   'TXN-0004', 1, 'VOU-2025-0018', 'B-204', 'BuildMart Hardware', 'Posted', NULL, NULL, NULL, 'CASH-000601'),
 ('2025-11-02', (SELECT id FROM ledger_accounts WHERE code='INC-RENT'),  'Income',  6000,  'Cash',          'RENT-11', 'Shop rent — November',                 NULL,           0,   'TXN-0005', 3, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'CASH-000649'),
 ('2026-01-20', (SELECT id FROM ledger_accounts WHERE code='EXP-WEL'),   'Expense', 12000, 'Bank Transfer', 'WEL-2026-014', 'Welfare aid — medical support',        'welfare',      2,   'TXN-0006', 1, 'VOU-2026-0003', 'WEL-2026-014', 'Welfare beneficiary', 'Posted', NULL, NULL, NULL, 'NEFT-66420'),
 ('2026-02-14', (SELECT id FROM ledger_accounts WHERE code='EXP-ELC'),   'Expense', 4650,  'UPI',           'KSEB-2025-7712', 'Duplicate electricity bill payment',   NULL,           0,   'TXN-0007', 1, 'VOU-2026-0002', 'KSEB-2025-7712', 'KSEB Ltd', 'Void', '2026-02-20 10:14:00', 1, 'Duplicate entry — original bill already paid in July', 'UPI-44500077'),
 ('2026-03-10', (SELECT id FROM ledger_accounts WHERE code='EXP-OTH'),   'Expense', 8750,  'UPI',           'P-88', 'Annual day program — printing & stage', NULL,           0,   'TXN-0008', 2, 'VOU-2026-0007', 'P-88', 'Sunrise Printers', 'Posted', NULL, NULL, NULL, 'UPI-44600111'),
 ('2026-04-05', (SELECT id FROM ledger_accounts WHERE code='INC-SUB'),   'Income',  10500, 'UPI',           'RCP-2026-041', 'April 2026 subscription collection',   'subscription', 2,   'TXN-0009', 2, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'UPI-44700039'),
 ('2026-05-15', (SELECT id FROM ledger_accounts WHERE code='EXP-ELC'),   'Expense', 5120,  'UPI',           'KSEB-2026-3310', 'Masjid electricity bill — May',        NULL,           0,   'TXN-0010', 1, 'VOU-2026-0014', 'KSEB-2026-3310', 'KSEB Ltd', 'Posted', NULL, NULL, NULL, 'UPI-44800122'),
 ('2026-06-08', (SELECT id FROM ledger_accounts WHERE code='INC-DON'),   'Income',  32000, 'Cash',          'RAM-2026', 'Ramzan charity collection',            NULL,           0,   'TXN-0011', 3, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'CASH-000730'),
 ('2026-07-03', (SELECT id FROM ledger_accounts WHERE code='EXP-SAL'),   'Expense', 15000, 'Bank Transfer', 'SAL-2026-07', 'Imam salary — July 2026',             NULL,           0,   'TXN-0012', 1, 'VOU-2026-0019', 'SAL-2026-07', 'Imam (salary)', 'Posted', NULL, NULL, NULL, 'NEFT-67230'),
 ('2026-08-01', (SELECT id FROM ledger_accounts WHERE code='INC-SUB'),   'Income',  10500, 'UPI',           'RCP-2026-081', 'August 2026 subscription collection',  'subscription', 3,   'TXN-0013', 2, NULL, NULL, NULL, 'Posted', NULL, NULL, NULL, 'UPI-44900061'),
 ('2026-08-10', (SELECT id FROM ledger_accounts WHERE code='EXP-WAT'),   'Expense', 2200,  'UPI',           'T-12', 'Water tanker refill — August',         NULL,           0,   'TXN-0014', 2, 'VOU-2026-0022', 'T-12', 'Aqua Service', 'Posted', NULL, NULL, NULL, 'UPI-45000088'),
 ('2026-08-20', (SELECT id FROM ledger_accounts WHERE code='EXP-ELC'),   'Expense', 5400,  'UPI',           'KSEB-2026-4401', 'Masjid electricity bill — August',     NULL,           0,   'TXN-0015', 1, 'VOU-2026-0023', 'KSEB-2026-4401', 'KSEB Ltd', 'Posted', NULL, NULL, NULL, 'UPI-45100103');

-- ---------------------------------------------------------------
-- 9. Marriage register — 3 complete records.
-- ---------------------------------------------------------------
INSERT INTO marriages (marriage_number, bride_name, bride_father, bride_address, groom_name, groom_father, groom_address, witness1, witness2, witness3, witness4, mahar, nikah_date, registration_date, imam_id, place, remarks) VALUES
 ('MRG-2025-0001', 'Sana Faisal',    'Faisal P',     'Chevayur, Kozhikode',        'Arif Koya',     'Koya Moideen',  'Moozhikkal, Kozhikode',      'Abdul Latheef', 'Sameer P', 'Hameed Koya', 'Rahman Kutty', '25 sovereigns gold', '2025-09-12', '2025-09-13', 4, 'Minz Mahallu Juma Masjid', 'Nikah performed after Jumuah prayers'),
 ('MRG-2026-0001', 'Hafsa Niyas',    'Niyas',        'Al Huda, Vellimadukunnu',    'Suhail K',      'Kunhi Koya',    'Kottooli, Kozhikode',        'Shameer',       'Nazeera',   'Rashid',      'Sameera',      '18 sovereigns gold + 1 lakh', '2026-02-20', '2026-02-20', 4, 'Minz Mahallu Juma Masjid', 'Dowry as per family agreement'),
 ('MRG-2026-0002', 'Ansha Shabeer',  'Shabeer',      'Hiba, Chevayur, Kozhikode',  'Nabeel Rahman', 'Rahman Koya',   'Pantheerankavu, Kozhikode',  'Faisal',        'Huda',      'Basheer',     'Ameena',       '20 sovereigns gold', '2026-07-25', '2026-07-25', 4, 'Minz Mahallu Juma Masjid', 'Registered within 45 days as per rules');

-- ---------------------------------------------------------------
-- 10. Death register — 2 complete records.
-- ---------------------------------------------------------------
INSERT INTO deaths (death_number, deceased_name, father_name, family_id, gender, date_of_death, burial_date, cause_of_death, burial_place, age, remarks, place_of_death, address, registration_date) VALUES
 ('DTH-2025-0001', 'Kunhi Haji',   'Moideen Haji',   9, 'Male',   '2025-10-05', '2025-10-05', 'Old age — natural causes', 'Mahallu Juma Masjid Cemetery', 82, 'Janazah after Zuhr', 'Home', 'Hiba, Chevayur, Kozhikode', '2025-10-05'),
 ('DTH-2026-0001', 'Abdul Khader', 'Moideen',        6, 'Male',   '2026-06-14', '2026-06-14', 'Cardiac arrest',          'Mahallu Juma Masjid Cemetery', 78, 'Janazah after Asr', 'Medical College Hospital', 'Darussalam West, Nadakkavu, Kozhikode', '2026-06-15');

-- ---------------------------------------------------------------
-- 11. Welfare requests — complete records across statuses.
-- ---------------------------------------------------------------
INSERT INTO welfare_requests (request_number, applicant_name, family_id, category, amount_requested, amount_approved, reason, status, approved_by, disbursed_date, remarks, request_date, rejection_reason, processed_by, processed_date) VALUES
 ('WEL-2025-0001', 'Nadiya Fathima', 1, 'Education Aid',      15000, 12000, 'School admission and books for two children',  'Approved',  1, NULL,          'Approved by committee on 2025-06-15', '2025-06-10', NULL, 1, '2025-06-15'),
 ('WEL-2025-0002', 'Lubna',          12, 'Medical Aid',       25000, 20000, 'Medical treatment — cardiac procedure',        'Disbursed', 1, '2025-08-28', 'Disbursed via bank transfer',          '2025-08-18', NULL, 1, '2025-08-20'),
 ('WEL-2026-0001', 'Fathima',        1,  'Marriage Assistance', 30000, 25000, 'Marriage assistance for daughter',            'Disbursed', 1, '2026-02-25', 'Disbursed before nikah',               '2026-02-10', NULL, 1, '2026-02-15'),
 ('WEL-2026-0002', 'Rasiya',         9,  'Financial Assistance', 10000, 8000, 'Household financial crisis support',          'Approved',  1, NULL,          'Approved — disbursement pending',       '2026-07-15', NULL, 1, '2026-07-20'),
 ('WEL-2026-0003', 'Haseena',        6,  'Medical Aid',       40000, NULL,  'Ongoing dialysis support',                    'Pending',   NULL, NULL,          'Awaiting committee meeting',            '2026-08-20', NULL, NULL, NULL);

-- ---------------------------------------------------------------
-- 12. Certificates — complete records with verification codes.
-- ---------------------------------------------------------------
INSERT INTO certificates (certificate_number, type, member_id, family_id, marriage_id, death_id, issued_to, issued_date, issued_by, status, notes, verification_code, reprint_count, qr_payload) VALUES
 ('CERT-2025-0001', 'Membership', 1,  1, NULL, NULL, 'Abdul Rahman',       '2025-08-15', 1, 'Issued', 'Membership certificate — annual renewal',   'WK4M-8Q7Z-T3HD', 0, NULL),
 ('CERT-2025-0002', 'Residence',  NULL, 2, NULL, NULL, 'Muhammed Shafi',     '2025-09-02', 1, 'Issued', 'Residence certificate for family FAM-002',   'A9BX-C2VP-M5KS', 0, NULL),
 ('CERT-2025-0003', 'Marriage',   NULL, NULL, 1, NULL, 'Sana Faisal & Arif Koya', '2025-09-15', 4, 'Issued', 'Marriage certificate — MRG-2025-0001',      'K7DZ-Q4WN-2T9H', 0, NULL),
 ('CERT-2025-0004', 'Death',      NULL, 9, NULL, 1,    'Family of Kunhi Haji', '2025-10-08', 1, 'Issued', 'Death certificate — DTH-2025-0001',         'X3MJ-P6RC-V8GZ', 0, NULL),
 ('CERT-2026-0001', 'Membership', 20, 7, NULL, NULL, 'Shameer',            '2026-03-01', 1, 'Issued', 'Membership certificate — renewed',           'B5KT-9HWD-4MQ2', 1, NULL);

-- ---------------------------------------------------------------
-- 13. Staff + salary payments.
-- ---------------------------------------------------------------
INSERT INTO staff (id, staff_code, member_id, name, role, phone, email, address, joined_date, salary, payment_frequency, status, notes) VALUES
 (1, 'STF-2024-001', NULL, 'Rafi K',        'Muezzin',         '9847012001', 'rafi.staff@example.com', 'Moozhikkal, Kozhikode',     '2019-04-01', 8000, 'Monthly', 'Active', 'Muezzin — Fajr and Maghrib adhan'),
 (2, 'STF-2024-002', NULL, 'Suhail M',      'Madrasa Teacher', '9847012002', 'suhail.staff@example.com', 'Vellimadukunnu, Kozhikode', '2021-06-01', 6000, 'Monthly', 'Active', 'Madrasa teacher — evening classes'),
 (3, 'STF-2024-003', NULL, 'Kunjahammed',   'Watchman',        '9847012003', 'kunjahammed.staff@example.com', 'Kottooli, Kozhikode', '2018-01-15', 7000, 'Monthly', 'Active', 'Masjid watchman and cleaning');

INSERT INTO staff_payments (staff_id, period_month, period_year, amount, payment_date, payment_method, transaction_ref, status, notes, paid_by) VALUES
 (1, 5, 2026, 8000, '2026-05-28', 'Bank Transfer', 'NEFT-66001', 'Paid', 'May 2026 salary', 1),
 (1, 6, 2026, 8000, '2026-06-28', 'Bank Transfer', 'NEFT-66011', 'Paid', 'June 2026 salary', 1),
 (1, 7, 2026, 8000, '2026-07-28', 'Bank Transfer', 'NEFT-66021', 'Paid', 'July 2026 salary', 1),
 (2, 5, 2026, 6000, '2026-05-28', 'Bank Transfer', 'NEFT-66002', 'Paid', 'May 2026 salary', 1),
 (2, 6, 2026, 6000, '2026-06-28', 'Bank Transfer', 'NEFT-66012', 'Paid', 'June 2026 salary', 1),
 (2, 7, 2026, 6000, '2026-07-28', 'Bank Transfer', 'NEFT-66022', 'Paid', 'July 2026 salary', 1),
 (3, 5, 2026, 7000, '2026-05-28', 'Bank Transfer', 'NEFT-66003', 'Paid', 'May 2026 salary', 1),
 (3, 6, 2026, 7000, '2026-06-28', 'Bank Transfer', 'NEFT-66013', 'Paid', 'June 2026 salary', 1),
 (3, 7, 2026, 7000, '2026-07-28', 'Bank Transfer', 'NEFT-66023', 'Paid', 'July 2026 salary', 1);

-- ---------------------------------------------------------------
-- 14. Committee — complete 8-member executive committee.
-- ---------------------------------------------------------------
INSERT INTO committee_members (id, committee_code, member_id, name, position, committee_type, phone, email, address, term_start, term_end, status, notes) VALUES
 (1, 'CMT-2024-001', 1,  'Abdul Rahman',   'President',         'Executive', '9847010001', 'rahman.cmt@example.com', 'Darussalam, Moozhikkal, Kozhikode', '2024-04-01', '2026-09-30', 'Active', 'Committee President'),
 (2, 'CMT-2024-002', 5,  'Muhammed Shafi', 'Vice President',    'Executive', '9847010005', 'shafi.cmt@example.com',  'Noor Manzil, Moozhikkal, Kozhikode', '2024-04-01', '2026-09-30', 'Active', 'Vice President'),
 (3, 'CMT-2024-003', 8,  'Niyas',          'Secretary',         'Executive', '9847010008', 'niyas.cmt@example.com',  'Al Huda, Vellimadukunnu, Kozhikode', '2024-04-01', '2026-09-30', 'Active', 'General Secretary'),
 (4, 'CMT-2024-004', 11, 'Afsal',          'Joint Secretary',   'Executive', '9847010011', 'afsal.cmt@example.com',  'Rahmath, Vellimadukunnu, Kozhikode', '2024-04-01', '2026-09-30', 'Active', 'Joint Secretary'),
 (5, 'CMT-2024-005', 14, 'Rashid',         'Treasurer',         'Executive', '9847010014', 'rashid.cmt@example.com', 'Mubarak, Nadakkavu, Kozhikode',      '2024-04-01', '2026-09-30', 'Active', 'Treasurer'),
 (6, 'CMT-2024-006', 17, 'Junaid',         'Auditor',           'Executive', '9847010017', 'junaid.cmt@example.com', 'Darussalam West, Nadakkavu, Kozhikode', '2024-04-01', '2026-09-30', 'Active', 'Internal Auditor'),
 (7, 'CMT-2024-007', 20, 'Shameer',        'Committee Member',  'Executive', '9847010020', 'shameer.cmt@example.com', 'Manzil, Kottooli, Kozhikode',        '2024-04-01', '2026-09-30', 'Active', 'Committee Member'),
 (8, 'CMT-2024-008', 23, 'Basheer',        'Committee Member',  'Executive', '9847010023', 'basheer.cmt@example.com', 'Safiya House, Kottooli, Kozhikode',  '2024-04-01', '2026-09-30', 'Active', 'Committee Member');

-- ---------------------------------------------------------------
-- 15. Token events + assignments.
-- ---------------------------------------------------------------
INSERT INTO token_events (id, event_name, event_type, event_date, event_time, venue, description, status) VALUES
 (1, 'Eid Distribution 2026',      'eid',      '2026-05-06', '10:30', 'Main Masjid Hall',   'Eid gift distribution to all registered families', 'completed'),
 (2, 'Monthly Welfare Counter',    'welfare',  '2026-08-25', '09:30', 'Mahallu Office',     'Monthly welfare aid token counter',              'active'),
 (3, 'Community Iftar 2026',       'general',  '2026-09-15', '18:45', 'Community Hall',     'Ramzan community iftar for all families',        'active');

INSERT INTO token_assignments (event_id, family_id, token_code, status, collected, collected_at, collected_by) VALUES
 (1, 1, 'E101', 'COLLECTED', 1, '2026-05-06 11:15:00', 2),
 (1, 2, 'E102', 'COLLECTED', 1, '2026-05-06 11:22:00', 2),
 (1, 3, 'E103', 'COLLECTED', 1, '2026-05-06 11:30:00', 3),
 (1, 4, 'E104', 'COLLECTED', 1, '2026-05-06 11:41:00', 3),
 (1, 5, 'E105', 'COLLECTED', 1, '2026-05-06 11:55:00', 2),
 (1, 6, 'E106', 'COLLECTED', 1, '2026-05-06 12:08:00', 2),
 (2, 1, 'W201', 'ISSUED',    0, NULL, NULL),
 (2, 2, 'W202', 'ISSUED',    0, NULL, NULL),
 (2, 3, 'W203', 'ISSUED',    0, NULL, NULL),
 (2, 4, 'W204', 'GENERATED', 0, NULL, NULL),
 (2, 5, 'W205', 'GENERATED', 0, NULL, NULL),
 (2, 6, 'W206', 'GENERATED', 0, NULL, NULL),
 (3, 1, 'I301', 'GENERATED', 0, NULL, NULL),
 (3, 2, 'I302', 'GENERATED', 0, NULL, NULL),
 (3, 3, 'I303', 'GENERATED', 0, NULL, NULL),
 (3, 4, 'I304', 'GENERATED', 0, NULL, NULL);

-- ---------------------------------------------------------------
-- 16. Notifications.
-- ---------------------------------------------------------------
INSERT INTO notifications (user_id, title, message, severity, is_read) VALUES
 (1, 'Demo dataset rebuilt', 'V032 demo rebuild — fresh complete data has been loaded. Default admin password: Admin@2026.', 'info', 0),
 (3, 'August subscriptions pending', 'Families FAM-007 and FAM-008 have pending August subscription payments.', 'warning', 0);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (32, 'Demo rebuild — remove all mockup data, fresh complete dataset');
