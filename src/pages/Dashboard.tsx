import { useAsync } from "@/hooks/useList";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  Home, Users, UserCheck, Wallet, AlertCircle,
  Gift, Gem, Flower, TrendingUp,
  Plus, User, BarChart3, RefreshCw, Clock, Database, History,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/* ─────────────────────────────────────────────────────────
   STUDIO DASHBOARD — bento grid composition:
   hero band → KPI strip → charts + side rail → activity
   timeline (replaces the classic hero/stat/chart/table stack).
   ───────────────────────────────────────────────────────── */

export function Dashboard() {
  const { t, isMalayalam } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayLocale = isMalayalam() ? "ml-IN" : "en-IN";
  const ml = (en: string, m: string) => (isMalayalam() ? m : en);

  const { data: summary, refresh: refreshSummary } = useAsync(() => window.mms.dashboard.summary(), []);
  const { data: balance } = useAsync(() => window.mms.dashboard.balance(), []);
  const { data: collections } = useAsync(() => window.mms.dashboard.monthlyCollections(6), []);
  const { data: incomeExpense } = useAsync(() => window.mms.dashboard.incomeVsExpense(6), []);
  const { data: recentActivity, refresh: refreshActivity } = useAsync(() => window.mms.dashboard.recentActivity(8), []);
  const { data: alerts } = useAsync(() => window.mms.dashboard.alerts(), []);
  const { data: glance, refresh: refreshGlance } = useAsync(() => window.mms.dashboard.todayAtGlance(), []);

  const prettyMonth = (m: string) => {
    const d = new Date(`${m}-01T00:00:00`);
    return d.toLocaleDateString(displayLocale, { month: "short", year: "2-digit" });
  };
  const collectionsChart = (collections || []).map((r: any) => ({ ...r, label: prettyMonth(r.month) }));
  const incomeExpenseChart = (incomeExpense || []).map((r: any) => ({ ...r, label: prettyMonth(r.month) }));

  const thisMonthColl = (collections && collections.length > 0) ? Number(collections[collections.length - 1]?.amount || 0) : 0;
  const lastMonthColl = (collections && collections.length > 1) ? Number(collections[collections.length - 2]?.amount || 0) : 0;
  const collDelta = lastMonthColl > 0 ? Math.round(((thisMonthColl - lastMonthColl) / lastMonthColl) * 100) : null;

  const balanceVal = balance ?? glance?.fundBalance ?? 0;
  const thisMonthIncome = (incomeExpense && incomeExpense.length > 0) ? Number(incomeExpense[incomeExpense.length - 1]?.income || 0) : 0;
  const thisMonthExpense = (incomeExpense && incomeExpense.length > 0) ? Number(incomeExpense[incomeExpense.length - 1]?.expense || 0) : 0;
  const netThisMonth = thisMonthIncome - thisMonthExpense;
  const lastMonthNet = (incomeExpense && incomeExpense.length > 1) ? (Number(incomeExpense[incomeExpense.length - 2]?.income || 0) - Number(incomeExpense[incomeExpense.length - 2]?.expense || 0)) : 0;
  const balDelta = lastMonthNet !== 0 ? Math.round(((netThisMonth - lastMonthNet) / Math.abs(lastMonthNet)) * 100) : null;

  const backupHealthy = (() => {
    if (!glance) return null;
    if (!glance.backupEnabled) return false;
    if (!glance.lastBackup) return false;
    return glance.nextBackup ? new Date(glance.nextBackup).getTime() > Date.now() + 10 * 60 * 1000 : true;
  })();

  const nextBackupLabel = (() => {
    if (!glance?.backupEnabled) return ml("Off", "ഓഫ്");
    if (!glance.nextBackup) return "—";
    const t = new Date(glance.nextBackup);
    if (t.getTime() <= Date.now()) return ml("Soon", "ഉടൻ");
    const sameDay = t.toDateString() === new Date().toDateString();
    return t.toLocaleTimeString(displayLocale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  })();

  const kpis = [
    { label: t("dash_fund_balance_short"), value: formatCurrency(balanceVal), icon: TrendingUp, tint: "t-em", delta: balDelta !== null ? `${balDelta >= 0 ? "+" : ""}${balDelta}%` : t("dash_all_funds") },
    { label: t("dash_total_families"), value: String(summary?.total_families ?? 0), icon: Home, tint: "t-vio", delta: t("dash_active") },
    { label: t("dash_total_members"), value: String(summary?.total_members ?? 0), icon: Users, tint: "t-sky", delta: t("dash_active") },
    { label: t("dash_active_members"), value: String(summary?.active_members ?? 0), icon: UserCheck, tint: "t-teal", delta: t("dash_active") },
    { label: t("dash_monthly_collection"), value: formatCurrency(summary?.monthly_collection ?? 0), icon: Wallet, tint: "t-gold", delta: collDelta !== null ? `${collDelta >= 0 ? "+" : ""}${collDelta}%` : t("dash_this_month") },
    { label: t("dash_donations_month"), value: formatCurrency(summary?.monthly_donations ?? 0), icon: Gift, tint: "t-pink", delta: t("dash_this_month") },
    { label: t("dash_pending_dues"), value: formatCurrency(summary?.pending_dues ?? 0), icon: AlertCircle, tint: "t-rose", delta: t("dash_overdue") },
    { label: t("dash_marriages_year"), value: String(summary?.marriages_this_year ?? 0), icon: Gem, tint: "t-orange", delta: t("dash_this_year") },
    { label: t("dash_deaths_year"), value: String(summary?.deaths_this_year ?? 0), icon: Flower, tint: "t-slate", delta: t("dash_this_year") },
  ];

  const quickActions = [
    { label: t("dash_qa_add_family"), icon: Plus, action: "families" },
    { label: t("dash_qa_add_member"), icon: User, action: "members" },
    { label: t("dash_qa_record_payment"), icon: Wallet, action: "subscriptions" },
    { label: t("dash_qa_add_donation"), icon: Gift, action: "donations" },
    { label: t("dash_qa_generate_report"), icon: BarChart3, action: "reports" },
  ];

  const hasAlerts = alerts && alerts.length > 0;

  return (
    <div className="view view-enter">
      <div className="bento">

        {/* ── Hero band ── */}
        <div className="bento-hero">
          <div className="bh-hi">
            <span className="bh-over">Minz Mahallu · {new Date().toLocaleDateString(displayLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            <h1>{t("dash_greeting")} <span className="name">{user?.fullName}</span></h1>
            <div className="bh-sub">{t("dash_subtitle")}</div>
            <div className="bh-chips">
              <span className="bh-chip t-gold"><Clock size={12} /> {t("dash_week")} {Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))} · {t("dash_day")} {Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (24 * 60 * 60 * 1000))}</span>
              <span className="bh-chip t-sky"><Wallet size={12} /> {t("dash_fy")} {new Date().getFullYear()}-{String(new Date().getFullYear() + 1).slice(-2)} · Q{Math.floor(new Date().getMonth() / 3) + 1}</span>
              <span className="bh-chip t-em"><Database size={12} /> {backupHealthy === null || backupHealthy ? t("dash_backup_ok") : ml("Backup attention needed", "ബാക്കപ്പ് ശ്രദ്ധ ആവശ്യമുണ്ട്")}</span>
            </div>
          </div>
          <div className="bh-qa">
            {quickActions.map((qa, i) => {
              const Icon = qa.icon;
              return (
                <button key={i} className="qa-btn" onClick={() => navigate(`/${qa.action}`)}>
                  <span className="q-ic"><Icon size={15} /></span>
                  {qa.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="kpi-strip">
          {kpis.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className={`kpi ${s.tint}`}>
                <div className="kpi-top">
                  <span className="kpi-ic"><Icon size={16} strokeWidth={2.1} /></span>
                  <span className="kpi-delta">{s.delta}</span>
                </div>
                <div className="kpi-num">{s.value}</div>
                <div className="kpi-lb">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* ── Charts + side rail ── */}
        <div className="b-chart">
          <div className="panel-h">
            <div>
              <div className="ph-title">{t("dash_collections_chart")}</div>
              <div className="ph-sub">{t("dash_subscription_receipts")} · {t("dash_last_6_months")}</div>
            </div>
            <span className="lg">₹</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={collectionsChart}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--c-em)" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="var(--c-em)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 5" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12, boxShadow: "var(--shl)" }} />
              <Area type="monotone" dataKey="amount" stroke="var(--c-em)" strokeWidth={2.4} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="b-side">
          <div className="side-widget">
            <div className="sw-title">{t("dash_today_glance")}</div>
            <div className="sw-row t-em"><span className="sw-dot" /><span>{t("dash_receipts_today")}</span><b>{glance?.receiptsToday ?? 0}</b></div>
            <div className="sw-row t-gold"><span className="sw-dot" /><span>{t("dash_next_backup")}</span><b>{nextBackupLabel}</b></div>
            <div className="sw-row t-pink"><span className="sw-dot" /><span>{t("dash_welfare_pending")}</span><b>{glance?.welfarePending ?? 0}</b></div>
            <div className="sw-row t-sky"><span className="sw-dot" /><span>{t("dash_fund_balance")}</span><b>{formatCurrency(glance?.fundBalance ?? balance ?? 0)}</b></div>
          </div>

          <div className="side-widget sw-alert t-rose">
            <div className="sw-title">{t("dash_subs_overdue")}</div>
            {hasAlerts ? (
              (alerts as any[]).map((a, i) => (
                <button key={i} className="swa-row" onClick={() => navigate(a.route)}>
                  <span className="swa-ic"><AlertCircle size={16} /></span>
                  <span style={{ minWidth: 0 }}>
                    <b>{a.count}</b> <small>{
                      a.type === "committee_ending" ? ml("committee terms ending", "കമ്മിറ്റി കാലാവധി അവസാനിക്കുന്നു") :
                      a.type === "subscriptions_overdue" ? ml("overdue subscriptions", "കാലാവധി കഴിഞ്ഞ സബ്സ്ക്രിപ്ഷനുകൾ") :
                      ml("welfare requests pending", "ക്ഷേമ അപേക്ഷകൾ ശേഷിക്കുന്നു")
                    }</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="swa-row">
                <span className="swa-ic"><AlertCircle size={16} /></span>
                <small>{t("dash_review_pending")}</small>
              </div>
            )}
            <button className="btn bs bd" style={{ width: "100%" }} onClick={() => navigate("/subscriptions")}>{t("dash_review_now")}</button>
          </div>
        </div>

        {/* ── Income vs expense (second chart, full-width under the grid) ── */}
        <div className="b-chart" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-h">
            <div>
              <div className="ph-title">{t("dash_income_vs_expense")}</div>
              <div className="ph-sub">{t("dash_financial_year")} · {t("dash_to_date")}</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <span className="lg">{t("dash_income")}</span>
              <span className="lg lg-rose">{t("dash_expense")}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={incomeExpenseChart} barGap={5}>
              <CartesianGrid strokeDasharray="3 5" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12, boxShadow: "var(--shl)" }} cursor={{ fill: "var(--panel2)" }} />
              <Bar dataKey="income" fill="var(--c-em)" radius={[7, 7, 0, 0]} maxBarSize={30} />
              <Bar dataKey="expense" fill="var(--c-rose)" radius={[7, 7, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Activity timeline ── */}
        <div className="b-activity">
          <div className="panel-h">
            <div>
              <div className="ph-title">{t("dash_recent_activity")}</div>
              <div className="ph-sub">{t("dash_last_audit")}</div>
            </div>
            <button className="btn bs bg" onClick={() => { refreshSummary(); refreshActivity(); refreshGlance(); }}>
              <RefreshCw size={13} /> {t("action_refresh")}
            </button>
          </div>
          <div className="tl">
            {(recentActivity || []).length === 0 ? (
              <div className="empty-state"><div className="es-title">{t("dash_no_activity")}</div></div>
            ) : (
              (recentActivity || []).slice(0, 6).map((a: any) => (
                <div key={a.id} className="tl-it t-vio">
                  <span className="tl-dot"><History size={14} /></span>
                  <div className="tl-body">
                    <div className="tl-line1">
                      <b>{a.username}</b>
                      <span className="tl-user">{a.action}</span>
                      <span className="tl-time">{new Date(a.created_at).toLocaleTimeString(displayLocale, { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="tl-desc">{a.description}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
