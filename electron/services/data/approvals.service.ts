/* Approvals module — the pending-approval queue for the role-based
 * permission model (V037).
 *
 * Member accounts can hand in donations/subscriptions; Staff accounts can
 * additionally add nikah, death, families and members. Entries created by
 * those roles land with approval_status='pending' and are NOT counted in
 * any ledger, dashboard or printed register until an Administrator or
 * Secretary approves them here. Rejecting removes the entry (it was never
 * official) and records the decision in the audit log.
 */
import { all, one, run, getDB } from "../../db/connection.js";
import { subscriptions } from "./subscriptions.service.js";

/** The tables that participate in the approval workflow. */
const KINDS = ["donations", "subscriptions", "families", "members", "marriages", "deaths"] as const;
export type ApprovalKind = (typeof KINDS)[number];

function isKind(kind: string): kind is ApprovalKind {
  return (KINDS as readonly string[]).includes(kind);
}

const TABLE: Record<ApprovalKind, string> = {
  donations: "donations",
  subscriptions: "subscriptions",
  families: "families",
  members: "members",
  marriages: "marriages",
  deaths: "deaths",
};

/** Human-readable summary per kind (bilingual handled in the UI; here we
 *  return the primary identifying text + amount where relevant). */
function labelFor(kind: ApprovalKind, row: any): { title: string; detail: string; amount: number | null } {
  switch (kind) {
    case "donations":
      return { title: row.donor_name || "—", detail: `${row.donation_date || ""} · ${row.payment_method || ""} · ${row.purpose || ""}`.trim(), amount: Number(row.amount || 0) };
    case "subscriptions":
      return { title: row.house_name || `Family #${row.family_id}`, detail: `${row.period_start || ""} → ${row.period_end || ""}${Number(row.pending_amount_paid || 0) > 0 ? ` · payment ₹${Number(row.pending_amount_paid).toFixed(2)}` : ""}`, amount: Number(row.pending_amount_paid || row.amount || 0) };
    case "families":
      return { title: row.house_name || "—", detail: `${row.family_number || ""} · ${row.area || ""} · ${row.ward || ""}`.trim(), amount: null };
    case "members":
      return { title: row.name || "—", detail: `${row.member_code || ""} · ${row.relationship || ""}`, amount: null };
    case "marriages":
      return { title: `${row.bride_name || "—"} & ${row.groom_name || "—"}`, detail: `${row.marriage_number || ""} · ${row.nikah_date || ""}`, amount: null };
    case "deaths":
      return { title: row.deceased_name || "—", detail: `${row.death_number || ""} · ${row.date_of_death || ""}`, amount: null };
  }
}

export const approvals = {
  /** Every pending entry, newest first, with a unified display shape. */
  list: () => {
    const rows: any[] = [];
    const kindQueries: Record<ApprovalKind, string> = {
      donations: `SELECT d.*, c.name AS category_name FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id WHERE d.approval_status = 'pending' ORDER BY d.id DESC`,
      subscriptions: `SELECT s.*, f.house_name, f.family_number FROM subscriptions s LEFT JOIN families f ON f.id = s.family_id WHERE s.approval_status = 'pending' ORDER BY s.id DESC`,
      families: `SELECT * FROM families WHERE approval_status = 'pending' ORDER BY id DESC`,
      members: `SELECT m.*, f.house_name AS family_house_name FROM members m LEFT JOIN families f ON f.id = m.family_id WHERE m.approval_status = 'pending' ORDER BY m.id DESC`,
      marriages: `SELECT * FROM marriages WHERE approval_status = 'pending' ORDER BY id DESC`,
      deaths: `SELECT * FROM deaths WHERE approval_status = 'pending' ORDER BY id DESC`,
    };
    for (const kind of KINDS) {
      for (const row of all<any>(kindQueries[kind], [])) {
        const label = labelFor(kind, row);
        rows.push({
          kind,
          id: row.id,
          title: label.title,
          detail: label.detail,
          amount: label.amount,
          createdAt: row.created_at || row.donation_date || row.nikah_date || row.date_of_death || "",
        });
      }
    }
    return { rows, total: rows.length };
  },

  /** Count of pending entries — for the sidebar badge. */
  pendingCount: (): number =>
    KINDS.reduce((sum, kind) => sum + (one<{ c: number }>(`SELECT COUNT(*) AS c FROM ${TABLE[kind]} WHERE approval_status = 'pending'`)?.c ?? 0), 0),

  /** Approve a pending entry. For a subscription with a parked first
   *  payment, the payment is applied NOW through the standard allocation
   *  (receipt number minted, money finally counted). */
  approve: (kind: string, id: number, actor: { id: number; username: string } | null) => {
    if (!isKind(kind)) throw new Error("Unknown entry type");
    const table = TABLE[kind];
    const row = one<any>(`SELECT * FROM ${table} WHERE id = ? AND approval_status = 'pending'`, [id]);
    if (!row) throw new Error("Pending entry not found (it may already have been approved or rejected)");
    if (kind === "subscriptions") {
      const parked = Number(row.pending_amount_paid || 0);
      run(`UPDATE subscriptions SET approval_status = 'approved', updated_at = datetime('now') WHERE id = ?`, [id]);
      if (parked > 0) {
        subscriptions.applyPayment(id, {
          amountPaid: parked,
          paymentMethod: row.pending_payment_method || "Cash",
          paymentDate: row.pending_payment_date || undefined,
          collectedBy: actor?.id,
        });
        run(`UPDATE subscriptions SET pending_amount_paid = NULL, pending_payment_method = NULL, pending_payment_date = NULL WHERE id = ?`, [id]);
      }
    } else {
      run(`UPDATE ${table} SET approval_status = 'approved' WHERE id = ?`, [id]);
    }
    return { success: true, kind, id };
  },

  /** Reject = the entry was never official, so it is removed outright and
   *  the decision is auditable. */
  reject: (kind: string, id: number, reason: string, actor: { id: number; username: string } | null) => {
    if (!isKind(kind)) throw new Error("Unknown entry type");
    const table = TABLE[kind];
    const row = one<any>(`SELECT * FROM ${table} WHERE id = ? AND approval_status = 'pending'`, [id]);
    if (!row) throw new Error("Pending entry not found (it may already have been approved or rejected)");
    const tx = getDB().transaction(() => {
      run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      return true;
    });
    tx();
    return { success: true, kind, id, reason: String(reason || "").trim() };
  },
};
