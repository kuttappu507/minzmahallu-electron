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
 *
 * v2.6.11 — REDESIGN (field verdict on v2.6.5–v2.6.10: the splash still sat
 * for many seconds and the first login keystrokes were still swallowed on
 * mid-range machines):
 *   1. The login page is a STATIC import — it needs ZERO lazy chunks. Full-
 *      app warming before the reveal was pure splash delay, and the 15 s
 *      fire cap could cut the parse mid-chunk and reveal exactly under the
 *      user's first keystrokes (the reported "words will not come / after
 *      some words it stops"). Pre-reveal warming is GONE.
 *   2. All 23 chunks now warm in the BACKGROUND after win:renderer-ready,
 *      one chunk per slice, PAUSED whenever the user has interacted in the
 *      last ~1.2 s (keydown/pointer/wheel). Parsing can therefore never
 *      compete with typing again — it only runs in the gaps the user
 *      leaves. Dashboard (the post-login landing page, a small chunk) is
 *      warmed unconditionally first; recharts (DashboardCharts, the one
 *      heavy parse) waits for a real idle gap like everything else.
 */

// ---------------------------------------------------------------------------
// Interaction tracker — feeds the background warmer's pause gate.
// Installed ONCE at module load (passive, capture) so every key press, click,
// scroll or touch marks "the user is doing something". The warmer only parses
// while the machine has been quiet — chunk parses can then never land under
// an active keystroke, which is exactly the v2.6.1/v2.6.7 regression class.
// ---------------------------------------------------------------------------
let lastInteractionAt = 0;
let interactionArmed = false;

export function markInteractionForTests(): void {
  lastInteractionAt = Date.now();
}

export function resetInteractionForTests(): void {
  lastInteractionAt = 0;
}

/** True when the user interacted within the last `quietMs` (default 1.2 s). */
export function userRecentlyInteracted(quietMs = 1_200): boolean {
  if (!lastInteractionAt) return false;
  return Date.now() - lastInteractionAt < quietMs;
}

function armInteractionTracking(): void {
  if (interactionArmed || typeof window === "undefined") return;
  interactionArmed = true;
  const mark = () => { lastInteractionAt = Date.now(); };
  try {
    window.addEventListener("keydown", mark, { capture: true, passive: true });
    window.addEventListener("pointerdown", mark, { capture: true, passive: true });
    window.addEventListener("wheel", mark, { capture: true, passive: true });
    window.addEventListener("touchstart", mark, { capture: true, passive: true });
  } catch { /* ancient bridge — warming just never pauses */ }
}

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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
export type ChunkLoader = readonly [string, () => Promise<any>, string];

export async function warmAppChunks(opts: { budgetMs?: number; skip?: string[]; shouldStop?: () => boolean; loaders?: ReadonlyArray<ChunkLoader> } = {}): Promise<{ warmed: number; total: number; ms: number; skipped: string[] }> {
  const started = Date.now();
  const budget = Math.max(0, opts.budgetMs ?? 12_000);
  const skip = new Set(opts.skip ?? []);
  const skipped: string[] = [];
  let warmed = 0;
  for (const [name, load, exportName] of opts.loaders ?? CHUNK_LOADERS) {
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

// ---------------------------------------------------------------------------
// BACKGROUND CHUNK WARMER (v2.6.11) — the post-reveal successor of the old
// splash-time warm-up. Runs AFTER win:renderer-ready has been sent, so the
// login window is on screen while it works, and PAUSES between chunks while
// the user is typing/clicking/scrolling. A parse can therefore never land
// under an active keystroke again — the machine's own idle gaps absorb the
// work. Never rejects; safe to fire-and-forget from App.tsx.
// ---------------------------------------------------------------------------

/** How long the warmer waits between chunks while the user is active before
 *  re-checking. 200 ms keeps the re-check cost invisible and the response to
 *  a pause instant. */
const PAUSE_RECHECK_MS = 200;
/** Idle gap left between consecutive chunk parses while the user is quiet —
 *  keeps every parse in its own macrotask so input and paints always win. */
const SLICE_GAP_MS = 250;
/** The one small chunk that may parse unconditionally right after the reveal:
 *  the Dashboard page itself (the post-login landing route). It is a small
 *  parse (~tens of ms) and warming it means the login → dashboard transition
 *  is instant even for a user who never stops typing. Everything heavier —
 *  recharts above all — waits for a real idle gap. */
const CRITICAL_FIRST = ["dashboard"];

export async function warmAppChunksBackground(opts: { loaders?: ReadonlyArray<ChunkLoader>; quietMs?: number; sliceGapMs?: number; shouldStop?: () => boolean } = {}): Promise<{ warmed: number; total: number }> {
  armInteractionTracking();
  const quietMs = opts.quietMs ?? 1_200;
  const sliceGap = opts.sliceGapMs ?? SLICE_GAP_MS;
  const loaders = opts.loaders ?? CHUNK_LOADERS;
  const critical = loaders.filter(([name]) => CRITICAL_FIRST.includes(name));
  const rest = loaders.filter(([name]) => !CRITICAL_FIRST.includes(name));
  let warmed = 0;
  // Wait for a quiet moment before the FIRST parse too — the reveal itself
  // can coincide with the user's first click into the username field.
  while (userRecentlyInteracted(quietMs)) {
    if (opts.shouldStop?.()) return { warmed, total: loaders.length };
    await wait(PAUSE_RECHECK_MS);
  }
  for (const [name, load, exportName] of [...critical, ...rest]) {
    if (opts.shouldStop?.()) break;
    const isCritical = CRITICAL_FIRST.includes(name);
    // Pause gate: while the user interacts, do NOTHING between chunks. The
    // critical dashboard chunk skips this gate (small parse, post-login
    // landing page) — everything else respects it absolutely.
    if (!isCritical) {
      while (userRecentlyInteracted(quietMs)) {
        if (opts.shouldStop?.()) return { warmed, total: loaders.length };
        await wait(PAUSE_RECHECK_MS);
      }
    }
    try {
      const mod = await load();
      const comp = mod?.[exportName] ?? mod?.default;
      if (comp) warmedComponents[exportName] = comp;
      warmed += 1;
    } catch (err) {
      console.warn(`[boot-warm] background chunk "${name}" failed to warm (will lazy-load on demand):`, err);
    }
    if (opts.shouldStop?.()) break;
    await wait(sliceGap);
  }
  return { warmed, total: loaders.length };
}
