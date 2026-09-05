/*
 * DataService — exposes all 16 modules' CRUD + summary operations
 * to the Electron renderer via IPC.
 */
import { all, one, run, scalar, getDB } from "../db/connection.js";
import { randomInt } from "node:crypto";
import { hashPasswordForStorage } from "./auth.service.js";
import { computeEntryHash, verifyAuditChain } from "./audit-chain.js";
import { makeVerificationCode } from "./codes.js";
import { parseQrPayload, QR_KIND_CERT, QR_KIND_RECEIPT, verifyQrSignature, isSignedPayload, extractScannedQrText } from "./qr-code.js";
import { getQrPrintContext, certificateQrVerifyMessage, receiptQrVerifyMessage } from "./qr-signing.js";
import { nextReceiptNumber, nextCertificateNumber } from "./doc-number.service.js";

// ================= HELPERS =================

// All MMS calendar dates are INDIAN time (Asia/Kolkata) — see ist-date.ts.
// Imported for local use AND re-exported so existing importers keep working.
import { todayIST, istMonth, istPlusDays, istDateStr } from "./ist-date.js";
export { todayIST, istMonth, istPlusDays, istDateStr };

function nowDate(): string {
  return todayIST();
}

/** Money-safe 2-decimal rounding — paise dust never accumulates on the
 *  arrears/advance ledger through repeated re-records. */
function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** One account's TRUE dues: old arrears + the uncovered part of this month
 *  − any advance credit, clamped at 0 (a prepaid family is never “negative
 *  pending”). Shared by the donations prefill, member pages and totals. */
function familyDue(db: ReturnType<typeof getDB>, familyId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(0, MAX(0, amount - amount_paid) + COALESCE(arrears, 0) - COALESCE(advance, 0))), 0) AS v
       FROM subscriptions WHERE family_id = ? AND status IN ('Pending','Partial','Overdue')`
    )
    .get(familyId) as { v: number } | undefined;
  return round2(Number(row?.v || 0));
}

/**
 * Next register number for official registers (marriages / deaths / welfare).
 *
 * The old scheme was `'PREFIX-' || year || printf('%03d', COUNT(*)+1)` scoped
 * to rows dated in the current year. That breaks in two ways:
 *   1. A record dated outside the current year (e.g. a late-registered 2025
 *      marriage) is invisible to the COUNT, so the NEXT registration reuses /
 *      lags behind a number — the register then shows e.g. numbers up to 009
 *      while the count and the dashboard card correctly say 10 records.
 *   2. Deleting the highest record (deaths) makes the same number reusable.
 * This helper instead takes the MAX trailing number across ALL rows of the
 * table (any prefix format) and adds 1, guaranteeing a strictly increasing,
 * collision-free series. A final existence loop guards mixed-format data.
 */
function nextRegisterNumber(
  table: string,
  column: string,
  prefix: string,
  opts: { pad?: number; withYear?: boolean } = {}
): string {
  const { pad = 3, withYear = true } = opts;
  const year = new Date().getFullYear();
  const rows = all<{ n: string }>(`SELECT ${column} AS n FROM ${table}`);
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(String(r.n ?? ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const build = (s: number) =>
    withYear ? `${prefix}-${year}-${String(s).padStart(pad, "0")}` : `${prefix}-${String(s).padStart(pad, "0")}`;
  let seq = max + 1;
  // Existence guard: with legacy mixed prefixes (MRG-001, MRG-DEMO-001, …)
  // the suffix max is still correct, but bump until truly unique.
  while (one(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [build(seq)])) {
    seq++;
  }
  return build(seq);
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
        (family_number, house_name, house_number, ward, area, address, pincode, phone, alternative_phone, status, notes, whatsapp_phone, whatsapp_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", data.whatsappPhone ?? "", data.whatsappEnabled === 0 ? 0 : 1
      ]
    );
    return { id, familyNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE families SET house_name = ?, house_number = ?, ward = ?, area = ?, address = ?, pincode = ?, phone = ?, alternative_phone = ?, status = ?, notes = ?, whatsapp_phone = ?, whatsapp_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.houseName ?? "", data.houseNumber ?? "", data.ward ?? "",
        data.area ?? "", data.address ?? "", data.pincode ?? "",
        data.phone ?? "", data.altPhone ?? "", data.status ?? "Active",
        data.notes ?? "", data.whatsappPhone ?? "", data.whatsappEnabled === 0 ? 0 : 1, id
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
  // A family can only have ONE head. When a member is saved with the Head
  // relationship, verify no OTHER member of that family is already the head.
  assertSingleHead: (familyId: number | null | undefined, excludeMemberId?: number) => {
    if (!familyId) return;
    const existing = one<any>(
      `SELECT id, name FROM members
        WHERE family_id = ? AND archive_state = 0
          AND (is_head = 1 OR relationship = 'Head')
          AND id != ?
        ORDER BY CASE WHEN is_head = 1 THEN 0 ELSE 1 END, id LIMIT 1`,
      [familyId, excludeMemberId ?? -1]
    );
    if (existing) {
      throw new Error(
        `This family already has a head (${existing.name || "member #" + existing.id}). ` +
        "A family can have only one head — change the existing head's relationship first."
      );
    }
  },
  create: (data: any) => {
    // Single-head rule applies ONLY when this new member is being saved AS the
    // head. Adding a Son/Daughter/Spouse etc. to a family that already has a
    // head is perfectly normal and must NOT be blocked.
    if (data.relationship === "Head") members.assertSingleHead(data.familyId);
    const num = scalar<string>(
      "SELECT 'MBR-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM members"
    );
    const isHead = data.relationship === "Head" ? 1 : 0;
    const { id } = run(
      `INSERT INTO members
        (member_code, family_id, name, arabic_name, father_name, gender, date_of_birth, age, blood_group, occupation, education, marital_status, mobile, email, emergency_contact, relationship, is_head, status, nationality, address, father_id, mother_id, spouse_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.familyId, data.name ?? "", data.arabicName ?? "",
        data.fatherName ?? "", data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null,
        data.bloodGroup ?? "", data.occupation ?? "", data.education ?? "",
        data.maritalStatus ?? "Single", data.mobile ?? "",
        data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", isHead,
        data.status ?? "Active",
        data.nationality ?? "Indian", data.address ?? "",
        data.fatherId ?? null, data.motherId ?? null, data.spouseId ?? null
      ]
    );
    return { id, memberCode: num };
  },
  update: (id: number, data: any) => {
    if (data.relationship === "Head") members.assertSingleHead(data.familyId, id);
    return run(
      `UPDATE members SET family_id = ?, name = ?, arabic_name = ?, father_name = ?, gender = ?, date_of_birth = ?, age = ?, blood_group = ?, occupation = ?, education = ?, marital_status = ?, mobile = ?, email = ?, emergency_contact = ?, relationship = ?, is_head = ?, status = ?, nationality = ?, address = ?, father_id = ?, mother_id = ?, spouse_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.familyId, data.name ?? "", data.arabicName ?? "", data.fatherName ?? "",
        data.gender ?? "Male", data.dateOfBirth ?? "", data.age ?? null, data.bloodGroup ?? "",
        data.occupation ?? "", data.education ?? "", data.maritalStatus ?? "Single",
        data.mobile ?? "", data.email ?? "", data.emergencyContact ?? "",
        data.relationship ?? "Other", data.relationship === "Head" ? 1 : 0,
        data.status ?? "Active", data.nationality ?? "Indian",
        data.address ?? "",
        data.fatherId ?? null, data.motherId ?? null, data.spouseId ?? null,
        id
      ]
    );
  },
  remove: (id: number) => run("DELETE FROM members WHERE id = ?", [id]),
  /**
   * Family-tree relations for a member: father, mother, spouse (direct member
   * links) and children (members whose father_id or mother_id points here).
   */
  relations: (id: number) => {
    const member = one<any>("SELECT id FROM members WHERE id = ?", [id]);
    if (!member) return null;
    const pick = (ids: (number | null)[]): any[] => {
      const clean = [...new Set(ids.filter((x): x is number => !!x && Number.isFinite(x)))];
      if (!clean.length) return [];
      return all<any>(
        `SELECT id, member_code, name, gender, relationship, is_head, mobile, date_of_birth, status, archive_state
         FROM members WHERE id IN (${clean.map(() => "?").join(",")}) AND archive_state = 0`,
        clean
      );
    };
    const self = one<any>("SELECT father_id, mother_id, spouse_id FROM members WHERE id = ?", [id]);
    const links = pick([self?.father_id, self?.mother_id, self?.spouse_id]);
    const byId = (v: any) => links.find((l) => l.id === v) || null;
    const children = all<any>(
      `SELECT id, member_code, name, gender, date_of_birth, status
       FROM members
       WHERE (father_id = ? OR mother_id = ?) AND archive_state = 0 AND id != ?
       ORDER BY date_of_birth ASC, id ASC`,
      [id, id, id]
    );
    return {
      father: byId(self?.father_id),
      mother: byId(self?.mother_id),
      spouse: byId(self?.spouse_id),
      children,
    };
  },
  relationships: () => [
    "Head", "Spouse", "Son", "Daughter", "Parent",
    "Brother", "Sister", "Nephew", "Niece",
    "Grandfather", "Grandmother", "Grandson", "Granddaughter",
    "Father-in-law", "Mother-in-law", "Other",
  ],
};

// ================= SUBSCRIPTIONS =================
// RECURRING MODEL: one subscriptions row per family = the family's subscription
// account, always recorded against the family HEAD. Each month the SAME row is
// rolled over to the new period (amount = configured monthly rate, e.g. 200;
// amount_paid resets to 0) — a new month NEVER creates a new row. Actual money
// movements live in subscription_payments (one record per family per month);
// editing a payment only changes how much was given — family / period / rate
// are locked.

function currentMonthPeriod(): { periodStart: string; periodEnd: string } {
  // First and last day of the CURRENT calendar month as seen in India.
  const ymd = istDateStr(new Date()); // "yyyy-mm-dd" in IST
  const year = ymd.slice(0, 4);
  const month = ymd.slice(5, 7);
  const periodStart = `${year}-${month}-01`;
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate(); // days in this month (pure arithmetic)
  const periodEnd = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

function familyHeadMemberId(familyId: number): number | null {
  const head = one<any>(
    "SELECT id FROM members WHERE family_id = ? AND archive_state = 0 ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1",
    [familyId]
  );
  return head?.id ?? null;
}

function ensureCurrentMonth() {
  const { periodStart, periodEnd } = currentMonthPeriod();
  const configured = scalar<number>("SELECT COALESCE(subscription_monthly_amount, 0) FROM settings WHERE id = 1") || 0;
  const plan = one<any>("SELECT * FROM subscription_plans WHERE frequency = 'Monthly' AND is_active = 1 ORDER BY id LIMIT 1");
  if (!plan || configured <= 0) return { created: 0, rolledOver: 0, amount: configured, periodStart, periodEnd };
  const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");
  let created = 0;
  let rolledOver = 0;
  const db = getDB();
  const tx = db.transaction(() => {
    for (const f of families) {
      const head = familyHeadMemberId(f.id);
      const existing = one<any>(
        "SELECT id, member_id, period_start, amount, amount_paid, arrears, advance FROM subscriptions WHERE family_id = ? LIMIT 1",
        [f.id]
      );
      if (!existing) {
        db.prepare(
          `INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')`
        ).run(f.id, head, plan.id, periodStart, periodEnd, configured);
        created++;
        continue;
      }
      // Always keep the account pointed at the current head.
      if (head && head !== existing.member_id) {
        db.prepare("UPDATE subscriptions SET member_id = ?, updated_at = datetime('now') WHERE id = ?").run(head, existing.id);
      }
      if (existing.period_start === periodStart) {
        // Same month: adopt a mid-month rate change only while unpaid.
        if (Number(existing.amount_paid || 0) === 0 && Number(existing.amount) !== configured) {
          db.prepare("UPDATE subscriptions SET amount = ?, updated_at = datetime('now') WHERE id = ?").run(configured, existing.id);
        }
        continue;
      }
      // New month → roll the SAME row over (never insert a second row).
      // The closing month's unpaid balance becomes ARREARS (it accumulates
      // month after month — “3 months due” = 3 × rate); a legacy overpaid
      // amount becomes ADVANCE credit that nets against future dues.
      const closingPaid = Number(existing.amount_paid || 0);
      const closingRate = Number(existing.amount || 0);
      let carriedArrears = Number(existing.arrears || 0);
      let carriedAdvance = Number(existing.advance || 0);
      if (closingPaid < closingRate) {
        carriedArrears += closingRate - closingPaid;
        // Standing advance first nets against the fresh arrears (a family
        // that prepaid ₹50 and then missed a ₹50 month owes nothing).
        const offset = Math.min(carriedArrears, carriedAdvance);
        carriedArrears -= offset;
        carriedAdvance -= offset;
      } else if (closingPaid > closingRate) {
        carriedAdvance += closingPaid - closingRate;
      }
      // Safety net: if the closing month was paid through a path that bypassed
      // applyPayment, snapshot it into the payment ledger first.
      if (closingPaid > 0) {
        const paid = one<any>(
          "SELECT id FROM subscription_payments WHERE subscription_id = ? AND period_start = ? LIMIT 1",
          [existing.id, existing.period_start]
        );
        if (!paid) {
          const s = one<any>("SELECT * FROM subscriptions WHERE id = ?", [existing.id]) as any;
          db.prepare(
            `INSERT INTO subscription_payments (subscription_id, family_id, member_id, period_start, period_end, amount, receipt_number, payment_date, payment_method, transaction_ref, collected_by, remarks, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`
          ).run(s.id, s.family_id, s.member_id, s.period_start, s.period_end, s.amount_paid, s.receipt_number, s.payment_date || s.period_start, s.payment_method || 'Cash', s.transaction_ref || '', s.collected_by, s.remarks || '');
        }
      }
      db.prepare(
        `UPDATE subscriptions SET plan_id = ?, period_start = ?, period_end = ?, amount = ?, amount_paid = 0, payment_date = NULL, receipt_number = NULL, status = 'Pending', arrears = ?, advance = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(plan.id, periodStart, periodEnd, configured, carriedArrears, carriedAdvance, existing.id);
      rolledOver++;
    }
  });
  tx();
  return { created, rolledOver, amount: configured, periodStart, periodEnd };
}

function memberSubscriptionBalance(familyId: number) {
  if (!familyId) return 0;
  // TRUE balance = old arrears + the uncovered part of this month − advance
  // credit (the "due 150, paid 200" family shows ₹0 here — their ₹50 is a
  // PREPAYMENT, not a negative due). One row per family, summed defensively.
  return scalar<number>(
    `SELECT COALESCE(SUM(MAX(0, MAX(0, amount - amount_paid) + COALESCE(arrears,0) - COALESCE(advance,0))), 0)
     FROM subscriptions WHERE family_id = ? AND status IN ('Pending','Partial','Overdue')`,
    [familyId]
  ) || 0;
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
      (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name,
      (SELECT sp.receipt_sent_at FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS wa_sent_at,
      (SELECT sp.receipt_delivered_at FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS wa_delivered_at,
      (SELECT sp.receipt_resends FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS wa_resends,
      (SELECT sp.amount FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS month_cash,
      (SELECT sp.arrears_cleared FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS month_arrears_cleared,
      (SELECT sp.advance_added FROM subscription_payments sp WHERE sp.subscription_id = s.id AND sp.period_start = s.period_start AND sp.status = 'Active' LIMIT 1) AS month_advance_added
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
    // One subscription ACCOUNT per family — the recurring row. If the family
    // already has one, refuse and point the user at the existing row.
    const existing = one<any>("SELECT id, receipt_number FROM subscriptions WHERE family_id = ? LIMIT 1", [data.familyId]);
    if (existing) {
      throw new Error(
        "This family already has a subscription. Open the existing row to record this month's payment — a family has exactly one recurring subscription."
      );
    }
    const { periodStart, periodEnd } = currentMonthPeriod();
    const configured = scalar<number>("SELECT COALESCE(subscription_monthly_amount, 0) FROM settings WHERE id = 1") || 0;
    const firstPayment = Math.max(0, Number(data.amountPaid ?? 0));
    const { id } = run(
      `INSERT INTO subscriptions
        (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid,
         payment_date, receipt_number, payment_method, transaction_ref, status, collected_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, 'Pending', ?, ?)`,
      [
        data.familyId, data.memberId ?? familyHeadMemberId(data.familyId), data.planId ?? 1,
        data.periodStart || periodStart, data.periodEnd || periodEnd,
        data.amount ?? configured,
        data.paymentMethod ?? "Cash", data.transactionRef ?? "",
        data.collectedBy ?? 1, data.remarks ?? ""
      ]
    );
    // A first payment runs through the SAME oldest-first allocation as any
    // other payment (a fresh account has no arrears, so cash above the rate
    // becomes advance credit for coming months — never a paid-ahead month).
    if (firstPayment > 0) {
      return { ...(subscriptions as any).applyPayment(id, data), id };
    }
    return { id, receiptNumber: "" };
  },
  /** Restricted payment edit: ONLY how much was given (plus date/method/ref/
   *  remarks) may change. Family, member, period and the monthly rate are
   *  locked because the subscription is a recurring account.
   *
   *  Cash is applied OLDEST-FIRST: old arrears → this month's rate → any
   *  extra becomes ADVANCE credit for coming months. Re-recording the month
   *  rolls the previous allocation back first (each ledger row remembers how
   *  much of its cash cleared arrears / became advance), so the account is
   *  always exactly "month-start state + this month's cash". Status is Paid
   *  only when the month is covered AND no arrears remain. */
  applyPayment: (id: number, data: any) => {
    const db = getDB();
    const s = one<any>("SELECT * FROM subscriptions WHERE id = ?", [id]);
    if (!s) throw new Error("Subscription not found");
    // Guard against attempts to move the account to another family/period.
    if (data.familyId != null && Number(data.familyId) !== Number(s.family_id)) {
      throw new Error("A subscription cannot be moved to another family. Payment edits only change how much was given.");
    }
    if (data.periodStart && data.periodStart !== s.period_start) {
      throw new Error("The billing period is fixed by the recurring subscription. Payment edits only change how much was given.");
    }
    const cash = Math.max(0, Number(data.amountPaid ?? s.amount_paid ?? 0));
    const rate = Number(s.amount || 0);
    let arrears = Number(s.arrears || 0);
    let advance = Number(s.advance || 0);
    const paymentDate = data.paymentDate || nowDate();
    let txReceipt = "";
    let txStatus = "Pending";
    let txState = { monthTake: 0, arrears, advance, cash };
    const tx = db.transaction(() => {
      // One payment record per subscription per month (upsert).
      const paid = one<any>(
        "SELECT id, receipt_number, amount, arrears_cleared, advance_added FROM subscription_payments WHERE subscription_id = ? AND period_start = ? LIMIT 1",
        [s.id, s.period_start]
      );
      // Roll THIS month's previous allocation back to the month-start state
      // before applying the new cash (re-record / top-up path).
      if (paid) {
        arrears += Number(paid.arrears_cleared || 0);
        advance = Math.max(0, advance - Number(paid.advance_added || 0));
      }
      // A receipt number already issued for this month (printed / sent on
      // WhatsApp) is NEVER renumbered. A fresh month gets a fresh number in
      // the mahallu's shared receipt series (donations + subscriptions use
      // ONE counter) — the legacy behaviour of reusing the subscription row's
      // number from a previous month is a duplicate-receipt bug and is gone.
      const receipt = String(paid?.receipt_number || "").trim() || nextReceiptNumber(paymentDate);
      // ---- Oldest-first allocation of the cash given this month ----
      const arrearsTake = Math.min(arrears, cash);            // 1) old dues
      arrears = round2(arrears - arrearsTake);
      const afterArrears = round2(cash - arrearsTake);
      const monthTake = Math.min(rate, afterArrears);        // 2) this month
      const advanceAdded = round2(afterArrears - monthTake); // 3) credit
      advance = round2(advance + advanceAdded);
      const status = cash <= 0 ? "Pending" : arrears <= 0.004 && monthTake >= rate ? "Paid" : "Partial";
      if (paid) {
        db.prepare(
          `UPDATE subscription_payments SET member_id = ?, amount = ?, arrears_cleared = ?, advance_added = ?, receipt_number = ?, payment_date = ?, payment_method = ?, transaction_ref = ?, remarks = ?, status = 'Active', updated_at = datetime('now') WHERE id = ?`
        ).run(s.member_id, cash, arrearsTake, advanceAdded, receipt, paymentDate, data.paymentMethod || "Cash", data.transactionRef ?? "", data.remarks ?? "", paid.id);
      } else {
        db.prepare(
          `INSERT INTO subscription_payments (subscription_id, family_id, member_id, period_start, period_end, amount, arrears_cleared, advance_added, receipt_number, payment_date, payment_method, transaction_ref, collected_by, remarks, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`
        ).run(s.id, s.family_id, s.member_id, s.period_start, s.period_end, cash, arrearsTake, advanceAdded, receipt, paymentDate, data.paymentMethod || "Cash", data.transactionRef ?? "", data.collectedBy ?? 1, data.remarks ?? "");
      }
      // The subscription row mirrors the LATEST month's receipt number for
      // list display and search. amount_paid holds the THIS-MONTH portion of
      // the cash (never above the rate); arrears/advance carry the rest.
      db.prepare(
        `UPDATE subscriptions SET amount_paid = ?, arrears = ?, advance = ?, payment_date = ?, receipt_number = ?, payment_method = ?, transaction_ref = ?, status = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(cash > 0 ? monthTake : 0, arrears, advance, cash > 0 ? paymentDate : null, cash > 0 ? receipt : null, data.paymentMethod || "Cash", data.transactionRef ?? "", status, data.remarks ?? "", id);
      txReceipt = receipt;
      txStatus = status;
      txState = { monthTake, arrears, advance, cash };
    });
    tx();
    // The account's dues after this payment — never negative (an overpaid
    // family is "paid ahead", not "minus pending").
    const dueTotal = Math.max(0, round2(txState.arrears + Math.max(0, rate - txState.monthTake) - txState.advance));
    return { id, receiptNumber: cash > 0 ? txReceipt : "", status: txStatus, amountPaid: cash, monthPaid: txState.monthTake, arrears: round2(txState.arrears), advance: round2(txState.advance), dueTotal };
  },
  /** Cancel the current month's payment (secure action: reason + admin
   *  password are enforced at the IPC layer). Resets the month to unpaid and
   *  marks the ledger record Cancelled — nothing is deleted. */
  cancelPayment: (id: number) => {
    const db = getDB();
    const s = one<any>("SELECT * FROM subscriptions WHERE id = ?", [id]);
    if (!s) throw new Error("Subscription not found");
    const tx = db.transaction(() => {
      // The month's ACTIVE payment (if any) — its allocation must be rolled
      // back exactly: whatever cash it cleared from old arrears goes back to
      // arrears, whatever it parked as advance credit is withdrawn.
      const paid = one<any>(
        "SELECT id, arrears_cleared, advance_added FROM subscription_payments WHERE subscription_id = ? AND period_start = ? AND status = 'Active' LIMIT 1",
        [id, s.period_start]
      );
      const backArrears = Number(paid?.arrears_cleared || 0);
      const backAdvance = Number(paid?.advance_added || 0);
      if (paid) {
        db.prepare(
          "UPDATE subscription_payments SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?"
        ).run(paid.id);
      }
      db.prepare(
        `UPDATE subscriptions SET amount_paid = 0, arrears = MAX(0, COALESCE(arrears,0) + ?), advance = MAX(0, COALESCE(advance,0) - ?), payment_date = NULL, receipt_number = NULL, status = 'Pending', updated_at = datetime('now') WHERE id = ?`
      ).run(backArrears, backAdvance, id);
    });
    tx();
    return { id };
  },
  /** Monthly payment history of a family (from the immutable ledger). */
  paymentsHistory: (familyId: number, limit = 60) =>
    all<any>(
      `SELECT sp.*, f.family_number, f.house_name,
        (SELECT m.name FROM members m WHERE m.id = sp.member_id) AS member_name
       FROM subscription_payments sp LEFT JOIN families f ON f.id = sp.family_id
       WHERE sp.family_id = ?
       ORDER BY COALESCE(sp.period_start, '') DESC, sp.id DESC LIMIT ?`,
      [familyId, limit]
    ),
  update: (id: number, data: any) => {
    // Legacy full-row update is retired for recurring subscriptions — the
    // only permitted edit is recording/correcting the payment amount.
    return (subscriptions as any).applyPayment(id, data);
  },
  remove: (id: number) => run("DELETE FROM subscriptions WHERE id = ?", [id]),
  markOverdue: () => {
    const today = nowDate();
    return run(
      `UPDATE subscriptions SET status = 'Overdue' WHERE status = 'Pending' AND period_end < ?`,
      [today]
    ).changes;
  },
  totalCollected: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM subscription_payments WHERE status = 'Active'"),
  // TRUE pending across every account: old arrears + this month's uncovered
  // rate − that family's own advance (per-family clamp at 0, so one family's
  // prepayment never erases another family's dues).
  totalPending: () => scalar<number>(`SELECT COALESCE(SUM(MAX(0, MAX(0, amount - amount_paid) + COALESCE(arrears,0) - COALESCE(advance,0))), 0) AS v FROM subscriptions WHERE status IN ('Pending','Partial','Overdue')`),
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
    // Auto-numbered in the mahallu's PREFIX/YYYY/MM/NNN series unless the
    // user typed their own number (book migration / manual override).
    const receipt = data.receiptNumber || nextReceiptNumber(data.donationDate || nowDate());
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
  totalThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM donations WHERE strftime('%Y-%m', donation_date) = ?", [istMonth()]),
};

// ================= ACCOUNTING =================

export const accounting = {
  list: (filter: { search?: string; type?: string; page?: number; pageSize?: number } = {}) => {
    const where: string[] = ["(t.status IS NULL OR t.status != 'Void')"];
    const params: any[] = [];
    if (filter.search) {
      where.push("(t.description LIKE ? OR t.receipt_number LIKE ? OR t.transaction_ref LIKE ? OR t.voucher_no LIKE ? OR t.bill_no LIKE ? OR t.payee LIKE ?)");
      const t = `%${filter.search}%`;
      params.push(t, t, t, t, t, t);
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
    // Receipt numbers must NEVER be reused. MAX(id)+1 breaks if an operator
    // types a high manual receipt number (a later auto number would collide).
    // Use the same suffix-max scheme as the official registers instead.
    const receipt = data.receiptNumber || (() => {
      const rows = all<{ n: string }>("SELECT receipt_number AS n FROM transactions");
      let max = 0;
      for (const r of rows) { const m = /(\d+)\s*$/.exec(String(r.n ?? "")); if (m) max = Math.max(max, parseInt(m[1], 10)); }
      return `TXN-${String(max + 1).padStart(4, "0")}`;
    })();
    // Voucher control: auto-fill a sequential voucher number when the operator
    // didn't type one, so every expense can be traced to a voucher reference.
    const year = new Date().getFullYear();
    const voucher = data.voucherNo || scalar<string>(
      "SELECT 'VOU-' || ? || '-' || printf('%04d', COALESCE(MAX(id), 0) + 1) AS n FROM transactions",
      [String(year)]
    );
    // Duplicate bill detection: warn (don't block) when the same bill number was
    // already entered for another expense — a classic duplicate-payment red flag.
    let duplicateBill: { id: number; txn_date: string; description: string; amount: number } | null = null;
    if (data.billNo && String(data.billNo).trim()) {
      const found = one<any>(
        `SELECT id, txn_date, description, amount FROM transactions
          WHERE bill_no = ? AND type = 'Expense' AND id != ? AND (status IS NULL OR status != 'Void')
          ORDER BY id DESC LIMIT 1`,
        [String(data.billNo).trim(), data.id ?? -1]
      );
      if (found) duplicateBill = found;
    }
    const { id } = run(
      `INSERT INTO transactions
        (txn_date, account_id, type, amount, payment_method, description, linked_module, linked_id, receipt_number, transaction_ref, voucher_no, bill_no, payee, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?)`,
      [
        data.txnDate || nowDate(), data.accountId ?? 1, data.type,
        data.amount, data.paymentMethod ?? "Cash", data.description ?? "",
        data.linkedModule ?? "", data.linkedId ?? null,
        receipt, data.transactionRef ?? "",
        voucher, data.billNo ? String(data.billNo).trim() : null,
        data.payee ? String(data.payee).trim() : null,
        data.createdBy ?? 1
      ]
    );
    return { id, receiptNumber: receipt, voucherNo: voucher, duplicateBill };
  },
  update: (id: number, data: any) => {
    const existing = one<any>("SELECT status FROM transactions WHERE id = ?", [id]);
    if (existing?.status === "Void") throw new Error("Voided entries cannot be edited. Enter a new entry instead.");
    return run(
      `UPDATE transactions SET txn_date = ?, account_id = ?, type = ?, amount = ?, payment_method = ?, description = ?, linked_module = ?, linked_id = ?, transaction_ref = ?, voucher_no = ?, bill_no = ?, payee = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.txnDate, data.accountId, data.type, data.amount,
        data.paymentMethod, data.description,
        data.linkedModule ?? "", data.linkedId,
        data.transactionRef,
        data.voucherNo ? String(data.voucherNo).trim() : null,
        data.billNo ? String(data.billNo).trim() : null,
        data.payee ? String(data.payee).trim() : null,
        id
      ]
    );
  },
  /**
   * VOID instead of delete: the receipt number stays occupied, the entry stays
   * visible (struck through) with who/when/why. An auditor can always see both
   * the original entry and the void reason.
   */
  void: (id: number, reason: string, userId: number) => {
    if (!reason?.trim()) throw new Error("A void reason is required");
    const existing = one<any>("SELECT * FROM transactions WHERE id = ?", [id]);
    if (!existing) throw new Error("Transaction not found");
    if (existing.status === "Void") throw new Error("This entry is already voided");
    run(
      `UPDATE transactions SET status = 'Void', voided_at = datetime('now'), voided_by = ?, void_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      [userId, String(reason).trim(), id]
    );
    return { id, receiptNumber: existing.receipt_number };
  },
  /**
   * Receipt sequence for continuity checks: every receipt number in order,
   * with status (Posted/Void) so an auditor can spot gaps or missing numbers.
   */
  receiptSequence: () => {
    const rows = all<any>(
      `SELECT id, receipt_number, txn_date, type, amount, status, void_reason
       FROM transactions
       WHERE receipt_number LIKE 'TXN-%'
       ORDER BY receipt_number ASC`
    );
    // Flag gaps: consecutive numbers that are missing entirely (only possible
    // if someone edited the DB manually, since deletion is blocked).
    const nums = rows
      .map((r) => parseInt(String(r.receipt_number).replace(/^TXN-/, ""), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const missing: number[] = [];
    for (let i = 1; i < nums.length; i++) {
      for (let n = nums[i - 1] + 1; n < nums[i]; n++) missing.push(n);
    }
    return { receipts: rows, missing, count: rows.length };
  },
  remove: (id: number) => run("DELETE FROM transactions WHERE id = ?", [id]),
  totalIncome: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type = 'Income' AND (status IS NULL OR status != 'Void')"),
  totalExpense: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type = 'Expense' AND (status IS NULL OR status != 'Void')"),
  balance: () => scalar<number>("SELECT (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void')) - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void')) AS v"),

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
      if (filter.search) { w.push("(t.description LIKE ? OR t.receipt_number LIKE ? OR t.transaction_ref LIKE ? OR t.voucher_no LIKE ? OR t.bill_no LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t, t, t, t); }
      parts.push(`SELECT t.id AS source_id, 'transactions' AS source, t.txn_date AS ledger_date, t.type, t.amount, t.description, t.payment_method, t.transaction_ref, t.receipt_number, t.account_id, t.linked_module, t.linked_id, t.voucher_no, t.bill_no, t.payee, t.status, t.void_reason, t.voided_at FROM transactions t WHERE ${w.join(" AND ")}`);
    }
    // 2. Donations (always Income)
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("d.donation_date >= ?"); w.push("d.donation_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Income") { w.push("1=0"); } // donations are income only
      if (filter.search) { w.push("(d.donor_name LIKE ? OR d.receipt_number LIKE ? OR d.purpose LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t, t); }
      parts.push(`SELECT d.id AS source_id, 'donations' AS source, d.donation_date AS ledger_date, 'Income' AS type, d.amount, (d.donor_name || COALESCE(' — ' || d.purpose, '')) AS description, d.payment_method, '' AS transaction_ref, d.receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id, NULL AS voucher_no, NULL AS bill_no, NULL AS payee, NULL AS status, NULL AS void_reason, NULL AS voided_at FROM donations d WHERE ${w.join(" AND ")}`);
    }
    // 3. Subscription payments from the immutable ledger (Income)
    {
      const w: string[] = ["sp.status = 'Active'", "COALESCE(sp.amount, 0) > 0"];
      if (range) { w.push("sp.payment_date >= ?"); w.push("sp.payment_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Income") { w.push("1=0"); }
      if (filter.search) { w.push("(sp.receipt_number LIKE ? OR sp.remarks LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT sp.id AS source_id, 'subscriptions' AS source, COALESCE(sp.payment_date, sp.period_start) AS ledger_date, 'Income' AS type, sp.amount, ('Subscription — ' || COALESCE(sp.receipt_number, '')) AS description, sp.payment_method, sp.transaction_ref, sp.receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id, NULL AS voucher_no, NULL AS bill_no, NULL AS payee, NULL AS status, NULL AS void_reason, NULL AS voided_at FROM subscription_payments sp WHERE ${w.join(" AND ")}`);
    }
    // 4. Welfare disbursements (Expense)
    {
      const w: string[] = ["w.status = 'Disbursed'"];
      if (range) { w.push("w.disbursed_date >= ?"); w.push("w.disbursed_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Expense") { w.push("1=0"); }
      if (filter.search) { w.push("(w.applicant_name LIKE ? OR w.request_number LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT w.id AS source_id, 'welfare' AS source, COALESCE(w.disbursed_date, w.created_at) AS ledger_date, 'Expense' AS type, w.amount_approved AS amount, ('Welfare — ' || w.applicant_name) AS description, '' AS payment_method, '' AS transaction_ref, w.request_number AS receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id, NULL AS voucher_no, NULL AS bill_no, NULL AS payee, NULL AS status, NULL AS void_reason, NULL AS voided_at FROM welfare_requests w WHERE ${w.join(" AND ")}`);
    }
    // 5. Staff salary payments (Expense, status='Paid')
    {
      const w: string[] = ["sp.status = 'Paid'"];
      if (range) { w.push("sp.payment_date >= ?"); w.push("sp.payment_date <= ?"); params.push(range.from, range.to); }
      if (filter.type && filter.type !== "All" && filter.type !== "Expense") { w.push("1=0"); }
      if (filter.search) { w.push("(s.name LIKE ? OR s.staff_code LIKE ?)"); const t = `%${filter.search}%`; params.push(t, t); }
      parts.push(`SELECT sp.id AS source_id, 'salary' AS source, sp.payment_date AS ledger_date, 'Expense' AS type, sp.amount, ('Salary — ' || s.name || ' (' || printf('%02d', sp.period_month) || '/' || sp.period_year || ')') AS description, sp.payment_method, sp.transaction_ref, '' AS receipt_number, NULL AS account_id, NULL AS linked_module, NULL AS linked_id, NULL AS voucher_no, NULL AS bill_no, NULL AS payee, NULL AS status, NULL AS void_reason, NULL AS voided_at FROM staff_payments sp LEFT JOIN staff s ON s.id = sp.staff_id WHERE ${w.join(" AND ")}`);
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
      const w: string[] = ["(t.status IS NULL OR t.status != 'Void')"];
      if (range) { w.push("t.txn_date >= ?"); w.push("t.txn_date <= ?"); }
      parts.push(`SELECT t.txn_date AS ledger_date, t.type, t.amount, 'transactions' AS source FROM transactions t WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["1=1"];
      if (range) { w.push("d.donation_date >= ?"); w.push("d.donation_date <= ?"); }
      parts.push(`SELECT d.donation_date AS ledger_date, 'Income' AS type, d.amount, 'donations' AS source FROM donations d WHERE ${w.join(" AND ")}`);
    }
    {
      const w: string[] = ["sp.status = 'Active'", "COALESCE(sp.amount, 0) > 0"];
      if (range) { w.push("sp.payment_date >= ?"); w.push("sp.payment_date <= ?"); }
      parts.push(`SELECT COALESCE(sp.payment_date, sp.period_start) AS ledger_date, 'Income' AS type, sp.amount, 'subscriptions' AS source FROM subscription_payments sp WHERE ${w.join(" AND ")}`);
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

  /**
   * Annual audit pack for a financial year (default 01-Apr → 31-Mar, matching
   * the settings financial_year_start of "04-01").
   * Produces: Receipts & Payments, Income & Expenditure, the 7% Waqf
   * contribution indicator (S.77), and the voucher-indexed transaction
   * listing — everything a Kerala Waqf Board / society auditor asks for.
   */
  auditPack: (fyYear: number) => {
    const fy = Number(fyYear) || new Date().getFullYear();
    const fyStart = `${fy}-04-01`;
    const fyEnd = `${fy + 1}-03-31`;
    const s = (sql: string) => scalar<number>(sql) || 0;

    // Opening balance = everything received/spent BEFORE the FY (all sources).
    const opening = s(`SELECT
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND txn_date < '${fyStart}')
      + (SELECT COALESCE(SUM(amount),0) FROM donations WHERE donation_date < '${fyStart}')
      + (SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE status='Active' AND COALESCE(payment_date, period_start) < '${fyStart}')
      - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND txn_date < '${fyStart}')
      - (SELECT COALESCE(SUM(amount_approved),0) FROM welfare_requests WHERE status='Disbursed' AND COALESCE(disbursed_date, created_at) < '${fyStart}')
      - (SELECT COALESCE(SUM(amount),0) FROM staff_payments WHERE status='Paid' AND payment_date < '${fyStart}')`);

    const receipts = {
      donations: s(`SELECT COALESCE(SUM(amount),0) FROM donations WHERE donation_date >= '${fyStart}' AND donation_date <= '${fyEnd}'`),
      subscriptions: s(`SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE status='Active' AND COALESCE(payment_date, period_start) >= '${fyStart}' AND COALESCE(payment_date, period_start) <= '${fyEnd}'`),
      manual: s(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND txn_date >= '${fyStart}' AND txn_date <= '${fyEnd}'`),
    };
    const payments = {
      welfare: s(`SELECT COALESCE(SUM(amount_approved),0) FROM welfare_requests WHERE status='Disbursed' AND COALESCE(disbursed_date, created_at) >= '${fyStart}' AND COALESCE(disbursed_date, created_at) <= '${fyEnd}'`),
      salary: s(`SELECT COALESCE(SUM(amount),0) FROM staff_payments WHERE status='Paid' AND payment_date >= '${fyStart}' AND payment_date <= '${fyEnd}'`),
      manual: s(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND txn_date >= '${fyStart}' AND txn_date <= '${fyEnd}'`),
    };
    const totalReceipts = receipts.donations + receipts.subscriptions + receipts.manual;
    const totalPayments = payments.welfare + payments.salary + payments.manual;
    const closing = opening + totalReceipts - totalPayments;

    // Voucher-indexed transaction listing (manual entries with audit evidence).
    const transactions = all<any>(
      `SELECT txn_date, receipt_number, voucher_no, bill_no, payee, description, type, amount, payment_method, status, void_reason
       FROM transactions
       WHERE txn_date >= ? AND txn_date <= ?
       ORDER BY txn_date ASC, id ASC`,
      [fyStart, fyEnd]
    );

    const settings = one<any>("SELECT mahallu_name, wakf_reg_no, society_reg_no, village, taluk, district, state FROM settings WHERE id = 1") || {};
    return {
      fyLabel: `${fy}-04-01 to ${fy + 1}-03-31`,
      fyYear: fy,
      mahalluName: settings.mahallu_name || "Minz Mahallu",
      wakfRegNo: settings.wakf_reg_no || "",
      societyRegNo: settings.society_reg_no || "",
      village: settings.village || "", taluk: settings.taluk || "", district: settings.district || "", state: settings.state || "",
      opening, closing,
      receipts, payments, totalReceipts, totalPayments,
      waqfContribution: Math.round(totalReceipts * 0.07 * 100) / 100,
      transactions,
      generatedAt: new Date().toISOString(),
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
    // Robust numbering: MAX trailing suffix + 1 across ALL marriages (see
    // nextRegisterNumber) — COUNT-based numbers collided/lagged when a
    // nikah_date fell outside the current year.
    const num = nextRegisterNumber("marriages", "marriage_number", "MRG");
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
  // Raw rows for the printed marriage register (chronological, numbered).
  registerRows: () => all<any>(
    `SELECT id, marriage_number, nikah_date, bride_name, bride_father, groom_name, groom_father, place, mahar
     FROM marriages ORDER BY nikah_date ASC, id ASC`
  ),
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
    // Robust numbering: MAX trailing suffix + 1 across ALL deaths (see
    // nextRegisterNumber) — COUNT-based numbers could be reused after a
    // deletion or lag behind when a death date is backdated.
    const num = nextRegisterNumber("deaths", "death_number", "DTH");
    const { id } = run(
      `INSERT INTO deaths
        (death_number, deceased_name, father_name, gender, age, date_of_death, place_of_death, burial_date, cause_of_death, burial_place, address, family_id, registration_date, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num, data.deceasedName ?? "", data.fatherName ?? "",
        data.gender ?? "Male", data.age ?? null, data.dateOfDeath,
        data.placeOfDeath ?? "", data.burialDate, data.causeOfDeath ?? "", data.burialPlace ?? "",
        data.address ?? "", data.familyId ?? null,
        data.registrationDate || nowDate(), data.remarks ?? ""
      ]
    );
    return { id, deathNumber: num };
  },
  update: (id: number, data: any) =>
    run(
      `UPDATE deaths SET deceased_name = ?, father_name = ?, gender = ?, age = ?, date_of_death = ?, place_of_death = ?, burial_date = ?, cause_of_death = ?, burial_place = ?, address = ?, family_id = ?, registration_date = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        data.deceasedName ?? "", data.fatherName ?? "", data.gender ?? "Male",
        data.age ?? null, data.dateOfDeath ?? "", data.placeOfDeath ?? "",
        data.burialDate ?? "", data.causeOfDeath ?? "", data.burialPlace ?? "",
        data.address ?? "", data.familyId ?? null, data.registrationDate || nowDate(),
        data.remarks ?? "", id
      ]
    ),
  remove: (id: number) => run("DELETE FROM deaths WHERE id = ?", [id]),
  // Raw rows for the printed death register (chronological, numbered).
  registerRows: () => all<any>(
    `SELECT id, death_number, deceased_name, father_name, gender, age, date_of_death, place_of_death, burial_date, burial_place
     FROM deaths ORDER BY date_of_death ASC, id ASC`
  ),
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
    // MAX(id)+1 could reuse a number after deleting the newest request;
    // use the same suffix-max scheme as the other official registers
    // (WEL keeps its legacy 4-digit, year-less format).
    const num = nextRegisterNumber("welfare_requests", "request_number", "WEL", { pad: 4, withYear: false });
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
  approve: (id: number, amount: number, remarks: string, userId: number, minutesDate?: string) =>
    run(
      `UPDATE welfare_requests SET status = 'Approved', amount_approved = ?, remarks = ?, minutes_date = COALESCE(?, minutes_date), processed_by = ?, processed_date = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [amount, remarks, minutesDate || null, userId, id]
    ),
  reject: (id: number, reason: string, userId: number) =>
    run(
      `UPDATE welfare_requests SET status = 'Rejected', remarks = ?, processed_by = ?, processed_date = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [reason, userId, id]
    ),
  /** Disbursement is a secure action: the IPC layer verifies the administrator
   *  password and requires a reason before calling this. A minutes_date must
   *  exist (recorded at approval) — the foolproof workflow trail. */
  disburse: (id: number, userId: number, reason = "") => {
    const w = one<any>("SELECT id, minutes_date, amount_approved FROM welfare_requests WHERE id = ?", [id]);
    if (!w) throw new Error("Welfare request not found");
    if (!w.minutes_date) {
      throw new Error("Date of the committee minutes approving this amount is missing. Reject the request and re-approve it with the minutes date recorded.");
    }
    return run(
      `UPDATE welfare_requests SET status = 'Disbursed', disbursed_date = ?, remarks = CASE WHEN ? != '' THEN (CASE WHEN remarks = '' OR remarks IS NULL THEN ? ELSE remarks || ' | Disbursement: ' || ? END) ELSE remarks END, processed_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [nowDate(), reason.trim(), reason.trim(), reason.trim(), userId, id]
    );
  },
  remove: (id: number) => run("DELETE FROM welfare_requests WHERE id = ?", [id]),
  categories: () => ["Medical Aid", "Education Aid", "Marriage Assistance", "Financial Assistance"],
};

// ================= CERTIFICATES =================

// ---------------------------------------------------------------------------
// Receipt verification lookup (anti-forgery) — donations + subscription
// payments share ONE receipt series and both carry verification codes.
// ---------------------------------------------------------------------------
type ReceiptLookup = {
  source: "donations" | "subscription_payments" | "subscriptions";
  receipt: {
    receipt_number: string;
    verification_code: string;
    kind: "DONATION" | "SUBSCRIPTION";
    payer: string;
    payer_detail: string;
    amount: number;
    date: string;
    payment_method: string;
    status: string;
  };
};

function donationReceiptLookup(row: any): ReceiptLookup["receipt"] {
  return {
    receipt_number: String(row.receipt_number || ""),
    verification_code: String(row.verification_code || ""),
    kind: "DONATION",
    payer: String(row.donor_name || ""),
    payer_detail: String(row.donor_phone || ""),
    amount: Number(row.amount || 0),
    date: String(row.donation_date || "").slice(0, 10),
    payment_method: String(row.payment_method || ""),
    status: "Posted",
  };
}

function subscriptionReceiptLookup(row: any): ReceiptLookup["receipt"] {
  // Ledger rows: `amount` IS what was paid. Subscriptions mirror: `amount_paid`
  // is what was paid (amount = the monthly due). Both are selected AS
  // paid_amount by the callers.
  const paid = Number(row.paid_amount ?? row.amount_paid ?? row.amount ?? 0);
  return {
    receipt_number: String(row.receipt_number || ""),
    verification_code: String(row.verification_code || ""),
    kind: "SUBSCRIPTION",
    payer: String(row.member_name || row.house_name || row.family_number || ""),
    payer_detail: String(row.family_number || ""),
    amount: paid,
    date: String(row.payment_date || row.period_start || "").slice(0, 10),
    payment_method: String(row.payment_method || ""),
    status: String(row.status || ""),
  };
}

/** Find a money receipt by its register verification code. Only rows that
 *  actually carry a code (i.e. a receipt was issued) can match. */
function findReceiptByCode(code: string): ReceiptLookup | null {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  const d = one<any>(
    `SELECT receipt_number, verification_code, donor_name, donor_phone, amount, donation_date, payment_method
     FROM donations WHERE verification_code = ?`,
    [clean]
  );
  if (d) return { source: "donations", receipt: donationReceiptLookup(d) };
  const sp = one<any>(
    `SELECT sp.receipt_number, sp.verification_code, sp.amount AS paid_amount, sp.payment_date, sp.period_start, sp.payment_method, sp.status,
       f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = sp.member_id) AS member_name
     FROM subscription_payments sp LEFT JOIN families f ON f.id = sp.family_id
     WHERE sp.verification_code = ?`,
    [clean]
  );
  if (sp) return { source: "subscription_payments", receipt: subscriptionReceiptLookup(sp) };
  // Legacy mirror: accounts whose payment predates the ledger.
  const s = one<any>(
    `SELECT s.receipt_number, s.verification_code, s.amount_paid AS paid_amount, s.payment_date, s.period_start, s.payment_method, s.status,
       f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name
     FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id
     WHERE s.verification_code = ?`,
    [clean]
  );
  if (s) return { source: "subscriptions", receipt: subscriptionReceiptLookup(s) };
  return null;
}

/** Find a money receipt by verification code OR receipt number. */
function findReceiptByCodeOrNumber(query: string): ReceiptLookup | null {
  const byCode = findReceiptByCode(query);
  if (byCode) return byCode;
  const clean = String(query || "").trim().toUpperCase();
  if (!clean) return null;
  const d = one<any>(
    `SELECT receipt_number, verification_code, donor_name, donor_phone, amount, donation_date, payment_method
     FROM donations WHERE receipt_number = ?`,
    [clean]
  );
  if (d) return { source: "donations", receipt: donationReceiptLookup(d) };
  const sp = one<any>(
    `SELECT sp.receipt_number, sp.verification_code, sp.amount AS paid_amount, sp.payment_date, sp.period_start, sp.payment_method, sp.status,
       f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = sp.member_id) AS member_name
     FROM subscription_payments sp LEFT JOIN families f ON f.id = sp.family_id
     WHERE sp.receipt_number = ?`,
    [clean]
  );
  if (sp) return { source: "subscription_payments", receipt: subscriptionReceiptLookup(sp) };
  const s = one<any>(
    `SELECT s.receipt_number, s.verification_code, s.amount_paid AS paid_amount, s.payment_date, s.period_start, s.payment_method, s.status,
       f.house_name, f.family_number,
       (SELECT m.name FROM members m WHERE m.id = s.member_id) AS member_name
     FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id
     WHERE s.receipt_number = ?`,
    [clean]
  );
  if (s) return { source: "subscriptions", receipt: subscriptionReceiptLookup(s) };
  return null;
}

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
  /** Lazy backfill of a certificate's verification code — certificates issued
   *  by builds before the anti-forgery feature have no code, and without a code
   *  the print shows NO verify box / NO QR at all. The code is minted the
   *  moment the certificate is next touched (print / preview / verify), and
   *  issued codes never change. Mutates + returns the passed row's code. */
  ensureVerificationCode: (cert: { id: number; verification_code?: string | null }): string => {
    const current = String((cert as any).verification_code || "").trim();
    if (current) return current;
    const code = makeVerificationCode();
    run("UPDATE certificates SET verification_code = ? WHERE id = ?", [code, cert.id]);
    (cert as any).verification_code = code;
    return code;
  },
  /** Duplicate guard: an ACTIVE (Issued) certificate of this type already
   *  exists for the same linked record → return it with alreadyIssued so the
   *  UI can open the existing PDF instead of minting a second certificate. */
  findActiveDuplicate: (type: string, where: string, params: any[]): { id: number; certificate_number: string } | null => {
    const row = one<any>(
      `SELECT id, certificate_number FROM certificates WHERE type = ? AND status = 'Issued' AND ${where} ORDER BY id DESC LIMIT 1`,
      [type, ...params]
    );
    return row ? { id: Number(row.id), certificate_number: String(row.certificate_number) } : null;
  },
  /** Normalize the issue-result shape (older handlers returned mixed key
   *  casing — both are kept so every caller keeps working). */
  issueResult: (id: number, certificateNumber: string, alreadyIssued = false) => ({
    id,
    certificateNumber,
    certificate_number: certificateNumber,
    alreadyIssued,
  }),
  issueMembership: (memberCode: string, userId: number) => {
    const m = one<any>("SELECT * FROM members WHERE member_code = ?", [memberCode]);
    if (!m) throw new Error("Member not found");
    const existing = certificates.findActiveDuplicate("Membership", "member_id = ?", [m.id]);
    if (existing) return certificates.issueResult(existing.id, existing.certificate_number, true);
    const certNum = nextCertificateNumber("Membership", nowDate());
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [certNum, "Membership", m.id, m.family_id, m.name, nowDate(), userId, "Issued", makeVerificationCode()]
    );
    return certificates.issueResult(id, certNum);
  },
  issueResidence: (familyNumber: string, issuedTo: string, userId: number) => {
    const f = one<any>("SELECT * FROM families WHERE family_number = ?", [familyNumber]);
    if (!f) throw new Error("Family not found");
    const person = (issuedTo || "").trim() || f.house_name;
    const existing = certificates.findActiveDuplicate("Residence", "family_id = ? AND issued_to = ?", [f.id, person]);
    if (existing) return certificates.issueResult(existing.id, existing.certificate_number, true);
    const certNum = nextCertificateNumber("Residence", nowDate());
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status, verification_code) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)",
      [certNum, "Residence", f.id, person, nowDate(), userId, "Issued", makeVerificationCode()]
    );
    return certificates.issueResult(id, certNum);
  },
  issueMarriage: (marriageNumber: string, userId: number) => {
    const m = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNumber]);
    if (!m) throw new Error("Marriage record not found");
    const couple = m.bride_name + " & " + m.groom_name;
    // marriage_id is linked on new issues; legacy rows (NULL link) fall back to
    // matching the couple line so they still block duplicates.
    const existing = certificates.findActiveDuplicate(
      "Marriage",
      "(marriage_id = ? OR (marriage_id IS NULL AND issued_to = ?))",
      [m.id, couple]
    );
    if (existing) return certificates.issueResult(existing.id, existing.certificate_number, true);
    const certNum = nextCertificateNumber("Marriage", nowDate());
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, marriage_id, issued_to, issued_date, issued_by, status, verification_code) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 'Issued', ?)",
      [certNum, "Marriage", m.id, couple, nowDate(), userId, makeVerificationCode()]
    );
    return certificates.issueResult(id, certNum);
  },
  issueMarriageNoc: (marriageNum: string, userId: number) => {
    const marriage = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNum]);
    if (!marriage) throw new Error("Marriage record not found");
    const existing = certificates.findActiveDuplicate("NOC", "marriage_id = ?", [marriage.id]);
    if (existing) return certificates.issueResult(existing.id, existing.certificate_number, true);
    const certificateNumber = nextCertificateNumber("NOC", nowDate());
    const issuedTo = [marriage.bride_name, marriage.groom_name].filter(Boolean).join(" & ");
    const result = run(
      `INSERT INTO certificates (certificate_number, type, marriage_id, issued_to, issued_date, issued_by, notes, verification_code)
       VALUES (?, 'NOC', ?, ?, ?, ?, ?, ?)`,
      [certificateNumber, marriage.id, issuedTo, todayIST(), userId, `No Objection Certificate for marriage ${marriage.marriage_number}`, makeVerificationCode()]
    );
    return certificates.issueResult(result.id, certificateNumber);
  },
  issueDeath: (deathNumber: string, userId: number) => {
    const d = one<any>("SELECT * FROM deaths WHERE death_number = ?", [deathNumber]);
    if (!d) throw new Error("Death record not found");
    const existing = certificates.findActiveDuplicate("Death", "death_id = ?", [d.id]);
    if (existing) return certificates.issueResult(existing.id, existing.certificate_number, true);
    const certNum = nextCertificateNumber("Death", nowDate());
    const { id } = run(
      "INSERT INTO certificates (certificate_number, type, member_id, family_id, marriage_id, death_id, issued_to, issued_date, issued_by, status, verification_code) VALUES (?, 'Death', NULL, ?, NULL, ?, ?, ?, ?, 'Issued', ?)",
      [certNum, d.family_id ?? null, d.id, d.deceased_name, nowDate(), userId, makeVerificationCode()]
    );
    return certificates.issueResult(id, certNum);
  },
  /** Anti-forgery lookup: any printed code or number can be checked against
   *  the register — certificates (by code or number) AND money receipts
   *  (donations + subscription payments, by code or receipt number). */
  verify: (code: string) => {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) throw new Error("Enter a verification code");
    const cert = one<any>(
      `SELECT id, certificate_number, type, member_id, family_id, issued_to, issued_date, issued_by, status, reprint_count, verification_code
       FROM certificates WHERE verification_code = ? OR certificate_number = ?`,
      [clean, clean]
    );
    if (!cert) {
      const receipt = findReceiptByCodeOrNumber(clean);
      if (!receipt) return { valid: false, kind: null, certificate: null, receipt: null };
      const { fingerprint } = getQrPrintContext();
      return {
        valid: true,
        kind: "RECEIPT",
        certificate: null,
        receipt: receipt.receipt,
        // The QR payload printed on this receipt — the human-readable message
        // format (what a phone shows when the QR is scanned).
        qrPayload: receiptQrVerifyMessage({
          receiptNumber: String(receipt.receipt.receipt_number || ""),
          verificationCode: String(receipt.receipt.verification_code || ""),
          date: String(receipt.receipt.date || "").slice(0, 10),
        }),
        deviceFingerprint: fingerprint,
      };
    }
    const { fingerprint } = getQrPrintContext();
    // Legacy certificates (issued before the anti-forgery feature) get their
    // code minted NOW — without it the print shows no QR / verify box at all.
    certificates.ensureVerificationCode(cert);
    return {
      valid: true,
      kind: "CERTIFICATE",
      certificate: {
        certificate_number: cert.certificate_number,
        type: cert.type,
        issued_to: cert.issued_to,
        issued_date: cert.issued_date,
        status: cert.status,
        reprint_count: cert.reprint_count || 0,
      },
      receipt: null,
      // The QR text printed on this certificate — the human-readable message
      // format (scanning it shows the verify-via-app instructions + code).
      qrPayload: certificateQrVerifyMessage(cert),
      deviceFingerprint: fingerprint,
    };
  },
  /**
   * QR anti-forgery: verify a scanned QR — accepts BOTH print formats.
   *
   *   1. The human-readable message (v2 prints): any phone scan shows
   *      "…can be verified using the Minz Mahallu app. Give the following
   *      security code for verification: XXXX-…" — the code is extracted and
   *      looked up in the register (certificates, then receipts). The claimed
   *      document number is cross-checked against the register record so a
   *      doctored scan text is flagged.
   *   2. The machine payload (v1 prints / manual entry):
   *      MMS|CERT|num|code|fp|date[|sig] and MMS|RCP|num|code|fp|date[|sig].
   *      Signed payloads are HMAC-checked first (a field altered after
   *      printing no longer matches the tag), then register-looked-up, then
   *      checked against this device's fingerprint. Six-field payloads are
   *      legacy prints: no tag to check, but still register-verified.
   */
  verifyQr: (payload: string) => {
    const raw = String(payload || "").trim();
    const parsed = parseQrPayload(raw);

    // ---- v2: human-readable scanned text → security-code lookup ----
    if (!parsed) {
      const scanned = extractScannedQrText(raw);
      if (!scanned) return { valid: false, reason: "malformed", kind: null, certificate: null, receipt: null };
      const cert = one<any>(
        `SELECT id, certificate_number, type, issued_to, issued_date, issued_by, status, reprint_count, verification_code
         FROM certificates WHERE verification_code = ?`,
        [scanned.verificationCode]
      );
      if (cert) {
        return {
          valid: true,
          kind: "CERTIFICATE",
          certificate: {
            certificate_number: cert.certificate_number,
            type: cert.type,
            issued_to: cert.issued_to,
            issued_date: cert.issued_date,
            status: cert.status,
            reprint_count: cert.reprint_count || 0,
          },
          receipt: null,
          source: "message",
          qr: { verificationCode: scanned.verificationCode, claimedNumber: scanned.number, signed: false },
          // A scan text whose claimed number disagrees with the register record
          // was doctored after printing — flag it instead of passing silently.
          certificateMatchesRegister: !scanned.number || scanned.number === cert.certificate_number,
        };
      }
      const receipt = findReceiptByCode(scanned.verificationCode);
      if (receipt) {
        return {
          valid: true,
          kind: "RECEIPT",
          certificate: null,
          receipt: receipt.receipt,
          source: "message",
          qr: { verificationCode: scanned.verificationCode, claimedNumber: scanned.number, signed: false },
          receiptMatchesRegister: !scanned.number || scanned.number === receipt.receipt.receipt_number,
        };
      }
      return { valid: false, reason: "not-found", kind: scanned.kind === "CERT" ? "CERTIFICATE" : scanned.kind === "RCP" ? "RECEIPT" : null, certificate: null, receipt: null };
    }

    // ---- v1: machine payload → HMAC + register + device fingerprint ----
    // Signed payload → the tag must match the mahallu's key. An outsider can
    // clone a whole QR but cannot alter any field or mint a new one.
    if (isSignedPayload(parsed)) {
      const { signingKey } = getQrPrintContext();
      if (signingKey && !verifyQrSignature(parsed, signingKey)) {
        return { valid: false, reason: "bad-signature", kind: null, certificate: null, receipt: null };
      }
    }

    if (parsed.kind === QR_KIND_CERT) {
      const cert = one<any>(
        `SELECT id, certificate_number, type, issued_to, issued_date, issued_by, status, reprint_count, verification_code
         FROM certificates WHERE verification_code = ?`,
        [parsed.verificationCode]
      );
      if (!cert) return { valid: false, reason: "not-found", kind: "CERTIFICATE", certificate: null, receipt: null };
      const { fingerprint: currentFp } = getQrPrintContext();
      return {
        valid: true,
        kind: "CERTIFICATE",
        certificate: {
          certificate_number: cert.certificate_number,
          type: cert.type,
          issued_to: cert.issued_to,
          issued_date: cert.issued_date,
          status: cert.status,
          reprint_count: cert.reprint_count || 0,
        },
        receipt: null,
        qr: {
          fingerprint: parsed.fingerprint,
          issuedDate: parsed.issuedDate,
          certificateNumber: parsed.number,
          signed: isSignedPayload(parsed),
        },
        issuedOnThisDevice: !!currentFp && parsed.fingerprint.toUpperCase() === currentFp.toUpperCase(),
        certificateMatchesRegister: parsed.number === cert.certificate_number,
      };
    }

    // Receipt payload (RCP)
    const found = findReceiptByCode(parsed.verificationCode);
    if (!found) return { valid: false, reason: "not-found", kind: "RECEIPT", certificate: null, receipt: null };
    const { fingerprint: currentFpR } = getQrPrintContext();
    return {
      valid: true,
      kind: "RECEIPT",
      certificate: null,
      receipt: found.receipt,
      qr: {
        fingerprint: parsed.fingerprint,
        issuedDate: parsed.issuedDate,
        certificateNumber: parsed.number,
        receiptNumber: parsed.number,
        signed: isSignedPayload(parsed),
      },
      issuedOnThisDevice: !!currentFpR && parsed.fingerprint.toUpperCase() === currentFpR.toUpperCase(),
      receiptMatchesRegister: parsed.number === found.receipt.receipt_number,
    };
  },
  /** Count reprints so printed copies carry a "Reprinted on" corner note. */
  markReprint: (id: number) => {
    run("UPDATE certificates SET reprint_count = COALESCE(reprint_count, 0) + 1, updated_at = datetime('now') WHERE id = ?", [id]);
    return one<any>("SELECT * FROM certificates WHERE id = ?", [id]);
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
      const db = getDB();
      // Tamper-evident chain: every new event stores the hash of the previous
      // event. The append-only triggers (V010) block UPDATE/DELETE on this
      // table, so once written, a row cannot be altered without breaking the
      // chain for every later event.
      const prev = db.prepare("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { entry_hash: string | null } | undefined;
      const prevHash = prev?.entry_hash || null;
      const entryHash = computeEntryHash(prevHash, {
        userId, username, action, module, entityId, description, metadata,
      });
      db.prepare(
        `INSERT INTO audit_log (user_id, username, action, module, entity_id, description, metadata, prev_hash, entry_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(userId, username, action, module, entityId, description, metadata, prevHash, entryHash);
      // Update the anchor so verification can also detect truncation of the tail.
      const anchor = db.prepare("SELECT event_count FROM audit_chain WHERE id = 1").get() as { event_count: number } | undefined;
      db.prepare("INSERT OR REPLACE INTO audit_chain (id, last_hash, event_count, updated_at) VALUES (1, ?, ?, datetime('now'))")
        .run(entryHash, (anchor?.event_count ?? 0) + 1);
    } catch (e) {
      console.error("[audit] Failed to log:", e);
    }
  },
  /**
   * Walk the whole audit log and verify the hash chain. Returns:
   *   { intact, verified, legacyRows, brokenAtId, anchor }
   */
  verify: () => {
    const rows = all<any>(
      `SELECT id, prev_hash, entry_hash, user_id, username, action, module, entity_id, description, metadata, created_at
       FROM audit_log ORDER BY id ASC`
    );
    const result = verifyAuditChain(rows);
    const anchor = one<any>("SELECT last_hash, event_count, updated_at FROM audit_chain WHERE id = 1") || null;
    // Cross-check the tail: the newest entry_hash must match the anchor.
    const newest = rows.length ? rows[rows.length - 1] : null;
    const tailMatches = !anchor?.last_hash
      ? newest?.entry_hash == null
      : newest?.entry_hash === anchor.last_hash;
    return {
      intact: result.intact && !!tailMatches,
      verified: result.verified,
      legacyRows: result.legacyRows,
      brokenAtId: result.brokenAtId,
      eventCount: anchor?.event_count ?? rows.length,
      anchorMatches: tailMatches,
      verifiedAt: new Date().toISOString(),
    };
  },
};

// ================= SETTINGS =================

export const settings = {
  load: () => one<any>("SELECT * FROM settings WHERE id = 1"),
  // Partial update: only the fields actually present in `data` are written.
  // Previously this was a full-row UPDATE with `?? ""` fallbacks, which meant
  // any caller that saved a subset (e.g. language persistence on theme/lang
  // change) silently wiped every field it did not pass — affiliation number,
  // reg nos, terms etc. Callers now merge: load() → save({...loaded, ...patch}).
  save: (data: any) => {
    const current = one<any>("SELECT * FROM settings WHERE id = 1") || {};
    const merged = { ...current, ...data };
    return run(
      `UPDATE settings SET
        mahallu_name = ?, address = ?, phone = ?, email = ?,
        financial_year_start = ?, currency_symbol = ?, subscription_monthly_amount = ?, theme = ?, language = ?,
        auto_backup = ?, backup_interval_hours = ?, receipt_prefix = ?,
        affiliation_number = ?, committee_term_start = ?, committee_term_end = ?,
        wakf_reg_no = ?, society_reg_no = ?, backup_mirror_dir = ?,
        village = ?, panchayath = ?, taluk = ?, district = ?, pincode = ?, state = ?,
        updated_at = datetime('now')
       WHERE id = 1`,
      [
        merged.mahalluName ?? merged.mahallu_name ?? "", merged.address ?? "", merged.phone ?? "", merged.email ?? "",
        merged.financialYearStart ?? merged.financial_year_start ?? "04-01", merged.currencySymbol ?? merged.currency_symbol ?? "₹",
        Number(merged.subscriptionMonthlyAmount ?? merged.subscription_monthly_amount ?? 0),
        merged.theme ?? "light", merged.language ?? "en",
        merged.autoBackup ?? merged.auto_backup ? 1 : 0, Number(merged.backupIntervalHours ?? merged.backup_interval_hours ?? 24),
        merged.receiptPrefix ?? merged.receipt_prefix ?? "RCP",
        merged.affiliationNumber ?? merged.affiliation_number ?? "", merged.committeeTermStart ?? merged.committee_term_start ?? "",
        merged.committeeTermEnd ?? merged.committee_term_end ?? "",
        merged.wakfRegNo ?? merged.wakf_reg_no ?? "", merged.societyRegNo ?? merged.society_reg_no ?? "",
        String(merged.backupMirrorDir ?? merged.backup_mirror_dir ?? ""),
        merged.village ?? "", merged.panchayath ?? "", merged.taluk ?? "", merged.district ?? "",
        merged.pincode ?? "", merged.state ?? ""
      ]
    );
  },
};

// ================= DASHBOARD =================

export const dashboard = {
  summary: () => {
    const row = one<any>("SELECT * FROM v_dashboard_summary");
    return row ?? {};
  },
  incomeThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = ?", [istMonth()]),
  expenseThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = ?", [istMonth()]),
  // Fund balance now uses the SAME unified ledger as the Accounting page
  // (manual transactions + donations + paid subscriptions + welfare
  // disbursements + paid salaries). Previously this summed the transactions
  // table only, so the dashboard card disagreed with the Accounting balance.
  balance: () => accounting.unifiedSummary({ period: "all" }).balance,
  monthlyCollections: (months: number = 6) => all<any>(
    // Recursive month series so the chart shows a continuous X axis with
    // zero-filled months instead of only months that happen to have rows.
    `WITH RECURSIVE months(m) AS (
       SELECT strftime('%Y-%m', date(?, ?))
       UNION ALL
       SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < ?
     )
     SELECT m AS month,
       COALESCE((SELECT SUM(amount) FROM subscription_payments WHERE status='Active' AND amount > 0 AND strftime('%Y-%m', payment_date) = m), 0) AS amount
     FROM months ORDER BY m`,
    [todayIST(), `-${months - 1} months`, istMonth()]
  ),
  monthlyDonations: (months: number = 6) => all<any>(
    `WITH RECURSIVE months(m) AS (
       SELECT strftime('%Y-%m', date(?, ?))
       UNION ALL
       SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < ?
     )
     SELECT m AS month,
       COALESCE((SELECT SUM(amount) FROM donations WHERE strftime('%Y-%m', donation_date) = m), 0) AS amount
     FROM months ORDER BY m`,
    [todayIST(), `-${months - 1} months`, istMonth()]
  ),
  // Income vs Expense chart — uses the SAME unified ledger as the Accounting
  // page (manual transactions + donations + paid subscriptions + welfare
  // disbursements + paid salaries). Previously this summed the transactions
  // table only, so the chart disagreed with the Accounting page whenever a
  // donation / subscription / welfare / salary entry existed.
  incomeVsExpense: (months: number = 6) => all<any>(
    `WITH RECURSIVE months(m) AS (
       SELECT strftime('%Y-%m', date(?, ?))
       UNION ALL
       SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < ?
     )
     SELECT m AS month,
       COALESCE((SELECT SUM(amount) FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = m), 0)
         + COALESCE((SELECT SUM(amount) FROM donations WHERE strftime('%Y-%m', donation_date) = m), 0)
         + COALESCE((SELECT SUM(amount) FROM subscription_payments WHERE status='Active' AND amount > 0 AND strftime('%Y-%m', COALESCE(payment_date, period_start)) = m), 0)
       AS income,
       COALESCE((SELECT SUM(amount) FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = m), 0)
         + COALESCE((SELECT SUM(amount_approved) FROM welfare_requests WHERE status='Disbursed' AND strftime('%Y-%m', COALESCE(disbursed_date, created_at)) = m), 0)
         + COALESCE((SELECT SUM(amount) FROM staff_payments WHERE status='Paid' AND strftime('%Y-%m', payment_date) = m), 0)
       AS expense
     FROM months ORDER BY m`,
    [todayIST(), `-${months - 1} months`, istMonth()]
  ),
  recentActivity: (limit: number = 10) => all<any>(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, [limit]
  ),

  // Real data for the "Today at a Glance" card (no more hardcoded values).
  todayAtGlance: () => {
    const receiptsToday = scalar<number>(
      `SELECT (SELECT COUNT(*) FROM subscription_payments WHERE status='Active' AND amount > 0 AND date(payment_date) = ?)
       + (SELECT COUNT(*) FROM donations WHERE date(donation_date) = ?) AS v`,
      [todayIST(), todayIST()]
    ) || 0;
    const donationsToday = scalar<number>(
      `SELECT COALESCE(SUM(amount),0) FROM donations WHERE date(donation_date) = ?`,
      [todayIST()]
    ) || 0;
    const welfarePending = scalar<number>(
      `SELECT COUNT(*) FROM welfare_requests WHERE status = 'Pending'`
    ) || 0;
    const fundBalance = accounting.unifiedSummary({ period: "all" }).balance;
    return { receiptsToday, donationsToday, welfarePending, fundBalance };
  },

  // Alerts: committee terms ending soon, overdue subs count, pending welfare
  alerts: () => {
    const alerts: any[] = [];
    try {
      // Committee terms ending within 30 days
      const endingSoon = scalar<number>(
        `SELECT COUNT(*) AS v FROM committee_members
         WHERE archive_state = 0 AND status = 'Active' AND term_end IS NOT NULL
           AND term_end >= ? AND term_end <= ?`, [todayIST(), istPlusDays(30)]
      );
      if (endingSoon > 0) alerts.push({ type: "committee_ending", count: endingSoon, route: "/committee" });

      // Overdue subscriptions
      const overdueSubs = scalar<number>(
        `SELECT COUNT(*) AS v FROM subscriptions WHERE status = 'Overdue'`, []
      );
      if (overdueSubs > 0) alerts.push({ type: "subscriptions_overdue", count: overdueSubs, route: "/subscriptions" });

      // Pending welfare requests
      const pendingWelfare = scalar<number>(
        `SELECT COUNT(*) AS v FROM welfare_requests WHERE status = 'Pending'`, []
      );
      if (pendingWelfare > 0) alerts.push({ type: "welfare_pending", count: pendingWelfare, route: "/welfare" });

      // Receipt sequence gaps — deletion is blocked in-app, so gaps can only
      // mean manual DB tampering; surface it right on the dashboard.
      try {
        const seq = accounting.receiptSequence();
        if (seq.missing.length > 0) {
          alerts.push({ type: "receipt_gaps", count: seq.missing.length, missing: seq.missing, route: "/accounting" });
        }
      } catch { /* non-fatal */ }
    } catch (e) { console.warn("[alerts] Failed:", e); }
    return alerts;
  },
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
  updateEvent: (id: number, data: any) => {
    const existing = one<any>("SELECT event_date FROM token_events WHERE id = ?", [id]);
    if (!existing) throw new Error("Token event not found");
    const today = todayIST();
    // A past event is a historical record, so its date can never be moved
    // into the "today or future" (deletable) zone — that would be an escape
    // route around removeEvent's date lock. Past-to-past corrections stay
    // allowed, and future events can be edited or postponed freely. The DB
    // trigger trg_token_events_block_date_escape enforces the same rule.
    if ((existing.event_date || "") < today && String(data.eventDate || "") >= today) {
      throw new Error(
        existing.event_date
          ? "This event's date has already passed, so its date can no longer be moved to today or a future date"
          : "This event has no valid date set; enter a past date to correct the record"
      );
    }
    return run(
      `UPDATE token_events SET event_name = ?, event_type = ?, event_date = ?, event_time = ?, venue = ?, description = ? WHERE id = ?`,
      [data.eventName, data.eventType || "general", data.eventDate, data.eventTime || "", data.venue || "", data.description || "", id]
    );
  },
  // ===== Delete event — ONLY while its date has not yet passed =====
  // Once the event date is over the event and its tokens are history: this
  // method refuses, the security-ipc layer refuses first with the same
  // message, and the DB triggers (see token-guard.ts) block even an
  // external editor. Deletion is a secure action: reason required, audit
  // row written in the SAME transaction as the cascade delete.
  removeEvent: (id: number, reason: string, actor: { id: number; username: string }) => {
    const db = getDB();
    const ev = one<any>("SELECT id, event_name, event_date FROM token_events WHERE id = ?", [id]);
    if (!ev) throw new Error("Token event not found");
    const today = todayIST();
    if (!ev.event_date || ev.event_date < today) {
      throw new Error("This event's date has already passed — its records are locked and cannot be deleted");
    }
    if (!String(reason || "").trim()) throw new Error("A deletion reason is required");
    const tokenCount = scalar<number>("SELECT COUNT(*) AS v FROM token_assignments WHERE event_id = ?", [id]);
    db.transaction(() => {
      // Delete the tokens explicitly BEFORE the event row: the FK ON DELETE
      // CASCADE would also do it (foreign_keys is re-asserted ON by getDB),
      // but an explicit delete keeps this audited flow correct under any
      // pragma state. The event's date is today-or-future, so the
      // past-event triggers allow both deletes through.
      db.prepare("DELETE FROM token_assignments WHERE event_id = ?").run(id);
      db.prepare("DELETE FROM token_events WHERE id = ?").run(id);
      audit.log(
        actor.id, actor.username, "DELETE", "token_events", id,
        `Token event '${ev.event_name}' deleted (with ${tokenCount} token${tokenCount === 1 ? "" : "s"}): ${String(reason).trim()}`,
        String(reason).trim()
      );
    })();
    return { success: true, deletedTokens: tokenCount };
  },

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
  /** Resignation / expulsion of a staff member (secure action — reason and
   *  administrator password are verified at the IPC layer). The effective
   *  date and reason are preserved on the record; archived_at carries the
   *  effective date so reports can show when the service ended. */
  setStatus: (id: number, status: "Resigned" | "Expelled", effectiveDate: string, reason: string, userId: number) => {
    if (status !== "Resigned" && status !== "Expelled") {
      throw new Error("Staff status can only be set to Resigned or Expelled through this action");
    }
    const s = one<any>("SELECT id, name, staff_code, status, archive_state FROM staff WHERE id = ?", [id]);
    if (!s) throw new Error("Staff member not found");
    if (s.archive_state) throw new Error("This staff member has already left service. Restore the record first if the status needs correcting.");
    if (!reason?.trim()) throw new Error("A reason is required");
    const eff = effectiveDate || nowDate();
    return run(
      `UPDATE staff SET archive_state = 1, archive_source = 'manual', archived_at = ?, archived_by = ?, archive_reason = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [eff, userId, reason.trim(), status, id]
    );
  },
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
         AND term_end >= ? AND term_end <= ?`,
      [todayIST(), istPlusDays(30)]
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

