import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Moon, Sun, Bell, Database, ChevronDown, User, Settings, LogOut } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/families": "Families",
  "/members": "Members",
  "/subscriptions": "Subscriptions",
  "/donations": "Donations",
  "/accounting": "Accounting",
  "/marriages": "Marriage",
  "/deaths": "Death",
  "/welfare": "Welfare",
  "/certificates": "Certificates",
  "/tokens": "Tokens",
  "/reports": "Reports",
  "/settings": "Settings",
  "/users": "Users",
  "/audit": "Audit Log",
  "/backup": "Backup",
};

export function Topbar() {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const pageTitle = PAGE_TITLES[location.pathname] || "Dashboard";
  const initials = user?.initials ?? "?";

  // Notification dropdown
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  // Avatar menu
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Load notifications (recent audit log entries)
  useEffect(() => {
    loadNotifications();
  }, [location.pathname]);

  const loadNotifications = async () => {
    try {
      const entries = await window.mms.audit.list({ page: 1, pageSize: 5 });
      setNotifications(entries.rows || []);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleQuickBackup = async () => {
    try {
      const result = await window.mms.backup.create();
      if (result.success) {
        toast.success("Backup created successfully");
      } else {
        toast.error(result.error || "Backup failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Backup failed");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <header className="topbar">
      {/* Breadcrumb */}
      <div className="crumb">
        <small>Minz Mahallu /</small>
        <b>{pageTitle}</b>
      </div>

      {/* Search */}
      <div className="qwrap" style={{ marginLeft: 8 }}>
        <Search size={16} strokeWidth={2} />
        <input placeholder="Search records…" />
        <kbd>Ctrl K</kbd>
      </div>

      {/* Right side */}
      <div className="tb-right">
        {/* DB status chip */}
        <span className="tb-chip t-em">
          <i />
          mms.db · connected
        </span>

        {/* Language segment — FIXED: clicking a button sets that language */}
        <div className="langseg">
          <button
            type="button"
            className={lang === "en" ? "on" : ""}
            onClick={() => setLang("en")}
            title="English"
          >
            EN
          </button>
          <button
            type="button"
            className={lang === "ml" ? "on" : ""}
            onClick={() => setLang("ml")}
            title="മലയാളം"
          >
            മല
          </button>
        </div>

        {/* Theme toggle — FIXED: show Moon in light (to switch to dark), Sun in dark (to switch to light) */}
        <button className="ibtn" onClick={toggle} title="Toggle dark mode">
          {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>

        {/* Notifications — WIRED: dropdown with recent audit entries */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            className="ibtn"
            title="Notifications"
            onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) loadNotifications(); }}
          >
            <Bell size={17} strokeWidth={2} />
            {notifications.length > 0 && (
              <span style={{
                position: "absolute", top: -3, right: -3,
                minWidth: 16, height: 16, borderRadius: 99,
                background: "#e8556e", color: "#fff",
                font: "800 9.5px Manrope", display: "grid", placeItems: "center",
                padding: "0 4px", border: "2px solid var(--panel)",
              }}>
                {notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="menu" style={{ display: "block", top: "calc(100% + 8px)", right: 0, width: 320, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "var(--shl)", overflow: "hidden", zIndex: 70 }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ font: "700 13px Manrope" }}>Notifications</b>
                <button onClick={loadNotifications} style={{ border: 0, background: "none", color: "var(--em)", font: "700 11.5px Manrope", cursor: "pointer" }}>Refresh</button>
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 26, textAlign: "center", color: "var(--fnt)", font: "700 12.5px Manrope" }}>No notifications</div>
              ) : (
                notifications.map((n, i) => (
                  <div key={n.id || i} style={{ display: "flex", gap: 11, padding: "13px 16px", borderBottom: i < notifications.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}
                    onClick={() => { setNotifOpen(false); navigate("/audit"); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 34, height: 34, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", color: "#fff",
                      background: n.action === "CREATE" ? "var(--c-em)" : n.action === "DELETE" ? "var(--c-rose)" : n.action === "LOGIN" ? "var(--c-sky)" : "var(--c-gold)" }}>
                      <Bell size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ font: "700 12.5px Manrope", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.description || n.action}</b>
                      <p style={{ font: "500 11.5px Manrope", color: "var(--mut)", marginTop: 2 }}>{n.username} · {n.module}</p>
                    </div>
                    <time style={{ font: "700 10px Manrope", color: "var(--fnt)", flex: "none" }}>{formatTime(n.created_at)}</time>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quick backup — WIRED: triggers backup.create() */}
        <button className="ibtn" title="Quick backup" onClick={handleQuickBackup}>
          <Database size={17} strokeWidth={2} />
        </button>

        <div className="tbdiv" />

        {/* Avatar menu — WIRED: Profile, Settings, Logout */}
        <div ref={avatarRef} style={{ position: "relative" }}>
          <button className="avbtn" onClick={() => setAvatarOpen(!avatarOpen)}>
            <span className="av">{initials}</span>
            <b>{user?.username ?? "—"}</b>
            <ChevronDown size={14} style={{ color: "var(--fnt)" }} />
          </button>
          {avatarOpen && (
            <div className="menu" style={{ display: "block", top: "calc(100% + 8px)", right: 0, width: 220, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "var(--shl)", overflow: "hidden", zIndex: 70 }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
                <b style={{ font: "700 13px Manrope", display: "block" }}>{user?.fullName}</b>
                <small style={{ font: "600 11px Manrope", color: "var(--fnt)" }}>{user?.role}</small>
              </div>
              <button className="menuit" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px", border: 0, background: "none", font: "700 12.8px Manrope", color: "var(--tx)", textAlign: "left", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--selbg)"; e.currentTarget.style.color = "var(--em)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--tx)"; }}
                onClick={() => { setAvatarOpen(false); toast.info("Profile page coming soon"); }}
              >
                <User size={15} /> Profile
              </button>
              <button className="menuit" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px", border: 0, background: "none", font: "700 12.8px Manrope", color: "var(--tx)", textAlign: "left", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--selbg)"; e.currentTarget.style.color = "var(--em)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--tx)"; }}
                onClick={() => { setAvatarOpen(false); navigate("/settings"); }}
              >
                <Settings size={15} /> Settings
              </button>
              <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
              <button className="menuit" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px", border: 0, background: "none", font: "700 12.8px Manrope", color: "var(--c-rose)", textAlign: "left", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--rose-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                onClick={handleLogout}
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
