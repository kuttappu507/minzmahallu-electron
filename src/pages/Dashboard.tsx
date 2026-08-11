import { useAsync } from "@/hooks/useList";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Users2,
  Users,
  UserCheck,
  Wallet,
  AlertCircle,
  HeartHandshake,
  Heart,
  Skull,
  Scale,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";

export function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: summary } = useAsync(() => window.mms.dashboard.summary(), []);
  const { data: incomeThisMonth } = useAsync(() => window.mms.dashboard.incomeThisMonth(), []);
  const { data: expenseThisMonth } = useAsync(() => window.mms.dashboard.expenseThisMonth(), []);
  const { data: collections } = useAsync(() => window.mms.dashboard.monthlyCollections(6), []);
  const { data: incomeExpense } = useAsync(() => window.mms.dashboard.incomeVsExpense(6), []);
  const { data: recentActivity } = useAsync(() => window.mms.dashboard.recentActivity(8), []);

  const stats = [
    { label: t("dash_total_families"), value: summary?.total_families ?? 0, icon: Users2, gradient: "from-blue-500 to-cyan-500", subtext: "Active families" },
    { label: t("dash_total_members"), value: summary?.total_members ?? 0, icon: Users, gradient: "from-violet-500 to-purple-500", subtext: "Registered" },
    { label: t("dash_active_members"), value: summary?.active_members ?? 0, icon: UserCheck, gradient: "from-emerald-500 to-teal-500", subtext: "Currently active" },
    { label: t("dash_monthly_collection"), value: formatCurrency(summary?.monthly_collection ?? 0), icon: Wallet, gradient: "from-amber-500 to-orange-500", subtext: "Total collected" },
    { label: t("dash_pending_dues"), value: formatCurrency(summary?.pending_dues ?? 0), icon: AlertCircle, gradient: "from-rose-500 to-red-500", subtext: "Outstanding" },
    { label: t("dash_donations_month"), value: formatCurrency(summary?.monthly_donations ?? 0), icon: HeartHandshake, gradient: "from-pink-500 to-rose-500", subtext: "This month" },
    { label: t("dash_marriages_year"), value: summary?.marriages_this_year ?? 0, icon: Heart, gradient: "from-fuchsia-500 to-pink-500", subtext: "This year" },
    { label: t("dash_deaths_year"), value: summary?.deaths_this_year ?? 0, icon: Skull, gradient: "from-slate-500 to-gray-500", subtext: "This year" },
    {
      label: t("dash_balance_month"),
      value: formatCurrency((incomeThisMonth ?? 0) - (expenseThisMonth ?? 0)),
      icon: Scale,
      gradient: "from-indigo-500 to-violet-500",
      subtext: "Income − Expense",
    },
  ];

  const chartTooltipStyle = {
    borderRadius: "12px",
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--surface))",
    color: "hsl(var(--text-primary))",
    fontSize: "12px",
    boxShadow: "0 10px 30px -10px rgb(0 0 0 / 0.2)",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          {t("dash_greeting")} <span className="text-gradient">{user?.fullName}</span>
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("dash_subtitle")}</p>
      </motion.div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
            >
              <Card className="card-hover overflow-hidden group cursor-default">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg group-hover:scale-110 transition-transform duration-200`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <p className="text-xs text-text-tertiary font-medium">{stat.label}</p>
                  <p className="text-xl font-bold tracking-tight text-text-primary mt-1 tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">{stat.subtext}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-text-primary">
                    {t("dash_chart_collections")}
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">Last 6 months</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 text-success text-xs font-medium">
                  <TrendingUp className="h-3 w-3" />
                  Trend
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={collections || []}>
                  <defs>
                    <linearGradient id="collectionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--text-tertiary))" }}
                    stroke="hsl(var(--border))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--text-tertiary))" }}
                    stroke="hsl(var(--border))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#collectionGrad)"
                    name={t("dash_chart_collections")}
                    dot={{ fill: "#6366f1", r: 3 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--surface))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-text-primary">
                    {t("dash_chart_income_expense")}
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">Last 6 months</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-info/10 text-info text-xs font-medium">
                  <Activity className="h-3 w-3" />
                  Compare
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={incomeExpense || []} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--text-tertiary))" }}
                    stroke="hsl(var(--border))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--text-tertiary))" }}
                    stroke="hsl(var(--border))"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    cursor={{ fill: "hsl(var(--surface-hover))" }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: "8px" }} iconType="circle" />
                  <Bar dataKey="income" fill="#10b981" name={t("acc_income")} radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expense" fill="#f43f5e" name={t("acc_expense")} radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold tracking-tight text-text-primary">
                {t("dash_recent_activity")}
              </h3>
              <span className="text-xs text-text-tertiary">{recentActivity?.length || 0} events</span>
            </div>
            <div className="space-y-1">
              {(recentActivity || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="h-8 w-8 text-text-muted mb-2" />
                  <p className="text-sm text-text-tertiary">No recent activity</p>
                </div>
              ) : (
                (recentActivity || []).map((activity: any, idx: number) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-hover transition-colors group"
                  >
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                        activity.action === "CREATE"
                          ? "bg-success/10 text-success"
                          : activity.action === "DELETE"
                          ? "bg-danger/10 text-danger"
                          : activity.action === "LOGIN"
                          ? "bg-info/10 text-info"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {activity.action === "CREATE" ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : activity.action === "DELETE" ? (
                        <TrendingDown className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{activity.description}</p>
                      <p className="text-xs text-text-tertiary">
                        <span className="font-medium text-text-secondary">{activity.username}</span>
                        {" · "}
                        {formatDate(activity.created_at)}
                        {" · "}
                        {activity.module}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-text-tertiary px-2 py-0.5 bg-surface-hover border border-border-subtle rounded uppercase tracking-wide">
                      {activity.action}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
