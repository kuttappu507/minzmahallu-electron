import { useLocation } from "react-router-dom";
import { Search, Moon, Sun, Bell, Database } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";

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
  const { toggleLang, isMalayalam } = useI18n();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const pageTitle = PAGE_TITLES[pathname] || "Dashboard";
  const initials = user?.initials ?? "?";

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

        {/* Language segment */}
        <div className="langseg">
          <button
            type="button"
            className={!isMalayalam() ? "on" : ""}
            onClick={() => !isMalayalam() && toggleLang()}
          >
            EN
          </button>
          <button
            type="button"
            className={isMalayalam() ? "on" : ""}
            onClick={() => isMalayalam() && toggleLang()}
          >
            മല
          </button>
        </div>

        {/* Theme toggle */}
        <button
          className="ibtn"
          onClick={toggle}
          title="Toggle dark mode"
        >
          {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>

        {/* Notifications */}
        <button className="ibtn" title="Notifications">
          <Bell size={17} strokeWidth={2} />
        </button>

        {/* Quick backup */}
        <button className="ibtn" title="Quick backup">
          <Database size={17} strokeWidth={2} />
        </button>

        <div className="tbdiv" />

        {/* Avatar */}
        <button className="avbtn">
          <span className="av">{initials}</span>
          <b>{user?.username ?? "—"}</b>
        </button>
      </div>
    </header>
  );
}
