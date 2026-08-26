import { useAsync } from "@/hooks/useList";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  Home, Users, UserCheck, Wallet, AlertCircle,
  Gift, Gem, Flower, TrendingUp,
  Plus, User, BarChart3, RefreshCw, Clock, Database,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export function Dashboard() {
  const { t, isMalayalam } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: summary, refresh: refreshSummary } = useAsync(() => window.mms.dashboard.summary(), []);
  const { data: balance } = useAsync(() => window.mms.dashboard.balance(), []);
  const { data: collections } = useAsync(() => window.mms.dashboard.monthlyCollections(6), []);
  const { data: incomeExpense } = useAsync(() => window.mms.dashboard.incomeVsExpense(6), []);
  const { data: recentActivity, refresh: refreshActivity } = useAsync(() => window.mms.dashboard.recentActivity(8), []);

  const stats = [
    { label: t("dash_total_families"), value: summary?.total_families ?? 0, icon: Home, tint: "t-em", delta: t("dash_6_this_month") },
    { label: t("dash_total_members"), value: summary?.total_members ?? 0, icon: Users, tint: "t-teal", delta: t("dash_18_this_month") },
    { label: t("dash_active_members"), value: summary?.active_members ?? 0, icon: UserCheck, tint: "t-sky", delta: t("dash_86_active") },
    { label: t("dash_monthly_collection"), value: formatCurrency(summary?.monthly_collection ?? 0), icon: Wallet, tint: "t-gold", delta: t("dash_total_collected") },
    { label: t("dash_pending_dues"), value: formatCurrency(summary?.pending_dues ?? 0), icon: AlertCircle, tint: "t-rose", delta: t("dash_overdue") },
    { label: t("dash_donations_month"), value: formatCurrency(summary?.monthly_donations ?? 0), icon: Gift, tint: "t-pink", delta: t("dash_124_pct") },
    { label: t("dash_marriages_year"), value: summary?.marriages_this_year ?? 0, icon: Gem, tint: "t-orange", delta: t("dash_2_this_qtr") },
    { label: t("dash_deaths_year"), value: summary?.deaths_this_year ?? 0, icon: Flower, tint: "t-slate", delta: t("dash_1_this_month") },
    { label: t("dash_fund_balance_short"), value: formatCurrency(balance ?? 0), icon: TrendingUp, tint: "t-blue", delta: t("dash_all_funds") },
  ];

  const quickActions = [
    { label: t("dash_qa_add_family"), icon: Plus, action: "families" },
    { label: t("dash_qa_add_member"), icon: User, action: "members" },
    { label: t("dash_qa_record_payment"), icon: Wallet, action: "subscriptions" },
    { label: t("dash_qa_add_donation"), icon: Gift, action: "donations" },
    { label: t("dash_qa_generate_report"), icon: BarChart3, action: "reports" },
  ];

  const displayLocale = isMalayalam() ? "ml-IN" : "en-IN";

  return (
    <div className="view view-enter">
      <div className="hero-row">
        <div className="hero t-em">
          <div className="overline">Minz Mahallu · {new Date().toLocaleDateString(displayLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1>
            {t("dash_greeting")} <span className="text-em">{user?.fullName}</span>
          </h1>
          <div className="sub">{t("dash_subtitle")}</div>
          <div className="gchips">
            <span className="gchip t-gold"><Clock size={13} /> {t("dash_week")} 31 · {t("dash_day")} 209</span>
            <span className="gchip t-sky"><Wallet size={13} /> {t("dash_fy")} 2026-27 · Q2</span>
            <span className="gchip t-em"><Database size={13} /> {t("dash_backup_ok")}</span>
          </div>
          <div className="qa-row">
            {quickActions.map((qa, i) => {
              const Icon = qa.icon;
              return (
                <button key={i} className="qa" onClick={() => navigate(`/${qa.action}`)}>
                  <span className="qic"><Icon size={15} /></span>
                  <b>{qa.label}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hero-side">
          <div className="alert-card t-rose">
            <span className="bic">
              <AlertCircle size={17} />
              <i />
            </span>
            <b>{t("dash_subs_overdue")}</b>
            <p>{t("dash_review_pending")}</p>
            <div className="bx">
              <button className="btn bs bd" onClick={() => navigate("/subscriptions")}>{t("dash_review_now")}</button>
            </div>
          </div>

          <div className="glance">
            <b>{t("dash_today_glance")}</b>
            <div className="g-row t-em"><span className="gdot" /><span>{t("dash_receipts_today")}</span><b>4</b></div>
            <div className="g-row t-gold"><span className="gdot" /><span>{t("dash_next_backup")}</span><b>15:29</b></div>
            <div className="g-row t-pink"><span className="gdot" /><span>{t("dash_welfare_pending")}</span><b>{recentActivity?.length ?? 0}</b></div>
            <div className="g-row t-sky"><span className="gdot" /><span>{t("dash_fund_balance")}</span><b>{formatCurrency(balance ?? 0)}</b></div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`stat ${s.tint}`}>
              <div className="srow">
                <span className="sic"><Icon size={18} /></span>
                <span className="delta">{s.delta}</span>
              </div>
              <div className="val">{s.value}</div>
              <div className="slab">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="chart-grid">
        <div className="card chart-card t-em">
          <div className="ch-head">
            <div>
              <div className="ch-title">{t("dash_collections_chart")}</div>
              <div className="ch-sub">{t("dash_subscription_receipts")} · {t("dash_last_6_months")}</div>
            </div>
            <div className="ch-legend">
              <span className="lg lg-em">₹ ×1000</span>
            </div>
          </div>
          <div className="ch-body">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={collections || []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--c-em)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--c-em)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12 }} />
                <Area type="monotone" dataKey="amount" stroke="var(--c-em)" strokeWidth={2.6} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-card t-gold">
          <div className="ch-head">
            <div>
              <div className="ch-title">{t("dash_income_vs_expense")}</div>
              <div className="ch-sub">{t("dash_financial_year")} · {t("dash_to_date")}</div>
            </div>
            <div className="ch-legend">
              <span className="lg lg-em">{t("dash_income")}</span>
              <span className="lg lg-rose">{t("dash_expense")}</span>
            </div>
          </div>
          <div className="ch-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={incomeExpense || []} barGap={4}>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "var(--fnt)" }} stroke="var(--line)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12 }} cursor={{ fill: "var(--selbg)" }} />
                <Bar dataKey="income" fill="var(--c-em)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" fill="var(--c-rose)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card card-pad-4 mt-3">
        <div className="ch-head">
          <div>
            <div className="ch-title">{t("dash_recent_activity")}</div>
            <div className="ch-sub">{t("dash_last_audit")}</div>
          </div>
          <button className="btn bs bg" onClick={() => { refreshSummary(); refreshActivity(); }}>
            <RefreshCw size={13} /> {t("action_refresh")}
          </button>
        </div>
        <div className="tbl tbl-flat mt-2">
          <table>
            <thead>
              <tr>
                <th>{t("audit_time")}</th>
                <th>{t("audit_user")}</th>
                <th>{t("audit_action")}</th>
                <th>{t("audit_description")}</th>
              </tr>
            </thead>
            <tbody>
              {(recentActivity || []).length === 0 ? (
                <tr><td colSpan={4} className="tempty">{t("dash_no_activity")}</td></tr>
              ) : (
                (recentActivity || []).slice(0, 6).map((a: any) => (
                  <tr key={a.id}>
                    <td><span className="recent-time">{new Date(a.created_at).toLocaleTimeString(displayLocale, { hour: "2-digit", minute: "2-digit" })}</span></td>
                    <td>{a.username}</td>
                    <td><span className="pill t-slate">{a.action}</span></td>
                    <td><span className="recent-desc">{a.description}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
