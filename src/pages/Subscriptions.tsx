import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, AlertCircle, Wallet, Eye } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList, useAsync } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, statusVariant } from "@/lib/utils";

interface Subscription {
  id: number;
  receipt_number: string;
  family_id: number;
  family_number: string;
  house_name?: string;
  member_id: number;
  member_name: string;
  plan_id: number;
  plan_name?: string;
  amount: number;
  amount_paid: number;
  period_start: string;
  period_end: string;
  payment_date: string;
  payment_method: string;
  transaction_ref: string;
  status: string;
  collected_by: number;
  remarks: string;
}

const emptyForm: Partial<Subscription> = {
  receipt_number: "", family_id: 0, member_name: "", plan_id: 1, plan_name: "",
  amount: 0, amount_paid: 0, period_start: "", period_end: "", payment_date: "",
  payment_method: "Cash", transaction_ref: "", status: "Pending", remarks: "",
};

const codeFontStyle = "code-text-sm";

export function Subscriptions() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Subscription>>(emptyForm);
  const [families, setFamilies] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Subscription | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.subscriptions.list(filter),
    { pageSize: 20, initialFilters: { status: statusFilter !== "All" ? statusFilter : undefined } }
  );

  const { data: totalCollected, refresh: refreshCollected } = useAsync(() => window.mms.subscriptions.totalCollected(), []);
  const { data: totalPending, refresh: refreshPending } = useAsync(() => window.mms.subscriptions.totalPending(), []);

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
    window.mms.subscriptions.plans().then((r) => setPlans(r || [])).catch(() => {});
  }, []);

  // Re-trigger filter change
  useEffect(() => {
    if (statusFilter !== "All") {
      // re-fetch is automatic via useList dependency on filters (we mutate setFilters below)
    }
  }, [statusFilter]);

  const handleSave = async () => {
    if (!form.family_id || !form.amount) {
      toast.error(t("ui_family_amount_required"));
      return;
    }
    try {
      const payload: any = {
        familyId: form.family_id,
        memberId: form.member_id || null,
        planId: form.plan_id || 1,
        periodStart: form.period_start,
        periodEnd: form.period_end,
        amount: form.amount,
        amountPaid: form.amount_paid ?? 0,
        paymentDate: form.payment_date,
        receiptNumber: form.receipt_number || "",
        paymentMethod: form.payment_method,
        transactionRef: form.transaction_ref || "",
        status: form.status,
        collectedBy: 1,
        remarks: form.remarks || "",
      };
      if (editingId) {
        await window.mms.subscriptions.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.subscriptions.create(payload);
        toast.success(t("add_subscription"));
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
    const s = await window.mms.subscriptions.get(id);
    setForm(s || emptyForm);
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
      await window.mms.subscriptions.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Subscription) => {
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

  const handleMarkOverdue = async () => {
    try {
      const count = await window.mms.subscriptions.markOverdue();
      toast.success(`${count} subscriptions marked overdue`);
      refetch();
      refreshCollected();
      refreshPending();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Subscription>[] = [
    {
      header: t("sub_receipt"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.receipt_number || "—"}
        </span>
      ),
    },
    { header: t("member_family"), accessor: (r) => r.house_name || r.family_number || "—" },
    { header: t("member_name"), accessor: (r) => r.member_name || "—" },
    { header: t("sub_plan"), accessor: (r) => r.plan_name || "—" },
    { header: t("sub_amount"), accessor: (r) => formatCurrency(r.amount) },
    { header: t("sub_amount_paid"), accessor: (r) => formatCurrency(r.amount_paid) },
    { header: t("sub_period_start"), accessor: (r) => formatDate(r.period_start) },
    {
      header: t("family_status"),
      accessor: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
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
        { k: t("sub_receipt"), v: previewRow.receipt_number },
        { k: t("member_family"), v: previewRow.house_name || previewRow.family_number || "—" },
        { k: t("member_name"), v: previewRow.member_name || "—" },
        { k: t("sub_plan"), v: previewRow.plan_name || "—" },
        { k: t("sub_amount"), v: formatCurrency(previewRow.amount) },
        { k: t("sub_amount_paid"), v: formatCurrency(previewRow.amount_paid) },
        { k: t("sub_period_start"), v: formatDate(previewRow.period_start) },
        { k: t("sub_period_end"), v: formatDate(previewRow.period_end) },
        { k: t("sub_payment_date"), v: formatDate(previewRow.payment_date) },
        { k: t("sub_method"), v: previewRow.payment_method || "—" },
        { k: t("ui_transaction_ref"), v: previewRow.transaction_ref || "—" },
        { k: t("family_status"), v: previewRow.status },
        { k: t("ui_remarks"), v: previewRow.remarks || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Wallet size={20} />
        </div>
        <div>
          <h1>{t("sub_title")}</h1>
          <div className="vs">{t("sub_subtitle")}</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={handleMarkOverdue}>
            <AlertCircle className="h-4 w-4" />
            {t("sub_mark_overdue")}
          </Button>
          <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t("add_subscription")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid stat-grid-2">
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><Wallet size={18} /></span>
            <span className="delta">{t("sub_collected")}</span>
          </div>
          <div className="val">{formatCurrency(totalCollected ?? 0)}</div>
          <div className="slab">{t("sub_total_collected")}</div>
        </div>
        <div className="stat t-rose">
          <div className="srow">
            <span className="sic"><AlertCircle size={18} /></span>
            <span className="delta">{t("sub_dues")}</span>
          </div>
          <div className="val">{formatCurrency(totalPending ?? 0)}</div>
          <div className="slab">{t("sub_pending_dues")}</div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Subscription[]}
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
            <option value="All">{t("filter_all")}</option>
            <option value="Paid">{t("status_paid")}</option>
            <option value="Pending">{t("status_pending")}</option>
            <option value="Overdue">{t("status_overdue")}</option>
            <option value="Partial">{t("status_partial")}</option>
          </Select>
        }
      />

      {/* Preview Dialog (read-only) */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("sub_title")}
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
                    {previewRow.receipt_number}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.member_name || previewRow.family_number || "—"}
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
        title={editingId ? t("action_edit") : t("add_subscription")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("member_family")} *</Label>
              <Select value={form.family_id || ""} onChange={async (e) => {
                const fid = Number(e.target.value);
                setForm({ ...form, family_id: fid, member_id: 0, member_name: "" });
                if (fid) {
                  try {
                    const result = await window.mms.members.list({ familyId: fid, pageSize: 100 });
                    setFamilyMembers(result.rows || []);
                  } catch { setFamilyMembers([]); }
                } else {
                  setFamilyMembers([]);
                }
              }}>
                <option value="">{t("ui_select")}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("member_name")}</Label>
              <Select
                value={form.member_id || ""}
                onChange={async (e) => {
                  const mid = Number(e.target.value);
                  const m = familyMembers.find((x) => x.id === mid);
                  setForm({ ...form, member_id: mid, member_name: m?.name || "" });
                }}
              >
                <option value="">—</option>
                {familyMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("sub_plan")}</Label>
              <Select
                value={form.plan_id || ""}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  const p = plans.find((x) => x.id === pid);
                  setForm({ ...form, plan_id: pid, plan_name: p?.name || "" });
                }}
              >
                <option value="">—</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>{t("sub_amount")} *</Label>
              <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("sub_amount_paid")}</Label>
              <Input type="number" value={form.amount_paid || ""} onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("sub_period_start")}</Label>
              <Input type="date" value={form.period_start || ""} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            </div>
            <div>
              <Label>{t("sub_period_end")}</Label>
              <Input type="date" value={form.period_end || ""} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
            </div>
            <div>
              <Label>{t("sub_payment_date")}</Label>
              <Input type="date" value={form.payment_date || ""} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("sub_method")}</Label>
              <Select value={form.payment_method || "Cash"} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="Cash">{t("payment_cash")}</option>
                <option value="Cheque">{t("payment_cheque")}</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">{t("payment_bank_transfer")}</option>
                <option value="Card">{t("payment_card")}</option>
                <option value="Other">{t("payment_other")}</option>
              </Select>
            </div>
            <div>
              <Label>{t("family_status")}</Label>
              <Select value={form.status || "Pending"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Paid">{t("status_paid")}</option>
                <option value="Pending">{t("status_pending")}</option>
                <option value="Overdue">{t("status_overdue")}</option>
                <option value="Partial">{t("status_partial")}</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("ui_remarks")}</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
        confirmLabel={t("ui_delete_subscription_label")}
      />
    </div>
  );
}
