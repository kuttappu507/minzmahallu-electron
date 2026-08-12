import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Moon, Sun, Bell, Database, ChevronDown, User, Settings, LogOut, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";

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

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Load notifications on mount + page change
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

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown]")) {
        setNotifOpen(false);
        setAvatarOpen(false);
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setNotifOpen(false); setAvatarOpen(false); }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, []);

  const handleQuickBackup = async () => {
    try {
      toast.info("Creating backup...");
      const result = await window.mms.backup.create();
      if (result.success) {
        toast.success("Backup created: " + result.path.split(/[\\/]/).pop());
      } else {
        toast.error(result.error || "Backup failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Backup failed");
    }
  };

  const handleLogout = async () => {
    setAvatarOpen(false);
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

  const dropdownStyle: React.CSSProperties = {
    position: "fixed",
    top: 60,
    zIndex: 9999,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    boxShadow: "var(--shl)",
    overflow: "hidden",
    animation: "dropdownIn 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2)",
  };

  return (
    <>
      <header className="topbar" style={{ position: "relative", zIndex: 35 }}>
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

          {/* Language segment */}
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

          {/* Theme toggle */}
          <button className="ibtn" onClick={toggle} title="Toggle dark mode">
            {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
          </button>

          {/* Notifications — fixed dropdown */}
          <div data-dropdown style={{ position: "relative" }}>
            <button
              className="ibtn"
              title="Notifications"
              onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen); setAvatarOpen(false); if (!notifOpen) loadNotifications(); }}
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
              <div style={{ ...dropdownStyle, right: 120, width: 340 }}>
                <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ font: "700 13px Manrope" }}>Notifications</b>
                  <button onClick={(e) => { e.stopPropagation(); loadNotifications(); }} style={{ border: 0, background: "none", color: "var(--em)", font: "700 11.5px Manrope", cursor: "pointer" }}>Refresh</button>
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

          {/* Quick backup */}
          <button className="ibtn" title="Quick backup" onClick={handleQuickBackup}>
            <Database size={17} strokeWidth={2} />
          </button>

          <div className="tbdiv" />

          {/* Avatar — fixed dropdown */}
          <div data-dropdown style={{ position: "relative" }}>
            <button className="avbtn" onClick={(e) => { e.stopPropagation(); setAvatarOpen(!avatarOpen); setNotifOpen(false); }}>
              <span className="av">{initials}</span>
              <b>{user?.username ?? "—"}</b>
              <ChevronDown size={14} style={{ color: "var(--fnt)" }} />
            </button>
            {avatarOpen && (
              <div style={{ ...dropdownStyle, right: 8, width: 220 }}>
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

      {/* Backdrop overlay when any dropdown is open — closes on click */}
      {(notifOpen || avatarOpen) && (
        <div
          onClick={() => { setNotifOpen(false); setAvatarOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" }}
        />
      )}
    </>
  );
}
