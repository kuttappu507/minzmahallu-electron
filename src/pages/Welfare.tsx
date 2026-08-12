import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, X, Send, Eye, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge, SectionLabel } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, statusVariant } from "@/lib/utils";

interface Welfare {
  id: number;
  request_number: string;
  applicant_name: string;
  family_id: number;
  category: string;
  amount_requested: number;
  amount_approved: number;
  reason: string;
  remarks: string;
  status: string;
  request_date: string;
  rejection_reason: string;
  processed_by: number;
  processed_date: string;
  disbursed_date: string;
}

const emptyForm: Partial<Welfare> = {
  request_number: "", applicant_name: "", family_id: 0, category: "",
  amount_requested: 0, amount_approved: 0, reason: "", remarks: "", status: "Pending",
};

const codeFontStyle = "code-text-sm";

export function Welfare() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Welfare>>(emptyForm);
  const [families, setFamilies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [approveAmount, setApproveAmount] = useState(0);
  const [approveRemarks, setApproveRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Welfare | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.welfare.list(filter),
    { pageSize: 20 }
  );

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
    window.mms.welfare.categories().then((r) => setCategories(r || [])).catch(() => {});
  }, []);

  const totalRequested = (rows as Welfare[]).reduce((s, r) => s + (r.amount_requested || 0), 0);
  const totalApproved = (rows as Welfare[]).reduce((s, r) => s + (r.amount_approved || 0), 0);

  const handleSave = async () => {
    if (!form.applicant_name || !form.amount_requested) {
      toast.error(t("ui_applicant_amount_required"));
      return;
    }
    try {
      const payload: any = {
        applicantName: form.applicant_name,
        familyId: form.family_id || null,
        category: form.category || "",
        amountRequested: form.amount_requested,
        amountApproved: form.amount_approved ?? 0,
        reason: form.reason || "",
        remarks: form.remarks || "",
        processedBy: 1,
      };
      if (editingId) {
        await window.mms.welfare.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.welfare.create(payload);
        toast.success(t("wel_new_request"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    }
  };

  const handleEdit = async (id: number) => {
    const w = await window.mms.welfare.get(id);
    setForm(w || emptyForm);
    setApproveAmount(w?.amount_approved || w?.amount_requested || 0);
    setApproveRemarks(w?.remarks || "");
    setRejectReason("");
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (pendingDeleteId == null) return;
    try {
      await window.mms.welfare.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Welfare) => {
    setPreviewRow(row);
    setPreviewOpen(true);
  };

  const switchToEdit = async () => {
    if (!previewRow) return;
    const id = previewRow.id;
    setPreviewOpen(false);
    setPreviewRow(null);
    await handleEdit(id);
  };

  const handleApprove = async () => {
    if (!editingId) return;
    try {
      await window.mms.welfare.approve(editingId, approveAmount, approveRemarks);
      toast.success(t("ui_request_approved"));
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReject = async () => {
    if (!editingId) return;
    if (!rejectReason) {
      toast.error(t("ui_rejection_required"));
      return;
    }
    try {
      await window.mms.welfare.reject(editingId, rejectReason);
      toast.success(t("ui_request_rejected"));
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDisburse = async (id: number) => {
    try {
      await window.mms.welfare.disburse(id);
      toast.success(t("ui_marked_disbursed"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Welfare>[] = [
    {
      header: t("wel_request_no"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.request_number}
        </span>
      ),
    },
    { header: t("wel_applicant"), accessor: (r) => <span className="font-medium">{r.applicant_name}</span> },
    { header: t("don_category"), accessor: (r) => <Badge variant="muted">{r.category}</Badge> },
    { header: t("wel_amount_requested"), accessor: (r) => formatCurrency(r.amount_requested) },
    { header: t("wel_amount_approved"), accessor: (r) => formatCurrency(r.amount_approved) },
    {
      header: t("family_status"),
      accessor: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {r.status === "Approved" && (
            <Button variant="ghost" size="icon" title={t("wel_mark_disbursed")} onClick={() => handleDisburse(r.id)}>
              <Send className="h-4 w-4 text-emerald-600" />
            </Button>
          )}
          <button className="act-btn act-edit" onClick={() => handleEdit(r.id)}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button className="act-btn act-del" onClick={() => handleDeleteClick(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </button>
        </div>
      ),
      align: "right",
    },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("wel_request_no"), v: previewRow.request_number },
        { k: t("wel_applicant"), v: previewRow.applicant_name },
        { k: t("don_category"), v: previewRow.category || "—" },
        { k: t("wel_amount_requested"), v: formatCurrency(previewRow.amount_requested) },
        { k: t("wel_amount_approved"), v: formatCurrency(previewRow.amount_approved) },
        { k: t("family_status"), v: previewRow.status },
        { k: t("ui_request_date"), v: previewRow.request_date || "—" },
        { k: t("ui_processed_date"), v: previewRow.processed_date || "—" },
        { k: t("ui_disbursed_date"), v: previewRow.disbursed_date || "—" },
        { k: t("wel_reason"), v: previewRow.reason || "—", full: true },
        { k: t("ui_remarks"), v: previewRow.remarks || "—", full: true },
        { k: t("ui_rejection_reason"), v: previewRow.rejection_reason || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1>{t("wel_title")}</h1>
          <div className="vs">{t("wel_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("wel_new_request")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid stat-grid-2">
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><ShieldCheck size={18} /></span>
            <span className="delta">requested</span>
          </div>
          <div className="val">{formatCurrency(totalRequested)}</div>
          <div className="slab">Total Requested</div>
        </div>
        <div className="stat t-gold">
          <div className="srow">
            <span className="sic"><Check size={18} /></span>
            <span className="delta">approved</span>
          </div>
          <div className="val">{formatCurrency(totalApproved)}</div>
          <div className="slab">Total Approved</div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Welfare[]}
        loading={loading}
        total={total}
        page={page}
        pageSize={20}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
        onRowDoubleClick={handleRowDoubleClick}
        toolbar={
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option>Disbursed</option>
          </Select>
        }
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("wel_title")}
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
                    {previewRow.applicant_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.request_number} · {formatCurrency(previewRow.amount_requested)}
                  </div>
                </div>
                <Badge variant={statusVariant(previewRow.status)}>{previewRow.status}</Badge>
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
            <Button onClick={switchToEdit}>
              <Edit2 size={14} />
              {t("action_edit")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : t("wel_new_request")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("wel_applicant")} *</Label>
              <Input value={form.applicant_name || ""} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("member_family")} (optional)</Label>
              <Select value={form.family_id || ""} onChange={(e) => setForm({ ...form, family_id: Number(e.target.value) })}>
                <option value="">{t("ui_none")}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("don_category")}</Label>
              <Select value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">{t("ui_select")}</option>
                {categories.map((c) => <option key={c.name || c.id} value={c.name}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>{t("wel_amount_requested")} *</Label>
              <Input type="number" value={form.amount_requested || ""} onChange={(e) => setForm({ ...form, amount_requested: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("wel_amount_approved")}</Label>
              <Input type="number" value={form.amount_approved || ""} onChange={(e) => setForm({ ...form, amount_approved: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("family_status")}</Label>
              <Select value={form.status || "Pending"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Pending</option>
                <option>Approved</option>
                <option>Rejected</option>
                <option>Disbursed</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("wel_reason")}</Label>
            <Textarea rows={2} value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <Label>{t("ui_remarks")}</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>

          {/* Workflow actions for pending */}
          {editingId && form.status === "Pending" && (
            <>
              <div className="sec-divider">
                <SectionLabel>{t("wel_approve_request")}</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("wel_amount_approved")}</Label>
                    <Input type="number" value={approveAmount || ""} onChange={(e) => setApproveAmount(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>{t("ui_remarks")}</Label>
                    <Input value={approveRemarks} onChange={(e) => setApproveRemarks(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button onClick={handleApprove}>
                    <Check className="h-4 w-4" />
                    {t("action_approve")}
                  </Button>
                </div>
              </div>
              <div className="sec-divider">
                <SectionLabel>{t("wel_reject_request")}</SectionLabel>
                <div>
                  <Label>{t("ui_rejection_reason")} *</Label>
                  <Textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="danger" onClick={handleReject}>
                    <X className="h-4 w-4" />
                    {t("action_reject")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {editingId && form.status === "Approved" && (
            <div className="sec-divider">
              <SectionLabel>{t("wel_mark_disbursed")}</SectionLabel>
              <Button onClick={() => editingId && handleDisburse(editingId)}>
                <Send className="h-4 w-4" />
                {t("action_disburse")}
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 sec-divider">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{t("action_save")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_request_label")}
      />
    </div>
  );
}
