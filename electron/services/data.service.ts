/*
 * DataService — exposes all 16 modules' CRUD + summary operations
 * to the Electron renderer via IPC.
 */
import { all, one, run, scalar } from "../db/connection.js";
import { randomBytes } from "node:crypto";

// ================= HELPERS =================

function genCode(prefix: string): string {
  // E.g. MBR-0007 — based on row count
  return `${prefix}`;
}

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ================= FAMILIES =================

export const families = {
  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(family_number LIKE ? OR house_name LIKE ? OR house_number LIKE ? OR phone LIKE ? OR area LIKE ? OR ward LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t, t, t);
    }
    if (filter.status && filter.status !== "All") {
      where.push("status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT f.*,
      (SELECT COUNT(*) FROM members m WHERE m.family_id = f.id AND m.status != 'Inactive') AS member_count
      FROM families f WHERE ${where.join(" AND ")}
      ORDER BY f.family_number ASC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM families f WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM families WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'FAM-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM families"
    );
    const { id } = run(
      `INSERT INTO families
        (family_number, house_name, house_number, ward, area, address, pincode, phone, alt_phone, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", data.createdBy ?? 1
      ]
    );
    return { id, familyNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE families SET house_name = ?, house_number = ?, ward = ?, area = ?, address = ?, pincode = ?, phone = ?, alt_phone = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", id
      ]
    ),
  remove: (id: number) => run("DELETE FROM families WHERE id = ?", [id]),
};

// ================= MEMBERS =================

export const members = {
  list: (filter: { search?: string; familyId?: number; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(m.name LIKE ? OR m.member_code LIKE ? OR m.mobile LIKE ? OR m.email LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t);
    }
    if (filter.familyId) {
      where.push("m.family_id = ?");
      params.push(filter.familyId);
    }
    if (filter.status && filter.status !== "All") {
      where.push("m.status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT m.*, f.family_number, f.house_name AS family_house_name
      FROM members m LEFT JOIN families f ON f.id = m.family_id
      WHERE ${where.join(" AND ")}
      ORDER BY m.member_code ASC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM members m WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM members WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'MBR-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM members"
    );
    const { id } = run(
      `INSERT INTO members
        (member_code, family_id, name, arabic_name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, emergency_contact, relationship, status, nationality, address, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.familyId, data.name ?? "", data.arabicName ?? "",
        data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null,
        data.bloodGroup ?? "", data.occupation ?? "", data.education ?? "",
        data.maritalStatus ?? "Single", data.mobile ?? "",
        data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", data.status ?? "Active",
        data.nationality ?? "Indian", data.address ?? "", data.createdBy ?? 1
      ]
    );
    return { id, memberCode: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE members SET family_id = ?, name = ?, arabic_name = ?, gender = ?, date_of_birth = ?, age = ?, blood_group = ?, occupation = ?, education = ?, marital_status = ?, mobile = ?, email = ?, emergency_contact = ?, relationship = ?, status = ?, nationality = ?, address = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.familyId, data.name, data.arabicName ?? "",
        data.gender, data.dateOfBirth, data.age, data.bloodGroup,
        data.occupation, data.education, data.maritalStatus,
        data.mobile, data.email, data.emergencyContact,
        data.relationship, data.status, data.nationality,
        data.address, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM members WHERE id = ?", [id]),
  relationships: () => ["Head", "Spouse", "Son", "Daughter", "Parent", "Sibling", "Other"],
};

// ================= SUBSCRIPTIONS =================

export const subscriptions = {
  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(s.receipt_number LIKE ? OR f.house_name LIKE ? OR f.family_number LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t);
    }
    if (filter.status && filter.status !== "All Status") {
      where.push("s.status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT s.*, f.family_number, f.house_name,
      (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name
      FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.payment_date DESC NULLS LAST, s.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM subscriptions s WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM subscriptions WHERE id = ?", [id]),
  create: (data: any) => {
    const receipt = data.receiptNumber || scalar<string>(
      "SELECT 'RCP-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM subscriptions"
    );
    const { id } = run(
      `INSERT INTO subscriptions
        (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid,
         payment_date, receipt_number, payment_method, transaction_ref, status, collected_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.familyId, data.memberId, data.planId ?? 1, data.periodStart,
        data.periodEnd, data.amount, data.amountPaid ?? 0,
        data.paymentDate, receipt, data.paymentMethod ?? "Cash",
        data.transactionRef ?? "", data.status ?? "Pending",
        data.collectedBy ?? 1, data.remarks ?? ""
      ]
    );
    return { id, receiptNumber: receipt };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE subscriptions SET family_id = ?, member_id = ?, plan_id = ?, period_start = ?, period_end = ?, amount = ?, amount_paid = ?, payment_date = ?, payment_method = ?, transaction_ref = ?, status = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.familyId, data.memberId, data.planId,
        data.periodStart, data.periodEnd, data.amount, data.amountPaid,
        data.paymentDate, data.paymentMethod, data.transactionRef,
        data.status, data.remarks, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM subscriptions WHERE id = ?", [id]),
  markOverdue: () => {
    const today = nowDate();
    return run(
      `UPDATE subscriptions SET status = 'Overdue' WHERE status = 'Pending' AND period_end < ?`,
      [today]
    ).changes;
  },
  totalCollected: () => scalar<number>("SELECT COALESCE(SUM(amount_paid),0) AS v FROM subscriptions WHERE status = 'Paid'"),
  totalPending: () => scalar<number>("SELECT COALESCE(SUM(amount-amount_paid),0) AS v FROM subscriptions WHERE status IN ('Pending','Overdue','Partial') OR amount_paid < amount"),
  plans: () => all<any>("SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY name"),
};

// ================= DONATIONS =================

export const donations = {
  list: (filter: { search?: string; category?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(d.donor_name LIKE ? OR d.receipt_number LIKE ? OR d.donor_phone LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t);
    }
    if (filter.category && filter.category !== "All") {
      where.push("c.name = ?");
      params.push(filter.category);
    }
    const sql = `SELECT d.*, c.name AS category_name
      FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id
      WHERE ${where.join(" AND ")}
      ORDER BY d.donation_date DESC, d.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM donations d WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM donations WHERE id = ?", [id]),
  create: (data: any) => {
    const receipt = data.receiptNumber || scalar<string>(
      "SELECT 'DON-' || printf('%03d', COALESCE(MAX(id), 0) + 1) AS n FROM donations"
    );
    const { id } = run(
      `INSERT INTO donations
        (donor_name, donor_phone, donor_address, family_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.donorName, data.donorPhone ?? "", data.donorAddress ?? "",
        data.familyId ?? null, data.categoryId, data.amount,
        data.donationDate || nowDate(), receipt,
        data.purpose ?? "", data.paymentMethod ?? "Cash",
        data.transactionRef ?? "", data.receivedBy ?? 1,
        data.remarks ?? ""
      ]
    );
    return { id, receiptNumber: receipt };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE donations SET donor_name = ?, donor_phone = ?, donor_address = ?, family_id = ?, category_id = ?, amount = ?, donation_date = ?, purpose = ?, payment_method = ?, transaction_ref = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.donorName, data.donorPhone, data.donorAddress,
        data.familyId, data.categoryId, data.amount,
        data.donationDate, data.purpose, data.paymentMethod,
        data.transactionRef, data.remarks, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM donations WHERE id = ?", [id]),
  categories: () => all<any>("SELECT * FROM donation_categories WHERE is_active = 1 ORDER BY name"),
  totalThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM donations WHERE strftime('%Y-%m', donation_date) = strftime('%Y-%m','now')"),
};

// ================= ACCOUNTING =================

export const accounting = {
  list: (filter: { search?: string; type?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(t.description LIKE ? OR t.receipt_number LIKE ? OR t.transaction_ref LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t);
    }
    if (filter.type && filter.type !== "All") {
      where.push("t.type = ?");
      params.push(filter.type);
    }
    const sql = `SELECT t.*, u.username AS created_by_name
      FROM transactions t LEFT JOIN users u ON u.id = t.created_by
      WHERE ${where.join(" AND ")}
      ORDER BY t.txn_date DESC, t.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM transactions t WHERE ${where.join(" AND ")}`,
        params
      );
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM transactions WHERE id = ?", [id]),
  create: (data: any) => {
    const receipt = data.receiptNumber || scalar<string>(
      "SELECT 'TXN-' || printf('%03d', COALESCE(MAX(id), 0) + 1) AS n FROM transactions"
    );
    const { id } = run(
      `INSERT INTO transactions
        (txn_date, account_id, type, amount, payment_method, description, linked_module, linked_id, receipt_number, transaction_ref, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.txnDate || nowDate(), data.accountId ?? 1, data.type,
        data.amount, data.paymentMethod ?? "Cash", data.description ?? "",
        data.linkedModule ?? "", data.linkedId ?? null,
        receipt, data.transactionRef ?? "", data.createdBy ?? 1
      ]
    );
    return { id, receiptNumber: receipt };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE transactions SET txn_date = ?, account_id = ?, type = ?, amount = ?, payment_method = ?, description = ?, linked_module = ?, linked_id = ?, transaction_ref = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.txnDate, data.accountId, data.type, data.amount,
        data.paymentMethod, data.description,
        data.linkedModule ?? "", data.linkedId,
        data.transactionRef, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM transactions WHERE id = ?", [id]),
  totalIncome: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type = 'Income'"),
  totalExpense: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type = 'Expense'"),
  balance: () => scalar<number>("SELECT (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Income') - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Expense') AS v"),
};

// ================= MARRIAGE =================

export const marriages = {
  list: (filter: { search?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(m.marriage_number LIKE ? OR m.bride_name LIKE ? OR m.groom_name LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t);
    }
    const sql = `SELECT m.* FROM marriages m WHERE ${where.join(" AND ")} ORDER BY m.nikah_date DESC, m.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM marriages m WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM marriages WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'MRG-' || strftime('%Y') || '-' || printf('%03d', COALESCE(MAX(id), 0) + 1) AS n FROM marriages"
    );
    const { id } = run(
      `INSERT INTO marriages
        (marriage_number, bride_name, bride_father, bride_address, groom_name, groom_father, groom_address, witness1, witness2, witness3, witness4, mahar, nikah_date, registration_date, place, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.brideName, data.brideFather ?? "", data.brideAddress ?? "",
        data.groomName, data.groomFather ?? "", data.groomAddress ?? "",
        data.witness1 ?? "", data.witness2 ?? "", data.witness3 ?? "", data.witness4 ?? "",
        data.mahar ?? "", data.nikahDate, data.registrationDate || nowDate(),
        data.place ?? "", data.remarks ?? "", data.createdBy ?? 1
      ]
    );
    return { id, marriageNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE marriages SET bride_name = ?, bride_father = ?, bride_address = ?, groom_name = ?, groom_father = ?, groom_address = ?, witness1 = ?, witness2 = ?, witness3 = ?, witness4 = ?, mahar = ?, nikah_date = ?, registration_date = ?, place = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.brideName, data.brideFather, data.brideAddress,
        data.groomName, data.groomFather, data.groomAddress,
        data.witness1, data.witness2, data.witness3, data.witness4,
        data.mahar, data.nikahDate, data.registrationDate,
        data.place, data.remarks, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM marriages WHERE id = ?", [id]),
};

// ================= DEATH =================

export const deaths = {
  list: (filter: { search?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(d.death_number LIKE ? OR d.deceased_name LIKE ? OR d.father_name LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t);
    }
    const sql = `SELECT d.* FROM deaths d WHERE ${where.join(" AND ")} ORDER BY d.date_of_death DESC, d.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM deaths d WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM deaths WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'DTH-' || strftime('%Y') || '-' || printf('%03d', COALESCE(MAX(id), 0) + 1) AS n FROM deaths"
    );
    const { id } = run(
      `INSERT INTO deaths
        (death_number, deceased_name, father_name, gender, date_of_death, burial_date, cause_of_death, burial_place, family_id, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.deceasedName, data.fatherName ?? "",
        data.gender ?? "Male", data.dateOfDeath,
        data.burialDate, data.causeOfDeath ?? "", data.burialPlace ?? "",
        data.familyId ?? null, data.remarks ?? "", data.createdBy ?? 1
      ]
    );
    return { id, deathNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE deaths SET deceased_name = ?, father_name = ?, gender = ?, date_of_death = ?, burial_date = ?, cause_of_death = ?, burial_place = ?, family_id = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.deceasedName, data.fatherName, data.gender,
        data.dateOfDeath, data.burialDate, data.causeOfDeath,
        data.burialPlace, data.familyId, data.remarks, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM deaths WHERE id = ?", [id]),
};

// ================= WELFARE =================

export const welfare = {
  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(w.request_number LIKE ? OR w.applicant_name LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t);
    }
    if (filter.status && filter.status !== "All") {
      where.push("w.status = ?");
      params.push(filter.status);
    }
    const sql = `SELECT w.* FROM welfare_requests w WHERE ${where.join(" AND ")} ORDER BY w.request_date DESC, w.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM welfare_requests w WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT * FROM welfare_requests WHERE id = ?", [id]),
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'WEL-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM welfare_requests"
    );
    const { id } = run(
      `INSERT INTO welfare_requests
        (request_number, applicant_name, family_id, category, amount_requested, amount_approved, reason, request_date, status, remarks, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.applicantName, data.familyId ?? null,
        data.category ?? "", data.amountRequested, data.amountApproved ?? 0,
        data.reason ?? "", nowDate(), "Pending",
        data.remarks ?? "", data.processedBy ?? 1
      ]
    );
    return { id, requestNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE welfare_requests SET applicant_name = ?, family_id = ?, category = ?, amount_requested = ?, amount_approved = ?, reason = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.applicantName, data.familyId, data.category,
        data.amountRequested, data.amountApproved, data.reason,
        data.remarks, id
      ]
    ),
  approve: (id: number, amount: number, remarks: string, userId: number) =>
    run(
      `UPDATE welfare_requests SET status = 'Approved', amount_approved = ?, remarks = ?, processed_by = ?, processed_date = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [amount, remarks, userId, id]
    ),
  reject: (id: number, reason: string, userId: number) =>
    run(
      `UPDATE welfare_requests SET status = 'Rejected', remarks = ?, processed_by = ?, processed_date = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [reason, userId, id]
    ),
  disburse: (id: number, userId: number) =>
    run(
      `UPDATE welfare_requests SET status = 'Disbursed', disbursed_date = ?, processed_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [nowDate(), userId, id]
    ),
  remove: (id: number) => run("DELETE FROM welfare_requests WHERE id = ?", [id]),
  categories: () => all<any>("SELECT * FROM welfare_categories WHERE is_active = 1 ORDER BY name"),
};

// ================= CERTIFICATES =================

export const certificates = {
  list: (filter: { type?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.type && filter.type !== "All Types") {
      where.push("type = ?");
      params.push(filter.type);
    }
    const sql = `SELECT * FROM certificates WHERE ${where.join(" AND ")} ORDER BY issued_date DESC, id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM certificates WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  issueMembership: (memberCode: string, userId: number) => {
    const m = one<any>("SELECT * FROM members WHERE member_code = ?", [memberCode]);
    if (!m) throw new Error("Member not found");
    const certNum = `MMS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [certNum, "Membership", m.id, m.family_id, m.name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  issueResidence: (familyNumber: string, issuedTo: string, userId: number) => {
    const f = one<any>("SELECT * FROM families WHERE family_number = ?", [familyNumber]);
    if (!f) throw new Error("Family not found");
    const certNum = `RES-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
      [certNum, "Residence", f.id, issuedTo || f.house_name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  issueMarriage: (marriageNumber: string, userId: number) => {
    const m = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNumber]);
    if (!m) throw new Error("Marriage record not found");
    const certNum = `MAR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)",
      [certNum, "Marriage", m.bride_name + " & " + m.groom_name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  issueDeath: (deathNumber: string, userId: number) => {
    const d = one<any>("SELECT * FROM deaths WHERE death_number = ?", [deathNumber]);
    if (!d) throw new Error("Death record not found");
    const certNum = `DTH-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)",
      [certNum, "Death", d.deceased_name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  remove: (id: number) => run("DELETE FROM certificates WHERE id = ?", [id]),
};

// ================= USERS =================

export const users = {
  list: () => all<any>(`SELECT id, username, full_name, role, is_active, must_change_pwd, last_login, created_at FROM users ORDER BY username`),
  create: (data: any, creatorRole: string) => {
    if (creatorRole !== "Administrator") throw new Error("Only administrators can create users");
    const salt = randomBytes(16);
    const iter = 200000;
    const hash = require("node:crypto").pbkdf2Sync(data.password || "Welcome@123", salt, iter, 32, "sha256");
    const stored = `pbkdf2_sha256$${iter}$${salt.toString("base64")}$${hash.toString("base64")}`;
    const { id } = run(
      "INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, must_change_pwd) VALUES (?, ?, ?, ?, ?, 1, ?)",
      [
        data.username, data.fullName, stored, salt.toString("base64"),
        data.role || "Viewer", data.mustChangePwd ? 1 : 1
      ]
    );
    return { id };
  },
  update: (id: number, data: any) =>
    run("UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?",
      [data.fullName, data.role, data.isActive ? 1 : 0, id]),
  toggleLock: (id: number, locked: boolean) =>
    run("UPDATE users SET is_active = ? WHERE id = ?", [locked ? 0 : 1, id]),
  resetPassword: (id: number, newPassword: string) => {
    const salt = randomBytes(16);
    const iter = 200000;
    const hash = require("node:crypto").pbkdf2Sync(newPassword, salt, iter, 32, "sha256");
    const stored = `pbkdf2_sha256$${iter}$${salt.toString("base64")}$${hash.toString("base64")}`;
    return run("UPDATE users SET password_hash = ?, password_salt = ?, must_change_pwd = 1 WHERE id = ?",
      [stored, salt.toString("base64"), id]);
  },
  remove: (id: number) => run("DELETE FROM users WHERE id = ? AND username != 'admin'", [id]),
};

// ================= AUDIT LOG =================

export const audit = {
  list: (filter: { user?: string; action?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.user) {
      where.push("username LIKE ?");
      params.push(`%${filter.user}%`);
    }
    if (filter.action && filter.action !== "All") {
      where.push("action = ?");
      params.push(filter.action);
    }
    const sql = `SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  log: (userId: number, username: string, action: string, module: string, entityId: number, description: string, metadata: string = "") => {
    try {
      run(
        "INSERT INTO audit_log (user_id, username, action, module, entity_id, description, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [userId, username, action, module, entityId, description, metadata]
      );
    } catch (e) {
      console.error("[audit] Failed to log:", e);
    }
  },
};

// ================= SETTINGS =================

export const settings = {
  load: () => one<any>("SELECT * FROM settings WHERE id = 1"),
  save: (data: any) =>
    run(
      `UPDATE settings SET
        mahallu_name = ?, address = ?, phone = ?, email = ?,
        financial_year_start = ?, currency_symbol = ?, theme = ?, language = ?,
        auto_backup = ?, backup_interval_hours = ?, receipt_prefix = ?,
        updated_at = datetime('now')
       WHERE id = 1`,
      [
        data.mahalluName ?? "", data.address ?? "", data.phone ?? "", data.email ?? "",
        data.financialYearStart ?? "", data.currencySymbol ?? "₹",
        data.theme ?? "light", data.language ?? "en",
        data.autoBackup ? 1 : 0, data.backupIntervalHours ?? 24,
        data.receiptPrefix ?? "RCP"
      ]
    ),
};

// ================= DASHBOARD =================

export const dashboard = {
  summary: () => {
    const row = one<any>("SELECT * FROM v_dashboard_summary");
    return row ?? {};
  },
  incomeThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Income' AND strftime('%Y-%m', txn_date) = strftime('%Y-%m','now')"),
  expenseThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Expense' AND strftime('%Y-%m', txn_date) = strftime('%Y-%m','now')"),
  monthlyCollections: (months: number = 6) => all<any>(
    `SELECT strftime('%Y-%m', payment_date) AS month, COALESCE(SUM(amount_paid),0) AS amount
     FROM subscriptions WHERE payment_date >= date('now', '-${months} months')
     GROUP BY month ORDER BY month`
  ),
  monthlyDonations: (months: number = 6) => all<any>(
    `SELECT strftime('%Y-%m', donation_date) AS month, COALESCE(SUM(amount),0) AS amount
     FROM donations WHERE donation_date >= date('now', '-${months} months')
     GROUP BY month ORDER BY month`
  ),
  incomeVsExpense: (months: number = 6) => all<any>(
    `SELECT strftime('%Y-%m', txn_date) AS month,
       SUM(CASE WHEN type='Income' THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type='Expense' THEN amount ELSE 0 END) AS expense
     FROM transactions WHERE txn_date >= date('now', '-${months} months')
     GROUP BY month ORDER BY month`
  ),
  recentActivity: (limit: number = 10) => all<any>(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, [limit]
  ),
};
