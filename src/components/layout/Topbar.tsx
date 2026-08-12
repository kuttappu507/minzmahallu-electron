import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Moon, Sun, Bell, Database, ChevronDown, User, Settings, LogOut, X, KeyRound, ShieldCheck } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Dialog, Button, Input, Label, Badge } from "@/components/ui";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

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
      if (result && result.success === false) {
        if (result.error !== "cancelled") {
          toast.error(result.error || "Backup failed");
        }
        return;
      }
      const path: string | undefined =
        typeof result === "string" ? result : result?.path;
      if (path) {
        toast.success("Backup saved: " + path.split(/[\\/]/).pop());
      } else {
        toast.success("Backup created");
      }
    } catch (e: any) {
      toast.error(e.message || "Backup failed");
    }
  };

  const handleChangePassword = async () => {
    if (!user?.id) {
      toast.error("No user session found");
      return;
    }
    if (!newPwd) {
      toast.error("New password is required");
      return;
    }
    if (newPwd.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPwd(true);
    try {
      const result: any = await window.mms.auth.changePassword(user.id, newPwd);
      if (result && result.success === false) {
        throw new Error(result.error || "Failed to change password");
      }
      toast.success("Password updated successfully");
      setNewPwd("");
      setConfirmPwd("");
      setProfileOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to change password");
    } finally {
      setSavingPwd(false);
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
                  onClick={() => { setAvatarOpen(false); setProfileOpen(true); }}
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

      {/* Profile dialog with Change Password */}
      <Dialog
        open={profileOpen}
        onClose={() => { setProfileOpen(false); setNewPwd(""); setConfirmPwd(""); }}
        title="My Profile"
      >
        <div style={{ padding: "2px 0" }}>
          {user && (
            <>
              {/* User details card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  marginBottom: 14,
                  background: "var(--sb)",
                  border: "1.5px solid var(--sl)",
                  borderRadius: 14,
                }}
                className="t-em"
              >
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 14, flex: "none",
                    background: "var(--sc)", color: "#fff",
                    display: "grid", placeItems: "center",
                    font: "700 18px 'Space Grotesk'",
                    boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                  }}
                >
                  {user.initials || user.username?.charAt(0).toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 16px 'Space Grotesk'", color: "var(--st)" }}>
                    {user.fullName}
                  </div>
                  <div style={{ font: "700 11px Poppins", color: "var(--st)", marginTop: 2 }}>
                    @{user.username}
                  </div>
                </div>
                <Badge variant={user.role === "Administrator" ? "default" : "muted"}>{user.role}</Badge>
              </div>

              {/* Profile details grid */}
              <div className="det-grid" style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                <div className="det">
                  <span className="k">Full Name</span>
                  <span className="v">{user.fullName || "—"}</span>
                </div>
                <div className="det">
                  <span className="k">Username</span>
                  <span className="v">{user.username}</span>
                </div>
                <div className="det">
                  <span className="k">Role</span>
                  <span className="v">{user.role}</span>
                </div>
                <div className="det">
                  <span className="k">Status</span>
                  <span className="v">{user.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>

              {/* Change Password section */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <KeyRound size={14} style={{ color: "var(--em)" }} />
                <b style={{ font: "800 11px Poppins", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--st)" }} className="t-em">
                  Change Password
                </b>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="Enter new password"
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <Button variant="secondary" onClick={() => { setProfileOpen(false); setNewPwd(""); setConfirmPwd(""); }} disabled={savingPwd}>
                  Close
                </Button>
                <Button onClick={handleChangePassword} disabled={savingPwd}>
                  {savingPwd ? "Saving…" : (
                    <>
                      <ShieldCheck size={14} />
                      Save Password
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
