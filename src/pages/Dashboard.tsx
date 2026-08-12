import { useAsync } from "@/hooks/useList";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  Home, Users, UserCheck, Wallet, AlertCircle,
  Gift, Activity, Gem, Flower, TrendingUp,
  Plus, User, Receipt, BarChart3, RefreshCw, Clock, Database,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const TINTS = {
  em: { sc: "var(--c-em)", sb: "var(--sb)", st: "var(--st)", sl: "var(--sl)" },
  gold: { sc: "var(--c-gold)", sb: "var(--sb)", st: "var(--st)", sl: "var(--sl)" },
  sky: { sc: "var(--c-sky)", sb: "var(--sb)", st: "var(--st)", sl: "var(--sl)" },
};

export function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: summary, refresh: refreshSummary } = useAsync(() => window.mms.dashboard.summary(), []);
  const { data: incomeThisMonth } = useAsync(() => window.mms.dashboard.incomeThisMonth(), []);
  const { data: expenseThisMonth } = useAsync(() => window.mms.dashboard.expenseThisMonth(), []);
  const { data: collections } = useAsync(() => window.mms.dashboard.monthlyCollections(6), []);
  const { data: incomeExpense } = useAsync(() => window.mms.dashboard.incomeVsExpense(6), []);
  const { data: recentActivity, refresh: refreshActivity } = useAsync(() => window.mms.dashboard.recentActivity(8), []);

  const stats = [
    { label: "Total Families", value: summary?.total_families ?? 0, icon: Home, tint: "t-em", delta: "▲ +6 this month" },
    { label: "Total Members", value: summary?.total_members ?? 0, icon: Users, tint: "t-teal", delta: "▲ +18 this month" },
    { label: "Active Members", value: summary?.active_members ?? 0, icon: UserCheck, tint: "t-sky", delta: "▲ 86.3% active" },
    { label: "Collection", value: formatCurrency(summary?.monthly_collection ?? 0), icon: Wallet, tint: "t-gold", delta: "▲ total collected" },
    { label: "Pending Dues", value: formatCurrency(summary?.pending_dues ?? 0), icon: AlertCircle, tint: "t-rose", delta: "▼ overdue" },
    { label: "Donations · Month", value: formatCurrency(summary?.monthly_donations ?? 0), icon: Gift, tint: "t-pink", delta: "▲ +12.4%" },
    { label: "Marriages · Year", value: summary?.marriages_this_year ?? 0, icon: Gem, tint: "t-orange", delta: "▲ 2 this qtr" },
    { label: "Deaths · Year", value: summary?.deaths_this_year ?? 0, icon: Flower, tint: "t-slate", delta: "▼ 1 this month" },
    { label: "Fund Balance", value: formatCurrency((incomeThisMonth ?? 0) - (expenseThisMonth ?? 0)), icon: TrendingUp, tint: "t-blue", delta: "▲ all funds" },
  ];

  const quickActions = [
    { label: "Add Family", icon: Plus, action: "families" },
    { label: "Add Member", icon: User, action: "members" },
    { label: "Record Payment", icon: Wallet, action: "subscriptions" },
    { label: "Add Donation", icon: Gift, action: "donations" },
    { label: "Generate Report", icon: BarChart3, action: "reports" },
  ];

  return (
    <div className="view view-enter">
      {/* Hero bento */}
      <div className="hero-row">
        <div className="hero t-em">
          <div className="overline">Minz Mahallu · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1>
            {t("dash_greeting")} <span style={{ color: "var(--st)" }}>{user?.fullName}</span>
          </h1>
          <div className="sub">{t("dash_subtitle")}</div>
          <div className="gchips">
            <span className="gchip t-gold"><Clock size={13} /> Week 31 · Day 209</span>
            <span className="gchip t-sky"><Wallet size={13} /> FY 2026-27 · Q2</span>
            <span className="gchip t-em"><Database size={13} /> Backup OK</span>
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
            <b>Subscriptions overdue</b>
            <p>Review & collect pending dues across wards.</p>
            <div className="bx">
              <button className="btn bs bd" onClick={() => navigate("/subscriptions")}>Review now</button>
            </div>
          </div>

          <div className="glance">
            <b>Today at a glance</b>
            <div className="g-row t-em"><span className="gdot" /><span>Receipts today</span><b>4 issued</b></div>
            <div className="g-row t-gold"><span className="gdot" /><span>Next auto-backup</span><b>15:29</b></div>
            <div className="g-row t-pink"><span className="gdot" /><span>Welfare pending</span><b>{recentActivity?.length ?? 0} requests</b></div>
            <div className="g-row t-sky"><span className="gdot" /><span>Fund balance</span><b>{formatCurrency((incomeThisMonth ?? 0) - (expenseThisMonth ?? 0))}</b></div>
          </div>
        </div>
      </div>

      {/* Stat grid */}
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

      {/* Charts */}
      <div className="chart-grid">
        <div className="card chart-card t-em">
          <div className="ch-head">
            <div>
              <div className="ch-title">Collections</div>
              <div className="ch-sub">Subscription receipts · last 6 months</div>
            </div>
            <div className="ch-legend">
              <span className="lg" style={{ "--c": "var(--c-em)" } as any}>₹ ×1000</span>
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
              <div className="ch-title">Income vs Expense</div>
              <div className="ch-sub">Financial year · to date</div>
            </div>
            <div className="ch-legend">
              <span className="lg" style={{ "--c": "var(--c-em)" } as any}>Income</span>
              <span className="lg" style={{ "--c": "var(--c-rose)" } as any}>Expense</span>
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

      {/* Recent activity */}
      <div className="card" style={{ padding: "16px 17px" }}>
        <div className="ch-head">
          <div>
            <div className="ch-title">Recent Activity</div>
            <div className="ch-sub">Last audit log entries</div>
          </div>
          <button className="btn bs bg" onClick={() => { refreshSummary(); refreshActivity(); }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div className="tbl" style={{ marginTop: 10, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {(recentActivity || []).length === 0 ? (
                <tr><td colSpan={4} className="tempty">No recent activity</td></tr>
              ) : (
                (recentActivity || []).slice(0, 6).map((a: any) => (
                  <tr key={a.id}>
                    <td><span style={{ font: "700 12px 'Space Grotesk'", color: "var(--fnt)" }}>{new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></td>
                    <td>{a.username}</td>
                    <td><span className="pill t-slate">{a.action}</span></td>
                    <td><span style={{ fontWeight: 700 }}>{a.description}</span></td>
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
