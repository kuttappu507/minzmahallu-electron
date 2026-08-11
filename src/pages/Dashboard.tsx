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
    { label: t("dash_total_families"), value: summary?.total_families ?? 0, icon: Users2, color: "text-brand-600 bg-brand-50" },
    { label: t("dash_total_members"), value: summary?.total_members ?? 0, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: t("dash_active_members"), value: summary?.active_members ?? 0, icon: UserCheck, color: "text-cyan-600 bg-cyan-50" },
    { label: t("dash_monthly_collection"), value: formatCurrency(summary?.monthly_collection ?? 0), icon: Wallet, color: "text-emerald-600 bg-emerald-50" },
    { label: t("dash_pending_dues"), value: formatCurrency(summary?.pending_dues ?? 0), icon: AlertCircle, color: "text-rose-600 bg-rose-50" },
    { label: t("dash_donations_month"), value: formatCurrency(summary?.monthly_donations ?? 0), icon: HeartHandshake, color: "text-pink-600 bg-pink-50" },
    { label: t("dash_marriages_year"), value: summary?.marriages_this_year ?? 0, icon: Heart, color: "text-purple-600 bg-purple-50" },
    { label: t("dash_deaths_year"), value: summary?.deaths_this_year ?? 0, icon: Skull, color: "text-gray-600 bg-gray-50" },
    { label: t("dash_balance_month"), value: formatCurrency((incomeThisMonth ?? 0) - (expenseThisMonth ?? 0)), icon: Scale, color: "text-indigo-600 bg-indigo-50" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          {t("dash_greeting")} {user?.fullName}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("dash_subtitle")}</p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-text-tertiary font-medium">{stat.label}</p>
                    <p className="text-xl font-bold text-text-primary mt-1">{stat.value}</p>
                  </div>
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${stat.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">{t("dash_chart_collections")}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={collections || []}>
                <defs>
                  <linearGradient id="collectionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#collectionGrad)"
                  name={t("dash_chart_collections")}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">{t("dash_chart_income_expense")}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={incomeExpense || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#059669" name={t("acc_income")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name={t("acc_expense")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-base font-semibold text-text-primary mb-4">{t("dash_recent_activity")}</h3>
          <div className="space-y-2">
            {(recentActivity || []).length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-8">No recent activity</p>
            ) : (
              (recentActivity || []).map((activity: any) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-subtle text-primary">
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
                      {activity.username} · {formatDate(activity.created_at)} · {activity.module}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-text-tertiary px-2 py-0.5 bg-surface-hover rounded">
                    {activity.action}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
