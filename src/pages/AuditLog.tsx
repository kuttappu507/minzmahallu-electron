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
    { header: t("audit_user"), accessor: (r) => <span className="font-semibold">{r.username}</span> },
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
        { k: "Entity ID", v: previewRow.entity_id != null ? String(previewRow.entity_id) : "—" },
        { k: "User ID", v: previewRow.user_id != null ? String(previewRow.user_id) : "—" },
        { k: t("audit_description"), v: previewRow.description || "—", full: true },
        { k: "Metadata", v: previewRow.metadata || "—", full: true },
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
          <div className="vs">Track all user actions and system changes</div>
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
        <div style={{ padding: "2px 0" }}>
          {previewRow && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  marginBottom: 14,
                  background: "var(--sb)",
                  border: "1.5px solid var(--sl)",
                  borderRadius: 14,
                }}
                className="t-em"
              >
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 14, flex: "none",
                    background: "var(--sc)", color: "#fff",
                    display: "grid", placeItems: "center",
                    boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                  }}
                >
                  <Eye size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 16px 'Space Grotesk'", color: "var(--st)" }}>
                    {previewRow.action}
                  </div>
                  <div style={{ font: "700 11px Poppins", color: "var(--st)", marginTop: 2 }}>
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Button variant="secondary" onClick={() => { setPreviewOpen(false); setPreviewRow(null); }}>
              {t("ui_close")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
