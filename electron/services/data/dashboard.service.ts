/* Dashboard module — split out of data.service.ts (public API unchanged via the facade). */

import { all, getDB, one, scalar } from "../../db/connection.js";
import { istMonth, istPlusDays, todayIST } from "../ist-date.js";
import { accounting } from "./accounting.service.js";

function dbChangeStamp(): string {
  try {
    const db = getDB();
    const tc = (db.prepare("SELECT total_changes() AS c").get() as { c: number } | undefined)?.c ?? 0;
    return `${todayIST()}:${tc}`;
  } catch {
    return `${Date.now()}`;
  }
}

let cachedUnifiedAll: { stamp: string; value: ReturnType<typeof accounting.unifiedSummary> } | null = null;
function getUnifiedSummaryAll() {
  const stamp = dbChangeStamp();
  if (cachedUnifiedAll && cachedUnifiedAll.stamp === stamp) {
    return cachedUnifiedAll.value;
  }
  const value = accounting.unifiedSummary({ period: "all" });
  cachedUnifiedAll = { stamp, value };
  return value;
}

interface WarmDashboardSnapshot {
  stamp: string;
  summary: any;
  balance: number;
  monthlyCollections6: any[];
  incomeVsExpense6: any[];
  recentActivity8: any[];
  todayAtGlance: { receiptsToday: number; donationsToday: number; welfarePending: number; fundBalance: number };
  alerts: any[];
}
let warmSnapshot: WarmDashboardSnapshot | null = null;

export const dashboard = {
  summary: () => {
    if (warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.summary;
    const row = one<any>("SELECT * FROM v_dashboard_summary");
    return row ?? {};
  },
  incomeThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = ?", [istMonth()]),
  expenseThisMonth: () => scalar<number>("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = ?", [istMonth()]),
  // Fund balance now uses the SAME unified ledger as the Accounting page
  // (manual transactions + donations + paid subscriptions + welfare
  // disbursements + paid salaries). Previously this summed the transactions
  // table only, so the dashboard card disagreed with the Accounting balance.
  balance: () => {
    if (warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.balance;
    return getUnifiedSummaryAll().balance;
  },
  monthlyCollections: (months: number = 6) => {
    if (months === 6 && warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.monthlyCollections6;
    return all<any>(
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
    );
  },
  monthlyDonations: (months: number = 6) => all<any>(
    `WITH RECURSIVE months(m) AS (
       SELECT strftime('%Y-%m', date(?, ?))
       UNION ALL
       SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < ?
     )
     SELECT m AS month,
       COALESCE((SELECT SUM(amount) FROM donations WHERE strftime('%Y-%m', donation_date) = m AND (approval_status IS NULL OR approval_status = 'approved')), 0) AS amount
     FROM months ORDER BY m`,
    [todayIST(), `-${months - 1} months`, istMonth()]
  ),
  // Income vs Expense chart — uses the SAME unified ledger as the Accounting
  // page (manual transactions + donations + paid subscriptions + welfare
  // disbursements + paid salaries). Previously this summed the transactions
  // table only, so the chart disagreed with the Accounting page whenever a
  // donation / subscription / welfare / salary entry existed.
  incomeVsExpense: (months: number = 6) => {
    if (months === 6 && warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.incomeVsExpense6;
    return all<any>(
      `WITH RECURSIVE months(m) AS (
         SELECT strftime('%Y-%m', date(?, ?))
         UNION ALL
         SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < ?
       )
       SELECT m AS month,
         COALESCE((SELECT SUM(amount) FROM transactions WHERE type='Income' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = m), 0)
           + COALESCE((SELECT SUM(amount) FROM donations WHERE strftime('%Y-%m', donation_date) = m AND (approval_status IS NULL OR approval_status = 'approved')), 0)
           + COALESCE((SELECT SUM(amount) FROM subscription_payments WHERE status='Active' AND amount > 0 AND strftime('%Y-%m', COALESCE(payment_date, period_start)) = m), 0)
         AS income,
         COALESCE((SELECT SUM(amount) FROM transactions WHERE type='Expense' AND (status IS NULL OR status != 'Void') AND strftime('%Y-%m', txn_date) = m), 0)
           + COALESCE((SELECT SUM(amount_approved) FROM welfare_requests WHERE status='Disbursed' AND strftime('%Y-%m', COALESCE(disbursed_date, created_at)) = m), 0)
           + COALESCE((SELECT SUM(amount) FROM staff_payments WHERE status='Paid' AND strftime('%Y-%m', payment_date) = m), 0)
         AS expense
       FROM months ORDER BY m`,
      [todayIST(), `-${months - 1} months`, istMonth()]
    );
  },
  recentActivity: (limit: number = 10) => {
    if (limit === 8 && warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.recentActivity8;
    return all<any>(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, [limit]
    );
  },

  // Real data for the "Today at a Glance" card (no more hardcoded values).
  todayAtGlance: () => {
    if (warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.todayAtGlance;
    const receiptsToday = scalar<number>(
      `SELECT (SELECT COUNT(*) FROM subscription_payments WHERE status='Active' AND amount > 0 AND date(payment_date) = ?)
       + (SELECT COUNT(*) FROM donations WHERE date(donation_date) = ? AND (approval_status IS NULL OR approval_status = 'approved')) AS v`,
      [todayIST(), todayIST()]
    ) || 0;
    const donationsToday = scalar<number>(
      `SELECT COALESCE(SUM(amount),0) FROM donations WHERE date(donation_date) = ? AND (approval_status IS NULL OR approval_status = 'approved')`,
      [todayIST()]
    ) || 0;
    const welfarePending = scalar<number>(
      `SELECT COUNT(*) FROM welfare_requests WHERE status = 'Pending'`
    ) || 0;
    const fundBalance = getUnifiedSummaryAll().balance;
    return { receiptsToday, donationsToday, welfarePending, fundBalance };
  },

  // Alerts: committee terms ending soon, overdue subs count, pending welfare
  alerts: () => {
    if (warmSnapshot && warmSnapshot.stamp === dbChangeStamp()) return warmSnapshot.alerts;
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

  /** Pre-computes all Dashboard queries under the splash screen so the first
   *  render after login resolves from memory with zero SQLite table-scan lag. */
  warmCache: () => {
    try {
      warmSnapshot = null;
      const summary = dashboard.summary();
      const balance = dashboard.balance();
      const monthlyCollections6 = dashboard.monthlyCollections(6);
      const incomeVsExpense6 = dashboard.incomeVsExpense(6);
      const recentActivity8 = dashboard.recentActivity(8);
      const todayAtGlance = dashboard.todayAtGlance();
      const alerts = dashboard.alerts();
      warmSnapshot = {
        stamp: dbChangeStamp(),
        summary,
        balance,
        monthlyCollections6,
        incomeVsExpense6,
        recentActivity8,
        todayAtGlance,
        alerts,
      };
    } catch { /* non-fatal */ }
  },

  /** Called right after a login updates users.last_login_at + audit_log so the
   *  pre-warmed financial/member aggregates stay valid for the post-login mount
   *  while recentActivity reflects the new login row. */
  refreshWarmStampAfterLogin: () => {
    if (!warmSnapshot) return;
    try {
      const recentActivity8 = all<any>(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, [8]);
      const stamp = dbChangeStamp();
      warmSnapshot = { ...warmSnapshot, stamp, recentActivity8 };
      if (cachedUnifiedAll) cachedUnifiedAll = { ...cachedUnifiedAll, stamp };
    } catch {
      warmSnapshot = null;
    }
  },
};
