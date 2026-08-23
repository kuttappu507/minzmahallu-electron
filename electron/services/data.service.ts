/*
 * DataService — exposes all 16 modules' CRUD + summary operations
 * to the Electron renderer via IPC.
 */
import { all, one, run, scalar, getDB } from "../db/connection.js";
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
    ensureCurrentMonth();
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
        (family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? ""
      ]
    );
    return { id, familyNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE families SET house_name = ?, house_number = ?, ward = ?, area = ?, address = ?, pincode = ?, phone = ?, alternative_phone = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
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
        (member_code, family_id, name, arabic_name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, emergency_contact, relationship, status, nationality, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.familyId, data.name ?? "", data.arabicName ?? "",
        data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null,
        data.bloodGroup ?? "", data.occupation ?? "", data.education ?? "",
        data.maritalStatus ?? "Single", data.mobile ?? "",
        data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", data.status ?? "Active",
        data.nationality ?? "Indian", data.address ?? ""
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

function ensureCurrentMonth() {
  const first = new Date();
  first.setDate(1);
  const periodStart = first.toISOString().slice(0, 10);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const periodEnd = last.toISOString().slice(0, 10);
  const configured = scalar<number>("SELECT COALESCE(subscription_monthly_amount, 0) FROM settings WHERE id = 1") || 0;
  const plan = one<any>("SELECT * FROM subscription_plans WHERE frequency = 'Monthly' AND is_active = 1 ORDER BY id LIMIT 1");
  if (!plan || configured <= 0) return { created: 0, amount: configured, periodStart, periodEnd };
  const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");
  let created = 0;
  const insert = getDB().prepare(`INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')`);
  getDB().transaction(() => {
    for (const f of families) {
      const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? LIMIT 1", [f.id, periodStart]);
      if (exists) continue;
      const head = one<any>("SELECT id FROM members WHERE family_id = ? AND status = 'Active' ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1", [f.id]);
      insert.run(f.id, head?.id ?? null, plan.id, periodStart, periodEnd, configured);
      created++;
    }
  })();
  return { created, amount: configured, periodStart, periodEnd };
}

function memberSubscriptionBalance(familyId: number) {
  if (!familyId) return 0;
  return scalar<number>("SELECT COALESCE(SUM(amount - amount_paid),0) FROM subscriptions WHERE family_id = ? AND amount > amount_paid AND status IN ('Pending','Partial','Overdue')", [familyId]) || 0;
}

export const subscriptions = {
  ensureCurrentMonth: () => ensureCurrentMonth(),
  memberBalance: (familyId: number, _memberId?: number) => memberSubscriptionBalance(familyId),
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
        `SELECT COUNT(*) AS c FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id WHERE ${where.join(" AND ")}`,
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
        (donor_name, donor_phone, donor_address, family_id, member_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.donorName, data.donorPhone ?? "", data.donorAddress ?? "",
        data.familyId ?? null, data.memberId ?? null, data.categoryId, data.amount,
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
      `UPDATE donations SET donor_name = ?, donor_phone = ?, donor_address = ?, family_id = ?, member_id = ?, category_id = ?, amount = ?, donation_date = ?, purpose = ?, payment_method = ?, transaction_ref = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.donorName, data.donorPhone, data.donorAddress,
        data.familyId, data.memberId ?? null, data.categoryId, data.amount,
        data.donationDate, data.purpose, data.paymentMethod,
        data.transactionRef, data.remarks, id
      ]
    ),
  remove: (id: number) => run("DELETE FROM donations WHERE id = ?", [id]),
  categories: () => all<any>("SELECT * FROM donation_categories WHERE is_active = 1 ORDER BY name"),
  categoriesAll: () => all<any>("SELECT dc.*, (SELECT COUNT(*) FROM donations d WHERE d.category_id = dc.id) AS donation_count FROM donation_categories dc ORDER BY dc.is_active DESC, dc.name"),
  createCategory: (name: string, description = "") => {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Category name is required");
    const { id } = run("INSERT INTO donation_categories (name, description, is_active) VALUES (?, ?, 1)", [clean, description]);
    return { id };
  },
  updateCategory: (id: number, name: string, description = "") => {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Category name is required");
    return run("UPDATE donation_categories SET name = ?, description = ? WHERE id = ?", [clean, description, id]);
  },
  setCategoryActive: (id: number, active: boolean) => run("UPDATE donation_categories SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]),
  removeCategory: (id: number) => {
    const used = scalar<number>("SELECT COUNT(*) FROM donations WHERE category_id = ?", [id]) || 0;
    if (used > 0) throw new Error("This category cannot be deleted because donations already exist in it. Deactivate it instead.");
    return run("DELETE FROM donation_categories WHERE id = ?", [id]);
  },
  memberBalance: (familyId: number, memberId?: number) => subscriptions.memberBalance(familyId, memberId),
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
        (marriage_number, bride_name, bride_father, bride_address, groom_name, groom_father, groom_address, witness1, witness2, witness3, witness4, mahar, nikah_date, registration_date, place, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.brideName, data.brideFather ?? "", data.brideAddress ?? "",
        data.groomName, data.groomFather ?? "", data.groomAddress ?? "",
        data.witness1 ?? "", data.witness2 ?? "", data.witness3 ?? "", data.witness4 ?? "",
        data.mahar ?? "", data.nikahDate, data.registrationDate || nowDate(),
        data.place ?? "", data.remarks ?? ""
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
        (death_number, deceased_name, father_name, gender, date_of_death, burial_date, cause_of_death, burial_place, family_id, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.deceasedName, data.fatherName ?? "",
        data.gender ?? "Male", data.dateOfDeath,
        data.burialDate, data.causeOfDeath ?? "", data.burialPlace ?? "",
        data.familyId ?? null, data.remarks ?? ""
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
  categories: () => ["Medical Aid", "Education Aid", "Marriage Assistance", "Financial Assistance"],
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
  issueMarriageNoc: (marriageNum: string, userId: number) => {
    const marriage = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNum]);
    if (!marriage) throw new Error("Marriage record not found");
    const certificateNumber = scalar<string>("SELECT 'NOC-' || printf('%04d', COALESCE(MAX(id),0)+1) FROM certificates");
    const issuedTo = [marriage.bride_name, marriage.groom_name].filter(Boolean).join(" & ");
    const result = run(
      `INSERT INTO certificates (certificate_number, type, marriage_id, issued_to, issued_date, issued_by, notes)
       VALUES (?, 'NOC', ?, ?, date('now'), ?, ?)`,
      [certificateNumber, marriage.id, issuedTo, userId, `No Objection Certificate for marriage ${marriage.marriage_number}`]
    );
    return { id: result.id, certificate_number: certificateNumber };
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
  list: () => all<any>(`SELECT id, username, full_name, role, is_active, must_change_pwd, last_login_at AS last_login, created_at FROM users ORDER BY username`),
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
        data.role || "Staff", data.mustChangePwd ? 1 : 1
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
        financial_year_start = ?, currency_symbol = ?, subscription_monthly_amount = ?, theme = ?, language = ?,
        auto_backup = ?, backup_interval_hours = ?, receipt_prefix = ?,
        updated_at = datetime('now')
       WHERE id = 1`,
      [
        data.mahalluName ?? "", data.address ?? "", data.phone ?? "", data.email ?? "",
        data.financialYearStart ?? "", data.currencySymbol ?? "₹", Number(data.subscriptionMonthlyAmount ?? 0),
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
  balance: () => scalar<number>("SELECT (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Income') - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Expense') AS v"),
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

// ================= TOKENS =================

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateTokenCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return code;
}

function generateUniqueTokenCode(existing: Set<string>): string {
  let code = generateTokenCode();
  let attempts = 0;
  while (existing.has(code) && attempts < 1000) {
    code = generateTokenCode();
    attempts++;
  }
  return code;
}

export const tokens = {
  // ===== Events =====
  listEvents: () => all<any>("SELECT * FROM token_events ORDER BY event_date DESC, id DESC"),
  getEvent: (id: number) => one<any>("SELECT * FROM token_events WHERE id = ?", [id]),
  createEvent: (data: any) => {
    const { id } = run(
      `INSERT INTO token_events (event_name, event_type, event_date, event_time, venue, description, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [data.eventName, data.eventType || "general", data.eventDate, data.eventTime || "", data.venue || "", data.description || ""]
    );
    return { id };
  },
  updateEvent: (id: number, data: any) =>
    run(
      `UPDATE token_events SET event_name = ?, event_type = ?, event_date = ?, event_time = ?, venue = ?, description = ? WHERE id = ?`,
      [data.eventName, data.eventType || "general", data.eventDate, data.eventTime || "", data.venue || "", data.description || "", id]
    ),

  // ===== Token listing =====
  list: (filter: { eventId?: number; search?: string; status?: string } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.eventId) {
      where.push("ta.event_id = ?");
      params.push(filter.eventId);
    }
    if (filter.status && filter.status !== "All") {
      where.push("ta.status = ?");
      params.push(filter.status);
    }
    if (filter.search) {
      where.push("(ta.token_code LIKE ? OR f.house_name LIKE ? OR f.family_number LIKE ? OR f.ward LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t);
    }
    const sql = `SELECT ta.*, f.family_number, f.house_name, f.ward, f.phone,
      te.event_name, te.event_date, te.venue
      FROM token_assignments ta
      LEFT JOIN families f ON f.id = ta.family_id
      LEFT JOIN token_events te ON te.id = ta.event_id
      WHERE ${where.join(" AND ")}
      ORDER BY ta.id DESC`;
    return { rows: all<any>(sql, params), total: 0 };
  },

  // ===== Duplicate check: which families already have tokens for this event =====
  checkExisting: (eventId: number) => {
    const rows = all<any>(
      "SELECT family_id FROM token_assignments WHERE event_id = ? AND status != 'CANCELLED'",
      [eventId]
    );
    return new Set(rows.map((r: any) => r.family_id));
  },

  // ===== Generate tokens for selected families =====
  generate: (eventId: number, familyIds: number[], userId: number) => {
    // Get existing codes for this event (and globally to avoid collision)
    const existingCodes = new Set(
      all<any>("SELECT token_code FROM token_assignments").map((r: any) => r.token_code)
    );
    const existingFamilyTokens = tokens.checkExisting(eventId);

    let generated = 0;
    let skipped = 0;
    const insertStmt = getDB().prepare(
      `INSERT INTO token_assignments (event_id, family_id, token_code, status)
       VALUES (?, ?, ?, 'GENERATED')`
    );

    const insertMany = getDB().transaction(() => {
      for (const familyId of familyIds) {
        if (existingFamilyTokens.has(familyId)) {
          skipped++;
          continue;
        }
        const code = generateUniqueTokenCode(existingCodes);
        existingCodes.add(code);
        insertStmt.run(eventId, familyId, code);
        generated++;
      }
    });
    insertMany();

    return { generated, skipped, total: familyIds.length };
  },

  // ===== Collect / mark as collected =====
  collect: (tokenId: number, userId: number) =>
    run(
      `UPDATE token_assignments SET status = 'COLLECTED', collected = 1, collected_at = datetime('now'), collected_by = ? WHERE id = ? AND status != 'CANCELLED'`,
      [userId, tokenId]
    ),

  // ===== Cancel token (for lost tokens) =====
  cancel: (tokenId: number, reason: string) =>
    run(
      `UPDATE token_assignments SET status = 'CANCELLED', cancelled_at = datetime('now'), cancelled_reason = ? WHERE id = ?`,
      [reason, tokenId]
    ),

  // ===== Replace token (generate new code for cancelled token) =====
  replace: (tokenId: number, reason: string, userId: number) => {
    const oldToken = one<any>("SELECT * FROM token_assignments WHERE id = ?", [tokenId]);
    if (!oldToken) throw new Error("Token not found");

    // Cancel old token
    run(
      `UPDATE token_assignments SET status = 'CANCELLED', cancelled_at = datetime('now'), cancelled_reason = ? WHERE id = ?`,
      [reason, tokenId]
    );

    // Generate new token for same event+family
    const existingCodes = new Set(
      all<any>("SELECT token_code FROM token_assignments").map((r: any) => r.token_code)
    );
    const newCode = generateUniqueTokenCode(existingCodes);
    const { id } = run(
      `INSERT INTO token_assignments (event_id, family_id, token_code, status, replacement_for)
       VALUES (?, ?, ?, 'GENERATED', ?)`,
      [oldToken.event_id, oldToken.family_id, newCode, tokenId]
    );
    return { id, tokenCode: newCode };
  },

  // ===== Stats for dashboard =====
  stats: (eventId: number) => {
    const total = scalar<number>("SELECT COUNT(*) AS v FROM token_assignments WHERE event_id = ? AND status != 'CANCELLED'", [eventId]);
    const collected = scalar<number>("SELECT COUNT(*) AS v FROM token_assignments WHERE event_id = ? AND status = 'COLLECTED'", [eventId]);
    const remaining = total - collected;
    const rate = total > 0 ? Math.round((collected / total) * 1000) / 10 : 0;
    return { total, collected, remaining, rate };
  },

  // ===== Get all tokens for an event (for PDF) =====
  listForPdf: (eventId: number) => all<any>(
    `SELECT ta.token_code, ta.status, ta.collected_at, ta.created_at,
       f.family_number, f.house_name, f.ward, f.house_number, f.phone,
       (SELECT m.name FROM members m WHERE m.family_id = f.id AND m.is_head = 1 AND m.status = 'Active' ORDER BY m.id LIMIT 1) AS house_head_name,
       te.event_name, te.event_date, te.venue, te.event_time
     FROM token_assignments ta
     LEFT JOIN families f ON f.id = ta.family_id
     LEFT JOIN token_events te ON te.id = ta.event_id
     WHERE ta.event_id = ? AND ta.status != 'CANCELLED'
     ORDER BY f.ward, f.family_number`,
    [eventId]
  ),
};

