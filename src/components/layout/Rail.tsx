import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Wallet, BookOpen, Settings2, Home, User,
  Briefcase, UsersRound, Receipt, Gift, Calculator, Gem, Flower,
  Activity, Award, Ticket, BarChart3, Sliders, FileText, Database,
  LogOut, ChevronRight,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
   STUDIO RAIL — vertical icon rail with flyout section menus.
   Replaces the classic 240px text sidebar: the navigation
   architecture itself is different (grouped command rail).
   ───────────────────────────────────────────────────────── */

type PageDef = { to: string; icon: any; key: string };
type SectionDef = {
  id: string;
  label: { en: string; ml: string };
  icon: any;
  direct?: PageDef;          // single-destination group navigates immediately
  pages?: PageDef[];
};

const SECTIONS: SectionDef[] = [
  {
    id: "overview", label: { en: "Overview", ml: "അവലോകനം" }, icon: LayoutDashboard,
    direct: { to: "/", icon: LayoutDashboard, key: "nav_dashboard" },
  },
  {
    id: "people", label: { en: "People", ml: "ആളുകൾ" }, icon: Users,
    pages: [
      { to: "/families", icon: Home, key: "nav_families" },
      { to: "/members", icon: User, key: "nav_members" },
      { to: "/staff", icon: Briefcase, key: "nav_staff" },
      { to: "/committee", icon: UsersRound, key: "nav_committee" },
    ],
  },
  {
    id: "finance", label: { en: "Finance", ml: "സാമ്പത്തികം" }, icon: Wallet,
    pages: [
      { to: "/subscriptions", icon: Receipt, key: "nav_subscriptions" },
      { to: "/donations", icon: Gift, key: "nav_donations" },
      { to: "/accounting", icon: Calculator, key: "nav_accounting" },
    ],
  },
  {
    id: "registers", label: { en: "Registers", ml: "രജിസ്റ്ററുകൾ" }, icon: BookOpen,
    pages: [
      { to: "/marriages", icon: Gem, key: "nav_marriage" },
      { to: "/deaths", icon: Flower, key: "nav_death" },
      { to: "/welfare", icon: Activity, key: "nav_welfare" },
      { to: "/certificates", icon: Award, key: "nav_certificates" },
      { to: "/tokens", icon: Ticket, key: "nav_tokens" },
    ],
  },
  {
    id: "system", label: { en: "System", ml: "സിസ്റ്റം" }, icon: Settings2,
    pages: [
      { to: "/reports", icon: BarChart3, key: "nav_reports" },
      { to: "/settings", icon: Sliders, key: "nav_settings" },
      { to: "/users", icon: Users, key: "nav_users" },
      { to: "/audit", icon: FileText, key: "nav_audit" },
      { to: "/backup", icon: Database, key: "nav_backup" },
    ],
  },
];

/* Which section owns a route (for the active indicator + breadcrumb). */
export function sectionFor(pathname: string): string {
  if (pathname === "/") return "overview";
  for (const s of SECTIONS) {
    if (s.direct && s.direct.to === pathname) return s.id;
    if (s.pages?.some((p) => pathname === p.to || pathname.startsWith(p.to + "/"))) return s.id;
  }
  return "overview";
}

export function sectionLabel(id: string, ml: boolean): string {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) return "";
  return ml ? s.label.ml : s.label.en;
}

const ROLE_ML: Record<string, string> = {
  Administrator: "അഡ്മിനിസ്ട്രേറ്റർ",
  Manager: "മാനേജർ",
  Operator: "ഓപ്പറേറ്റർ",
  Viewer: "വ്യൂവർ",
};

export function Sidebar() {
  const { t, lang } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const ml = lang === "ml";
  const activeSection = sectionFor(location.pathname);

  // Close the flyout whenever the route changes or Escape is pressed.
  useEffect(() => { setOpenSection(null); }, [location.pathname]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenSection(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  const open = SECTIONS.find((s) => s.id === openSection && s.pages);

  return (
    <>
      {open && <div className="rail-backdrop" onClick={() => setOpenSection(null)} />}

      <aside className="rail">
        <div className="rail-logo" title="MMS · Minz Mahallu System">
          <span className="mark">
            <img src="./logo.png" alt="MMS" />
          </span>
        </div>

        <nav className="rail-nav">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            const label = ml ? sec.label.ml : sec.label.en;
            if (sec.direct) {
              return (
                <NavLink key={sec.id} to={sec.direct.to} end
                  className={cn("rail-grp", active && "active")}
                  title={t(sec.direct.key)}>
                  <span className="rail-ic"><Icon size={21} strokeWidth={2.1} /></span>
                  <span className="rail-lb">{label}</span>
                </NavLink>
              );
            }
            return (
              <button key={sec.id} type="button"
                className={cn("rail-grp", active && "active", openSection === sec.id && "open")}
                onClick={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                title={label}>
                <span className="rail-ic"><Icon size={21} strokeWidth={2.1} /></span>
                <span className="rail-lb">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
          <button type="button" className="rail-av"
            title={`${user?.fullName ?? "—"} · ${user?.role ?? ""}`}
            onClick={() => navigate("/users")}>
            {user?.initials ?? "?"}
          </button>
          <button type="button" className="rail-out" onClick={handleLogout} title={t("action_logout")}>
            <LogOut size={17} strokeWidth={2.1} />
          </button>
        </div>
      </aside>

      {open && (
        <div className="rail-fly">
          <div className="rail-fly-head">
            <small>{ml ? "വിഭാഗം" : "Section"}</small>
            <b>{ml ? open.label.ml : open.label.en}</b>
          </div>
          <div className="rail-fly-body">
            {open.pages!.map((p) => {
              const PI = p.icon;
              const on = location.pathname === p.to || location.pathname.startsWith(p.to + "/");
              return (
                <NavLink key={p.to} to={p.to}
                  className={cn("fly-it", on && "on")}
                  onClick={() => setOpenSection(null)}>
                  <span className="fly-ic"><PI size={16} strokeWidth={2.1} /></span>
                  {t(p.key)}
                  <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.4 }} />
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
