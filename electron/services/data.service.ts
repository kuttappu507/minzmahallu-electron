/*
 * DataService — exposes all 16 modules' CRUD + summary operations
 * to the Electron renderer via IPC.
 */
import { all, one, run, scalar, getDB } from "../db/connection.js";
import { randomInt } from "node:crypto";
import { hashPasswordForStorage } from "./auth.service.js";

// ================= HELPERS =================

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
    const isHead = data.relationship === "Head" ? 1 : 0;
    const { id } = run(
      `INSERT INTO members
        (member_code, family_id, name, arabic_name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, emergency_contact, relationship, is_head, status, nationality, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.familyId, data.name ?? "", data.arabicName ?? "",
        data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null,
        data.bloodGroup ?? "", data.occupation ?? "", data.education ?? "",
        data.maritalStatus ?? "Single", data.mobile ?? "",
        data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", isHead,
        data.status ?? "Active",
        data.nationality ?? "Indian", data.address ?? ""
      ]
    );
    return { id, memberCode: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE members SET family_id = ?, name = ?, arabic_name = ?, gender = ?, date_of_birth = ?, age = ?, blood_group = ?, occupation = ?, education = ?, marital_status = ?, mobile = ?, email = ?, emergency_contact = ?, relationship = ?, is_head = ?, status = ?, nationality = ?, address = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.familyId, data.name ?? "", data.arabicName ?? "",
        data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null, data.bloodGroup ?? "",
        data.occupation ?? "", data.education ?? "", data.maritalStatus ?? "Single",
        data.mobile ?? "", data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", data.relationship === "Head" ? 1 : 0,
        data.status ?? "Active", data.nationality ?? "Indian",
        data.address ?? "", id
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

  // ===== Unified ledger — combines manual transactions with auto-entries from
  // donations, subscriptions, welfare disbursements, and staff salary payments.
  // Each row carries a `source` field so the renderer can badge it.
  //
  // Period presets (server-side computed):
  //   all | this_month | last_month | this_quarter | last_quarter | this_year | last_year | custom
  // When period === 'custom', the caller must pass `from` and `to` (YYYY-MM-DD).
  // =================================================================
  _resolvePeriodRange: (period: string, from?: string, to?: string): { from: string; to: string } | null => {
    if (period === "all") return null;
    if (period === "custom") {
      if (!from || !to) return null;
      return { from, to };
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-11
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (period === "this_month") {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return { from: iso(first), to: iso(last) };
    }
    if (period === "last_month") {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: iso(first), to: iso(last) };
    }
    if (period === "this_quarter") {
      const qStartMonth = Math.floor(m / 3) * 3;
      const first = new Date(y, qStartMonth, 1);
      const last = new Date(y, qStartMonth + 3, 0);
      return { from: iso(first), to: iso(last) };
    }
    if (period === "last_quarter") {
      const qStartMonth = Math.floor(m / 3) * 3 - 3;
      const cy = qStartMonth < 0 ? y - 1 : y;
      const cm = qStartMonth < 0 ? qStartMonth + 12 : qStartMonth;
      const first = new Date(cy, cm, 1);
      const last = new Date(cy, cm + 3, 0);
      return { from: iso(first), to: iso(last) };
    }
    if (period === "this_year") {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    if (period === "last_year") {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    }
    return null;
  },

  unifiedList: (filter: { period?: string; from?: string; to?: string; source?: string; type?: string; search?: string; page?: number; pageSize?: number } = {}) => {
    const range = (accounting as any)._resolvePeriodRange(filter.period || "all", filter.from, filter.to) as { from: string; to: string } | null;
    // Each sub-query projects a uniform row shape: ledger_date, type, amount, source, source_id, description, payment_method, transaction_ref, receipt_number.
    // We use UNION ALL and a synthetic row_number for stable ordering across sources.
    const parts: string[] = [];
    const params: any[] = [];

    // 1. Manual transactions
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("t.txn_date >= ?"); w.push("t.txn_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All") { w.push("t.type = ?"); params.push(filter.type); }
      if (filter.search) { w.push("(t.description LIKE ? OR t.receipt_number LIKE ? OR t.transaction_ref LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t, t); }
      parts.push(`SELECT t.id AS source_id, 'transactions' AS source, t.txn_date AS ledger_date, t.type, t.amount, t.description, t.payment_method, t.transaction_ref, t.receipt_number, t.account_id, t.linked_module, t.linked_id FROM transactions t WHERE ${w.join(" AND ")}`);
    }
    // 2. Donations (always Income)
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("d.donation_date >= ?"); w.push("d.donation_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Income") { w.push("1=0"); } // donations are income only
      if (filter.search) { w.push("(d.donor_name LIKE ? OR d.receipt_number LIKE ? OR d.purpose LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t, t); }
      parts.push(`SELECT d.id AS source_id, 'donations' AS source, d.donation_date AS ledger_date, 'Income' AS type, d.amount, (d.donor_name || COALESCE(' — ' || d.purpose, '')) AS description, d.payment_method, '' AS transaction_ref, d.receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id FROM donations d WHERE ${w.join(" AND ")}`);
    }
    // 3. Subscriptions where status='Paid' (Income)
    {
      const w: string[] = ["s.status = 'Paid'"];
      if (range) { w.push("s.payment_date >= ?"); w.push("s.payment_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Income") { w.push("1=0"); }
      if (filter.search) { w.push("(s.receipt_number LIKE ? OR s.remarks LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT s.id AS source_id, 'subscriptions' AS source, COALESCE(s.payment_date, s.period_start) AS ledger_date, 'Income' AS type, s.amount_paid AS amount, ('Subscription — ' || COALESCE(s.receipt_number, '')) AS description, s.payment_method, s.transaction_ref, s.receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id FROM subscriptions s WHERE ${w.join(" AND ")}`);
    }
    // 4. Welfare disbursements (Expense)
    {
      const w: string[] = ["w.status = 'Disbursed'"];
      if (range) { w.push("w.disbursed_date >= ?"); w.push("w.disbursed_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Expense") { w.push("1=0"); }
      if (filter.search) { w.push("(w.applicant_name LIKE ? OR w.request_number LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT w.id AS source_id, 'welfare' AS source, COALESCE(w.disbursed_date, w.created_at) AS ledger_date, 'Expense' AS type, w.amount_approved AS amount, ('Welfare — ' || w.applicant_name) AS description, '' AS payment_method, '' AS transaction_ref, w.request_number AS receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id FROM welfare_requests w WHERE ${w.join(" AND ")}`);
    }
    // 5. Staff salary payments (Expense, status='Paid')
    {
      const w: string[] = ["sp.status = 'Paid'"];
      if (range) { w.push("sp.payment_date >= ?"); w.push("sp.payment_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Expense") { w.push("1=0"); }
      if (filter.search) { w.push("(s.name LIKE ? OR s.staff_code LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT sp.id AS source_id, 'salary' AS source, sp.payment_date AS ledger_date, 'Expense' AS type, sp.amount, ('Salary — ' || s.name || ' (' || printf('%02d', sp.period_month) || '/' || sp.period_year || ')') AS description, sp.payment_method, sp.transaction_ref, '' AS receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id FROM staff_payments sp LEFT JOIN staff s ON s.id = sp.staff_id WHERE ${w.join(" AND ")}`);
    }

    // Combine — wrap in a sub-select so we can filter by source + paginate uniformly.
    // Note: better-sqlite3 doesn't support parameterised LIMIT inside a UNION, but
    // the inner UNION has no LIMIT and the outer SELECT does, which is fine.
    const innerSql = parts.join(" UNION ALL ");
    const outerWhere: string[] = ["1=1"];
    if (filter.source && filter.source !== "All") {
      outerWhere.push("source = ?");
      params.push(filter.source);
    }
    const sql = `SELECT * FROM (${innerSql}) AS u WHERE ${outerWhere.join(" AND ")} ORDER BY u.ledger_date DESC, u.source_id DESC`;

    let rows: any[];
    let total: number;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      rows = all<any>(`${sql} LIMIT ? OFFSET ?`, [...params, filter.pageSize, offset]);
      const countRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM (${innerSql}) AS u WHERE ${outerWhere.join(" AND ")}`, params);
      total = countRow?.c ?? 0;
    } else {
      rows = all<any>(sql, params);
      total = rows.length;
    }
    return { rows, total };
  },

  unifiedSummary: (filter: { period?: string; from?: string; to?: string } = {}) => {
    const range = (accounting as any)._resolvePeriodRange(filter.period || "all", filter.from, filter.to) as { from: string; to: string } | null;

    // Re-use the union from unifiedList but only compute aggregates. We build it
    // inline here (rather than calling unifiedList) so we don't ship all the rows
    // back to the renderer just to sum them.
    const parts: string[] = [];
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("t.txn_date >= ?"); w.push("t.txn_date <= ?"); }
      parts.push(`SELECT t.txn_date AS ledger_date, t.type, t.amount, 'transactions' AS source FROM transactions t WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("d.donation_date >= ?"); w.push("d.donation_date <= ?"); }
      parts.push(`SELECT d.donation_date AS ledger_date, 'Income' AS type, d.amount, 'donations' AS source FROM donations d WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["s.status = 'Paid'"];
      if (range) { w.push("s.payment_date >= ?"); w.push("s.payment_date <= ?"); }
      parts.push(`SELECT COALESCE(s.payment_date, s.period_start) AS ledger_date, 'Income' AS type, s.amount_paid AS amount, 'subscriptions' AS source FROM subscriptions s WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["w.status = 'Disbursed'"];
      if (range) { w.push("w.disbursed_date >= ?"); w.push("w.disbursed_date <= ?"); }
      parts.push(`SELECT COALESCE(w.disbursed_date, w.created_at) AS ledger_date, 'Expense' AS type, w.amount_approved AS amount, 'welfare' AS source FROM welfare_requests w WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["sp.status = 'Paid'"];
      if (range) { w.push("sp.payment_date >= ?"); w.push("sp.payment_date <= ?"); }
      parts.push(`SELECT sp.payment_date AS ledger_date, 'Expense' AS type, sp.amount, 'salary' AS source FROM staff_payments sp WHERE ${w.join(" AND ")}`);
    }

    const params: any[] = [];
    if (range) { params.push(range.from, range.to); params.push(range.from, range.to); params.push(range.from, range.to); params.push(range.from, range.to); params.push(range.from, range.to); }

    const union = parts.join(" UNION ALL ");
    // BUGFIX: previously the outer SELECT was `FROM (union) AS u ${dateClause}`
    // which produced `FROM (...) AS u AND ledger_date >= ?` — missing the
    // WHERE keyword. SQLite raised: "near \"AND\": syntax error" whenever a
    // period filter was active. Now we always emit `WHERE 1=1` so the optional
    // AND-clause composes cleanly even when there is no period filter.
    const whereClause = range ? "WHERE 1=1 AND ledger_date >= ? AND ledger_date <= ?" : "WHERE 1=1";
    const row = one<any>(
      `SELECT
        COALESCE(SUM(CASE WHEN type='Income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type='Expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN type='Income' AND source='donations' THEN amount ELSE 0 END), 0) AS income_donations,
        COALESCE(SUM(CASE WHEN type='Income' AND source='subscriptions' THEN amount ELSE 0 END), 0) AS income_subscriptions,
        COALESCE(SUM(CASE WHEN type='Income' AND source='transactions' THEN amount ELSE 0 END), 0) AS income_manual,
        COALESCE(SUM(CASE WHEN type='Expense' AND source='welfare' THEN amount ELSE 0 END), 0) AS expense_welfare,
        COALESCE(SUM(CASE WHEN type='Expense' AND source='salary' THEN amount ELSE 0 END), 0) AS expense_salary,
        COALESCE(SUM(CASE WHEN type='Expense' AND source='transactions' THEN amount ELSE 0 END), 0) AS expense_manual,
        COUNT(*) AS entry_count
       FROM (${union}) AS u ${whereClause}`,
      range ? [...params, range.from, range.to] : params
    );
    return {
      totalIncome: row?.total_income ?? 0,
      totalExpense: row?.total_expense ?? 0,
      balance: (row?.total_income ?? 0) - (row?.total_expense ?? 0),
      incomeDonations: row?.income_donations ?? 0,
      incomeSubscriptions: row?.income_subscriptions ?? 0,
      incomeManual: row?.income_manual ?? 0,
      expenseWelfare: row?.expense_welfare ?? 0,
      expenseSalary: row?.expense_salary ?? 0,
      expenseManual: row?.expense_manual ?? 0,
      entryCount: row?.entry_count ?? 0,
      period: filter.period || "all",
      from: range?.from ?? null,
      to: range?.to ?? null
    };
  },
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
      "SELECT 'MRG-' || strftime('%Y') || '-' || printf('%03d', COUNT(*) + 1) AS n FROM marriages WHERE strftime('%Y', nikah_date) = strftime('%Y','now')"
    );
    const { id } = run(
      `INSERT INTO marriages
        (marriage_number, bride_name, bride_father, bride_address, groom_name, groom_father, groom_address, witness1, witness2, witness3, witness4, mahar, nikah_date, registration_date, place, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.brideName ?? "", data.brideFather ?? "", data.brideAddress ?? "",
        data.groomName ?? "", data.groomFather ?? "", data.groomAddress ?? "",
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
        data.brideName ?? "", data.brideFather ?? "", data.brideAddress ?? "",
        data.groomName ?? "", data.groomFather ?? "", data.groomAddress ?? "",
        data.witness1 ?? "", data.witness2 ?? "", data.witness3 ?? "", data.witness4 ?? "",
        data.mahar ?? "", data.nikahDate ?? "", data.registrationDate ?? nowDate(),
        data.place ?? "", data.remarks ?? "", id
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
      "SELECT 'DTH-' || strftime('%Y') || '-' || printf('%03d', COUNT(*) + 1) AS n FROM deaths WHERE strftime('%Y', date_of_death) = strftime('%Y','now')"
    );
    const { id } = run(
      `INSERT INTO deaths
        (death_number, deceased_name, father_name, gender, date_of_death, burial_date, cause_of_death, burial_place, family_id, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.deceasedName ?? "", data.fatherName ?? "",
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
        data.deceasedName ?? "", data.fatherName ?? "", data.gender ?? "Male",
        data.dateOfDeath ?? "", data.burialDate ?? "", data.causeOfDeath ?? "",
        data.burialPlace ?? "", data.familyId ?? null, data.remarks ?? "", id
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
    const certNum = `MMS-${new Date().getFullYear()}-${String(scalar<number>("SELECT COALESCE(MAX(id),0)+1 FROM certificates WHERE type='Membership' AND strftime('%Y', issued_date)=strftime('%Y','now')")).padStart(6, "0")}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [certNum, "Membership", m.id, m.family_id, m.name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  issueResidence: (familyNumber: string, issuedTo: string, userId: number) => {
    const f = one<any>("SELECT * FROM families WHERE family_number = ?", [familyNumber]);
    if (!f) throw new Error("Family not found");
    const certNum = `RES-${new Date().getFullYear()}-${String(scalar<number>("SELECT COALESCE(MAX(id),0)+1 FROM certificates WHERE type='Residence' AND strftime('%Y', issued_date)=strftime('%Y','now')")).padStart(6, "0")}`;
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
      [certNum, "Residence", f.id, issuedTo || f.house_name, nowDate(), userId, "Issued"]
    );
    return { id, certificateNumber: certNum };
  },
  issueMarriage: (marriageNumber: string, userId: number) => {
    const m = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNumber]);
    if (!m) throw new Error("Marriage record not found");
    const certNum = `MAR-${new Date().getFullYear()}-${String(scalar<number>("SELECT COALESCE(MAX(id),0)+1 FROM certificates WHERE type='Marriage' AND strftime('%Y', issued_date)=strftime('%Y','now')")).padStart(6, "0")}`;
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
    const certNum = `DTH-${new Date().getFullYear()}-${String(scalar<number>("SELECT COALESCE(MAX(id),0)+1 FROM certificates WHERE type='Death' AND strftime('%Y', issued_date)=strftime('%Y','now')")).padStart(6, "0")}`;
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
    const { stored, salt } = hashPasswordForStorage(data.password || "Welcome@123");
    const { id } = run(
      "INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, must_change_pwd) VALUES (?, ?, ?, ?, ?, 1, ?)",
      [
        data.username, data.fullName, stored, salt,
        data.role || "Staff", data.mustChangePwd ? 1 : 1
      ]
    );
    return { id };
  },
  update: (id: number, data: any) =>
    run("UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?",
      [data.fullName, data.role, data.isActive ? 1 : 0, id]),
  toggleLock: (id: number, locked: boolean) =>
    // Fix: previously this set is_active, which is a different concept from is_locked.
    // is_locked is set by the 5-failed-attempts auto-lockout; toggling it from the
    // Users page should clear is_locked + locked_until + failed_attempts (unlock)
    // or set them (lock), without touching is_active (which is a separate
    // admin-controlled "account enabled" flag).
    run(
      "UPDATE users SET is_locked = ?, locked_until = NULL, failed_attempts = 0, updated_at = datetime('now') WHERE id = ? AND username != 'admin'",
      [locked ? 1 : 0, id]
    ),
  resetPassword: (id: number, newPassword: string) => {
    const { stored, salt } = hashPasswordForStorage(newPassword);
    return run("UPDATE users SET password_hash = ?, password_salt = ?, must_change_pwd = 1, failed_attempts = 0, is_locked = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
      [stored, salt, id]);
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
     FROM subscriptions WHERE payment_date >= date('now', ?)
     GROUP BY month ORDER BY month`,
    [`-${months} months`]
  ),
  monthlyDonations: (months: number = 6) => all<any>(
    `SELECT strftime('%Y-%m', donation_date) AS month, COALESCE(SUM(amount),0) AS amount
     FROM donations WHERE donation_date >= date('now', ?)
     GROUP BY month ORDER BY month`,
    [`-${months} months`]
  ),
  incomeVsExpense: (months: number = 6) => all<any>(
    `SELECT strftime('%Y-%m', txn_date) AS month,
       SUM(CASE WHEN type='Income' THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type='Expense' THEN amount ELSE 0 END) AS expense
     FROM transactions WHERE txn_date >= date('now', ?)
     GROUP BY month ORDER BY month`,
    [`-${months} months`]
  ),
  recentActivity: (limit: number = 10) => all<any>(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, [limit]
  ),
};

// ================= TOKENS =================

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateTokenCode(): string {
  // Use crypto.randomInt() instead of Math.random() — token codes are security-sensitive
  // (they are presented at event entry) and must be unguessable.
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
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
    // Load only token codes for this event (not globally) to keep the working set small.
    const existingCodes = new Set(
      all<any>("SELECT token_code FROM token_assignments WHERE event_id = ?", [eventId]).map((r: any) => r.token_code)
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
    const db = getDB();
    return db.transaction(() => {
      const oldToken = one<any>("SELECT * FROM token_assignments WHERE id = ?", [tokenId]);
      if (!oldToken) throw new Error("Token not found");

      // Cancel old token
      db.prepare(
        `UPDATE token_assignments SET status = 'CANCELLED', cancelled_at = datetime('now'), cancelled_reason = ? WHERE id = ?`
      ).run(reason, tokenId);

      // Generate new token for same event+family.
      // Scope the duplicate-code check to this event so we don't load the entire table.
      const existingCodes = new Set(
        all<any>("SELECT token_code FROM token_assignments WHERE event_id = ?", [oldToken.event_id]).map((r: any) => r.token_code)
      );
      const newCode = generateUniqueTokenCode(existingCodes);
      const result = db.prepare(
        `INSERT INTO token_assignments (event_id, family_id, token_code, status, replacement_for)
         VALUES (?, ?, ?, 'GENERATED', ?)`
      ).run(oldToken.event_id, oldToken.family_id, newCode, tokenId);
      return { id: Number(result.lastInsertRowid), tokenCode: newCode };
    })();
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
       f.family_number, f.house_name, f.ward, f.house_number, f.phone, f.area,
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

// ================= STAFF =================

export const staff = {
  list: (filter: { search?: string; role?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(s.name LIKE ? OR s.staff_code LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t);
    }
    if (filter.role && filter.role !== "All") {
      where.push("s.role = ?");
      params.push(filter.role);
    }
    if (filter.status && filter.status !== "All") {
      // "Active" / "Inactive" / "Resigned" / "Archived"
      if (filter.status === "Archived") {
        where.push("s.archive_state = 1");
      } else {
        where.push("s.archive_state = 0 AND s.status = ?");
        params.push(filter.status);
      }
    } else {
      // By default, exclude archived rows unless explicitly requested.
      where.push("s.archive_state = 0");
    }
    const sql = `SELECT s.*, m.member_code AS linked_member_code, m.name AS linked_member_name, m.mobile AS linked_member_mobile
      FROM staff s LEFT JOIN members m ON m.id = s.member_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.staff_code ASC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM staff s WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT s.*, m.member_code AS linked_member_code, m.name AS linked_member_name FROM staff s LEFT JOIN members m ON m.id = s.member_id WHERE s.id = ?", [id]),
  roles: () => ["Imam", "Khatheeb", "Muazzin", "Khadim", "Secretary", "Treasurer", "President", "Vice President", "Committee Member", "Madrasa Teacher", "Accountant", "Cleaner", "Security", "Other"],
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'STF-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM staff"
    );
    const { id } = run(
      `INSERT INTO staff
        (staff_code, member_id, name, role, phone, email, address, joined_date, salary, payment_frequency, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num,
        data.memberId ?? null,
        data.name ?? "",
        data.role ?? "Staff",
        data.phone ?? "",
        data.email ?? "",
        data.address ?? "",
        data.joinedDate ?? null,
        Number(data.salary ?? 0),
        data.paymentFrequency ?? "Monthly",
        data.status ?? "Active",
        data.notes ?? ""
      ]
    );
    return { id, staffCode: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE staff SET member_id = ?, name = ?, role = ?, phone = ?, email = ?, address = ?, joined_date = ?, salary = ?, payment_frequency = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.memberId ?? null,
        data.name ?? "",
        data.role ?? "Staff",
        data.phone ?? "",
        data.email ?? "",
        data.address ?? "",
        data.joinedDate ?? null,
        Number(data.salary ?? 0),
        data.paymentFrequency ?? "Monthly",
        data.status ?? "Active",
        data.notes ?? "",
        id
      ]
    ),
  archive: (id: number, reason: string, userId: number) =>
    run(
      `UPDATE staff SET archive_state = 1, archive_source = 'manual', archived_at = datetime('now'), archived_by = ?, archive_reason = ?, status = 'Resigned', updated_at = datetime('now') WHERE id = ?`,
      [userId, reason, id]
    ),
  restore: (id: number, userId: number) =>
    run(
      `UPDATE staff SET archive_state = 0, archive_source = NULL, archived_at = NULL, archived_by = ?, archive_reason = NULL, status = 'Active', updated_at = datetime('now') WHERE id = ?`,
      [userId, id]
    ),
  // ===== Salary payments =====
  listPayments: (filter: { staffId?: number; year?: number; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.staffId) {
      where.push("sp.staff_id = ?");
      params.push(filter.staffId);
    }
    if (filter.year) {
      where.push("sp.period_year = ?");
      params.push(filter.year);
    }
    const sql = `SELECT sp.*, s.staff_code, s.name AS staff_name, s.role AS staff_role
      FROM staff_payments sp LEFT JOIN staff s ON s.id = sp.staff_id
      WHERE ${where.join(" AND ")}
      ORDER BY sp.period_year DESC, sp.period_month DESC, sp.id DESC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM staff_payments sp WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  paySalary: (data: any, userId: number) => {
    const { id } = run(
      `INSERT INTO staff_payments (staff_id, period_month, period_year, amount, payment_date, payment_method, transaction_ref, status, notes, paid_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.staffId,
        Number(data.periodMonth),
        Number(data.periodYear),
        Number(data.amount ?? 0),
        data.paymentDate || nowDate(),
        data.paymentMethod || "Cash",
        data.transactionRef || "",
        data.status || "Paid",
        data.notes || "",
        userId
      ]
    );
    return { id };
  },
  cancelPayment: (id: number) =>
    run(`UPDATE staff_payments SET status = 'Cancelled' WHERE id = ?`, [id]),
  salarySummary: (year: number = new Date().getFullYear()) => {
    const row = one<any>(
      `SELECT
        COALESCE(SUM(CASE WHEN status='Paid' THEN amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END), 0) AS total_pending,
        COUNT(CASE WHEN status='Paid' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN status='Pending' THEN 1 END) AS pending_count
       FROM staff_payments WHERE period_year = ?`,
      [year]
    );
    const activeCount = scalar<number>("SELECT COUNT(*) AS v FROM staff WHERE archive_state = 0 AND status = 'Active'", []);
    return {
      totalPaid: row?.total_paid ?? 0,
      totalPending: row?.total_pending ?? 0,
      paidCount: row?.paid_count ?? 0,
      pendingCount: row?.pending_count ?? 0,
      activeStaffCount: activeCount,
      year
    };
  },
  history: (staffId: number, limit = 100) =>
    all<any>(
      `SELECT * FROM record_history WHERE entity_type = ? AND entity_id = ? ORDER BY changed_at DESC, id DESC LIMIT ?`,
      ["staff", staffId, limit]
    ),
};

// ================= COMMITTEE =================
// Elected/nominated committee members with term tracking. Distinct from Staff
// (which are paid employees). Positions: President, VP, Secretary, Joint Secretary,
// Treasurer, Auditor, Committee Member, Advisory Member, etc.
export const committee = {
  list: (filter: { search?: string; position?: string; committeeType?: string; status?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(c.name LIKE ? OR c.committee_code LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t);
    }
    if (filter.position && filter.position !== "All") {
      where.push("c.position = ?");
      params.push(filter.position);
    }
    if (filter.committeeType && filter.committeeType !== "All") {
      where.push("c.committee_type = ?");
      params.push(filter.committeeType);
    }
    if (filter.status && filter.status !== "All") {
      if (filter.status === "Archived") {
        where.push("c.archive_state = 1");
      } else {
        where.push("c.archive_state = 0 AND c.status = ?");
        params.push(filter.status);
      }
    } else {
      // Default: exclude archived.
      where.push("c.archive_state = 0");
    }
    const sql = `SELECT c.*, m.member_code AS linked_member_code, m.name AS linked_member_name, m.mobile AS linked_member_mobile
      FROM committee_members c LEFT JOIN members m ON m.id = c.member_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.committee_code ASC`;
    if (filter.page && filter.pageSize) {
      const offset = (filter.page - 1) * filter.pageSize;
      const pageSql = `${sql} LIMIT ? OFFSET ?`;
      const rows = all<any>(pageSql, [...params, filter.pageSize, offset]);
      const totalRow = one<{ c: number }>(`SELECT COUNT(*) AS c FROM committee_members c WHERE ${where.join(" AND ")}`, params);
      return { rows, total: totalRow?.c ?? 0 };
    }
    return { rows: all<any>(sql, params), total: 0 };
  },
  get: (id: number) => one<any>("SELECT c.*, m.member_code AS linked_member_code, m.name AS linked_member_name FROM committee_members c LEFT JOIN members m ON m.id = c.member_id WHERE c.id = ?", [id]),
  positions: () => ["President", "Vice President", "Secretary", "Joint Secretary", "Treasurer", "Auditor", "Committee Member", "Advisory Member", "Trustee", "Other"],
  types: () => ["Executive", "Advisory", "Working", "Sub-Committee", "Trust"],
  create: (data: any) => {
    const num = scalar<string>(
      "SELECT 'COM-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM committee_members"
    );
    const { id } = run(
      `INSERT INTO committee_members
        (committee_code, member_id, name, position, committee_type, phone, email, address, term_start, term_end, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num,
        data.memberId ?? null,
        data.name ?? "",
        data.position ?? "Committee Member",
        data.committeeType ?? "Executive",
        data.phone ?? "",
        data.email ?? "",
        data.address ?? "",
        data.termStart ?? null,
        data.termEnd ?? null,
        data.status ?? "Active",
        data.notes ?? ""
      ]
    );
    return { id, committeeCode: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE committee_members SET member_id = ?, name = ?, position = ?, committee_type = ?, phone = ?, email = ?, address = ?, term_start = ?, term_end = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.memberId ?? null,
        data.name ?? "",
        data.position ?? "Committee Member",
        data.committeeType ?? "Executive",
        data.phone ?? "",
        data.email ?? "",
        data.address ?? "",
        data.termStart ?? null,
        data.termEnd ?? null,
        data.status ?? "Active",
        data.notes ?? "",
        id
      ]
    ),
  archive: (id: number, reason: string, userId: number) =>
    run(
      `UPDATE committee_members SET archive_state = 1, archive_source = 'manual', archived_at = datetime('now'), archived_by = ?, archive_reason = ?, status = 'Past', updated_at = datetime('now') WHERE id = ?`,
      [userId, reason, id]
    ),
  restore: (id: number, userId: number) =>
    run(
      `UPDATE committee_members SET archive_state = 0, archive_source = NULL, archived_at = NULL, archived_by = ?, archive_reason = NULL, status = 'Active', updated_at = datetime('now') WHERE id = ?`,
      [userId, id]
    ),
  summary: () => {
    const activeCount = scalar<number>("SELECT COUNT(*) AS v FROM committee_members WHERE archive_state = 0 AND status = 'Active'", []);
    // Terms ending within 30 days (term_end between today and today+30 days).
    const endingSoon = scalar<number>(
      `SELECT COUNT(*) AS v FROM committee_members
       WHERE archive_state = 0 AND status = 'Active' AND term_end IS NOT NULL
         AND term_end >= date('now') AND term_end <= date('now', '+30 days')`,
      []
    );
    const totalCount = scalar<number>("SELECT COUNT(*) AS v FROM committee_members", []);
    return { activeCount, endingSoon, totalCount };
  },
  history: (committeeId: number, limit = 100) =>
    all<any>(
      `SELECT * FROM record_history WHERE entity_type = ? AND entity_id = ? ORDER BY changed_at DESC, id DESC LIMIT ?`,
      ["committee", committeeId, limit]
    ),
};

