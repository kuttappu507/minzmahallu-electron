import { useLocation } from "react-router-dom";
import { Search, Moon, Sun, Globe } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/i18n";
import { Input } from "@/components/ui";

const pageLabels: Record<string, string> = {
  "/": "nav_dashboard",
  "/families": "nav_families",
  "/members": "nav_members",
  "/subscriptions": "nav_subscriptions",
  "/donations": "nav_donations",
  "/accounting": "nav_accounting",
  "/marriages": "nav_marriage",
  "/deaths": "nav_death",
  "/welfare": "nav_welfare",
  "/certificates": "nav_certificates",
  "/tokens": "nav_tokens",
  "/reports": "nav_reports",
  "/settings": "nav_settings",
  "/users": "nav_users",
  "/audit": "nav_audit",
  "/backup": "nav_backup",
};

export function Topbar() {
  const { theme, toggle } = useTheme();
  const { t, toggleLang, isMalayalam } = useI18n();
  const { pathname } = useLocation();

  const pageTitle = pageLabels[pathname] || "nav_dashboard";

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-surface border-b border-border">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-text-tertiary uppercase tracking-wide">
          MINZ MAHALLU /
        </span>
        <h1 className="text-lg font-semibold text-text-primary">{t(pageTitle)}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            placeholder={t("search_placeholder")}
            className="pl-9 w-64"
            onChange={() => {/* Search implementation varies per page */}}
          />
        </div>

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          title={t("set_language")}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors"
        >
          <span className="text-xs font-bold text-primary">{isMalayalam() ? "ML" : "EN"}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={t("set_theme")}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-text-primary" />
          ) : (
            <Moon className="h-4 w-4 text-text-primary" />
          )}
        </button>
      </div>
    </header>
  );
}
