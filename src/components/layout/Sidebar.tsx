import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Users2,
  CreditCard,
  HeartHandshake,
  Wallet,
  Heart,
  Skull,
  HandHeart,
  Award,
  Coins,
  FileText,
  Settings,
  Shield,
  ScrollText,
  DatabaseBackup,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function Sidebar() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { to: "/", key: "nav_dashboard", icon: LayoutDashboard },
    { to: "/families", key: "nav_families", icon: Users2 },
    { to: "/members", key: "nav_members", icon: Users },
    { to: "/subscriptions", key: "nav_subscriptions", icon: CreditCard },
    { to: "/donations", key: "nav_donations", icon: HeartHandshake },
    { to: "/accounting", key: "nav_accounting", icon: Wallet },
    { to: "/marriages", key: "nav_marriage", icon: Heart },
    { to: "/deaths", key: "nav_death", icon: Skull },
    { to: "/welfare", key: "nav_welfare", icon: HandHeart },
    { to: "/certificates", key: "nav_certificates", icon: Award },
    { to: "/tokens", key: "nav_tokens", icon: Coins },
    { to: "/reports", key: "nav_reports", icon: FileText },
    { to: "/settings", key: "nav_settings", icon: Settings },
    { to: "/users", key: "nav_users", icon: Shield },
    { to: "/audit", key: "nav_audit", icon: ScrollText },
    { to: "/backup", key: "nav_backup", icon: DatabaseBackup },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 text-white transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 backdrop-blur">
          <span className="text-lg font-bold">M</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold">MMS</span>
            <span className="text-xs text-brand-200">Minz Mahallu</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-white/15 text-white font-medium"
                    : "text-brand-100 hover:bg-white/10 hover:text-white",
                  collapsed && "justify-center px-2"
                )
              }
              title={collapsed ? t(item.key) : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>{t(item.key)}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-white/10 p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gold text-gold-text font-bold text-sm">
                {user?.initials ?? "?"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{user?.fullName ?? "—"}</span>
                <span className="text-xs text-brand-200">{user?.role ?? "—"}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-100 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("action_logout")}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title={t("action_logout")}
            className="flex items-center justify-center w-full p-2 text-brand-100 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-12 bg-surface border border-border rounded-md shadow-md hover:bg-surface-hover"
      >
        {collapsed ? <ChevronRight className="h-4 w-4 text-text-primary" /> : <ChevronLeft className="h-4 w-4 text-text-primary" />}
      </button>
    </aside>
  );
}
