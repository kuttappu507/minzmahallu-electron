import { useState } from "react";
import { ScrollText, Eye } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Badge, Select, Button, Dialog } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { formatDateTime } from "@/lib/utils";

interface AuditEntry {
  id: number;
  created_at: string;
  username: string;
  action: string;
  module: string;
  description: string;
  entity_id: number;
  metadata: string;
  user_id: number;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<AuditEntry | null>(null);

  const { rows, total, totalPages, loading } = useList(
    (filter) => window.mms.audit.list(filter),
    { pageSize: 50 }
  );

  const handleRowDoubleClick = (row: AuditEntry) => {
    setPreviewRow(row);
    setPreviewOpen(true);
  };

  const columns: Column<AuditEntry>[] = [
    { header: t("audit_time"), accessor: (r) => formatDateTime(r.created_at) },
    { header: t("audit_user"), accessor: (r) => <span className="font-medium">{r.username}</span> },
    {
      header: t("audit_action"),
      accessor: (r) => <Badge variant={actionVariant(r.action)}>{r.action}</Badge>,
    },
    { header: t("audit_module"), accessor: (r) => <span className="text-text-secondary">{r.module}</span> },
    { header: t("audit_description"), accessor: (r) => r.description || "—" },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("audit_time"), v: formatDateTime(previewRow.created_at) },
        { k: t("audit_user"), v: previewRow.username || "—" },
        { k: t("audit_action"), v: previewRow.action || "—" },
        { k: t("audit_module"), v: previewRow.module || "—" },
        { k: t("ui_entity_id"), v: previewRow.entity_id != null ? String(previewRow.entity_id) : "—" },
        { k: t("ui_user_id"), v: previewRow.user_id != null ? String(previewRow.user_id) : "—" },
        { k: t("audit_description"), v: previewRow.description || "—", full: true },
        { k: t("ui_metadata"), v: previewRow.metadata || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <ScrollText size={20} />
        </div>
        <div>
          <h1>{t("audit_title")}</h1>
          <div className="vs">{t("audit_subtitle")}</div>
        </div>
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
        onRowDoubleClick={handleRowDoubleClick}
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

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("audit_title")}
      >
        <div className="dlg-pad">
          {previewRow && (
            <>
              <div className="dlg-hero t-em">
                <div className="dlg-hero-ic">
                  <Eye size={20} />
                </div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">
                    {previewRow.action}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.username} · {previewRow.module} · {formatDateTime(previewRow.created_at)}
                  </div>
                </div>
                <Badge variant={actionVariant(previewRow.action)}>{previewRow.action}</Badge>
              </div>
              <div className="det-grid">
                {previewDetails.map((d, i) => (
                  <div key={i} className={`det${d.full ? " full" : ""}`}>
                    <span className="k">{d.k}</span>
                    <span className="v">{d.v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="dlg-actions">
            <Button variant="secondary" onClick={() => { setPreviewOpen(false); setPreviewRow(null); }}>
              {t("ui_close")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
