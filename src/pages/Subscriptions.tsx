import { useState, useEffect } from "react";
import { Edit2, AlertCircle, Wallet, Eye, Ban, History, RefreshCw, FileDown, MessageCircle } from "lucide-react";
import { useI18n } from "@/i18n";
import { useList, useAsync } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge, SectionLabel } from "@/components/ui";
import { SecureActionDialog } from "@/components/SecureActionDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, statusVariant, todayIST } from "@/lib/utils";

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

interface PaymentRecord {
  id: number;
  receipt_number: string | null;
  period_start: string | null;
  amount: number;
  payment_date: string | null;
  payment_method: string;
  status: string;
  member_name?: string;
}

const emptyForm: Partial<Subscription> = {
  receipt_number: "", family_id: 0, member_name: "", plan_id: 1, plan_name: "",
  amount: 0, amount_paid: 0, period_start: "", period_end: "", payment_date: "",
  payment_method: "Cash", transaction_ref: "", status: "Pending", remarks: "",
};

const codeFontStyle = "code-text-sm";

const monthLabel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

export function Subscriptions() {
  const { t, lang } = useI18n();
  const ml = lang === "ml";
  const tx = (en: string, m: string) => (ml ? m : en);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Subscription>>(emptyForm);
  const [families, setFamilies] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<Subscription | null>(null);
  const [historyRows, setHistoryRows] = useState<PaymentRecord[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);

  const { rows, total, totalPages, loading, refetch, setFilters } = useList(
    (filter) => window.mms.subscriptions.list(filter),
    { pageSize: 20, initialFilters: { status: statusFilter !== "All" ? statusFilter : undefined } }
  );

  // Status filter drives the query (and resets to page 1).
  useEffect(() => {
    setFilters({ status: statusFilter !== "All" ? statusFilter : undefined });
    setPage(1);
  }, [statusFilter, setFilters]);

  const { data: totalCollected, refresh: refreshCollected } = useAsync(() => window.mms.subscriptions.totalCollected(), []);
  const { data: totalPending, refresh: refreshPending } = useAsync(() => window.mms.subscriptions.totalPending(), []);

  useEffect(() => {
    window.mms.families.list({ pageSize: 1000 }).then((r) => setFamilies(r.rows || [])).catch(() => {});
  }, []);

  // Keep the recurring rows in step with the current month on every visit.
  useEffect(() => {
    window.mms.subscriptions.ensureCurrentMonth().then(() => refetch()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setForm({ ...emptyForm, payment_date: todayIST() });
    setEditingId(null);
    setDialogOpen(true);
  };

  // Payment recording: only the payment fields are editable — family, head,
  // period and the monthly rate are fixed by the recurring account.
  const handleSave = async () => {
    if (!editingId) {
      // Creating a NEW subscription account (only for families without one).
      if (!form.family_id || !form.amount) {
        toast.error(t("ui_family_amount_required"));
        return;
      }
      try {
        await window.mms.subscriptions.create({
          familyId: form.family_id,
          memberId: form.member_id || null,
          planId: form.plan_id || 1,
          amount: form.amount,
          amountPaid: form.amount_paid ?? 0,
          paymentDate: form.payment_date,
          paymentMethod: form.payment_method,
          transactionRef: form.transaction_ref || "",
          remarks: form.remarks || "",
        });
        toast.success(t("add_subscription"));
        setDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        refetch();
      } catch (err: any) {
        toast.error(err.message || t("ui_failed_save"));
      }
      return;
    }
    if (form.amount_paid == null || Number(form.amount_paid) < 0) {
      toast.error(tx("Enter how much was given", "എത്ര നൽകി എന്ന് നൽകുക"));
      return;
    }
    try {
      const r: any = await window.mms.subscriptions.update(editingId, {
        amountPaid: Number(form.amount_paid),
        paymentDate: form.payment_date,
        paymentMethod: form.payment_method,
        transactionRef: form.transaction_ref || "",
        remarks: form.remarks || "",
      });
      // The receipt (A6) is generated and saved in the app automatically;
      // WhatsApp delivery depends on pairing + the family's number.
      const waNote: string =
        r?.receiptWhatsApp === "sent" ? tx(" — receipt sent on WhatsApp", " — രസീറ്റ് വാട്ട്സ്ആപ്പിൽ അയച്ചു")
        : r?.receiptWhatsApp === "no-phone" ? tx(" — receipt saved (no WhatsApp number for this family)", " — രസീറ്റ് സേവ് ചെയ്തു (ഈ കുടുംബത്തിന് വാട്ട്സ്ആപ്പ് നമ്പർ ഇല്ല)")
        : r?.receiptWhatsApp === "not-connected" ? tx(" — receipt saved (WhatsApp not connected)", " — രസീറ്റ് സേവ് ചെയ്തു (വാട്ട്സ്ആപ്പ് കണക്റ്റ് അല്ല)")
        : r?.receiptWhatsApp === "failed" ? tx(` — receipt not sent: ${r.receiptError || "failed"}`, ` — രസീറ്റ് അയച്ചില്ല: ${r.receiptError || "പരാജയം"}`)
        : "";
      toast.success(tx(
        `Payment saved — ${r.status}${r.receiptNumber ? ` (receipt ${r.receiptNumber})` : ""}${waNote}`,
        `പേയ്‌മെന്റ് സേവ് ചെയ്തു — ${r.status}${r.receiptNumber ? ` (രസീറ്റ് ${r.receiptNumber})` : ""}${waNote}`
      ));
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
      refreshCollected();
      refreshPending();
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    }
  };

  const handleEdit = async (id: number) => {
    const s = await window.mms.subscriptions.get(id);
    setForm({ ...emptyForm, ...s, payment_date: s?.payment_date || todayIST() });
    setEditingId(id);
    setDialogOpen(true);
  };

  const openCancel = (row: Subscription) => {
    setCancelTarget(row);
    setCancelOpen(true);
  };

  const executeCancel = async ({ reason }: { reason: string }) => {
    if (!cancelTarget) return;
    await window.mms.subscriptions.cancelPayment(cancelTarget.id, reason);
    toast.success(tx("Payment cancelled — the subscription stays with the family", "പേയ്‌മെന്റ് റദ്ദാക്കി — സബ്‌സ്ക്രിപ്ഷൻ കുടുംബത്തിനൊപ്പം തുടരും"));
    refetch();
    refreshCollected();
    refreshPending();
  };

  // ===== A6 payment receipts (PDF / WhatsApp) — always saved as PDF files,
  // never sent straight to a printer. =====
  const saveReceipt = async (id: number) => {
    try {
      const r: any = await window.mms.receipts.saveSubscriptionPdf(id);
      if (r?.success) toast.success(tx("Receipt PDF saved", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d PDF \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d24\u0d41"));
    } catch (e: any) { toast.error(e?.message || tx("Could not save the receipt PDF", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d PDF \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32")); }
  };
  const sendReceipt = async (id: number) => {
    try {
      const r: any = await window.mms.whatsapp.sendSubscriptionReceipt(id);
      if (r?.status === "sent" || r?.success) toast.success(tx("Payment receipt sent on WhatsApp", "\u0d2a\u0d47\u0d2f\u0d4d\u200c\u0d2e\u0d46\u0d28\u0d4d\u0d31\u0d4d \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d35\u0d3e\u0d1f\u0d4d\u0d38\u0d3e\u0d2a\u0d4d\u0d2a\u0d3f\u0d32\u0d4d \u0d05\u0d2f\u0d1a\u0d4d\u0d1a\u0d41"));
      else toast.error(r?.error || tx("Could not send the receipt", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32"));
    } catch (e: any) { toast.error(e?.message || tx("Could not send the receipt", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32")); }
  };
  const saveReceiptsPdf = async () => {
    try {
      const list: any = await window.mms.subscriptions.list({
        search: search || undefined,
        status: statusFilter !== "All" ? statusFilter : undefined,
        page: 1, pageSize: 500,
      });
      const ids = (list?.rows || []).filter((r: any) => Number(r.amount_paid || 0) > 0).map((r: any) => r.id);
      if (!ids.length) { toast.error(tx("No paid subscriptions to save", "\u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d28\u0d4d \u0d05\u0d1f\u0d1a\u0d4d\u0d1a \u0d38\u0d2c\u0d4d\u200c\u0d38\u0d4d\u0d15\u0d4d\u0d30\u0d3f\u0d2a\u0d4d\u0d36\u0d28\u0d41\u0d15\u0d33\u0d3f\u0d32\u0d4d\u0d32")); return; }
      const r: any = await window.mms.receipts.saveSubscriptionBatchPdf(ids);
      if (r?.cancelled) { /* closed the save dialog */ }
      else if (r?.success) toast.success(tx(`Saved ${r.count} receipts as one PDF (4 per A4 sheet)`, `${r.count} \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d41\u0d15\u0d33\u0d4d \u0d12\u0d30\u0d41 PDF \u0d86\u0d2f\u0d3f \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d24\u0d41 (\u0d12\u0d30\u0d41 A4 \u0d37\u0d40\u0d31\u0d4d\u0d1f\u0d3f\u0d7d 4 \u0d0e\u0d23\u0d4d\u0d23\u0d02)`));
      else toast.error(r?.reason || tx("Could not save the receipts PDF", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d41\u0d15\u0d33\u0d4d \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32"));
    } catch (e: any) { toast.error(e?.message || tx("Could not save the receipts PDF", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d41\u0d15\u0d33\u0d4d \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32")); }
  };

  const handleRowDoubleClick = async (row: Subscription) => {
    setPreviewRow(row);
    setPreviewOpen(true);
    setHistoryRows([]);
    try {
      const h = await window.mms.subscriptions.paymentsHistory(row.family_id);
      setHistoryRows(h || []);
    } catch { setHistoryRows([]); }
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
      toast.success(`${count} ${tx("subscriptions marked overdue", "സബ്‌സ്ക്രിപ്ഷനുകൾ ഓവർഡ്യൂ ആയി")}`);
      refetch();
      refreshCollected();
      refreshPending();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<Subscription>[] = [
    {
      header: t("member_family"),
      accessor: (r) => <span className="font-medium">{r.house_name || r.family_number || "—"}</span>,
    },
    { header: tx("Head", "തലവൻ"), accessor: (r) => r.member_name || "—" },
    { header: tx("Month", "മാസം"), accessor: (r) => monthLabel(r.period_start) },
    { header: t("sub_amount"), accessor: (r) => formatCurrency(r.amount) },
    { header: t("sub_amount_paid"), accessor: (r) => formatCurrency(r.amount_paid) },
    {
      header: t("sub_receipt"),
      accessor: (r) => (
        <span className={codeFontStyle + " text-primary"}>
          {r.receipt_number || "—"}
        </span>
      ),
    },
    {
      header: t("family_status"),
      accessor: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      header: "",
      accessor: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {Number(r.amount_paid) > 0 && <>
            <button className="act-btn" title={tx("Save A6 receipt PDF", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d PDF \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15")} onClick={() => saveReceipt(r.id)}>
              <FileDown className="h-4 w-4 text-primary" />
            </button>
            <button className="act-btn" title={tx("Send receipt on WhatsApp", "\u0d35\u0d3e\u0d1f\u0d4d\u0d38\u0d3e\u0d2a\u0d4d\u0d2a\u0d3f\u0d7d \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d41\u0d15")} onClick={() => sendReceipt(r.id)}>
              <MessageCircle className="h-4 w-4 text-primary" />
            </button>
          </>}
          <button className="act-btn act-edit" title={tx("Record payment", "പേയ്‌മെന്റ് രേഖപ്പെടുത്തുക")} onClick={() => handleEdit(r.id)}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            className="act-btn act-del"
            title={tx("Cancel this month's payment", "ഈ മാസത്തെ പേയ്‌മെന്റ് റദ്ദാക്കുക")}
            disabled={!r.amount_paid}
            style={{ opacity: r.amount_paid ? 1 : 0.35, cursor: r.amount_paid ? "pointer" : "not-allowed" }}
            onClick={() => r.amount_paid && openCancel(r)}
          >
            <Ban className="h-4 w-4 text-danger" />
          </button>
        </div>
      ),
      align: "right",
    },
  ];

  const previewDetails = previewRow
    ? [
        { k: t("member_family"), v: previewRow.house_name || previewRow.family_number || "—" },
        { k: t("member_name"), v: previewRow.member_name || "—" },
        { k: tx("Month", "മാസം"), v: monthLabel(previewRow.period_start) },
        { k: t("sub_amount"), v: formatCurrency(previewRow.amount) },
        { k: t("sub_amount_paid"), v: formatCurrency(previewRow.amount_paid) },
        { k: t("sub_receipt"), v: previewRow.receipt_number || "—" },
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
          <div className="vs">{tx(
            "Recurring monthly subscription — one row per family (head), rolled over each month",
            "മാസിക സബ്‌സ്ക്രിപ്ഷൻ — ഓരോ കുടുംബത്തിനും (തലവന്) ഒരു വരി, ഓരോ മാസവും അതേ വരിയിൽ തന്നെ"
          )}</div>
        </div>
        <div className="vr">
          <Button variant="secondary" onClick={saveReceiptsPdf} title={tx("Save A6 payment receipts as one PDF \u2014 4 per A4 sheet (paid rows, current filter)", "\u0d05\u0d1f\u0d1a\u0d4d\u0d1a \u0d38\u0d2c\u0d4d\u200c\u0d38\u0d4d\u0d15\u0d4d\u0d30\u0d3f\u0d2a\u0d4d\u0d36\u0d28\u0d4d \u0d30\u0d38\u0d40\u0d1f\u0d41\u0d15\u0d7e \u0d12\u0d30\u0d41 PDF \u0d86\u0d2f\u0d3f \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15")}>
            <FileDown className="h-4 w-4" />
            {tx("Save receipts", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d41\u0d15\u0d7d \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15")}
          </Button>
          <Button variant="secondary" onClick={handleMarkOverdue}>
            <AlertCircle className="h-4 w-4" />
            {t("sub_mark_overdue")}
          </Button>
          <Button variant="secondary" onClick={() => { window.mms.subscriptions.ensureCurrentMonth().then(() => refetch()).catch(() => {}); }}>
            <RefreshCw className="h-4 w-4" />
            {tx("Sync month", "മാസം സമന്വയിക്കുക")}
          </Button>
          <Button onClick={openNew}>
            <Edit2 className="h-4 w-4" />
            {tx("New subscription", "പുതിയ സബ്‌സ്ക്രിപ്ഷൻ")}
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
          <div className="slab">{tx("Total collected (all months)", "മൊത്തം ശേഖരിച്ചത് (എല്ലാ മാസങ്ങളും)")}</div>
        </div>
        <div className="stat t-rose">
          <div className="srow">
            <span className="sic"><AlertCircle size={18} /></span>
            <span className="delta">{t("sub_dues")}</span>
          </div>
          <div className="val">{formatCurrency(totalPending ?? 0)}</div>
          <div className="slab">{tx("This month's pending dues", "ഈ മാസത്തെ ബാക്കി")}</div>
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

      {/* Preview Dialog (read-only) + payment history */}
      <Dialog
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        title={t("sub_title")}
        className="max-w-2xl"
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
                    {previewRow.house_name || previewRow.family_number} — {previewRow.member_name}
                  </div>
                  <div className="dlg-hero-sub">
                    {monthLabel(previewRow.period_start)} · {formatCurrency(previewRow.amount)} / {tx("month", "മാസം")}
                  </div>
                </div>
                <Badge variant={statusVariant(previewRow.status)}>{previewRow.status}</Badge>
              </div>
              <div className="dlg-sec"><b>{tx("Subscription", "സബ്സ്ക്രിപ്ഷൻ")}</b></div>
              <div className="det-grid">
                {previewDetails.slice(0, 6).map((d, i) => (
                  <div key={i} className={`det${d.full ? " full" : ""}`}>
                    <span className="k">{d.k}</span>
                    <span className="v">{d.v}</span>
                  </div>
                ))}
              </div>
              <div className="dlg-sec"><b>{tx("Payment & status", "പേയ്മെന്റും അവസ്ഥയും")}</b></div>
              <div className="det-grid">
                {previewDetails.slice(6).map((d, i) => (
                  <div key={i} className={`det${d.full ? " full" : ""}`}>
                    <span className="k">{d.k}</span>
                    <span className="v">{d.v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="flex items-center gap-2 mb-3">
                  <History size={16} />
                  <strong>{tx("Payment history", "പേയ്‌മെന്റ് ചരിത്രം")}</strong>
                </div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {historyRows.length ? historyRows.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                      <div>
                        <div className="text-sm font-medium">{monthLabel(h.period_start)} · {formatCurrency(h.amount)}</div>
                        <div className="text-xs text-muted">
                          {h.receipt_number || "—"} · {formatDate(h.payment_date)} · {h.payment_method}
                        </div>
                      </div>
                      <Badge variant={h.status === "Cancelled" ? "danger" : "success"}>{h.status}</Badge>
                    </div>
                  )) : (
                    <div className="text-sm text-muted">{tx("No payments recorded yet", "ഇതുവരെ പേയ്‌മെന്റുകളില്ല")}</div>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="dlg-actions">
            <Button variant="secondary" onClick={() => { setPreviewOpen(false); setPreviewRow(null); }}>
              {t("ui_close")}
            </Button>
            {Number(previewRow?.amount_paid) > 0 && <>
              <Button variant="secondary" onClick={() => previewRow && saveReceipt(previewRow.id)}>
                <FileDown size={14} />{tx("Save A6 PDF", "A6 PDF \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15")}
              </Button>
              <Button variant="secondary" onClick={() => previewRow && sendReceipt(previewRow.id)}>
                <MessageCircle size={14} />{tx("WhatsApp receipt", "\u0d35\u0d3e\u0d1f\u0d4d\u0d38\u0d3e\u0d2a\u0d4d\u0d2a\u0d4d \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d")}
              </Button>
            </>}
            <Button onClick={switchToEdit}>
              <Edit2 size={14} />
              {tx("Record payment", "പേയ്‌മെന്റ് രേഖപ്പെടുത്തുക")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Record-payment / new-account Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? tx("Record payment", "പേയ്‌മെന്റ് രേഖപ്പെടുത്തുക") : tx("New subscription account", "പുതിയ സബ്‌സ്ക്രിപ്ഷൻ അക്കൗണ്ട്")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          {editingId ? (
            <>
              <div className="rounded-lg border border-border-subtle bg-surface-hover/40 px-4 py-3 text-sm flex items-center gap-2">
                <Wallet size={14} className="text-primary" />
                <span className="text-muted">
                  {tx("Recurring subscription for", "ഇതിന്റെ ആവർത്തിക്കുന്ന സബ്‌സ്ക്രിപ്ഷൻ")} <b className="text-text-primary">{form.house_name || form.family_number}</b>
                  {" — "}{tx("recorded in the name of", "ഇവരുടെ പേരിൽ രേഖപ്പെടുത്തിയത്")} <b className="text-text-primary">{form.member_name || "—"}</b>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{tx("Month", "മാസം")}</Label>
                  <Input value={monthLabel(form.period_start)} readOnly className="bg-surface-muted" />
                </div>
                <div>
                  <Label>{tx("Monthly due", "പ്രതിമാസ തുക")}</Label>
                  <Input value={formatCurrency(form.amount || 0)} readOnly className="bg-surface-muted" />
                </div>
                <div>
                  <Label>{tx("Balance", "ബാക്കി")}</Label>
                  <Input value={formatCurrency(Math.max(0, Number(form.amount || 0) - Number(form.amount_paid || 0)))} readOnly className="bg-surface-muted" />
                </div>
              </div>
              <div className="sec-divider">
                <SectionLabel>{tx("Payment details (editable)", "പേയ്‌മെന്റ് വിവരങ്ങൾ (തിരുത്താവുന്നത്)")}</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{tx("How much was given", "എത്ര നൽകി")} *</Label>
                    <Input type="number" min="0" value={form.amount_paid ?? 0} onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })} />
                    <div className="text-xs text-muted mt-1.5">{tx("Family, head, month and rate are fixed — only this can be edited.", "കുടുംബം, തലവൻ, മാസം, നിരക്ക് എന്നിവ മാറ്റാനാവില്ല — ഇത് മാത്രം തിരുത്താം.")}</div>
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
                    <Label>{t("ui_transaction_ref")}</Label>
                    <Input value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>{t("ui_remarks")}</Label>
                  <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border-subtle bg-surface-hover/40 px-4 py-2.5 text-sm text-muted">
                {tx("Use this only for a family that has no subscription yet. Existing families already have their recurring row.", "സബ്‌സ്ക്രിപ്ഷൻ ഇല്ലാത്ത കുടുംബത്തിന് മാത്രം ഉപയോഗിക്കുക. നിലവിലുള്ള കുടുംബങ്ങൾക്ക് അവരുടെ ആവർത്തിക്കുന്ന വരി ഉണ്ട്.")}
              </div>
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
                  <Label>{tx("Monthly due", "പ്രതിമാസ തുക")} *</Label>
                  <Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>{tx("First payment (optional)", "ആദ്യ പേയ്‌മെന്റ് (ഓപ്ഷണൽ)")}</Label>
                  <Input type="number" min="0" value={form.amount_paid ?? 0} onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })} />
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
                  <Label>{t("ui_transaction_ref")}</Label>
                  <Input value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t("ui_remarks")}</Label>
                <Textarea rows={2} value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("action_cancel")}</Button>
            <Button onClick={handleSave}>{editingId ? tx("Save payment", "പേയ്‌മെന്റ് സേവ് ചെയ്യുക") : t("action_save")}</Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel payment — secure gate (reason + admin password) */}
      <SecureActionDialog
        open={cancelOpen}
        onClose={() => { setCancelOpen(false); setCancelTarget(null); }}
        onConfirm={executeCancel}
        title={tx("Cancel payment", "പേയ്‌മെന്റ് റദ്ദാക്കുക")}
        description={
          cancelTarget
            ? tx(
                `Cancel the ${monthLabel(cancelTarget.period_start)} payment of ${formatCurrency(cancelTarget.amount_paid)} for ${cancelTarget.house_name || cancelTarget.family_number}?`,
                `${cancelTarget.house_name || cancelTarget.family_number} ന്റെ ${monthLabel(cancelTarget.period_start)} പേയ്‌മെന്റ് (${formatCurrency(cancelTarget.amount_paid)}) റദ്ദാക്കണോ?`
              )
            : ""
        }
        confirmLabel={tx("Cancel payment", "പേയ്‌മെന്റ് റദ്ദാക്കുക")}
      />
    </div>
  );
}
