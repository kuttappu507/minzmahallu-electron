import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Home, User, Receipt, Gift, Calculator,
  Gem, Flower, Activity, Award, Ticket, BarChart3,
  Sliders, Users, FileText, Database, LogOut,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV = [
  { sec: "Overview" },
  { id: "dash", to: "/", icon: LayoutDashboard, key: "nav_dashboard" },
  { sec: "Management" },
  { id: "families", to: "/families", icon: Home, key: "nav_families" },
  { id: "members", to: "/members", icon: User, key: "nav_members" },
  { id: "subs", to: "/subscriptions", icon: Receipt, key: "nav_subscriptions" },
  { id: "dons", to: "/donations", icon: Gift, key: "nav_donations" },
  { sec: "Finance" },
  { id: "acct", to: "/accounting", icon: Calculator, key: "nav_accounting" },
  { sec: "Registers" },
  { id: "marriage", to: "/marriages", icon: Gem, key: "nav_marriage" },
  { id: "death", to: "/deaths", icon: Flower, key: "nav_death" },
  { id: "welfare", to: "/welfare", icon: Activity, key: "nav_welfare" },
  { id: "certs", to: "/certificates", icon: Award, key: "nav_certificates" },
  { id: "tokens", to: "/tokens", icon: Ticket, key: "nav_tokens", badge: "NEW" },
  { sec: "System" },
  { id: "reports", to: "/reports", icon: BarChart3, key: "nav_reports" },
  { id: "settings", to: "/settings", icon: Sliders, key: "nav_settings" },
  { id: "users", to: "/users", icon: Users, key: "nav_users" },
  { id: "audit", to: "/audit", icon: FileText, key: "nav_audit" },
  { id: "backup", to: "/backup", icon: Database, key: "nav_backup" },
];

const TINTS: Record<string, string> = {
  dash: "t-em",
  families: "t-em",
  members: "t-teal",
  subs: "t-gold",
  dons: "t-pink",
  acct: "t-sky",
  marriage: "t-vio",
  death: "t-slate",
  welfare: "t-orange",
  certs: "t-cyan",
  tokens: "t-pink",
  reports: "t-blue",
  settings: "t-vio",
  users: "t-blue",
  audit: "t-gold",
  backup: "t-teal",
};

export function Sidebar() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = user?.initials ?? "?";

  return (
    <aside className={cn("sidebar islamic-pattern", collapsed && "min")}>
      {/* Logo */}
      <div className="sb-logo">
        <span className="logo">
          <svg viewBox="0 0 256 256" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sbLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e3f6ec"/>
                <stop offset="100%" stopColor="#bfe8d4"/>
              </linearGradient>
            </defs>
            <rect width="256" height="256" rx="56" fill="url(#sbLogoGrad)" stroke="#0eab7f" strokeWidth="4"/>
            <text x="128" y="178" fontFamily="Poppins, Arial, sans-serif" fontSize="140" fontWeight="700" fill="#0eab7f" textAnchor="middle">M</text>
          </svg>
        </span>
        {!collapsed && (
          <div className="nm">
            <b>MMS</b>
            <small>MINZ MAHALLU</small>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="navscroll">
        {NAV.map((item, i) => {
          if (item.sec) {
            return (
              <div key={`sec-${i}`} className="navsec">
                {collapsed ? "" : item.sec}
              </div>
            );
          }
          const Icon = item.icon!;
          const tint = TINTS[item.id!];
          return (
            <NavLink
              key={item.id}
              to={item.to!}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn("navit", tint, isActive && "on")
              }
              data-tip={t(item.key!)}
              title={collapsed ? t(item.key!) : undefined}
            >
              <Icon className="ic" size={18} strokeWidth={2} />
              {!collapsed && <b>{t(item.key!)}</b>}
              {!collapsed && item.badge && (
                <span className="navbadge">{item.badge}</span>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User */}
      <div className="sb-user">
        <span className="av">{initials}</span>
        {!collapsed && (
          <div className="nm">
            <b>{user?.fullName ?? "—"}</b>
            <small>{user?.role ?? "—"}</small>
          </div>
        )}
        <button
          className="ibtn"
          onClick={handleLogout}
          title={t("action_logout")}
        >
          <LogOut size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Collapse flap */}
      <button
        className="flap"
        onClick={() => setCollapsed(!collapsed)}
        title="Collapse sidebar"
      >
        <span className="ic">
          <ChevronRight size={16} strokeWidth={2.4} />
        </span>
      </button>
    </aside>
  );
}
