/*
 * Splash-time renderer warm-up (v2.6.3 freeze fix — office report: after the
 * login page appears, typing echoes late and scrolling dies for a few seconds
 * on mid-range machines).
 *
 * ROOT CAUSE: every app page is a React.lazy chunk, and nothing used to load
 * those chunks before the window was revealed. The moment the user logged in
 * (or first opened any page) the renderer's main thread paused to fetch,
 * parse and module-init that chunk — the biggest being DashboardCharts
 * (recharts ≈ 300 kB), which lands seconds AFTER the login succeeded. On a
 * mid-range CPU that parse is a multi-second input freeze: keys appear to
 * not type, lists appear to not scroll.
 *
 * FIX: while the native splash is still covering the (hidden) window —
 * i.e. BEFORE win:renderer-ready is sent — import every lazy chunk once.
 * The browser module map caches each evaluation, so the later React.lazy()
 * call resolves instantly and no navigation can jank again. The cost is paid
 * as splash time on every machine, fast or slow, exactly as requested:
 * "paint everything behind the splash; after the main window comes, no lag".
 *
 * The warm-up is deliberately SEQUENTIAL with a compositor yield between
 * chunks (not Promise.all): one parse at a time keeps total memory flat,
 * avoids one giant GC pause right before reveal, and keeps the hidden page
 * painting so the final two-frame check stays honest. A time budget bounds
 * the whole thing so a pathological machine can never strand the splash —
 * any chunk not warmed within the budget simply lazy-loads the old way.
 */

/** One loader per React.lazy() call in App.tsx, in the order the office
 *  actually meets the pages: the Dashboard (+ its recharts child) is what
 *  appears right after login, so it is warmed FIRST. The rest follow so no
 *  later navigation can hitch either. */
const CHUNK_LOADERS: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
  ["dashboard", () => import("@/pages/Dashboard")],
  ["dashboard-charts", () => import("@/pages/dashboard/DashboardCharts")],
  ["families", () => import("@/pages/Families")],
  ["members", () => import("@/pages/Members")],
  ["subscriptions", () => import("@/pages/Subscriptions")],
  ["donations", () => import("@/pages/Donations")],
  ["accounting", () => import("@/pages/Accounting")],
  ["tokens-manage", () => import("@/pages/TokensWithPrint")],
  ["tokens-events", () => import("@/pages/TokenEvents")],
  ["certificates", () => import("@/pages/Certificates")],
  ["reports", () => import("@/pages/Reports")],
  ["welfare", () => import("@/pages/Welfare")],
  ["marriages", () => import("@/pages/Marriages")],
  ["deaths", () => import("@/pages/Deaths")],
  ["assets", () => import("@/pages/Assets")],
  ["staff", () => import("@/pages/Staff")],
  ["committee", () => import("@/pages/Committee")],
  ["approvals", () => import("@/pages/Approvals")],
  ["whatsapp", () => import("@/pages/WhatsApp")],
  ["settings", () => import("@/pages/Settings")],
  ["users", () => import("@/pages/Users")],
  ["audit", () => import("@/pages/AuditLog")],
  ["backup", () => import("@/pages/Backup")],
];

/** Yield to the event loop so the compositor and IPC keep breathing between
 *  chunk parses. (A setTimeout — not rAF — because the window is hidden and
 *  rAF may be throttled; a 0-ms timer is not.) */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Preloads every lazy route chunk. Never rejects: a chunk that fails to
 * warm is left for the normal React.lazy path (it will show its spinner and
 * load on demand, exactly as before).
 *
 * @param budgetMs  stop warming after this long, whatever is left over lazy-loads later
 * @param skip      loaders to leave out (tests; the uninstall-verify window)
 */
export async function warmAppChunks(opts: { budgetMs?: number; skip?: string[] } = {}): Promise<{ warmed: number; total: number; ms: number; skipped: string[] }> {
  const started = Date.now();
  const budget = Math.max(0, opts.budgetMs ?? 12_000);
  const skip = new Set(opts.skip ?? []);
  const skipped: string[] = [];
  let warmed = 0;
  for (const [name, load] of CHUNK_LOADERS) {
    if (skip.has(name)) { skipped.push(name); continue; }
    if (Date.now() - started > budget) break;
    try {
      await load();
      warmed += 1;
    } catch (err) {
      // Best effort by design: one broken chunk must not hold the splash.
      console.warn(`[boot-warm] chunk "${name}" failed to warm (will lazy-load on demand):`, err);
    }
    await breathe();
  }
  return { warmed, total: CHUNK_LOADERS.length - skip.size, ms: Date.now() - started, skipped };
}
