-- MMS Seed Data
PRAGMA foreign_keys = OFF;

INSERT OR IGNORE INTO users (id, username, full_name, password_hash, password_salt, role, is_active, must_change_pwd)
VALUES (1, 'admin', 'System Administrator',
    'pbkdf2_sha256$200000$c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=$dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=',
    'c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=',
    'Administrator', 1, 0);

INSERT OR IGNORE INTO settings (id, mahallu_name, theme, language, currency_symbol) VALUES (1, 'Minz Mahallu', 'light', 'en', 'â¹');

-- schema.sql already inserts default subscription plans via INSERT OR IGNORE.
-- The old seed used a non-existent 'period_months' column which aborted seed.sql.
-- Add an extra 'Special' plan not in the schema defaults:
INSERT OR IGNORE INTO subscription_plans (name, frequency, default_amount, description) VALUES
('Special Subscription','OneTime',0,'Special one-time contribution');

-- schema.sql already inserts default ledger accounts via INSERT OR IGNORE.
-- The old seed used a non-existent 'balance' column which aborted seed.sql.
-- (No extra seed accounts needed — the schema defaults are sufficient.)

INSERT OR IGNORE INTO donation_categories (id, name, description, is_active) VALUES
(1,'General Donation','General',1),(2,'Masjid Donation','Mosque',1),(3,'Building Fund','Construction',1),
(4,'Education Fund','Education',1),(5,'Medical Fund','Medical',1);

INSERT OR IGNORE INTO families (id, family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status) VALUES
(1,'FAM-001','Darul Aman','1','1','Moozhikkal','Darul Aman, Moozhikkal, Kozhikode','683513','98470000001','','Active'),
(2,'FAM-002','Rahmath','2','2','Vellimadukunnu','Rahmath, Vellimadukunnu, Kozhikode','683513','98470000002','','Active'),
(3,'FAM-003','Noor Manzil','3','3','Nadakkavu','Noor Manzil, Nadakkavu, Kozhikode','683513','98470000003','','Active'),
(4,'FAM-004','Al Huda','4','4','Kallai','Al Huda, Kallai, Kozhikode','683513','98470000004','','Active'),
(5,'FAM-005','Mubarak','5','5','Puthiyangadi','Mubarak, Puthiyangadi, Kozhikode','683513','98470000005','','Active'),
(6,'FAM-006','Darussalam','6','6','West Hill','Darussalam, West Hill, Kozhikode','683513','98470000006','','Active'),
(7,'FAM-007','Manzil','7','7','Kottooli','Manzil, Kottooli, Kozhikode','683513','98470000007','','Active'),
(8,'FAM-008','Safiya House','8','8','Eranhipalam','Safiya House, Eranhipalam, Kozhikode','683513','98470000008','','Active'),
(9,'FAM-009','Hiba','9','1','Chevayur','Hiba, Chevayur, Kozhikode','683513','98470000009','','Active'),
(10,'FAM-010','Fathima Manzil','10','2','Malaparamba','Fathima Manzil, Malaparamba, Kozhikode','683513','98470000010','','Active'),
(11,'FAM-011','Naseema','11','3','Medical College','Naseema, Medical College, Kozhikode','683513','98470000011','','Active'),
(12,'FAM-012','Madinah House','12','4','Feroke','Madinah House, Feroke, Kozhikode','683513','98470000012','','Active'),
(13,'FAM-013','Safa','13','5','Ramanattukara','Safa, Ramanattukara, Kozhikode','683513','98470000013','','Active'),
(14,'FAM-014','Rahma','14','6','Pantheerankavu','Rahma, Pantheerankavu, Kozhikode','683513','98470000014','','Inactive'),
(15,'FAM-015','Amina House','15','7','Kozhikode Beach','Amina House, Kozhikode Beach, Kozhikode','683513','98470000015','','Active');

INSERT OR IGNORE INTO members (id, family_id, member_code, name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, nationality, relationship, is_head, status) VALUES
(1,1,'MEM-001','Abdul Rahman','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000001','m1@e.com','Indian','Head',1,'Active'),
(2,1,'MEM-002','Fathima','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000002','m2@e.com','Indian','Spouse',0,'Active'),
(3,2,'MEM-003','Muhammed Shafi','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000003','m3@e.com','Indian','Head',1,'Active'),
(4,2,'MEM-004','Rukiya','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000004','m4@e.com','Indian','Spouse',0,'Active'),
(5,3,'MEM-005','Niyas','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000005','m5@e.com','Indian','Head',1,'Active'),
(6,3,'MEM-006','Shahana','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000006','m6@e.com','Indian','Spouse',0,'Active'),
(7,4,'MEM-007','Afsal','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000007','m7@e.com','Indian','Head',1,'Active'),
(8,4,'MEM-008','Suhara','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000008','m8@e.com','Indian','Spouse',0,'Active'),
(9,5,'MEM-009','Rashid','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000009','m9@e.com','Indian','Head',1,'Active'),
(10,5,'MEM-010','Sameera','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000010','m10@e.com','Indian','Spouse',0,'Active'),
(11,6,'MEM-011','Junaid','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000011','m11@e.com','Indian','Head',1,'Active'),
(12,6,'MEM-012','Haseena','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000012','m12@e.com','Indian','Spouse',0,'Active'),
(13,7,'MEM-013','Shameer','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000013','m13@e.com','Indian','Head',1,'Active'),
(14,7,'MEM-014','Nazeera','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000014','m14@e.com','Indian','Spouse',0,'Active'),
(15,8,'MEM-015','Basheer','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000015','m15@e.com','Indian','Head',1,'Active'),
(16,8,'MEM-016','Ameena','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000016','m16@e.com','Indian','Spouse',0,'Active'),
(17,9,'MEM-017','Shabeer','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000017','m17@e.com','Indian','Head',1,'Active'),
(18,9,'MEM-018','Rasiya','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000018','m18@e.com','Indian','Spouse',0,'Active'),
(19,10,'MEM-019','Faisal','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000019','m19@e.com','Indian','Head',1,'Active'),
(20,10,'MEM-020','Huda','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000020','m20@e.com','Indian','Spouse',0,'Active'),
(21,11,'MEM-021','Muneer','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000021','m21@e.com','Indian','Head',1,'Active'),
(22,11,'MEM-022','Sajida','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000022','m22@e.com','Indian','Spouse',0,'Active'),
(23,12,'MEM-023','Naufal','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000023','m23@e.com','Indian','Head',1,'Active'),
(24,12,'MEM-024','Aaliya','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000024','m24@e.com','Indian','Spouse',0,'Active'),
(25,13,'MEM-025','Irfan','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000025','m25@e.com','Indian','Head',1,'Active'),
(26,13,'MEM-026','Mariya','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000026','m26@e.com','Indian','Spouse',0,'Active'),
(27,14,'MEM-027','Salman','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000027','m27@e.com','Indian','Head',1,'Active'),
(28,14,'MEM-028','Safiya','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000028','m28@e.com','Indian','Spouse',0,'Active'),
(29,15,'MEM-029','Ashraf','Male','1980-01-15',45,'O+','Worker','BA','Married','98470000029','m29@e.com','Indian','Head',1,'Active'),
(30,15,'MEM-030','Khadija','Female','1980-01-15',45,'O+','Worker','BA','Married','98470000030','m30@e.com','Indian','Spouse',0,'Active');

INSERT OR IGNORE INTO donations (donor_name, donor_phone, family_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, received_by) VALUES
('Anonymous','',NULL,1,5000,'2026-07-02','DON-001','General','Cash',1),
('Abdul Hameed','9847012345',1,2,10000,'2026-06-18','DON-002','Masjid','UPI',1),
('Muneer Koya','9847023456',2,3,25000,'2026-06-04','DON-003','Building','Bank Transfer',1),
('Anonymous','',NULL,1,3000,'2026-05-21','DON-004','General','Cash',1),
('Suhail Ahmed','9847034567',3,4,15000,'2026-05-07','DON-005','Education','Cheque',1),
('Yusuf Ali','9847056789',5,5,8000,'2026-04-23','DON-006','Medical','UPI',1),
('Anonymous','',NULL,1,2000,'2026-04-09','DON-007','General','Cash',1),
('Afsana Rahman','9847078901',7,2,12000,'2026-03-26','DON-008','Masjid','Cash',1),
('Shahid P','9847089012',8,3,30000,'2026-03-12','DON-009','Building','Bank Transfer',1),
('Anonymous','',NULL,1,5000,'2026-02-26','DON-010','General','UPI',1),
('Nabeel K','9847101234',10,4,10000,'2026-02-12','DON-011','Education','Cheque',1),
('Rashid PM','9847112345',11,5,7000,'2026-01-29','DON-012','Medical','Cash',1),
('Anonymous','',NULL,1,1500,'2026-01-15','DON-013','General','Cash',1),
('Sameer TK','9847123456',12,2,8000,'2026-01-01','DON-014','Masjid','UPI',1),
('Firoz KP','9847134567',13,3,20000,'2025-12-18','DON-015','Building','Bank Transfer',1);

INSERT OR IGNORE INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, payment_date, receipt_number, payment_method, status, collected_by) VALUES
(1,1,1,'2025-12-27','2026-01-27',100,100,'2026-07-09','RCP-001','Cash','Paid',1),
(2,4,1,'2025-12-27','2026-01-27',100,100,'2026-07-02','RCP-002','Cash','Paid',1),
(3,6,1,'2025-12-27','2026-01-27',100,100,'2026-06-25','RCP-003','UPI','Paid',1),
(1,1,1,'2025-12-27','2026-01-27',100,100,'2026-06-18','RCP-004','Cash','Paid',1),
(2,4,1,'2026-01-27','2026-02-27',100,100,'2026-06-11','RCP-005','Cash','Paid',1),
(4,9,3,'2026-01-27','2026-02-27',1200,1200,'2026-06-04','RCP-006','Bank Transfer','Paid',1),
(5,11,1,'2026-01-27','2026-02-27',100,100,'2026-05-28','RCP-007','UPI','Paid',1),
(3,6,1,'2026-01-27','2026-02-27',100,100,'2026-05-21','RCP-008','UPI','Paid',1),
(6,13,1,'2026-02-27','2026-03-30',100,100,'2026-05-14','RCP-009','Cash','Paid',1),
(7,15,1,'2026-02-27','2026-03-30',100,100,'2026-05-07','RCP-010','Cash','Paid',1),
(8,18,3,'2026-02-27','2026-03-30',1200,1200,'2026-04-30','RCP-011','Cheque','Paid',1),
(1,1,1,'2026-02-27','2026-03-30',100,100,'2026-04-23','RCP-012','Cash','Paid',1),
(9,20,1,'2026-03-30','2026-04-30',100,100,'2026-04-16','RCP-013','Cash','Paid',1),
(10,22,1,'2026-03-30','2026-04-30',100,100,'2026-04-09','RCP-014','UPI','Paid',1),
(2,4,1,'2026-03-30','2026-04-30',100,0,'2026-04-02','RCP-015','','Pending',1),
(11,24,3,'2026-03-30','2026-04-30',1200,1200,'2026-03-26','RCP-016','Bank Transfer','Paid',1),
(1,1,1,'2026-04-30','2026-05-31',100,100,'2026-03-19','RCP-017','Cash','Paid',1),
(3,6,1,'2026-04-30','2026-05-31',100,100,'2026-03-12','RCP-018','UPI','Paid',1),
(12,26,1,'2026-04-30','2026-05-31',100,100,'2026-03-05','RCP-019','Cash','Paid',1),
(5,11,1,'2026-04-30','2026-05-31',100,50,'2026-02-26','RCP-020','Cash','Partial',1),
(13,28,1,'2026-05-31','2026-07-01',100,100,'2026-02-19','RCP-021','Cash','Paid',1),
(1,1,1,'2026-05-31','2026-07-01',100,100,'2026-02-12','RCP-022','UPI','Paid',1),
(7,15,1,'2026-05-31','2026-07-01',100,0,'2026-02-05','RCP-023','','Overdue',1),
(14,29,1,'2026-05-31','2026-07-01',100,0,'2026-01-29','RCP-024','','Overdue',1),
(15,30,1,'2026-07-01','2026-08-01',100,100,'2026-01-22','RCP-025','Cash','Paid',1),
(2,4,1,'2026-07-01','2026-08-01',100,100,'2026-01-15','RCP-026','UPI','Paid',1);

INSERT OR IGNORE INTO transactions (txn_date, account_id, type, amount, payment_method, description, linked_module, receipt_number, created_by) VALUES
('2026-07-11',1,'Income',5000,'Cash','General donation','donation','TXN-001',1),
('2026-06-27',1,'Income',300,'Cash','Monthly subscriptions','donation','TXN-002',1),
('2026-06-13',1,'Income',10000,'UPI','Masjid donation','donation','TXN-003',1),
('2026-05-30',1,'Income',400,'Cash','Monthly subscriptions','donation','TXN-004',1),
('2026-05-16',1,'Income',8000,'Cheque','Education donation','donation','TXN-005',1),
('2026-05-02',1,'Income',500,'UPI','Monthly subscriptions','donation','TXN-006',1),
('2026-04-18',1,'Income',2000,'Cash','General donation','donation','TXN-007',1),
('2026-04-04',1,'Income',450,'Cash','Monthly subscriptions','donation','TXN-008',1),
('2026-03-21',1,'Income',12000,'Bank Transfer','Building fund','donation','TXN-009',1),
('2026-03-07',1,'Income',550,'UPI','Monthly subscriptions','donation','TXN-010',1),
('2026-02-21',1,'Income',5000,'Cheque','Education donation','donation','TXN-011',1),
('2026-02-07',1,'Income',400,'Cash','Monthly subscriptions','donation','TXN-012',1),
('2026-01-24',1,'Income',3000,'Cash','General donation','donation','TXN-013',1),
('2026-01-10',1,'Income',500,'UPI','Monthly subscriptions','donation','TXN-014',1),
('2026-07-06',5,'Expense',2000,'Cash','Electricity bill','','TXN-015',1),
('2026-06-22',5,'Expense',3500,'Cash','Water & maintenance','','TXN-016',1),
('2026-06-08',5,'Expense',5000,'Cheque','Repair work','','TXN-017',1),
('2026-05-25',5,'Expense',1500,'Cash','Cleaning supplies','','TXN-018',1),
('2026-05-11',5,'Expense',2800,'UPI','Electricity bill','','TXN-019',1),
('2026-04-27',5,'Expense',4000,'Cash','Mosque maintenance','','TXN-020',1),
('2026-04-13',6,'Expense',3200,'Bank Transfer','Salary - Mouzin','','TXN-021',1),
('2026-03-30',5,'Expense',1800,'Cash','Supplies','','TXN-022',1),
('2026-03-16',5,'Expense',2500,'UPI','Electricity bill','','TXN-023',1);

INSERT OR IGNORE INTO marriages (marriage_number, bride_name, bride_father, groom_name, groom_father, witness1, witness2, mahar, nikah_date, registration_date, place) VALUES
('MRG-001','Ayesha','Ibrahim','Rasheed','Ahammed','Saleem','Najeeb',50000,'2026-06-16','2026-06-16','Paravur Masjid'),
('MRG-002','Fatima','Yousuf','Anas','Haneef','Mansoor','Jaleel',75000,'2026-05-17','2026-05-17','Aluva Masjid'),
('MRG-003','Sajna','Akbar','Shafeeq','Yousuf','Sameer','Nizar',100000,'2026-04-17','2026-04-17','Edappally Masjid'),
('MRG-004','Haseena','Jaleel','Aslam','Mansoor','Ibrahim','Salim',60000,'2026-03-18','2026-03-18','Kakkanad Masjid');

INSERT OR IGNORE INTO deaths (death_number, deceased_name, father_name, family_id, gender, date_of_death, burial_date, cause_of_death, burial_place, age) VALUES
('DTH-001','Abdulla','Kunhi',14,'Male','2026-06-01','2026-06-01','Heart Attack','Paravur Kabarsthan',72),
('DTH-002','Khadeeja','Moosa',2,'Female','2026-04-17','2026-04-17','Old Age','Aluva Kabarsthan',68),
('DTH-003','Moosa','Ali',9,'Male','2026-03-03','2026-03-03','Cancer','Kakkanad Kabarsthan',65);

-- Welfare categories must match the CHECK constraint in schema.sql:
-- ('Medical Aid','Education Aid','Marriage Assistance','Financial Assistance')
INSERT OR IGNORE INTO welfare_requests (request_number, applicant_name, family_id, category, amount_requested, reason, status) VALUES
('WEL-001','Kareem',14,'Medical Aid',25000,'Heart surgery','Approved'),
('WEL-002','Jaleel',9,'Financial Assistance',50000,'House repair','Disbursed'),
('WEL-003','Fouziya',9,'Education Aid',15000,'Children education','Pending'),
('WEL-004','Nizar',13,'Medical Aid',10000,'Treatment','Approved'),
('WEL-005','Kareem',14,'Financial Assistance',5000,'Daily needs','Rejected');

INSERT OR IGNORE INTO audit_log (created_at, username, action, module, description) VALUES
(datetime('2026-07-15 10:00:00'),'admin','LOGIN','auth','User logged in'),
(datetime('2026-07-14 10:00:00'),'admin','ADD','family','Added family'),
(datetime('2026-07-13 10:00:00'),'admin','ADD','member','Added member'),
(datetime('2026-07-12 10:00:00'),'admin','ADD','donation','Recorded donation'),
(datetime('2026-07-11 10:00:00'),'admin','EDIT','settings','Updated settings'),
(datetime('2026-07-10 10:00:00'),'admin','ADD','subscription','Recorded payment'),
(datetime('2026-07-09 10:00:00'),'admin','ADD','marriage','Registered marriage'),
(datetime('2026-07-08 10:00:00'),'admin','BACKUP','backup','Created backup'),
(datetime('2026-07-07 10:00:00'),'admin','ADD','death','Registered death'),
(datetime('2026-07-06 10:00:00'),'admin','ADD','welfare','New welfare request');
