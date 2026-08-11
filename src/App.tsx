import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ToastContainer } from "@/components/ToastContainer";

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
import { Tokens } from "@/pages/Tokens";
import { Reports } from "@/pages/Reports";
import { Settings } from "@/pages/Settings";
import { Users } from "@/pages/Users";
import { AuditLog } from "@/pages/AuditLog";
import { Backup } from "@/pages/Backup";
import { useEffect, useState } from "react";

function StatusBar() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <footer className="statusbar">
      <span className="sl">
        <i />
        <span>Ready · {time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
      <span className="sr">
        <span>SQLite 3.46 · WAL</span>
        <span>Electron · React 18</span>
        <span>user: admin</span>
      </span>
    </footer>
  );
}

function ProtectedLayout() {
  return (
    <div className="app-window">
      {/* Title bar */}
      <div className="tbar">
        <span className="logo">
          <b>M</b>
        </span>
        <span className="ttl">MMS</span>
        <span className="tsu">· Minz Mahallu Management System</span>
        <span className="tb-chip t-em">
          <i />
          mms.db · connected
        </span>
        <span className="tb-chip t-gold">v3.0.0</span>
      </div>

      {/* App body */}
      <div id="app" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Sidebar />
        <div className="maincol">
          <Topbar />
          <div id="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/families" element={<Families />} />
              <Route path="/members" element={<Members />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/donations" element={<Donations />} />
              <Route path="/accounting" element={<Accounting />} />
              <Route path="/marriages" element={<Marriages />} />
              <Route path="/deaths" element={<Deaths />} />
              <Route path="/welfare" element={<Welfare />} />
              <Route path="/certificates" element={<Certificates />} />
              <Route path="/tokens" element={<Tokens />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/users" element={<Users />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/backup" element={<Backup />} />
            </Routes>
          </div>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { apply } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    apply();
  }, [apply]);

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/*" element={user ? <ProtectedLayout /> : <Navigate to="/login" />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
