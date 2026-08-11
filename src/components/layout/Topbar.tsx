import { useLocation } from "react-router-dom";
import { Search, Moon, Sun, Globe, Command } from "lucide-react";
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
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 glass border-b border-border/50">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          {t(pageTitle)}
        </h1>
        <span className="text-xs text-text-muted">·</span>
        <span className="text-xs text-text-tertiary font-medium">
          {isMalayalam() ? "മലയാളം" : "English"}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary transition-colors group-focus-within:text-primary" />
          <Input
            placeholder={t("search_placeholder")}
            className="pl-9 pr-12 w-64 text-sm"
            onChange={() => {/* Search implementation varies per page */}}
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-0.5 px-1.5 h-5 text-[10px] font-mono text-text-muted bg-surface-hover border border-border rounded">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </div>

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          title={t("set_language")}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-hover hover:border-border-hover transition-all duration-200 group"
        >
          <Globe className="h-4 w-4 text-text-secondary group-hover:text-primary transition-colors" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={t("set_theme")}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-hover hover:border-border-hover transition-all duration-200 group overflow-hidden"
        >
          <Sun
            className={`absolute h-4 w-4 transition-all duration-300 ${
              theme === "dark"
                ? "opacity-0 rotate-90 scale-0"
                : "opacity-100 rotate-0 scale-100 text-amber-500"
            }`}
          />
          <Moon
            className={`absolute h-4 w-4 transition-all duration-300 ${
              theme === "dark"
                ? "opacity-100 rotate-0 scale-100 text-brand-300"
                : "opacity-0 -rotate-90 scale-0"
            }`}
          />
        </button>
      </div>
    </header>
  );
}
