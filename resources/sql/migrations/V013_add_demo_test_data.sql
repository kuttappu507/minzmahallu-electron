-- V013: realistic demo records for exercising all major modules.
-- The inserts are idempotent and only use distinct demo identifiers.

INSERT OR IGNORE INTO families
  (family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status, notes)
VALUES
  ('FAM-016','Green View','16','1','Kunduparamba','Green View, Kunduparamba, Kozhikode','673007','9847216001','9747216001','Active','Demo family'),
  ('FAM-017','Noor Palace','17','2','Eranhipalam','Noor Palace, Eranhipalam, Kozhikode','673006','9847216002','9747216002','Active','Demo family'),
  ('FAM-018','Al Madina','18','3','Pottammal','Al Madina, Pottammal, Kozhikode','673016','9847216003','9747216003','Active','Demo family'),
  ('FAM-019','Rahma Villa','19','4','Chevayur','Rahma Villa, Chevayur, Kozhikode','673017','9847216004','9747216004','Active','Demo family'),
  ('FAM-020','Hidaya House','20','5','Palazhi','Hidaya House, Palazhi, Kozhikode','673014','9847216005','9747216005','Active','Demo family');

INSERT OR IGNORE INTO members
  (family_id, member_code, name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, nationality, relationship, is_head, status)
SELECT id, 'MEM-031','Shahabas Ali','Male','1978-04-12',48,'B+','Civil Engineer','B.Tech','Married','9847216101','shahabas.demo@example.com','Indian','Head',1,'Active' FROM families WHERE family_number='FAM-016';
INSERT OR IGNORE INTO members SELECT id, 'MEM-032', 'Nadiya Shahabas','Female','1983-09-21',42,'A+','Teacher','B.Ed','Married','9847216102','nadiya.demo@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-016';
INSERT OR IGNORE INTO members SELECT id, 'MEM-033', 'Ayaan Shahabas','Male','2010-06-03',16,'O+','Student','Class 10','Single','9847216103','ayaan.demo@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-016';

INSERT OR IGNORE INTO members SELECT id, 'MEM-034', 'Muneer Rahman','Male','1972-11-08',53,'O+','Business Owner','B.Com','Married','9847216201','muneer.demo@example.com','Indian','Head',1,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-017';
INSERT OR IGNORE INTO members SELECT id, 'MEM-035', 'Shameema Muneer','Female','1977-02-16',49,'AB+','Accountant','M.Com','Married','9847216202','shameema.demo@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-017';
INSERT OR IGNORE INTO members SELECT id, 'MEM-036', 'Ibrahim Muneer','Male','2004-08-27',21,'A+','Software Developer','BCA','Single','9847216203','ibrahim.demo@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-017';

INSERT OR IGNORE INTO members SELECT id, 'MEM-037', 'Fazil Kareem','Male','1985-01-19',41,'A+','Architect','B.Arch','Married','9847216301','fazil.demo@example.com','Indian','Head',1,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-018';
INSERT OR IGNORE INTO members SELECT id, 'MEM-038', 'Hafsa Fazil','Female','1989-07-30',37,'O+','Lecturer','M.A.','Married','9847216302','hafsa.demo@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-018';
INSERT OR IGNORE INTO members SELECT id, 'MEM-039', 'Maryam Fazil','Female','2014-03-11',12,'B+','Student','Class 6','Single','9847216303','maryam.demo@example.com','Indian','Daughter',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-018';

INSERT OR IGNORE INTO members SELECT id, 'MEM-040', 'Jaleel Koya','Male','1968-05-06',58,'O-','Retired Railway Employee','Diploma','Married','9847216401','jaleel.demo@example.com','Indian','Head',1,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-019';
INSERT OR IGNORE INTO members SELECT id, 'MEM-041', 'Rafeena Jaleel','Female','1972-12-14',53,'A-','Homemaker','Higher Secondary','Married','9847216402','rafeena.demo@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-019';
INSERT OR IGNORE INTO members SELECT id, 'MEM-042', 'Suhail Jaleel','Male','2001-10-25',24,'O+','Pharmacist','B.Pharm','Single','9847216403','suhail.demo@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-019';

INSERT OR IGNORE INTO members SELECT id, 'MEM-043', 'Naseer Ahmed','Male','1976-03-22',50,'AB+','Government Employee','M.A.','Married','9847216501','naseer.demo@example.com','Indian','Head',1,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-020';
INSERT OR IGNORE INTO members SELECT id, 'MEM-044', 'Lubna Naseer','Female','1981-08-18',45,'B+','Nurse','B.Sc Nursing','Married','9847216502','lubna.demo@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-020';
INSERT OR IGNORE INTO members SELECT id, 'MEM-045', 'Zayd Naseer','Male','2012-11-02',13,'O+','Student','Class 8','Single','9847216503','zayd.demo@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now') FROM families WHERE family_number='FAM-020';

INSERT OR IGNORE INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status)
VALUES
  (101,'Eid Distribution 2026','eid','2026-05-01','10:30','Main Masjid Hall','Demo token distribution event','completed'),
  (102,'Monthly Welfare Counter','welfare','2026-08-22','09:30','Mahallu Office','Demo welfare token event','active'),
  (103,'Community Food Distribution','general','2026-09-05','11:00','Community Hall','Demo community event','active');

INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status,collected,collected_at)
SELECT 101,id,'A101','COLLECTED',1,'2026-05-01 11:15:00' FROM families WHERE family_number='FAM-001';
INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status,collected,collected_at)
SELECT 101,id,'A102','COLLECTED',1,'2026-05-01 11:22:00' FROM families WHERE family_number='FAM-016';
INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status)
SELECT 102,id,'B101','GENERATED' FROM families WHERE family_number='FAM-002';
INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status)
SELECT 102,id,'B102','ISSUED' FROM families WHERE family_number='FAM-017';
INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status)
SELECT 103,id,'C101','GENERATED' FROM families WHERE family_number='FAM-018';
INSERT OR IGNORE INTO token_assignments (event_id,family_id,token_code,status)
SELECT 103,id,'C102','GENERATED' FROM families WHERE family_number='FAM-019';

INSERT OR IGNORE INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,imam_id,place,remarks)
VALUES
  ('MRG-DEMO-001','Ayesha Nizam','Nizamuddin','Eranhipalam, Kozhikode','Rashid Basheer','Basheer Koya','Kunduparamba, Kozhikode','Abdul Latheef','Sameer P','Gold 10 sovereigns','2026-07-18','2026-07-18',1,'Minz Mahallu','Demo marriage record');

INSERT OR IGNORE INTO deaths (death_number,deceased_name,father_name,family_id,gender,date_of_death,burial_date,cause_of_death,burial_place,age,remarks)
SELECT 'DTH-DEMO-001','Abdul Khader','Moideen',id,'Male','2026-06-14','2026-06-14','Natural causes','Mahallu Juma Masjid Cemetery',78,'Demo death record' FROM families WHERE family_number='FAM-006';

INSERT OR IGNORE INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,status,approved_by,disbursed_date,remarks)
SELECT 'WEL-DEMO-001','Nadiya Shahabas',id,'Education Aid',15000,12000,'School admission and books','Approved',1,NULL,'Demo welfare record' FROM families WHERE family_number='FAM-016';
INSERT OR IGNORE INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,status,approved_by,disbursed_date,remarks)
SELECT 'WEL-DEMO-002','Lubna Naseer',id,'Medical Aid',25000,20000,'Medical treatment support','Disbursed',1,'2026-07-28','Demo welfare record' FROM families WHERE family_number='FAM-020';

INSERT OR IGNORE INTO certificates (certificate_number,type,member_id,family_id,issued_to,issued_date,issued_by,notes)
SELECT 'CERT-DEMO-001','Membership',m.id,m.family_id,m.name,'2026-07-05',1,'Demo membership certificate' FROM members m WHERE m.member_code='MEM-031';
INSERT OR IGNORE INTO certificates (certificate_number,type,family_id,issued_to,issued_date,issued_by,notes)
SELECT 'CERT-DEMO-002','Residence',id,house_name,'2026-07-12',1,'Demo residence certificate' FROM families WHERE family_number='FAM-017';
INSERT OR IGNORE INTO certificates (certificate_number,type,marriage_id,issued_to,issued_date,issued_by,notes)
SELECT 'CERT-DEMO-003','Marriage',id,bride_name || ' & ' || groom_name,'2026-07-19',1,'Demo marriage certificate' FROM marriages WHERE marriage_number='MRG-DEMO-001';
INSERT OR IGNORE INTO certificates (certificate_number,type,death_id,issued_to,issued_date,issued_by,notes)
SELECT 'CERT-DEMO-004','Death',id,deceased_name,'2026-06-15',1,'Demo death certificate' FROM deaths WHERE death_number='DTH-DEMO-001';

INSERT OR IGNORE INTO transactions (txn_date,account_id,type,amount,payment_method,reference,description,linked_module,linked_id,receipt_number,created_by)
VALUES
  ('2026-07-05',(SELECT id FROM ledger_accounts WHERE code='INC-SUB'),'Income',8500,'UPI','DEMO-TXN-001','Monthly subscription collection','subscription',1,'RCP-DEMO-001',1),
  ('2026-07-10',(SELECT id FROM ledger_accounts WHERE code='INC-DON'),'Income',25000,'Bank Transfer','DEMO-TXN-002','Building fund donation','donation',1,'DON-DEMO-001',1),
  ('2026-07-15',(SELECT id FROM ledger_accounts WHERE code='EXP-WEL'),'Expense',12000,'Bank Transfer','DEMO-TXN-003','Education welfare disbursement','welfare',1,'PAY-DEMO-001',1),
  ('2026-07-20',(SELECT id FROM ledger_accounts WHERE code='EXP-ELC'),'Expense',4200,'UPI','DEMO-TXN-004','Masjid electricity bill','accounting',0,'EXP-DEMO-001',1);
