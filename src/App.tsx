import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ToastContainer } from "@/components/ToastContainer";
import { Splash } from "@/components/Splash";
import "@fontsource-variable/anek-malayalam/wght.css";
import "@/styles/visual-enhancement.css";
import "@/styles/layout-stability.css";
import "@/styles/global-search.css";
import "@/styles/topbar-fixes.css";
import "@/styles/branding.css";
import { LoginPage } from "@/pages/LoginPage";
import { Dashboard } from "@/pages/Dashboard";
import { Families } from "@/pages/Families";
import { Members } from "@/pages/Members";
import { Subscriptions } from "@/pages/Subscriptions";
import { Donations } from "@/pages/Donations";
import { Accounting } from "@/pages/Accounting";
import { Marriages } from "@/pages/Marriages";
import { Deaths } from "@/pages/Deaths";
import { Welfare } from "@/pages/Welfare";
import { Certificates } from "@/pages/Certificates";
import { TokensWithPrint } from "@/pages/TokensWithPrint";
import { TokenEvents } from "@/pages/TokenEvents";
import { Reports } from "@/pages/Reports";
import { Settings } from "@/pages/Settings";
import { Users } from "@/pages/Users";
import { AuditLog } from "@/pages/AuditLog";
import { Backup } from "@/pages/Backup";
import { useEffect, useState } from "react";

function ProtectedLayout() {
  const location = useLocation();
  useEffect(() => {
    document.body.classList.toggle("route-accounting", location.pathname === "/accounting");
    return () => document.body.classList.remove("route-accounting");
  }, [location.pathname]);

  return <div id="app" className="app-shell"><Sidebar /><div className="maincol"><Topbar /><div id="content"><Routes>
    <Route path="/" element={<Dashboard />} /><Route path="/families" element={<Families />} /><Route path="/members" element={<Members />} />
    <Route path="/subscriptions" element={<Subscriptions />} /><Route path="/donations" element={<Donations />} /><Route path="/accounting" element={<Accounting />} />
    <Route path="/marriages" element={<Marriages />} /><Route path="/deaths" element={<Deaths />} /><Route path="/welfare" element={<Welfare />} />
    <Route path="/certificates" element={<Certificates />} /><Route path="/tokens" element={<TokenEvents />} /><Route path="/tokens/manage" element={<TokensWithPrint />} />
    <Route path="/reports" element={<Reports />} /><Route path="/settings" element={<Settings />} /><Route path="/users" element={<Users />} />
    <Route path="/audit" element={<AuditLog />} /><Route path="/backup" element={<Backup />} />
  </Routes></div></div></div>;
}

function LanguagePersistence() {
  const { lang } = useI18n();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await window.mms.settings.load();
        if (!cancelled && current && current.language !== lang) {
          await window.mms.settings.save({
            mahalluName: current.mahallu_name,
            address: current.address,
            phone: current.phone,
            email: current.email,
            financialYearStart: current.financial_year_start,
            currencySymbol: current.currency_symbol,
            theme: current.theme,
            language: lang,
            autoBackup: !!current.auto_backup,
            backupIntervalHours: current.backup_interval_hours,
            receiptPrefix: current.receipt_prefix,
          });
        }
      } catch (err) { console.warn("Could not persist active language:", err); }
    })();
    return () => { cancelled = true; };
  }, [lang]);
  return null;
}

export default function App() {
  const { apply } = useTheme();
  const { user } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => { apply(); }, [apply]);
  useEffect(() => { if (splashDone) document.body.classList.add("app-loaded"); }, [splashDone]);
  if (!splashDone) return <Splash onDone={() => setSplashDone(true)} />;
  return <><LanguagePersistence /><Routes><Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} /><Route path="/*" element={user ? <ProtectedLayout /> : <Navigate to="/login" />} /></Routes><ToastContainer /></>;
}
