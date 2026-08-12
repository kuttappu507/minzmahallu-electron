import { useState } from "react";
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, Scale, Eye } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList, useAsync } from "@/hooks/useList";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Transaction {
  id: number;
  receipt_number: string;
  txn_date: string;
  type: string;
  amount: number;
  payment_method: string;
  description: string;
  account_id: number;
  transaction_ref: string;
  linked_module: string;
  linked_id: number;
  created_by_name?: string;
}

const emptyForm: Partial<Transaction> = {
  receipt_number: "", txn_date: "", type: "Income", amount: 0, payment_method: "Cash",
  description: "", account_id: 1, transaction_ref: "", linked_module: "", linked_id: 0,
};

const codeFontStyle = "code-text-sm";

export function Accounting() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>(emptyForm);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Transaction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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
      toast.error(t("ui_amount_date_required"));
      return;
    }
    try {
      const payload: any = {
        txnDate: form.txn_date,
        accountId: form.account_id || 1,
        type: form.type,
        amount: form.amount,
        paymentMethod: form.payment_method || "Cash",
        description: form.description || "",
        linkedModule: form.linked_module || "",
        linkedId: form.linked_id || null,
        receiptNumber: form.receipt_number || "",
        transactionRef: form.transaction_ref || "",
        createdBy: 1,
      };
      if (editingId) {
        await window.mms.accounting.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        await window.mms.accounting.create(payload);
        toast.success(t("add_transaction"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
      refreshSummary();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    }
  };

  const handleEdit = async (id: number) => {
    const txn = await window.mms.accounting.get(id);
    setForm(txn || emptyForm);
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
      await window.mms.accounting.remove(pendingDeleteId);
      toast.success(t("ui_record_deleted"));
      refetch();
      refreshSummary();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleRowDoubleClick = (row: Transaction) => {
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

  const columns: Column<Transaction>[] = [
    {
      header: t("sub_receipt"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.receipt_number || "—"}
        </span>
      ),
    },
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
          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(r.id)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
      align: "right",
    },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("sub_receipt"), v: previewRow.receipt_number || "—" },
        { k: t("don_date"), v: formatDate(previewRow.txn_date) },
        { k: t("acc_type"), v: previewRow.type },
        { k: t("sub_amount"), v: formatCurrency(previewRow.amount) },
        { k: t("sub_method"), v: previewRow.payment_method || "—" },
        { k: t("ui_account_id"), v: String(previewRow.account_id ?? "—") },
        { k: t("ui_transaction_ref"), v: previewRow.transaction_ref || "—" },
        { k: t("ui_linked_module"), v: previewRow.linked_module || "—" },
        { k: t("ui_created_by"), v: previewRow.created_by_name || "—" },
        { k: t("acc_description"), v: previewRow.description || "—", full: true },
      ]
    : [];

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em">
          <Scale size={20} />
        </div>
        <div>
          <h1>{t("acc_title")}</h1>
          <div className="vs">{t("acc_subtitle")}</div>
        </div>
        <div className="vr">
          <Button onClick={() => openAdd("Income")}>
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
      <div className="stat-grid stat-grid-3">
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><TrendingUp size={18} /></span>
            <span className="delta">income</span>
          </div>
          <div className="val">{formatCurrency(totalIncome ?? 0)}</div>
          <div className="slab">{t("acc_income")}</div>
        </div>
        <div className="stat t-rose">
          <div className="srow">
            <span className="sic"><TrendingDown size={18} /></span>
            <span className="delta">expense</span>
          </div>
          <div className="val">{formatCurrency(totalExpense ?? 0)}</div>
          <div className="slab">{t("acc_expense")}</div>
        </div>
        <div className="stat t-sky">
          <div className="srow">
            <span className="sic"><Scale size={18} /></span>
            <span className="delta">balance</span>
          </div>
          <div className="val">{formatCurrency(balance ?? 0)}</div>
          <div className="slab">{t("acc_balance")}</div>
        </div>
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
        onRowDoubleClick={handleRowDoubleClick}
        toolbar={
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
            <option>All</option>
            <option>Income</option>
            <option>Expense</option>
          </Select>
        }
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("acc_title")}
      >
        <div className="dlg-pad">
          {previewRow && (
            <>
              <div className={`dlg-hero ${previewRow.type === "Income" ? "t-em" : "t-rose"}`}>
                <div className="dlg-hero-ic">
                  <Eye size={20} />
                </div>
                <div className="dlg-hero-body">
                  <div className="dlg-hero-title">
                    {previewRow.receipt_number || previewRow.description || "Transaction"}
                  </div>
                  <div className="dlg-hero-sub">
                    {previewRow.type} · {formatDate(previewRow.txn_date)} · {formatCurrency(previewRow.amount)}
                  </div>
                </div>
                <Badge variant={previewRow.type === "Income" ? "success" : "danger"}>{previewRow.type}</Badge>
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
              <Label>{t("ui_transaction_ref")}</Label>
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
        onConfirm={handleDeleteConfirm}
        title={t("ui_confirm_delete")}
        confirmLabel={t("ui_delete_transaction_label")}
      />
    </div>
  );
}
