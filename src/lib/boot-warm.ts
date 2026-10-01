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

/** Resolved component references populated as each chunk warms under the
 *  splash screen. Rendering through getWarmedComponent() avoids React.lazy's
 *  first-mount Promise throw / <Suspense> spinner flash when entering the
 *  Dashboard after login. */
const warmedComponents: Record<string, any> = {};

export function getWarmedComponent(name: string): any {
  return warmedComponents[name] ?? null;
}

/** One loader per React.lazy() call in App.tsx, in the order the office
 *  actually meets the pages: the Dashboard (+ its recharts child) is what
 *  appears right after login, so it is warmed FIRST. The rest follow so no
 *  later navigation can hitch either. */
const CHUNK_LOADERS: ReadonlyArray<readonly [string, () => Promise<any>, string]> = [
  ["dashboard", () => import("@/pages/Dashboard"), "Dashboard"],
  ["dashboard-charts", () => import("@/pages/dashboard/DashboardCharts"), "DashboardCharts"],
  ["families", () => import("@/pages/Families"), "Families"],
  ["members", () => import("@/pages/Members"), "Members"],
  ["subscriptions", () => import("@/pages/Subscriptions"), "Subscriptions"],
  ["donations", () => import("@/pages/Donations"), "Donations"],
  ["accounting", () => import("@/pages/Accounting"), "Accounting"],
  ["tokens-manage", () => import("@/pages/TokensWithPrint"), "TokensWithPrint"],
  ["tokens-events", () => import("@/pages/TokenEvents"), "TokenEvents"],
  ["certificates", () => import("@/pages/Certificates"), "Certificates"],
  ["reports", () => import("@/pages/Reports"), "Reports"],
  ["welfare", () => import("@/pages/Welfare"), "Welfare"],
  ["marriages", () => import("@/pages/Marriages"), "Marriages"],
  ["deaths", () => import("@/pages/Deaths"), "Deaths"],
  ["assets", () => import("@/pages/Assets"), "Assets"],
  ["staff", () => import("@/pages/Staff"), "Staff"],
  ["committee", () => import("@/pages/Committee"), "Committee"],
  ["approvals", () => import("@/pages/Approvals"), "Approvals"],
  ["whatsapp", () => import("@/pages/WhatsApp"), "WhatsApp"],
  ["settings", () => import("@/pages/Settings"), "Settings"],
  ["users", () => import("@/pages/Users"), "Users"],
  ["audit", () => import("@/pages/AuditLog"), "AuditLog"],
  ["backup", () => import("@/pages/Backup"), "Backup"],
];

/** Yield to the event loop so the compositor and IPC keep breathing between
 *  chunk parses. (A setTimeout — not rAF — because the window is hidden and
 *  rAF may be throttled; a 0-ms timer is not.) */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Pre-decodes both Latin (Poppins) and Malayalam (Anek Malayalam Variable)
 *  font weights under the splash so the first keystroke in the login input
 *  and the post-login Dashboard transition never pay a synchronous HarfBuzz /
 *  font-decode stall. Bounded at 2.5 s so a missing face never blocks boot. */
export async function warmAppFonts(timeoutMs = 2_500): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const work = (async () => {
    try { await document.fonts.ready; } catch {}
    if (typeof document.fonts.load === "function") {
      await Promise.allSettled([
        document.fonts.load("400 15px Poppins"),
        document.fonts.load("500 15px Poppins"),
        document.fonts.load("600 15px Poppins"),
        document.fonts.load("700 15px Poppins"),
        document.fonts.load('400 15px "Anek Malayalam Variable"'),
        document.fonts.load('600 15px "Anek Malayalam Variable"'),
      ]);
    }
  })();
  await Promise.race([
    work,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Preloads every lazy route chunk. Never rejects: a chunk that fails to
 * warm is left for the normal React.lazy path (it will show its spinner and
 * load on demand, exactly as before).
 *
 * @param budgetMs    stop warming after this long, whatever is left over lazy-loads later
 * @param skip        loaders to leave out (tests; the uninstall-verify window)
 * @param shouldStop  optional predicate; when true, stops immediately so chunk
 *                    parsing can never run after the window has been revealed
 */
export async function warmAppChunks(opts: { budgetMs?: number; skip?: string[]; shouldStop?: () => boolean } = {}): Promise<{ warmed: number; total: number; ms: number; skipped: string[] }> {
  const started = Date.now();
  const budget = Math.max(0, opts.budgetMs ?? 12_000);
  const skip = new Set(opts.skip ?? []);
  const skipped: string[] = [];
  let warmed = 0;
  for (const [name, load, exportName] of CHUNK_LOADERS) {
    if (opts.shouldStop?.()) break;
    if (skip.has(name)) { skipped.push(name); continue; }
    if (Date.now() - started > budget) break;
    try {
      const mod = await load();
      const comp = mod?.[exportName] ?? mod?.default;
      if (comp) warmedComponents[exportName] = comp;
      warmed += 1;
    } catch (err) {
      // Best effort by design: one broken chunk must not hold the splash.
      console.warn(`[boot-warm] chunk "${name}" failed to warm (will lazy-load on demand):`, err);
    }
    if (opts.shouldStop?.()) break;
    await breathe();
  }
  return { warmed, total: CHUNK_LOADERS.length - skip.size, ms: Date.now() - started, skipped };
}
