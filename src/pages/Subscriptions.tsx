import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, AlertCircle, Wallet } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList, useAsync } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, statusVariant } from "@/lib/utils";

interface Subscription {
  id: number;
  receipt: string;
  family_id: number;
  family_number: string;
  member_name: string;
  plan_name: string;
  amount: number;
  amount_paid: number;
  period_start: string;
  period_end: string;
  payment_date: string;
  payment_method: string;
  status: string;
  remarks: string;
}

const emptyForm: Partial<Subscription> = {
  receipt: "", family_id: 0, member_name: "", plan_name: "", amount: 0, amount_paid: 0,
  period_start: "", period_end: "", payment_date: "", payment_method: "Cash",
  status: "Pending", remarks: "",
};

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

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.subscriptions.list(filter),
    { pageSize: 20, initialFilters: { status: statusFilter !== "All" ? statusFilter : undefined } }
  );

  const { data: totalCollected } = useAsync(() => window.mms.subscriptions.totalCollected(), []);
  const { data: totalPending } = useAsync(() => window.mms.subscriptions.totalPending(), []);

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
      toast.error("Family and Amount are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.subscriptions.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.subscriptions.create(form);
        toast.success(t("add_subscription"));
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
    const s = await window.mms.subscriptions.get(id);
    setForm(s || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this subscription?")) return;
    try {
      await window.mms.subscriptions.remove(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleMarkOverdue = async () => {
    try {
      await window.mms.subscriptions.markOverdue();
      toast.success("Overdue status updated");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Subscription>[] = [
    { header: t("sub_receipt"), accessor: (r) => <span className="font-semibold">{r.receipt}</span> },
    { header: t("member_family"), accessor: (r) => r.family_number || "—" },
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
          <h1 className="text-2xl font-bold text-text-primary">{t("sub_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("sub_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-medium">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalCollected ?? 0)}</p>
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-medium">Pending Dues</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(totalPending ?? 0)}</p>
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
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
        toolbar={
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Paid</option>
            <option>Pending</option>
            <option>Overdue</option>
            <option>Partial</option>
          </Select>
        }
      />

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
              <Select value={form.family_id || ""} onChange={(e) => setForm({ ...form, family_id: Number(e.target.value) })}>
                <option value="">{t("ui_select")}</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.house_name} ({f.family_number})</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("member_name")}</Label>
              <Input value={form.member_name || ""} onChange={(e) => setForm({ ...form, member_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("sub_plan")}</Label>
              <Select value={form.plan_name || ""} onChange={(e) => setForm({ ...form, plan_name: e.target.value })}>
                <option value="">—</option>
                {plans.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
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
                <option>Cash</option>
                <option>Cheque</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Card</option>
                <option>Other</option>
              </Select>
            </div>
            <div>
              <Label>{t("family_status")}</Label>
              <Select value={form.status || "Pending"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Paid</option>
                <option>Pending</option>
                <option>Overdue</option>
                <option>Partial</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Remarks</Label>
            <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{t("action_save")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
