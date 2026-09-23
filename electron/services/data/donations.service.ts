/* Donations module — split out of data.service.ts (public API unchanged via the facade). */

import { all, one, run, scalar } from "../../db/connection.js";
import { nextReceiptNumber } from "../doc-number.service.js";
import { istMonth } from "../ist-date.js";
import { nowDate } from "./shared.js";
import { subscriptions } from "./subscriptions.service.js";

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
    // Auto-numbered in the mahallu's PREFIX/YYYY/MM/NNN series unless the
    // user typed their own number (book migration / manual override).
    const receipt = data.receiptNumber || nextReceiptNumber(data.donationDate || nowDate(), "donation");
    // Role-based approval workflow: Member/Staff entries stay PENDING (not
    // counted anywhere) until the secretary/admin approves them. The IPC
    // layer injects approvalStatus; default 'approved' keeps every other
    // caller (imports, fixtures) behaving exactly as before.
    const approvalStatus = data.approvalStatus === "pending" ? "pending" : "approved";
    const { id } = run(
      `INSERT INTO donations
        (donor_name, donor_phone, donor_address, family_id, member_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.donorName, data.donorPhone ?? "", data.donorAddress ?? "",
        data.familyId ?? null, data.memberId ?? null, data.categoryId, data.amount,
        data.donationDate || nowDate(), receipt,
        data.purpose ?? "", data.paymentMethod ?? "Cash",
        data.transactionRef ?? "", data.receivedBy ?? 1,
        data.remarks ?? "", approvalStatus
      ]
    );
    return { id, receiptNumber: receipt, approvalStatus };
  },
  update: (id: number, data: any) => {
    // Receipt freeze (user request): the moment a receipt PDF exists for this
    // donation (printed, saved, or sent on WhatsApp), the amount is FROZEN —
    // the copy the donor already holds must keep matching the register.
    // Contact details / remarks / purpose stay editable; they never print on
    // the receipt's amount line. A wrong amount needs the donation cancelled
    // and a fresh one recorded. Fresh databases may not carry the receipt
    // columns yet — nothing can have been generated there, so the edit
    // proceeds unguarded (the try/catch below).
    let receiptFrozen = false;
    let prevAmount: number | null = null;
    try {
      const prev = one<any>("SELECT amount, receipt_generated_at FROM donations WHERE id = ?", [id]);
      if (prev?.receipt_generated_at) {
        receiptFrozen = true;
        prevAmount = Number(prev.amount);
      }
    } catch { /* no receipt columns yet -> no receipt can exist */ }
    if (receiptFrozen && Number(data.amount) !== prevAmount) {
      throw new Error(
        "A receipt has already been generated for this donation (printed or sent on WhatsApp), so its amount can no longer be edited. Cancel this donation and record a new one if the amount is wrong."
      );
    }
    return run(
      `UPDATE donations SET donor_name = ?, donor_phone = ?, donor_address = ?, family_id = ?, member_id = ?, category_id = ?, amount = ?, donation_date = ?, purpose = ?, payment_method = ?, transaction_ref = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.donorName, data.donorPhone, data.donorAddress,
        data.familyId, data.memberId ?? null, data.categoryId, data.amount,
        data.donationDate, data.purpose, data.paymentMethod,
        data.transactionRef, data.remarks, id
      ]
    );
  },
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
  totalThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM donations WHERE strftime('%Y-%m', donation_date) = ? AND (approval_status IS NULL OR approval_status = 'approved')", [istMonth()]),
};
