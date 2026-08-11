import { useEffect } from "react";
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

function ProtectedLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-canvas">
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
        </main>
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
