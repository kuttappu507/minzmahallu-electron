import { useState } from "react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Badge, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDateTime } from "@/lib/utils";

interface AuditEntry {
  id: number;
  created_at: string;
  username: string;
  action: string;
  module: string;
  description: string;
}

function actionVariant(action: string): "default" | "success" | "warning" | "danger" | "info" | "muted" {
  const a = action?.toUpperCase() || "";
  if (a.includes("CREATE")) return "success";
  if (a.includes("UPDATE")) return "info";
  if (a.includes("DELETE")) return "danger";
  if (a.includes("LOGIN") || a.includes("LOGOUT")) return "muted";
  if (a.includes("APPROVE") || a.includes("DISBURSE")) return "default";
  if (a.includes("REJECT")) return "warning";
  return "muted";
}

export function AuditLog() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [page, setPage] = useState(1);

  const { rows, total, totalPages, loading } = useList(
    (filter) => window.mms.audit.list(filter),
    { pageSize: 50 }
  );

  const columns: Column<AuditEntry>[] = [
    { header: t("audit_time"), accessor: (r) => formatDateTime(r.created_at) },
    { header: t("audit_user"), accessor: (r) => <span className="font-semibold">{r.username}</span> },
    {
      header: t("audit_action"),
      accessor: (r) => <Badge variant={actionVariant(r.action)}>{r.action}</Badge>,
    },
    { header: t("audit_module"), accessor: (r) => <span className="text-text-secondary">{r.module}</span> },
    { header: t("audit_description"), accessor: (r) => r.description || "—" },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t("audit_title")}</h1>
        <p className="text-sm text-text-secondary mt-1">Track all user actions and system changes</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows as AuditEntry[]}
        loading={loading}
        total={total}
        page={page}
        pageSize={50}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
        searchPlaceholder="Search by user or description..."
        toolbar={
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="w-48">
            <option>All</option>
            <option>CREATE</option>
            <option>UPDATE</option>
            <option>DELETE</option>
            <option>LOGIN</option>
            <option>LOGOUT</option>
          </Select>
        }
      />
    </div>
  );
}
