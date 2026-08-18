-- V014: reset disposable demo database and populate a large realistic test dataset.
-- This migration is intentionally destructive for the development/demo build requested by the owner.
PRAGMA foreign_keys=OFF;

-- Compatibility fields required by Accounting and some CRUD forms.
ALTER TABLE transactions ADD COLUMN transaction_ref TEXT;
ALTER TABLE transactions ADD COLUMN updated_at TEXT;

DELETE FROM token_assignments;
DELETE FROM token_events;
DELETE FROM certificates;
DELETE FROM deaths;
DELETE FROM marriages;
DELETE FROM welfare_requests;
DELETE FROM transactions;
DELETE FROM donations;
DELETE FROM subscriptions;
DELETE FROM members;
DELETE FROM families;
DELETE FROM audit_log;
DELETE FROM notifications;

INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (1,'FAM-001','Darussalam','1','1','Nadakkavu','Darussalam, Nadakkavu, Kozhikode','673011','9847010001','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (2,'FAM-002','Noor Manzil','2','2','Moozhikkal','Noor Manzil, Moozhikkal, Kozhikode','673010','9847010002','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (3,'FAM-003','Rahmath','3','3','Vellimadukunnu','Rahmath, Vellimadukunnu, Kozhikode','673012','9847010003','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (4,'FAM-004','Al Huda','4','4','Kottooli','Al Huda, Kottooli, Kozhikode','673016','9847010004','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (5,'FAM-005','Mubarak','5','5','Malaparamba','Mubarak, Malaparamba, Kozhikode','673009','9847010005','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (6,'FAM-006','Safiya House','6','6','Chevayur','Safiya House, Chevayur, Kozhikode','673017','9847010006','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (7,'FAM-007','Madinah','7','7','Pottammal','Madinah, Pottammal, Kozhikode','673016','9847010007','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (8,'FAM-008','Hidaya','8','8','Palazhi','Hidaya, Palazhi, Kozhikode','673014','9847010008','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (9,'FAM-009','Fathima Manzil','9','1','Kunduparamba','Fathima Manzil, Kunduparamba, Kozhikode','673007','9847010009','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (10,'FAM-010','Safa Villa','10','2','Eranhipalam','Safa Villa, Eranhipalam, Kozhikode','673006','9847010010','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (11,'FAM-011','Rahma House','11','3','Feroke','Rahma House, Feroke, Kozhikode','673631','9847010011','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (12,'FAM-012','Amina Manzil','12','4','Ramanattukara','Amina Manzil, Ramanattukara, Kozhikode','673633','9847010012','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (13,'FAM-013','Naseema','13','5','Pantheerankavu','Naseema, Pantheerankavu, Kozhikode','673019','9847010013','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (14,'FAM-014','Shifa','14','6','Kallai','Shifa, Kallai, Kozhikode','673003','9847010014','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (15,'FAM-015','Mariya House','15','7','West Hill','Mariya House, West Hill, Kozhikode','673005','9847010015','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (16,'FAM-016','Zamzam','16','8','Medical College','Zamzam, Medical College, Kozhikode','673008','9847010016','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (17,'FAM-017','Green View','17','1','Puthiyangadi','Green View, Puthiyangadi, Kozhikode','673021','9847010017','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (18,'FAM-018','Noor Palace','18','2','Govindapuram','Noor Palace, Govindapuram, Kozhikode','673016','9847010018','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (19,'FAM-019','Al Madina','19','3','Mankavu','Al Madina, Mankavu, Kozhikode','673007','9847010019','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (20,'FAM-020','Rahma Villa','20','4','Parayancheri','Rahma Villa, Parayancheri, Kozhikode','673004','9847010020','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (21,'FAM-021','Hidaya House','21','5','Karaparamba','Hidaya House, Karaparamba, Kozhikode','673010','9847010021','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (22,'FAM-022','Baitul Noor','22','6','Thondayad','Baitul Noor, Thondayad, Kozhikode','673017','9847010022','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (23,'FAM-023','Darul Aman','23','7','Arayidathupalam','Darul Aman, Arayidathupalam, Kozhikode','673004','9847010023','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (24,'FAM-024','Anwar Manzil','24','8','Mananchira','Anwar Manzil, Mananchira, Kozhikode','673001','9847010024','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (25,'FAM-025','Safa Manzil','25','1','Kozhikode Beach','Safa Manzil, Kozhikode Beach, Kozhikode','673032','9847010025','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (26,'FAM-026','Afsar Villa','26','2','Nadakkavu East','Afsar Villa, Nadakkavu East, Kozhikode','673011','9847010026','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (27,'FAM-027','Barakah','27','3','Pokkunny','Barakah, Pokkunny, Kozhikode','673007','9847010027','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (28,'FAM-028','Misk','28','4','Kommeri','Misk, Kommeri, Kozhikode','673007','9847010028','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (29,'FAM-029','Riyaz House','29','5','Kakkodi','Riyaz House, Kakkodi, Kozhikode','673611','9847010029','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (30,'FAM-030','Tasneem','30','6','Kunnamangalam','Tasneem, Kunnamangalam, Kozhikode','673571','9847010030','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (31,'FAM-031','Ilham','31','7','Elathur','Ilham, Elathur, Kozhikode','673303','9847010031','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (32,'FAM-032','Rafeeq Manzil','32','8','Athanikkal','Rafeeq Manzil, Athanikkal, Kozhikode','673637','9847010032','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (33,'FAM-033','Thaj Manzil','33','1','Beypore','Thaj Manzil, Beypore, Kozhikode','673015','9847010033','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (34,'FAM-034','Afnan House','34','2','Chalappuram','Afnan House, Chalappuram, Kozhikode','673002','9847010034','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (35,'FAM-035','Jannath','35','3','Puthiyara','Jannath, Puthiyara, Kozhikode','673004','9847010035','Active','Demo dataset');
INSERT INTO families (id,family_number,house_name,house_number,ward,area,address,pincode,phone,status,notes) VALUES (36,'FAM-036','Naseem Villa','36','4','Ramanattukara East','Naseem Villa, Ramanattukara East, Kozhikode','673633','9847010036','Active','Demo dataset');

-- 144 members (4 per family) using realistic names, occupations, education and contacts.
INSERT INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status) VALUES (1,1,'MEM-001','Abdul Rahman','Male','1971-02-02',55,'O+','Business Owner','B.Com','Married','9847200001','demo001@example.com','Indian','Head',1,'Active');
INSERT INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status) VALUES (2,1,'MEM-002','Fathima','Female','1978-03-03',48,'A+','Teacher','B.Ed','Married','9847200002','demo002@example.com','Indian','Spouse',0,'Active');
INSERT INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status) VALUES (3,1,'MEM-003','Ayaan Rahman','Male','2010-04-04',16,'O+','Student','Class 10','Single','9847200003','demo003@example.com','Indian','Son',0,'Active');
INSERT INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status) VALUES (4,1,'MEM-004','Maryam Rahman','Female','2013-05-05',13,'B+','Student','Class 7','Single','9847200004','demo004@example.com','Indian','Daughter',0,'Active');

INSERT INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status) VALUES (5,2,'MEM-005','Muhammed Shafi','Male','1972-02-02',54,'B+','Civil Engineer','B.Tech','Married','9847200005','demo005@example.com','Indian','Head',1,'Active');
INSERT INTO members VALUES (6,2,'MEM-006','Rukiya','Female','1979-03-03',47,'O+','Homemaker','Higher Secondary','Married','9847200006','demo006@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now'));
INSERT INTO members VALUES (7,2,'MEM-007','Ibrahim Shafi','Male','2006-04-04',20,'A+','Software Developer','BCA','Single','9847200007','demo007@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now'));
INSERT INTO members VALUES (8,2,'MEM-008','Safa Shafi','Female','2014-05-05',12,'O+','Student','Class 6','Single','9847200008','demo008@example.com','Indian','Daughter',0,'Active',datetime('now'),datetime('now'));

INSERT INTO members VALUES (9,3,'MEM-009','Niyas','Male','1973-02-02',53,'O+','Accountant','M.Com','Married','9847200009','demo009@example.com','Indian','Head',1,'Active',datetime('now'),datetime('now'));
INSERT INTO members VALUES (10,3,'MEM-010','Shahana','Female','1980-03-03',46,'A+','Teacher','M.A.','Married','9847200010','demo010@example.com','Indian','Spouse',0,'Active',datetime('now'),datetime('now'));
INSERT INTO members VALUES (11,3,'MEM-011','Ramees Niyas','Male','2007-04-04',19,'B+','Student','B.Sc','Single','9847200011','demo011@example.com','Indian','Son',0,'Active',datetime('now'),datetime('now'));
INSERT INTO members VALUES (12,3,'MEM-012','Hiba Niyas','Female','2015-05-05',11,'O+','Student','Class 5','Single','9847200012','demo012@example.com','Indian','Daughter',0,'Active',datetime('now'),datetime('now'));

-- Families 4-36 are populated compactly with four members each via INSERT...SELECT.
INSERT INTO members (family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status)
SELECT f.id,'MEM-' || printf('%03d',((f.id-1)*4)+1),
CASE f.id WHEN 4 THEN 'Afsal' WHEN 5 THEN 'Rashid' WHEN 6 THEN 'Junaid' WHEN 7 THEN 'Shameer' WHEN 8 THEN 'Basheer' WHEN 9 THEN 'Shabeer' WHEN 10 THEN 'Faisal' WHEN 11 THEN 'Muneer' WHEN 12 THEN 'Naufal' WHEN 13 THEN 'Irfan' WHEN 14 THEN 'Salman' WHEN 15 THEN 'Ashraf' WHEN 16 THEN 'Shahabas Ali' WHEN 17 THEN 'Muneer Rahman' WHEN 18 THEN 'Fazil Kareem' WHEN 19 THEN 'Jaleel Koya' WHEN 20 THEN 'Naseer Ahmed' WHEN 21 THEN 'Suhail Ahmed' WHEN 22 THEN 'Rafiq P' WHEN 23 THEN 'Ameen K' WHEN 24 THEN 'Arshad V' WHEN 25 THEN 'Shanavas P' WHEN 26 THEN 'Noufal K' WHEN 27 THEN 'Sadiq Ali' WHEN 28 THEN 'Sameer TK' WHEN 29 THEN 'Firoz KP' WHEN 30 THEN 'Nabeel K' WHEN 31 THEN 'Haris PM' WHEN 32 THEN 'Riyas M' WHEN 33 THEN 'Yaseen A' WHEN 34 THEN 'Adil Rahman' WHEN 35 THEN 'Suhail J' WHEN 36 THEN 'Jabir K' END,
'Male','1970-01-10',50,'O+','Professional','Graduate','Married','9847200000'+printf('%02d',f.id*4-3),'head' || f.id || '@example.com','Indian','Head',1,'Active' FROM families f WHERE f.id>=4;
INSERT INTO members (family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status)
SELECT f.id,'MEM-' || printf('%03d',((f.id-1)*4)+2),
CASE f.id WHEN 4 THEN 'Suhara' WHEN 5 THEN 'Sameera' WHEN 6 THEN 'Haseena' WHEN 7 THEN 'Nazeera' WHEN 8 THEN 'Ameena' WHEN 9 THEN 'Rasiya' WHEN 10 THEN 'Huda' WHEN 11 THEN 'Sajida' WHEN 12 THEN 'Aaliya' WHEN 13 THEN 'Mariya' WHEN 14 THEN 'Safiya' WHEN 15 THEN 'Khadija' WHEN 16 THEN 'Nadiya' WHEN 17 THEN 'Shameema' WHEN 18 THEN 'Hafsa' WHEN 19 THEN 'Rafeena' WHEN 20 THEN 'Lubna' WHEN 21 THEN 'Afsana' WHEN 22 THEN 'Sana' WHEN 23 THEN 'Hiba' WHEN 24 THEN 'Farhana' WHEN 25 THEN 'Nusra' WHEN 26 THEN 'Sumayya' WHEN 27 THEN 'Muneera' WHEN 28 THEN 'Jameela' WHEN 29 THEN 'Bushra' WHEN 30 THEN 'Ayesha' WHEN 31 THEN 'Maryam' WHEN 32 THEN 'Zainab' WHEN 33 THEN 'Rifa' WHEN 34 THEN 'Safa' WHEN 35 THEN 'Sadia' WHEN 36 THEN 'Nafeesa' END,
'Female','1978-02-12',48,'A+','Teacher','Graduate','Married','9847200000'+printf('%02d',f.id*4-2),'spouse' || f.id || '@example.com','Indian','Spouse',0,'Active' FROM families f WHERE f.id>=4;
INSERT INTO members (family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status)
SELECT f.id,'MEM-' || printf('%03d',((f.id-1)*4)+3),'Ibrahim ' || f.house_name,'Male','2007-04-15',19,'B+','Student','B.Sc','Single','9847200000'+printf('%02d',f.id*4-1),'son' || f.id || '@example.com','Indian','Son',0,'Active' FROM families f WHERE f.id>=4;
INSERT INTO members (family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,status)
SELECT f.id,'MEM-' || printf('%03d',((f.id-1)*4)+4),'Amina ' || f.house_name,'Female','2014-05-18',12,'O+','Student','Class 6','Single','9847200000'+printf('%02d',f.id*4),'daughter' || f.id || '@example.com','Indian','Daughter',0,'Active' FROM families f WHERE f.id>=4;

-- Subscriptions
INSERT INTO subscriptions (family_id,member_id,plan_id,period_start,period_end,amount,amount_paid,payment_date,receipt_number,payment_method,status,collected_by)
SELECT f.id,(f.id-1)*4+1,1,'2026-01-01','2026-01-31',100,CASE WHEN f.id%5=0 THEN 50 ELSE 100 END,'2026-07-'||printf('%02d',(f.id%27)+1),'RCP-DEMO-'||printf('%03d',f.id),CASE WHEN f.id%3=0 THEN 'UPI' ELSE 'Cash' END,CASE WHEN f.id%5=0 THEN 'Partial' ELSE 'Paid' END,1 FROM families f;

-- Donations
INSERT INTO donations (donor_name,donor_phone,donor_address,family_id,category_id,amount,donation_date,receipt_number,purpose,payment_method,received_by,remarks)
SELECT CASE (f.id%5) WHEN 0 THEN 'Abdul Hameed' WHEN 1 THEN 'Muneer Koya' WHEN 2 THEN 'Suhail Ahmed' WHEN 3 THEN 'Yusuf Ali' ELSE 'Nabeel K' END,
'98473'||printf('%05d',f.id),'Kozhikode',f.id,(f.id%5)+1,5000+(f.id*250),'2026-'||printf('%02d',(f.id%8)+1)||'-'||printf('%02d',(f.id%25)+1),'DON-DEMO-'||printf('%03d',f.id),'Mahallu support',CASE WHEN f.id%3=0 THEN 'UPI' ELSE 'Cash' END,1,'Demo donation' FROM families f;

-- Accounting
INSERT INTO transactions (txn_date,account_id,type,amount,payment_method,reference,description,linked_module,linked_id,receipt_number,transaction_ref,created_by)
SELECT '2026-'||printf('%02d',(f.id%8)+1)||'-'||printf('%02d',(f.id%25)+1),
(SELECT id FROM ledger_accounts WHERE code=CASE WHEN f.id%3=0 THEN 'INC-DON' ELSE 'INC-SUB' END),'Income',2500+(f.id*100),CASE WHEN f.id%2=0 THEN 'UPI' ELSE 'Cash' END,'DEMO-TXN-'||printf('%03d',f.id),'Collection income','accounting',0,'TXN-DEMO-'||printf('%03d',f.id),'DEMO-REF-'||printf('%03d',f.id),1 FROM families f;
INSERT INTO transactions (txn_date,account_id,type,amount,payment_method,reference,description,linked_module,linked_id,receipt_number,transaction_ref,created_by)
SELECT '2026-'||printf('%02d',(f.id%8)+1)||'-'||printf('%02d',(f.id%25)+1),(SELECT id FROM ledger_accounts WHERE code='EXP-MAINT'),'Expense',1200+(f.id*50),'UPI','DEMO-EXP-'||printf('%03d',f.id),'Maintenance expense','accounting',0,'EXP-DEMO-'||printf('%03d',f.id),'EXP-REF-'||printf('%03d',f.id),1 FROM families f;

-- Marriages / deaths / welfare / certificates / token events are seeded with multiple realistic records.
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-001','Ayesha','Abdul Rahman','Nadakkavu, Kozhikode','Ibrahim Shafi','Muhammed Shafi','Moozhikkal, Kozhikode','Abdul Latheef','Sameer P','Gold 5 sovereigns','2026-01-18','2026-01-18','Minz Mahallu','Demo marriage');
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-002','Hiba','Niyas','Vellimadukunnu, Kozhikode','Ramees Niyas','Niyas','Kottooli, Kozhikode','Abdul Latheef','Sameer P','Gold 7 sovereigns','2026-02-22','2026-02-22','Minz Mahallu','Demo marriage');
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-003','Safa','Rashid','Malaparamba, Kozhikode','Junaid','Jaleel Koya','West Hill, Kozhikode','Abdul Latheef','Sameer P','Gold 4 sovereigns','2026-03-08','2026-03-08','Minz Mahallu','Demo marriage');
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-004','Nadiya','Shahabas Ali','Medical College, Kozhikode','Muneer Rahman','Muneer Rahman','Puthiyangadi, Kozhikode','Abdul Latheef','Sameer P','Gold 6 sovereigns','2026-04-19','2026-04-19','Minz Mahallu','Demo marriage');
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-005','Hafsa','Fazil Kareem','Govindapuram, Kozhikode','Jaleel Koya','Abdul Rahman','Mankavu, Kozhikode','Abdul Latheef','Sameer P','Gold 8 sovereigns','2026-05-14','2026-05-14','Minz Mahallu','Demo marriage');
INSERT INTO marriages (marriage_number,bride_name,bride_father,bride_address,groom_name,groom_father,groom_address,witness1,witness2,mahar,nikah_date,registration_date,place,remarks) VALUES
('MRG-DEMO-006','Lubna','Naseer Ahmed','Parayancheri, Kozhikode','Ameen K','Arshad V','Arayidathupalam, Kozhikode','Abdul Latheef','Sameer P','Gold 5 sovereigns','2026-06-11','2026-06-11','Minz Mahallu','Demo marriage');

INSERT INTO deaths (death_number,deceased_name,father_name,family_id,gender,date_of_death,burial_date,cause_of_death,burial_place,age,remarks) VALUES ('DTH-DEMO-001','Abdul Khader','Moideen',11,'Male','2026-01-14','2026-01-14','Natural causes','Mahallu Juma Masjid Cemetery',78,'Demo death');
INSERT INTO deaths VALUES (NULL,'DTH-DEMO-002','Yusuf Koya','Abdul Rahman',15,'Male','2026-02-18','2026-02-18','Natural causes','Mahallu Juma Masjid Cemetery',81,'Demo death',datetime('now'),datetime('now'));
INSERT INTO deaths VALUES (NULL,'DTH-DEMO-003','Hamza','Muneer',20,'Male','2026-03-09','2026-03-09','Natural causes','Mahallu Juma Masjid Cemetery',74,'Demo death',datetime('now'),datetime('now'));
INSERT INTO deaths VALUES (NULL,'DTH-DEMO-004','Abdul Salam','Kareem',25,'Male','2026-04-17','2026-04-17','Natural causes','Mahallu Juma Masjid Cemetery',76,'Demo death',datetime('now'),datetime('now'));
INSERT INTO deaths VALUES (NULL,'DTH-DEMO-005','Moideen','Rashid',30,'Male','2026-05-23','2026-05-23','Natural causes','Mahallu Juma Masjid Cemetery',69,'Demo death',datetime('now'),datetime('now'));
INSERT INTO deaths VALUES (NULL,'DTH-DEMO-006','Hassan','Basheer',35,'Male','2026-06-12','2026-06-12','Natural causes','Mahallu Juma Masjid Cemetery',83,'Demo death',datetime('now'),datetime('now'));

INSERT INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,request_date,status,remarks) VALUES ('WEL-DEMO-001','Nadiya',17,'Education Aid',15000,12000,'School admission and books','2026-01-10','Approved','Demo welfare');
INSERT INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,request_date,status,remarks) VALUES ('WEL-DEMO-002','Lubna',20,'Medical Aid',25000,20000,'Medical treatment support','2026-02-15','Disbursed','Demo welfare');
INSERT INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,request_date,status,remarks) VALUES ('WEL-DEMO-003','Sana',23,'Financial Assistance',10000,0,'Temporary support','2026-03-12','Pending','Demo welfare');
INSERT INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,request_date,status,remarks) VALUES ('WEL-DEMO-004','Hiba',26,'Marriage Assistance',30000,25000,'Marriage support','2026-04-09','Approved','Demo welfare');
INSERT INTO welfare_requests (request_number,applicant_name,family_id,category,amount_requested,amount_approved,reason,request_date,status,remarks) VALUES ('WEL-DEMO-005','Afsana',29,'Medical Aid',18000,15000,'Treatment assistance','2026-05-21','Disbursed','Demo welfare');

INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (101,'Eid Distribution','eid','2026-04-21','10:00','Main Masjid Hall','Demo token event','completed');
INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (102,'Monthly Welfare','welfare','2026-05-18','09:30','Mahallu Office','Demo token event','completed');
INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (103,'Community Food Distribution','general','2026-06-15','11:00','Community Hall','Demo token event','completed');
INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (104,'Qurbani Distribution','general','2026-07-02','10:30','Masjid Ground','Demo token event','completed');
INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (105,'Ramadan Relief','welfare','2026-08-08','09:00','Mahallu Office','Demo token event','active');
INSERT INTO token_events (id,event_name,event_type,event_date,event_time,venue,description,status) VALUES (106,'Milad Gathering','general','2026-10-12','18:30','Main Masjid Hall','Demo token event','active');

INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 101,id,'A'||printf('%03d',id),'COLLECTED',1 FROM families WHERE id<=18;
INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 102,id,'B'||printf('%03d',id),CASE WHEN id%4=0 THEN 'ISSUED' ELSE 'GENERATED' END,0 FROM families WHERE id<=18;
INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 103,id,'C'||printf('%03d',id),'GENERATED',0 FROM families WHERE id<=18;
INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 104,id,'D'||printf('%03d',id),CASE WHEN id%3=0 THEN 'COLLECTED' ELSE 'GENERATED' END,CASE WHEN id%3=0 THEN 1 ELSE 0 END FROM families WHERE id<=18;
INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 105,id,'E'||printf('%03d',id),'GENERATED',0 FROM families WHERE id<=18;
INSERT INTO token_assignments (event_id,family_id,token_code,status,collected) SELECT 106,id,'F'||printf('%03d',id),'GENERATED',0 FROM families WHERE id<=18;

INSERT INTO certificates (certificate_number,type,member_id,family_id,issued_to,issued_date,issued_by,notes)
SELECT 'CERT-DEMO-'||printf('%03d',id),CASE WHEN id%3=0 THEN 'Membership' WHEN id%3=1 THEN 'Residence' ELSE 'Character' END,id,family_id,name,'2026-07-'||printf('%02d',(id%25)+1),1,'Demo certificate' FROM members WHERE id<=20;

PRAGMA foreign_keys=ON;
