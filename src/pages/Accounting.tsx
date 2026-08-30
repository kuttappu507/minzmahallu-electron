import { useEffect, useState } from "react";
import { Plus, Edit2, Ban, ReceiptText, TrendingUp, TrendingDown, Scale, Eye, Calendar, FileDown, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Dialog, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, todayIST } from "@/lib/utils";

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
  voucher_no: string;
  bill_no: string;
  payee: string;
  linked_module: string;
  linked_id: number;
  created_by_name?: string;
}

interface UnifiedRow {
  source_id: number;
  source: "transactions" | "donations" | "subscriptions" | "welfare" | "salary";
  ledger_date: string;
  type: "Income" | "Expense";
  amount: number;
  description: string;
  payment_method: string;
  transaction_ref: string;
  receipt_number: string;
  voucher_no?: string | null;
  bill_no?: string | null;
  payee?: string | null;
  account_id: number | null;
  linked_module: string | null;
  linked_id: number | null;
  status?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
}

interface UnifiedSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeDonations: number;
  incomeSubscriptions: number;
  incomeManual: number;
  expenseWelfare: number;
  expenseSalary: number;
  expenseManual: number;
  entryCount: number;
  period: string;
  from: string | null;
  to: string | null;
}

const emptyForm: Partial<Transaction> = {
  receipt_number: "", txn_date: "", type: "Income", amount: 0, payment_method: "Cash",
  description: "", account_id: 1, transaction_ref: "", voucher_no: "", bill_no: "", payee: "",
  linked_module: "", linked_id: 0,
};

const PERIOD_OPTIONS = [
  { value: "all", key: "filter_all" },
  { value: "this_month", key: "filter_this_month" },
  { value: "last_month", key: "filter_last_month" },
  { value: "this_quarter", key: "filter_this_quarter" },
  { value: "last_quarter", key: "filter_last_quarter" },
  { value: "this_year", key: "filter_this_year" },
  { value: "last_year", key: "filter_last_year" },
  { value: "custom", key: "filter_custom" },
] as const;

const SOURCE_OPTIONS = [
  { value: "All", key: "acc_source_all" },
  { value: "transactions", key: "acc_source_transactions" },
  { value: "donations", key: "acc_source_donations" },
  { value: "subscriptions", key: "acc_source_subscriptions" },
  { value: "welfare", key: "acc_source_welfare" },
  { value: "salary", key: "acc_source_salary" },
] as const;

function sourceBadgeVariant(source: UnifiedRow["source"]): string {
  switch (source) {
    case "donations": return "success";
    case "subscriptions": return "info";
    case "welfare": return "warning";
    case "salary": return "muted";
    default: return "default";
  }
}

export function Accounting() {
  const { t, isMalayalam } = useI18n();
  const tx = (en: string, ml: string) => isMalayalam() ? ml : en;

  // Unified ledger state.
  const [period, setPeriod] = useState<string>("this_month");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [customOpen, setCustomOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UnifiedSummary | null>(null);

  // Manual transaction dialog (still uses legacy list/create/update).
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>(emptyForm);
  // VOID workflow: entries are never deleted — they are voided with a reason.
  const [voidOpen, setVoidOpen] = useState(false);
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  // Receipt sequence continuity check.
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [receiptsData, setReceiptsData] = useState<any>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const fetchUnified = async () => {
    setLoading(true);
    try {
      const filter: any = { period, source: sourceFilter, type: typeFilter, search: search || undefined, page, pageSize: 20 };
      if (period === "custom") {
        if (!from || !to) { setLoading(false); return; }
        filter.from = from; filter.to = to;
      }
      const [listRes, sumRes] = await Promise.all([
        window.mms.accounting.unifiedList(filter),
        window.mms.accounting.unifiedSummary({ period, from: period === "custom" ? from : undefined, to: period === "custom" ? to : undefined })
      ]);
      setRows(listRes.rows || []);
      setTotal(listRes.total || 0);
      setSummary(sumRes);
    } catch (e: any) {
      toast.error(e.message || tx("Failed to load ledger", "ലെഡ്ജർ ലോഡ് ചെയ്യാനായില്ല"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUnified(); }, [period, sourceFilter, typeFilter, page, from, to]);

  // Manual transaction save (calls the legacy create/update endpoints).
  const openAdd = (type: "Income" | "Expense") => {
    setForm({ ...emptyForm, type, txn_date: todayIST() });
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
        voucherNo: form.voucher_no || "",
        billNo: form.bill_no || "",
        payee: form.payee || "",
        createdBy: 1,
      };
      if (editingId) {
        await window.mms.accounting.update(editingId, payload);
        toast.success(t("ui_save_changes"));
      } else {
        const res = await window.mms.accounting.create(payload);
        if (res?.duplicateBill) {
          toast.warning(
            tx(
              `Bill no. "${form.bill_no}" was already used on ${formatDate(res.duplicateBill.txn_date)} (${formatCurrency(res.duplicateBill.amount)}). Please verify this is not a duplicate payment.`,
              `ബിൽ നമ്പർ "${form.bill_no}" ${formatDate(res.duplicateBill.txn_date)}-ന് ഇതിനകം ഉപയോഗിച്ചിട്ടുണ്ട് (${formatCurrency(res.duplicateBill.amount)}). ഇത് തനിപ്പകർപ്പ് പേയ്മെന്റ് അല്ലെന്ന് ഉറപ്പാക്കുക.`
            )
          );
        }
        toast.success(t("add_transaction"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      fetchUnified();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    }
  };

  const handleEdit = async (id: number) => {
    // Only 'transactions' source rows are editable from this UI.
    const txn = await window.mms.accounting.get(id);
    setForm(txn || emptyForm);
    setEditingId(id);
    setDialogOpen(true);
  };

  const openVoid = (id: number) => {
    setPendingVoidId(id);
    setVoidReason("");
    setVoidOpen(true);
  };

  const confirmVoid = async () => {
    if (pendingVoidId == null) return;
    if (!voidReason.trim()) {
      toast.error(tx("A void reason is required", "റദ്ദാക്കാനുള്ള കാരണം നൽകണം"));
      return;
    }
    try {
      await window.mms.accounting.void(pendingVoidId, voidReason.trim());
      toast.success(tx("Entry voided — kept for audit", "എൻട്രി റദ്ദാക്കി — ഓഡിറ്റിനായി സൂക്ഷിച്ചു"));
      fetchUnified();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVoidOpen(false);
      setPendingVoidId(null);
    }
  };

  const fetchReceipts = async () => {
    try {
      setReceiptsData(await window.mms.accounting.receiptSequence());
      setReceiptsOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Export handlers — both respect the current period/source/type filters.
  const buildExportFilter = () => {
    const filter: any = { period, source: sourceFilter, type: typeFilter };
    if (period === "custom") { filter.from = from; filter.to = to; }
    return filter;
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const result = await window.mms.accounting.exportPdf(buildExportFilter());
      if (result?.success) toast.success(tx(`PDF exported (${result.count} entries)`, `${result.count} രേഖകളുടെ PDF തയ്യാറാക്കി`));
      else if (!result?.cancelled) toast.error(result?.error || tx("Failed to export PDF", "PDF തയ്യാറാക്കാൻ കഴിഞ്ഞില്ല"));
    } catch (e: any) { toast.error(e.message); }
    finally { setExportingPdf(false); }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const result = await window.mms.accounting.exportExcel(buildExportFilter());
      if (result?.success) toast.success(tx(`Excel exported (${result.count} entries)`, `${result.count} രേഖകളുടെ എക്സൽ തയ്യാറാക്കി`));
      else if (!result?.cancelled) toast.error(result?.error || tx("Failed to export Excel", "എക്സൽ തയ്യാറാക്കാൻ കഴിഞ്ഞില്ല"));
    } catch (e: any) { toast.error(e.message); }
    finally { setExportingExcel(false); }
  };

  const columns: Column<UnifiedRow>[] = [
    { header: tx("Date", "തീയതി"), accessor: r => formatDate(r.ledger_date), width: "120px" },
    {
      header: t("acc_source"),
      accessor: r => <Badge variant={sourceBadgeVariant(r.source)}>{t(`acc_source_${r.source}`)}</Badge>,
      width: "120px"
    },
    {
      header: t("acc_type"),
      accessor: r => <Badge variant={r.type === "Income" ? "success" : "danger"}>{t(r.type === "Income" ? "acc_income" : "acc_expense")}</Badge>,
      width: "100px"
    },
    { header: t("acc_description"), accessor: r => (
      <div>
        <span className={`font-medium ${r.status === "Void" ? "line-through text-muted" : ""}`}>{r.description || "—"}</span>
        {r.status === "Void" && r.void_reason && (
          <div className="text-xs text-rose-600/80 italic mt-0.5">{tx("Voided:", "റദ്ദാക്കി:")} {r.void_reason}{r.voided_at ? ` · ${formatDate(r.voided_at)}` : ""}</div>
        )}
      </div>
    ) },
    {
      header: tx("Receipt", "രസീത്"),
      accessor: r => r.receipt_number ? <span className="code-text-sm text-primary">{r.receipt_number}</span> : "—",
      width: "120px"
    },
    {
      header: tx("Voucher", "വൗച്ചർ"),
      accessor: r => (
        <div className="flex flex-col">
          {r.voucher_no ? <span className="code-text-sm text-primary">{r.voucher_no}</span> : <span className="text-muted">—</span>}
          {r.bill_no && <span className="text-xs text-muted">{tx("Bill", "ബിൽ")}: {r.bill_no}</span>}
          {r.payee && <span className="text-xs text-muted">{r.payee}</span>}
        </div>
      ),
      width: "150px"
    },
    {
      header: t("sub_amount"),
      accessor: r => (
        <span className={r.type === "Income" ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
          {r.type === "Income" ? "+" : "−"}{formatCurrency(r.amount)}
        </span>
      ),
      width: "140px"
    },
    {
      header: "",
      accessor: r => r.source === "transactions" ? (
        <div className="flex items-center gap-1 justify-end">
          {r.status === "Void" ? (
            <span title={r.void_reason ? `${tx("Void reason", "റദ്ദാക്കാനുള്ള കാരണം")}: ${r.void_reason}` : ""}><Badge variant="danger">{tx("VOID", "റദ്ദാക്കി")}</Badge></span>
          ) : (
            <>
              <button className="act-btn act-edit" onClick={() => handleEdit(r.source_id)} title={t("action_edit")}><Edit2 className="h-4 w-4" /></button>
              <button className="act-btn act-del" onClick={() => openVoid(r.source_id)} title={tx("Void (keep for audit)", "റദ്ദാക്കുക (ഓഡിറ്റിനായി സൂക്ഷിക്കും)")}><Ban className="h-4 w-4 text-danger" /></button>
            </>
          )}
        </div>
      ) : <span className="text-xs text-muted">{tx("auto", "ഓട്ടോ")}</span>,
      align: "right",
      width: "110px"
    },
  ];

  const periodLabel = (p: string): string => {
    const opt = PERIOD_OPTIONS.find(o => o.value === p);
    return opt ? t(opt.key) : p;
  };

  const rangeLabel = summary?.from && summary?.to ? `${formatDate(summary.from)} → ${formatDate(summary.to)}` : (summary?.period === "all" ? tx("All time", "എല്ലാ കാലവും") : "");

  return (
    <div className="view view-enter">
      <div className="vhead">
        <div className="modic t-em"><Scale size={20} /></div>
        <div>
          <h1>{t("acc_unified_title")}</h1>
          <div className="vs">{t("acc_unified_subtitle")}{rangeLabel ? ` · ${rangeLabel}` : ""}</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {tx("Export PDF", "PDF എക്സ്പോർട്ട്")}
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} disabled={exportingExcel}>
            {exportingExcel ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {tx("Export Excel", "എക്സൽ എക്സ്പോർട്ട്")}
          </Button>
          <Button onClick={() => openAdd("Income")}><Plus className="h-4 w-4" />{t("acc_add_income")}</Button>
          <Button variant="danger" onClick={() => openAdd("Expense")}><Plus className="h-4 w-4" />{t("acc_add_expense")}</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid stat-grid-3">
        <div className="stat t-em">
          <div className="srow">
            <span className="sic"><TrendingUp size={18} /></span>
            <span className="delta">{t("acc_income_delta")}</span>
          </div>
          <div className="val">{formatCurrency(summary?.totalIncome ?? 0)}</div>
          <div className="slab">{t("acc_income")} · {periodLabel(period)}</div>
        </div>
        <div className="stat t-rose">
          <div className="srow">
            <span className="sic"><TrendingDown size={18} /></span>
            <span className="delta">{t("acc_expense_delta")}</span>
          </div>
          <div className="val">{formatCurrency(summary?.totalExpense ?? 0)}</div>
          <div className="slab">{t("acc_expense")} · {periodLabel(period)}</div>
        </div>
        <div className="stat t-sky">
          <div className="srow">
            <span className="sic"><Scale size={18} /></span>
            <span className="delta">{t("acc_balance_delta")}</span>
          </div>
          <div className="val">{formatCurrency(summary?.balance ?? 0)}</div>
          <div className="slab">{t("acc_balance")} · {periodLabel(period)}</div>
        </div>
      </div>

      {/* Source breakdown card */}
      {summary && (
        <div className="card card-pad-tight mt-3">
          <div className="ch-head mb-3"><div className="ch-title">{t("acc_breakdown")}</div></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-border bg-emerald-50/30">
              <div className="text-xs text-muted">{t("acc_income_donations")}</div>
              <div className="font-mono font-semibold text-emerald-700">{formatCurrency(summary.incomeDonations)}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-emerald-50/30">
              <div className="text-xs text-muted">{t("acc_income_subscriptions")}</div>
              <div className="font-mono font-semibold text-emerald-700">{formatCurrency(summary.incomeSubscriptions)}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-emerald-50/30">
              <div className="text-xs text-muted">{t("acc_income_manual")}</div>
              <div className="font-mono font-semibold text-emerald-700">{formatCurrency(summary.incomeManual)}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-rose-50/30">
              <div className="text-xs text-muted">{t("acc_expense_welfare")}</div>
              <div className="font-mono font-semibold text-rose-700">{formatCurrency(summary.expenseWelfare)}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-rose-50/30">
              <div className="text-xs text-muted">{t("acc_expense_salary")}</div>
              <div className="font-mono font-semibold text-rose-700">{formatCurrency(summary.expenseSalary)}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-rose-50/30">
              <div className="text-xs text-muted">{t("acc_expense_manual")}</div>
              <div className="font-mono font-semibold text-rose-700">{formatCurrency(summary.expenseManual)}</div>
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={total}
        page={page}
        pageSize={20}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={setSearch}
        rowKey={r => `${r.source}-${r.source_id}`}
        toolbar={
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={period} onChange={e => { const v = e.target.value; setPeriod(v); setPage(1); if (v === "custom") setCustomOpen(true); }} className="w-40">
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
            </Select>
            <Select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }} className="w-44">
              {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
            </Select>
            <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="w-32">
              <option value="All">{t("filter_all")}</option>
              <option value="Income">{t("acc_income")}</option>
              <option value="Expense">{t("acc_expense")}</option>
            </Select>
            {period === "custom" && (
              <Button variant="secondary" onClick={() => setCustomOpen(true)}><Calendar size={14} />{rangeLabel || tx("Set dates", "തീയതികൾ സജ്ജമാക്കുക")}</Button>
            )}
            <Button variant="secondary" onClick={fetchReceipts}><ReceiptText size={14} />{tx("Receipts", "രസീതുകൾ")}</Button>
          </div>
        }
      />

      {/* Add/Edit Transaction Dialog */}
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
                <option value="Income">{t("acc_income")}</option>
                <option value="Expense">{t("acc_expense")}</option>
              </Select>
            </div>
            <div>
              <Label>{t("sub_amount")} *</Label>
              <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
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
              <Label>{t("ui_transaction_ref")}</Label>
              <Input value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
            </div>
            {form.type === "Expense" && (
              <>
                <div>
                  <Label>{tx("Voucher No.", "വൗച്ചർ നമ്പർ")}</Label>
                  <Input value={form.voucher_no || ""} onChange={(e) => setForm({ ...form, voucher_no: e.target.value })} placeholder={tx("auto-filled if empty", "ശൂന്യമാണെങ്കിൽ സ്വയം നൽകും")} />
                </div>
                <div>
                  <Label>{tx("Bill / Invoice No.", "ബിൽ / ഇൻവോയ്സ് നമ്പർ")}</Label>
                  <Input value={form.bill_no || ""} onChange={(e) => setForm({ ...form, bill_no: e.target.value })} placeholder={tx("e.g. shop bill no.", "ഉദാ: കടയുടെ ബിൽ നമ്പർ")} />
                </div>
                <div className="col-span-2">
                  <Label>{tx("Paid to (Payee)", "നൽകിയത് (പേയി)")}</Label>
                  <Input value={form.payee || ""} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder={tx("Who was this payment made to?", "ആർക്കാണ് ഈ പണം നൽകിയത്?")} />
                </div>
                <p className="col-span-2 text-xs text-muted">{tx("Voucher & bill numbers are kept for audit — no files need to be uploaded.", "ഓഡിറ്റിനായി വൗച്ചർ, ബിൽ നമ്പറുകൾ സൂക്ഷിക്കും — ഫയലുകൾ അപ്‌ലോഡ് ചെയ്യേണ്ടതില്ല.")}</p>
              </>
            )}
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

      {/* Custom date range dialog */}
      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} title={t("filter_custom")} className="modal-sm">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("filter_from")} *</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t("filter_to")} *</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={() => { if (!from || !to) { toast.error(tx("Select both dates", "രണ്ട് തീയതികളും തിരഞ്ഞെടുക്കുക")); return; } setCustomOpen(false); setPage(1); fetchUnified(); }}>{t("filter_apply")}</Button>
          </div>
        </div>
      </Dialog>

      {/* VOID dialog — the entry is kept for audit, never deleted */}
      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} title={tx("Void entry", "എൻട്രി റദ്ദാക്കുക")} className="modal-sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted">{tx("The entry will NOT be deleted. The receipt number stays occupied and the record remains visible (marked VOID) for the auditor, with the reason below.", "എൻട്രി ഇല്ലാതാക്കില്ല. രസീത് നമ്പർ നിലനിർത്തും, രേഖ ഓഡിറ്ററിനായി (VOID അടയാളത്തോടെ) ദൃശ്യമായിരിക്കും — കാരണം ചുവടെ നൽകുക.")}</p>
          <div>
            <Label>{tx("Reason", "കാരണം")} *</Label>
            <Textarea rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder={tx("Why is this entry being voided?", "എന്തുകൊണ്ടാണ് ഈ എൻട്രി റദ്ദാക്കുന്നത്?")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidOpen(false)}>{t("action_cancel")}</Button>
            <Button variant="danger" onClick={confirmVoid}><Ban size={14} />{tx("Void entry", "എൻട്രി റദ്ദാക്കുക")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Receipt sequence continuity */}
      <Dialog open={receiptsOpen} onClose={() => setReceiptsOpen(false)} title={tx("Receipt sequence", "രസീത് ശ്രേണി")} className="max-w-2xl">
        <div className="p-6 space-y-4">
          {receiptsData?.missing?.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {tx("Missing receipt numbers", "കാണാത്ത രസീത് നമ്പറുകൾ")}: {receiptsData.missing.join(", ")} — {tx("permanent deletion is disabled, so gaps mean manual editing of the database.", "സ്ഥിരം ഇല്ലാതാക്കൽ നിർജ്ജീവമാക്കിയതിനാൽ, വിടവുകൾ ഡാറ്റാബേസ് കൈകാര്യം ചെയ്തതിന്റെ സൂചനയാണ്.")}
            </div>
          )}
          {(!receiptsData?.missing || receiptsData.missing.length === 0) && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {tx("Sequence continuous — no gaps", "ശ്രേണി തുടർച്ചയായി — വിടവുകളില്ല")} ({receiptsData?.count || 0} {tx("receipts", "രസീതുകൾ")})
            </div>
          )}
          <div className="max-h-80 overflow-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover sticky top-0">
                <tr><th className="text-left px-3 py-2">{tx("Receipt", "രസീത്")}</th><th className="text-left px-3 py-2">{tx("Date", "തീയതി")}</th><th className="text-left px-3 py-2">{tx("Type", "തരം")}</th><th className="text-right px-3 py-2">{tx("Amount", "തുക")}</th><th className="text-left px-3 py-2">{tx("Status", "നില")}</th></tr>
              </thead>
              <tbody>
                {(receiptsData?.receipts || []).map((r: any) => (
                  <tr key={r.id} className={`border-t border-border-subtle ${r.status === "Void" ? "bg-rose-50/60" : ""}`}>
                    <td className={`px-3 py-1.5 code-text-sm ${r.status === "Void" ? "text-muted line-through" : "text-primary"}`}>{r.receipt_number}</td>
                    <td className="px-3 py-1.5">{formatDate(r.txn_date)}</td>
                    <td className="px-3 py-1.5">{r.type}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-1.5">{r.status === "Void" ? <Badge variant="danger">{tx("VOID", "റദ്ദാക്കി")}{r.void_reason ? ` — ${r.void_reason}` : ""}</Badge> : <Badge variant="success">{tx("Posted", "പോസ്റ്റ് ചെയ്തു")}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setReceiptsOpen(false)}>{t("ui_close")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
