/* ============================================================================
 * Preview mock (DEV ONLY) — lets the renderer run in a plain browser so the
 * full UI can be reviewed in the Vite dev server without the Electron bridge.
 *
 * Enabled ONLY when the URL contains ?preview=1 in a DEV build:
 *   http://localhost:5174/?preview=1
 *
 * It installs a Proxy-backed window.mms that returns realistic data for the
 * shell + dashboard and safe empty/default responses for everything else, so
 * every screen renders its design (tables show the empty state, etc.).
 * This file is dead code in production builds (never imported there).
 * ========================================================================== */

export function installPreviewMock() {
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.mms) return;

  const adminUser = {
    id: 1,
    username: "admin",
    fullName: "System Administrator",
    role: "Administrator",
    isActive: true,
    mustChangePwd: false,
    initials: "SA",
  };

  const dashboard = {
    summary: () => ({
      total_families: 12,
      total_members: 37,
      active_members: 35,
      monthly_collection: 18500,
      pending_dues: 3200,
      monthly_donations: 12400,
      marriages_this_year: 3,
      deaths_this_year: 2,
    }),
    balance: () => 396500,
    monthlyCollections: () => [
      { month: "2026-03", amount: 16800 },
      { month: "2026-04", amount: 17250 },
      { month: "2026-05", amount: 15900 },
      { month: "2026-06", amount: 18100 },
      { month: "2026-07", amount: 17650 },
      { month: "2026-08", amount: 18500 },
    ],
    incomeVsExpense: () => [
      { month: "2026-03", income: 22100, expense: 8900 },
      { month: "2026-04", income: 23400, expense: 10400 },
      { month: "2026-05", income: 19800, expense: 9600 },
      { month: "2026-06", income: 24600, expense: 11300 },
      { month: "2026-07", income: 22900, expense: 10700 },
      { month: "2026-08", income: 26200, expense: 11800 },
    ],
    recentActivity: () => [
      { id: 1, action: "created", entity_type: "member", entity_id: 12, username: "admin", changed_at: "2026-08-29 18:42:11", summary: "Added member Ayaan Rahman" },
      { id: 2, action: "created", entity_type: "donation", entity_id: 8, username: "treasurer", changed_at: "2026-08-29 17:15:03", summary: "Recorded donation ₹2,500" },
      { id: 3, action: "updated", entity_type: "family", entity_id: 4, username: "secretary", changed_at: "2026-08-28 11:20:47", summary: "Updated family FAM-004" },
      { id: 4, action: "created", entity_type: "certificate", entity_id: 5, username: "secretary", changed_at: "2026-08-27 15:05:22", summary: "Issued certificate CERT-2025-0005" },
    ],
    alerts: () => [
      { type: "subscriptions_overdue", count: 3 },
      { type: "welfare_pending", count: 2 },
    ],
    todayAtGlance: () => ({
      receiptsToday: 6,
      welfarePending: 2,
      fundBalance: 396500,
      backupEnabled: true,
      lastBackup: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      nextBackup: new Date(Date.now() + 19 * 3600 * 1000).toISOString(),
    }),
  };

  const settings = {
    load: () => ({
      mahallu_name: "Minz Mahallu Juma Masjid",
      address: "Moozhikkal, Kozhikode, Kerala 673011",
      phone: "0495-2400000",
      email: "office@minzmahallu.org",
      financial_year_start: "04-01",
      currency_symbol: "₹",
      theme: "light",
      language: "en",
      auto_backup: true,
      backup_interval_hours: 24,
      receipt_prefix: "TXN-",
    }),
    save: () => ({ success: true }),
  };

  const auth = {
    setupStatus: () => ({ required: false }),
    login: async () => ({ success: true, user: adminUser }),
    logout: () => ({ success: true }),
    changePassword: () => ({ success: true }),
    verifyAdminPassword: () => ({ success: true }),
    createInitialAdministrator: () => ({ success: true, user: adminUser }),
  };

  const win = {
    minimize: () => ({}),
    maximize: () => ({}),
    close: () => ({}),
  };

  // Heuristic fallback: any other mms.<module>.<method> returns a safe default.
  // List-ish methods → empty array (pages read the array directly or fall back
  // to []); everything else → a neutral success object.
  const base: Record<string, unknown> = { dashboard, settings, auth, win };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === "then") return undefined; // avoid thenable detection
      const key = String(prop);
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        const name = key.toLowerCase();
        if (/list|rows|items|history|activity|search|positions|types|categories|notifications|backups|events|payments/.test(name)) {
          return Promise.resolve([]);
        }
        if (/summary|stats|balance|count|total|overview|verify|receipt/.test(name)) {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      };
    },
  };

  anyWin.mms = new Proxy(base, handler);
  console.info("[preview-mock] window.mms installed (dev preview only)");
}
