import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ToastContainer } from "@/components/ToastContainer";
import { CloseConfirmDialog } from "@/components/CloseConfirmDialog";
import UpdateBanner from "@/components/UpdateBanner";
import "@fontsource-variable/anek-malayalam/wght.css";
import "@/styles/globals.css";
import { LoginPage } from "@/pages/LoginPage";
import { UninstallConfirm } from "@/pages/UninstallConfirm";

// Lazy-load all page components so the initial bundle is smaller.
// Each page loads on-demand when first navigated to.
const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
const Families = lazy(() => import("@/pages/Families").then(m => ({ default: m.Families })));
const Members = lazy(() => import("@/pages/Members").then(m => ({ default: m.Members })));
const Staff = lazy(() => import("@/pages/Staff").then(m => ({ default: m.Staff })));
const Committee = lazy(() => import("@/pages/Committee").then(m => ({ default: m.Committee })));
const Subscriptions = lazy(() => import("@/pages/Subscriptions").then(m => ({ default: m.Subscriptions })));
const Donations = lazy(() => import("@/pages/Donations").then(m => ({ default: m.Donations })));
const WhatsApp = lazy(() => import("@/pages/WhatsApp").then(m => ({ default: m.WhatsApp })));
const Accounting = lazy(() => import("@/pages/Accounting").then(m => ({ default: m.Accounting })));
const Assets = lazy(() => import("@/pages/Assets").then(m => ({ default: m.Assets })));
const Marriages = lazy(() => import("@/pages/Marriages").then(m => ({ default: m.Marriages })));
const Deaths = lazy(() => import("@/pages/Deaths").then(m => ({ default: m.Deaths })));
const Welfare = lazy(() => import("@/pages/Welfare").then(m => ({ default: m.Welfare })));
const Certificates = lazy(() => import("@/pages/Certificates").then(m => ({ default: m.Certificates })));
const TokensWithPrint = lazy(() => import("@/pages/TokensWithPrint").then(m => ({ default: m.TokensWithPrint })));
const TokenEvents = lazy(() => import("@/pages/TokenEvents").then(m => ({ default: m.TokenEvents })));
const Reports = lazy(() => import("@/pages/Reports").then(m => ({ default: m.Reports })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));
const Users = lazy(() => import("@/pages/Users").then(m => ({ default: m.Users })));
const AuditLog = lazy(() => import("@/pages/AuditLog").then(m => ({ default: m.AuditLog })));
const Backup = lazy(() => import("@/pages/Backup").then(m => ({ default: m.Backup })));
const Approvals = lazy(() => import("@/pages/Approvals").then(m => ({ default: m.Approvals })));
import { useEffect } from "react";
import { transliterateMalayalam } from "@/lib/malayalamTransliteration";
import { setCurrencySymbol } from "@/lib/utils";
import { warmAppChunks } from "@/lib/boot-warm";

/** Auto-capitalization lives in src/lib/auto-capitalize.ts (wired from
 *  main.tsx, v2.2.1): one document-level focusout listener with data-nocap
 *  opt-outs. Nothing else needed here. */
function OfflineMalayalamLayer() {
  const { lang } = useI18n();
  useEffect(() => {
    if (lang !== "ml") return;
    const shouldTransliterate = (el: HTMLInputElement | HTMLTextAreaElement) => {
      const text = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
      return /(name|address|house|event|venue|description|family|member|head|father|mother|spouse|groom|bride|witness|place|remarks|reason|mahallu)/.test(text);
    };
    // Manglish → Malayalam on ENTER only. Converting on every keystroke
    // mangles partial words mid-typing ("nan", "mahall") and makes editing
    // impossible — the user types freely and presses Enter to convert.
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const el = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (!el || !shouldTransliterate(el) || el.dataset.mlTransliterateBusy === "1") return;
      if (!/[a-z]/i.test(el.value) || /[\u0D00-\u0D7F]/.test(el.value)) return;
      const next = transliterateMalayalam(el.value);
      if (next === el.value) return;
      event.preventDefault();
      el.dataset.mlTransliterateBusy = "1";
      el.value = next;
      const caret = next.length;
      el.setSelectionRange(caret, caret);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      delete el.dataset.mlTransliterateBusy;
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [lang]);
  return null;
}

function ProtectedLayout() {
  const location = useLocation();
  useEffect(() => { document.body.classList.toggle("route-accounting", location.pathname === "/accounting"); return () => document.body.classList.remove("route-accounting"); }, [location.pathname]);
  return <div id="app" className="app-shell"><Topbar /><div className="app-body"><Sidebar /><div className="maincol"><div id="content"><Suspense fallback={<div className="flex items-center justify-center h-64"><div className="spinner-sm" /></div>}><Routes>
    <Route path="/" element={<Dashboard />} /><Route path="/families" element={<Families />} /><Route path="/members" element={<Members />} /><Route path="/staff" element={<Staff />} /><Route path="/committee" element={<Committee />} /><Route path="/subscriptions" element={<Subscriptions />} /><Route path="/donations" element={<Donations />} /><Route path="/whatsapp" element={<WhatsApp />} /><Route path="/accounting" element={<Accounting />} /><Route path="/assets" element={<Assets />} /><Route path="/marriages" element={<Marriages />} /><Route path="/deaths" element={<Deaths />} /><Route path="/welfare" element={<Welfare />} /><Route path="/certificates" element={<Certificates />} /><Route path="/tokens" element={<TokenEvents />} /><Route path="/tokens/manage" element={<TokensWithPrint />} /><Route path="/reports" element={<Reports />} /><Route path="/approvals" element={<Approvals />} /><Route path="/settings" element={<Settings />} /><Route path="/users" element={<Users />} /><Route path="/audit" element={<AuditLog />} /><Route path="/backup" element={<Backup />} />
  </Routes></Suspense></div></div></div></div>;
}

function LanguagePersistence() {
  const { lang } = useI18n();
  useEffect(() => { let cancelled = false; (async () => { try { const current = await window.mms.settings.load(); if (!cancelled && current) { setCurrencySymbol(current.currency_symbol); if (current.language !== lang) await window.mms.settings.save({ mahalluName: current.mahallu_name, address: current.address, phone: current.phone, email: current.email, financialYearStart: current.financial_year_start, currencySymbol: current.currency_symbol, theme: current.theme, language: lang, autoBackup: !!current.auto_backup, backupIntervalHours: current.backup_interval_hours, receiptPrefix: current.receipt_prefix }); } } catch (err) { console.warn("Could not persist active language:", err); } })(); return () => { cancelled = true; }; }, [lang]);
  return null;
}

export default function App() {
  const { apply } = useTheme(); const { user } = useAuth();
  useEffect(() => { apply(); }, [apply]);
  /* Uninstaller mode (?uninstall=1): the NSIS gate launched us with
     --verify-uninstall — render ONLY the admin-password verify page.
     No splash, no login, nothing else boots. */
  const isUninstallMode = new URLSearchParams(window.location.search).get("uninstall") === "1";
  /* Task 47 — SINGLE-splash boot. The renderer-side splash overlay is GONE:
     the only splash is the native one, which the main process shows before
     any boot work. This window is created hidden (show:false) and stays
     hidden until the REAL UI has mounted and painted; then we tell the main
     process to reveal the complete window, so the user goes splash →
     complete window with nothing in between (no dummy splash, no
     semi-transparent frozen frame). */
  useEffect(() => {
    if (isUninstallMode) { document.body.classList.add("app-loaded"); return; }
    document.body.classList.add("app-loaded");
    const notify = () => { try { window.mms?.win?.rendererReady(); } catch { /* bridge absent (browser dev preview) */ } };
    // v2.6.3 — tell the main process immediately that a HEALTHY renderer is
    // up. Its post-startup fallback force-reveals ~6 s after page load when
    // the renderer stays silent (dead bridge / early JS error); with the
    // warm-up below the ready signal now legitimately takes longer than that,
    // so the fallback must be able to tell "alive and warming" from "wedged".
    try { window.mms?.win?.rendererAlive?.(); } catch { /* bridge absent (browser dev preview) */ }
    // v2.6.1 — FULL-PAINT signal (extended v2.6.3 — FULL-BOOT signal). The
    // old "mount + 120 ms beat" fired before the fonts had swapped in on
    // slower machines; the window is now revealed only after
    //   1. fonts are ready AND two frames have composited, AND
    //   2. warmAppChunks() has pre-parsed every lazy page chunk (recharts,
    //      framer-motion, …) BEHIND the splash — that parse used to run
    //      right after login and freeze typing/scrolling on mid-range PCs.
    // Both halves are bounded so the reveal can NEVER land mid-warm-up
    // (v2.6.7 — the reported "one time freeze when inputing login details"):
    // the warm-up budget (9 s) only STARTS after fonts.ready, so a slow
    // fonts phase used to push the chunk parses past the 15 s cap below —
    // the cap fired, the window revealed, and the user typed into a renderer
    // that was still parsing recharts. fonts (≤ ~4 s under an antivirus
    // scan) + warm-up (≤ 9 s) now always finish inside the 15 s cap, and
    // the main process's alive-renderer force fallback sits even further
    // out at 30 s. A wedged fonts.ready or a pathological chunk can never
    // strand the splash.
    let done = false;
    let cap: ReturnType<typeof setTimeout> | null = null;
    let beat: ReturnType<typeof setTimeout> | null = null;
    const fire = () => { if (done) return; done = true; notify(); };
    const go = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (done) return;
        void (async () => {
          // Dev keeps lazy chunks lazy (vite serves them on demand and dev
          // iteration values fast reloads); packaged builds warm everything.
          if (!import.meta.env.DEV) {
            try { await warmAppChunks({ budgetMs: 9_000 }); }
            catch { /* best effort — a failed chunk lazy-loads on demand later */ }
          }
          if (done) return;
          beat = setTimeout(fire, 120); // one beat past the second painted frame
          if (cap) { clearTimeout(cap); cap = null; }
        })();
      }));
    };
    cap = setTimeout(fire, 15_000);
    if (document.fonts?.ready) { document.fonts.ready.then(go, go); } else { go(); }
    return () => { done = true; if (cap) clearTimeout(cap); if (beat) clearTimeout(beat); };
  }, [isUninstallMode]);
  if (isUninstallMode) {
    return <UninstallConfirm />;
  }
  return <><LanguagePersistence /><OfflineMalayalamLayer /><Routes><Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} /><Route path="/*" element={user ? <ProtectedLayout /> : <Navigate to="/login" />} /></Routes><ToastContainer /><UpdateBanner /><CloseConfirmDialog /></>;
}
