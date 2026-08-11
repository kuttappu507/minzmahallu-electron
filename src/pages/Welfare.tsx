import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, X, Send } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge, SectionLabel } from "@/components/ui";
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
  rejection_reason: string;
}

const emptyForm: Partial<Welfare> = {
  request_number: "", applicant_name: "", family_id: 0, category: "",
  amount_requested: 0, amount_approved: 0, reason: "", remarks: "", status: "Pending",
};

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
      toast.error("Applicant Name and Requested Amount are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.welfare.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.welfare.create(form);
        toast.success(t("wel_new_request"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this welfare request?")) return;
    try {
      await window.mms.welfare.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleApprove = async () => {
    if (!editingId) return;
    try {
      await window.mms.welfare.approve(editingId, approveAmount, approveRemarks);
      toast.success("Request approved");
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReject = async () => {
    if (!editingId) return;
    if (!rejectReason) {
      toast.error("Rejection reason is required");
      return;
    }
    try {
      await window.mms.welfare.reject(editingId, rejectReason);
      toast.success("Request rejected");
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDisburse = async (id: number) => {
    try {
      await window.mms.welfare.disburse(id);
      toast.success("Marked as disbursed");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Welfare>[] = [
    { header: t("wel_request_no"), accessor: (r) => <span className="font-semibold">{r.request_number}</span> },
    { header: t("wel_applicant"), accessor: (r) => <span className="font-semibold">{r.applicant_name}</span> },
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
          <Button variant="ghost" size="icon" onClick={() => handleEdit(r.id)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
      align: "right",
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t("wel_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("wel_subtitle")}</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          {t("wel_new_request")}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-text-tertiary font-medium">Total Requested</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(totalRequested)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-text-tertiary font-medium">Total Approved</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalApproved)}</p>
          </CardContent>
        </Card>
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
            <Label>Remarks</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>

          {/* Workflow actions for pending */}
          {editingId && form.status === "Pending" && (
            <>
              <div className="border-t border-border pt-4">
                <SectionLabel>{t("wel_approve_request")}</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("wel_amount_approved")}</Label>
                    <Input type="number" value={approveAmount || ""} onChange={(e) => setApproveAmount(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Remarks</Label>
                    <Input value={approveRemarks} onChange={(e) => setApproveRemarks(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove}>
                    <Check className="h-4 w-4" />
                    {t("action_approve")}
                  </Button>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <SectionLabel>{t("wel_reject_request")}</SectionLabel>
                <div>
                  <Label>Rejection Reason *</Label>
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
            <div className="border-t border-border pt-4">
              <SectionLabel>{t("wel_mark_disbursed")}</SectionLabel>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => editingId && handleDisburse(editingId)}>
                <Send className="h-4 w-4" />
                {t("action_disburse")}
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{t("action_save")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
