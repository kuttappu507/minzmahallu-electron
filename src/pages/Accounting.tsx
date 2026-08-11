import { useState } from "react";
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList, useAsync } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Transaction {
  id: number;
  receipt: string;
  txn_date: string;
  type: string;
  amount: number;
  payment_method: string;
  description: string;
  account_id: number;
  transaction_ref: string;
}

const emptyForm: Partial<Transaction> = {
  receipt: "", txn_date: "", type: "Income", amount: 0, payment_method: "Cash",
  description: "", account_id: 1, transaction_ref: "",
};

export function Accounting() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>(emptyForm);

  const { rows, total, totalPages, loading, refetch } = useList(
    (filter) => window.mms.accounting.list(filter),
    { pageSize: 20 }
  );

  const { data: totalIncome, refresh: refreshIncome } = useAsync(() => window.mms.accounting.totalIncome(), []);
  const { data: totalExpense, refresh: refreshExpense } = useAsync(() => window.mms.accounting.totalExpense(), []);
  const { data: balance, refresh: refreshBalance } = useAsync(() => window.mms.accounting.balance(), []);

  const refreshSummary = () => {
    refreshIncome();
    refreshExpense();
    refreshBalance();
  };

  const openAdd = (type: "Income" | "Expense") => {
    setForm({ ...emptyForm, type });
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.amount || !form.txn_date) {
      toast.error("Amount and Date are required");
      return;
    }
    try {
      if (editingId) {
        await window.mms.accounting.update(editingId, form);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.accounting.create(form);
        toast.success(t("add_transaction"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
      refreshSummary();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleEdit = async (id: number) => {
    const txn = await window.mms.accounting.get(id);
    setForm(txn || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await window.mms.accounting.remove(id);
      toast.success("Deleted");
      refetch();
      refreshSummary();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Transaction>[] = [
    { header: t("sub_receipt"), accessor: (r) => <span className="font-semibold">{r.receipt}</span> },
    { header: t("don_date"), accessor: (r) => formatDate(r.txn_date) },
    {
      header: t("acc_type"),
      accessor: (r) => (
        <Badge variant={r.type === "Income" ? "success" : "danger"}>{r.type}</Badge>
      ),
    },
    { header: t("acc_description"), accessor: (r) => r.description || "—" },
    {
      header: t("sub_amount"),
      accessor: (r) => (
        <span className={r.type === "Income" ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
          {r.type === "Income" ? "+" : "−"}{formatCurrency(r.amount)}
        </span>
      ),
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
          <h1 className="text-2xl font-bold text-text-primary">{t("acc_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("acc_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openAdd("Income")}>
            <Plus className="h-4 w-4" />
            {t("acc_add_income")}
          </Button>
          <Button variant="danger" onClick={() => openAdd("Expense")}>
            <Plus className="h-4 w-4" />
            {t("acc_add_expense")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-medium">{t("acc_income")}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalIncome ?? 0)}</p>
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-medium">{t("acc_expense")}</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(totalExpense ?? 0)}</p>
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 text-rose-600">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-medium">{t("acc_balance")}</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(balance ?? 0)}</p>
            </div>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600">
              <Scale className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        rows={rows as Transaction[]}
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
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Income</option>
            <option>Expense</option>
          </Select>
        }
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? t("action_edit") : (form.type === "Income" ? t("acc_add_income") : t("acc_add_expense"))}
        className="max-w-xl"
      >
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("don_date")} *</Label>
              <Input type="date" value={form.txn_date || ""} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("acc_type")}</Label>
              <Select value={form.type || "Income"} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Income</option>
                <option>Expense</option>
              </Select>
            </div>
            <div>
              <Label>{t("sub_amount")} *</Label>
              <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
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
              <Label>Transaction Reference</Label>
              <Input value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("acc_description")}</Label>
            <Textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
