-- V029: revise the demo/mock dataset to model the NEW family structure —
-- extended households where the head's siblings and their children live
-- under the SAME family record (V026 model: explicit father_name per member,
-- Brother/Sister/Nephew/Niece relationships, one head per family).
--
-- This runs automatically at app start ("real time" revision): fresh demo
-- databases get the extended households immediately, and existing demo
-- databases are upgraded in place. Real (non-demo) databases are untouched:
-- every INSERT is guarded by the target family carrying the demo marker
-- (families.notes = 'Demo dataset' — set by the V014 demo seed), so members
-- are never added to a mahallu's real families.
--
-- Idempotent: explicit ids + INSERT OR IGNORE (member_code is UNIQUE).

-- Family 1 — Darussalam (head: Abdul Rahman). Father of the siblings: Kunhi Haji.
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 200,1,'MEM-200','Abdul Kareem','Male','1976-05-20',50,'O+','Tailor','ITI','Married','9847210200','demo200@example.com','Indian','Brother',0,'Kunhi Haji','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 1 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 201,1,'MEM-201','Suhaira','Female','1980-09-14',45,'A+','Homemaker','Higher Secondary','Married','9847210201','demo201@example.com','Indian','Other',0,NULL,'Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 1 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 202,1,'MEM-202','Adhil Kareem','Male','2005-11-02',20,'B+','Student','B.Tech','Single','9847210202','demo202@example.com','Indian','Nephew',0,'Abdul Kareem','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 1 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 203,1,'MEM-203','Alina Kareem','Female','2009-03-25',17,'O+','Student','Plus Two','Single','9847210203','demo203@example.com','Indian','Niece',0,'Abdul Kareem','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 1 AND f.notes = 'Demo dataset');

-- Family 3 — Rahmath (head: Niyas). Widowed mother + unmarried sister of the head.
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 204,3,'MEM-204','Fathima Beevi','Female','1948-07-08',77,'B+','Retired','SSLC','Widowed','9847210204','demo204@example.com','Indian','Grandmother',0,NULL,'Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 3 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 205,3,'MEM-205','Sajitha','Female','1982-12-19',43,'A+','Nurse','GNM','Single','9847210205','demo205@example.com','Indian','Sister',0,'Abdullah Haji','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 3 AND f.notes = 'Demo dataset');

-- Family 5 — Mubarak (head: Rashid). Brother with his own small family.
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 206,5,'MEM-206','Nasar','Male','1974-02-17',51,'A+','Driver','SSLC','Married','9847210206','demo206@example.com','Indian','Brother',0,'Muhammed Koya','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 5 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 207,5,'MEM-207','Rasiya','Female','1978-06-11',48,'O+','Homemaker','Higher Secondary','Married','9847210207','demo207@example.com','Indian','Other',0,NULL,'Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 5 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 208,5,'MEM-208','Sinan Nasar','Male','2006-08-30',19,'B+','Student','B.Com','Single','9847210208','demo208@example.com','Indian','Nephew',0,'Nasar','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 5 AND f.notes = 'Demo dataset');

-- Family 8 — Hidaya (head: Basheer). Unmarried brother + his daughter-side niece.
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 209,8,'MEM-209','Sameer','Male','1977-10-05',48,'AB+','Electrician','ITI','Married','9847210209','demo209@example.com','Indian','Brother',0,'Kunhi Moosa','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 8 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 210,8,'MEM-210','Shibla','Female','2010-01-15',16,'O+','Student','SSLC','Single','9847210210','demo210@example.com','Indian','Niece',0,'Sameer','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 8 AND f.notes = 'Demo dataset');

-- Family 11 — Rahma House (head: Muneer). Sister of the head, divorced,
-- living back in the tharavad with her child.
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 211,11,'MEM-211','Naseera','Female','1985-04-22',40,'B+','Tailor','SSLC','Divorced','9847210211','demo211@example.com','Indian','Sister',0,'Ahmed Koya','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 11 AND f.notes = 'Demo dataset');
INSERT OR IGNORE INTO members (id,family_id,member_code,name,gender,date_of_birth,age,blood_group,occupation,education,marital_status,mobile,email,nationality,relationship,is_head,father_name,status)
SELECT 212,11,'MEM-212','Rayyan','Male','2012-09-09',13,'A+','Student','8th Standard','Single','','demo212@example.com','Indian','Nephew',0,'Zainul Abid','Active'
WHERE EXISTS (SELECT 1 FROM families f WHERE f.id = 11 AND f.notes = 'Demo dataset');

-- Backfill: demo members recorded as Nephew/Niece whose father is the
-- family head's brother/sister keep the explicit father_name set above.
-- For any remaining demo Son/Daughter members without father_name (databases
-- seeded before V026), default it to the male head of the same family.
UPDATE members
SET father_name = (
  SELECT h.name FROM members h
  WHERE h.family_id = members.family_id
    AND h.is_head = 1 AND h.gender = 'Male' AND h.archive_state = 0
)
WHERE relationship IN ('Son','Daughter')
  AND (father_name IS NULL OR father_name = '')
  AND EXISTS (SELECT 1 FROM families f WHERE f.id = members.family_id AND f.notes = 'Demo dataset');

-- Refresh demo activity for the CURRENT month (at upgrade time) so the
-- dashboard cards and charts — Collection (this month) and Income vs
-- Expense — show live-looking data after the revision. Demo families only;
-- real mahallu data is never touched.
INSERT INTO subscriptions
  (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, payment_date, receipt_number, payment_method, status, collected_by)
SELECT f.id,
       COALESCE((SELECT m.id FROM members m WHERE m.family_id = f.id AND m.is_head = 1 AND m.status = 'Active' ORDER BY m.id LIMIT 1), 1),
       1,
       date('now', 'start of month'),
       date('now', 'start of month', '+1 month', '-1 day'),
       100, 100, date('now'),
       'RCP-DMO-' || f.family_number, 'Cash', 'Paid', 1
FROM families f
WHERE f.notes = 'Demo dataset'
  AND f.status = 'Active'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.family_id = f.id
      AND strftime('%Y-%m', COALESCE(s.payment_date, s.period_start)) = strftime('%Y-%m', 'now')
  );
