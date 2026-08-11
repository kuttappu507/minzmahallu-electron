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
    { to: "/", key: "nav_dashboard", icon: LayoutDashboard, group: "overview" },
    { to: "/families", key: "nav_families", icon: Users2, group: "records" },
    { to: "/members", key: "nav_members", icon: Users, group: "records" },
    { to: "/subscriptions", key: "nav_subscriptions", icon: CreditCard, group: "financial" },
    { to: "/donations", key: "nav_donations", icon: HeartHandshake, group: "financial" },
    { to: "/accounting", key: "nav_accounting", icon: Wallet, group: "financial" },
    { to: "/marriages", key: "nav_marriage", icon: Heart, group: "registers" },
    { to: "/deaths", key: "nav_death", icon: Skull, group: "registers" },
    { to: "/welfare", key: "nav_welfare", icon: HandHeart, group: "services" },
    { to: "/certificates", key: "nav_certificates", icon: Award, group: "services" },
    { to: "/tokens", key: "nav_tokens", icon: Coins, group: "services" },
    { to: "/reports", key: "nav_reports", icon: FileText, group: "system" },
    { to: "/settings", key: "nav_settings", icon: Settings, group: "system" },
    { to: "/users", key: "nav_users", icon: Shield, group: "system" },
    { to: "/audit", key: "nav_audit", icon: ScrollText, group: "system" },
    { to: "/backup", key: "nav_backup", icon: DatabaseBackup, group: "system" },
  ];

  const groups = [
    { id: "overview", label: "Overview" },
    { id: "records", label: "Records" },
    { id: "financial", label: "Financial" },
    { id: "registers", label: "Registers" },
    { id: "services", label: "Services" },
    { id: "system", label: "System" },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-surface border-r border-border transition-all duration-300 ease-smooth",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* ===== Logo header ===== */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border-subtle">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand shadow-glow">
          <span className="text-lg font-bold text-white">M</span>
          <div className="absolute inset-0 rounded-xl bg-white/20 blur-md -z-10" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">MMS</span>
            <span className="text-[10px] text-text-tertiary font-medium tracking-wide uppercase">
              Minz Mahallu
            </span>
          </div>
        )}
      </div>

      {/* ===== Nav ===== */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        {groups.map((group) => {
          const items = navItems.filter((i) => i.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="space-y-0.5">
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ease-smooth",
                        isActive
                          ? "text-white"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
                        collapsed && "justify-center px-2"
                      )
                    }
                    title={collapsed ? t(item.key) : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active gradient pill background */}
                        {isActive && (
                          <span className="absolute inset-0 rounded-lg bg-gradient-brand opacity-90 shadow-glow" />
                        )}
                        {/* Active indicator dot */}
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-accent-400" />
                        )}
                        <Icon
                          className={cn(
                            "relative h-4 w-4 flex-shrink-0 transition-transform duration-200",
                            "group-hover:scale-110",
                            !isActive && "text-text-tertiary group-hover:text-text-secondary"
                          )}
                        />
                        {!collapsed && (
                          <span className="relative font-medium">{t(item.key)}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ===== User + logout ===== */}
      <div className="border-t border-border-subtle p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-hover/50">
              <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-brand-500 text-white font-bold text-sm shadow-md">
                {user?.initials ?? "?"}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-surface" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold truncate">{user?.fullName ?? "—"}</span>
                <span className="text-[11px] text-text-tertiary truncate">{user?.role ?? "—"}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-200 ease-smooth group"
            >
              <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>{t("action_logout")}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title={t("action_logout")}
            className="flex items-center justify-center w-full p-2 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ===== Collapse toggle ===== */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 bg-surface border border-border rounded-md shadow-soft hover:bg-surface-hover hover:border-border-hover transition-all duration-200 z-10"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 text-text-secondary" />
        )}
      </button>
    </aside>
  );
}
