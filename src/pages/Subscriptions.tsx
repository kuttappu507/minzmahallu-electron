import { useState, useEffect } from "react";
import { Edit2, AlertCircle, Wallet, Eye, Ban, History, RefreshCw, FileDown, MessageCircle, Lock, Check } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { useList, useAsync } from "@/hooks/useList";
import { Card, CardContent, Button, Dialog, Input, Label, Select, Textarea, Badge, SectionLabel } from "@/components/ui";
import { SecureActionDialog } from "@/components/SecureActionDialog";
import { friendlySendError } from "@/lib/ipc-error";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, statusVariant, todayIST, getCurrencySymbol } from "@/lib/utils";

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
  /** Old unpaid balances accumulated across closed months. */
  arrears?: number;
  /** Prepaid credit that nets against future dues (overpayment). */
  advance?: number;
  period_start: string;
  period_end: string;
  payment_date: string;
  payment_method: string;
  transaction_ref: string;
  status: string;
  collected_by: number;
  remarks: string;
  /** Current month's WhatsApp receipt send state (joined from the ledger). */
  wa_sent_at?: string | null;
  wa_delivered_at?: string | null;
  wa_resends?: number;
  /** Receipt PDF already generated for the current month's ledger payment —
   *  when set, the paid amount is frozen (the payee's copy must match). */
  wa_receipt_generated_at?: string | null;
  month_cash?: number | null;
  month_arrears_cleared?: number | null;
  month_advance_added?: number | null;
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
  arrears_cleared?: number;
  advance_added?: number;
  receipt_delivered_at?: string | null;
}

const emptyForm: Partial<Subscription> = {
  receipt_number: "", family_id: 0, member_name: "", plan_id: 1, plan_name: "",
  amount: 0, amount_paid: 0, period_start: "", period_end: "", payment_date: "",
  payment_method: "Cash", transaction_ref: "", status: "Pending", remarks: "",
};

const codeFontStyle = "code-text-sm";

const monthLabel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  // "2026-09[[-dd]]" is a CALENDAR period — render it in UTC so a machine on
  // another zone cannot shift it to the previous/next month.
  const m = String(iso).match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return String(iso);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2] || 1) - 1, 1));
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
};

export function Subscriptions() {
  const { t, lang } = useI18n();
  const ml = lang === "ml";
  const tx = (en: string, m: string) => (ml ? m : en);
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
  // WhatsApp receipt privacy lock: the one admin-authorized re-send gate.
  const [resendOpen, setResendOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState<Subscription | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false); // blocks double-click duplicate payments (user report)

  // Approval workflow (V037): subscriptions added by Member/Staff accounts
  // wait for a full-power account. Full-power users approve right on the row;
  // until then receipt actions and payment recording stay locked (enforced
  // in the main process too — this is the discoverable UI half).
  const { user } = useAuth();
  const canApprove = user?.role === "Administrator" || user?.role === "Secretary";
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const isPendingRow = (r: any) => (r as any).approval_status === "pending";
  const pendingLockTitle = tx("Waiting for admin approval — receipts and payments unlock after approval", "അഡ്മിൻ അംഗീകാരം വേണം — അംഗീകരണത്തിനുശേഷം രസീതും അടവും ലഭ്യമാകും");
  const approveRow = async (id: number) => {
    setApprovingId(id);
    try {
      await window.mms.approvals.approve("subscriptions", id);
      toast.success(tx("Entry approved — the parked first payment is applied and receipts unlock", "രേഖ അംഗീകരിച്ചു — സൂക്ഷിച്ച ആദ്യ അടവ് ചേർക്കും, രസീതും ലഭ്യമാകും"));
      refetch();
      refreshCollected();
    } catch (e: any) {
      toast.error(e?.message || tx("Could not approve", "അംഗീകരിക്കാനായില്ല"));
    } finally {
      setApprovingId(null);
    }
  };

  const { rows, total, totalPages, loading, refetch, setFilters, search, setSearch } = useList(
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

  // Late WhatsApp delivery ack. The receipt send returns the moment WhatsApp
  // ACCEPTS the message; the confirmation that lands a moment later is PUSHED
  // here, so the row turns "delivered — locked" by itself instead of sitting
  // on "sent, not confirmed" until the next manual refresh. (The pushed id is
  // the ledger payment id, so any subscription delivery refreshes the list.)
  useEffect(() => {
    let off: any;
    try { off = (window.mms.whatsapp as any).onReceiptDelivered?.((e: any) => { if (e?.kind === "subscription") refetch(); }); } catch { /* preview build */ }
    return () => { try { if (typeof off === "function") off(); } catch { /* already gone */ } };
  }, [refetch]);

  const openNew = () => {
    setForm({ ...emptyForm, payment_date: todayIST() });
    setEditingId(null);
    setDialogOpen(true);
  };

  // Background WhatsApp receipt send — the SAME pattern the Donations page
  // uses (user report: donation WhatsApp was quick and correct). The dialog
  // closes FIRST, the receipt goes out in the background, and the delivery
  // toast lands when the send finishes. One send per save — no duplicates.
  const backgroundSendReceipt = (id: number) => {
    toast.info(tx("Sending receipt on WhatsApp…", "വാട്ട്സ്ആപ്പിൽ രസീത് അയയ്ക്കുന്നു…"));
    (async () => {
      try {
        const sent: any = await window.mms.whatsapp.sendSubscriptionReceipt(id);
        if (sent?.status === "delivered" || (sent?.success && sent?.delivered)) {
          toast.success(tx("Receipt delivered to the recipient — it is now locked", "രസീത് സ്വീകർത്താവിന് ലഭിച്ചു — ഇപ്പോൾ ലോക്ക് ചെയ്തിരിക്കുന്നു"));
        } else if (sent?.status === "sent" || sent?.success) {
          toast.warning(tx("Receipt sent on WhatsApp — delivery is being confirmed. It locks itself the moment the recipient's phone confirms; if it never arrives you can send it again.", "രസീത് വാട്ട്സ്ആപ്പിൽ അയച്ചു — ഡെലിവറി ഉറപ്പാക്കിക്കൊണ്ടിരിക്കുന്നു. സ്വീകർത്താവിന്റെ ഫോൺ ഉറപ്പിച്ച ഉടനെ അത് ലോക്ക് ആകും; ലഭിച്ചില്ലെങ്കിൽ വീണ്ടും അയയ്ക്കാം."));
          // The recipient's phone may confirm delivery a few seconds later —
          // re-check silently so the lock badge flips WITHOUT the user
          // re-sending or reopening the page (user report: "it shows it is
          // not confirmed the delivery").
          setTimeout(() => { refetch(); }, 15000);
        } else if (sent?.status === "already-delivered") {
          toast.info(tx("Already sent to the recipient — the receipt is locked for their privacy.", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു — സ്വകാര്യതയ്ക്കായി രസീത് ലോക്ക് ചെയ്തിരിക്കുന്നു."));
        } else if (sent?.status === "no-phone" || sent?.status === "not-connected" || sent?.status === "skipped") {
          toast.info(tx("Receipt saved in the app (WhatsApp send skipped — no number or not connected).", "രസീത് ആപ്പിൽ സംരക്ഷിച്ചു (വാട്ട്സ്ആപ്പിൽ അയച്ചില്ല — നമ്പറില്ല അല്ലെങ്കിൽ കണക്റ്റ് ചെയ്തിട്ടില്ല)."));
        } else {
          toast.error(sent?.error || tx("Could not send the receipt", "രസീത് അയയ്ക്കാനായില്ല"));
        }
        refetch();
        if (!(sent?.status === "delivered" || (sent?.success && sent?.delivered))) {
          // A late WhatsApp delivery-ack flips the lock in the database —
          // refresh again shortly so the row turns "Delivered — locked" on
          // its own instead of sitting on "sent, not confirmed" forever.
          setTimeout(refetch, 5_000);
          setTimeout(refetch, 15_000);
        }
      } catch (e: any) {
        toast.error(friendlySendError(e, t) || tx("Could not send the receipt", "രസീത് അയയ്ക്കാനായില്ല"));
        refetch();
      }
    })();
  };

  // Payment recording: only the payment fields are editable — family, head,
  // period and the monthly rate are fixed by the recurring account.
  const handleSave = async () => {
    if (saving) return; // one save at a time — repeated clicks used to queue duplicate payments + receipts
    if (!editingId) {
      // Creating a NEW subscription account (only for families without one).
      if (!form.family_id || !form.amount) {
        toast.error(t("ui_family_amount_required"));
        return;
      }
      try {
        setSaving(true);
        const created: any = await window.mms.subscriptions.create({
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
        refreshCollected();
        refreshPending();
        // Close FIRST, then send — the receipt goes out in the background.
        if (Number(form.amount_paid ?? 0) > 0 && created?.id) backgroundSendReceipt(Number(created.id));
      } catch (err: any) {
        toast.error(err.message || t("ui_failed_save"));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (form.amount_paid == null || Number(form.amount_paid) < 0) {
      toast.error(tx("Enter how much was given", "അടച്ച തുക നൽകുക"));
      return;
    }
    const payingId = editingId;
    const paidNow = Number(form.amount_paid);
    try {
      setSaving(true);
      const r: any = await window.mms.subscriptions.update(payingId, {
        amountPaid: paidNow,
        paymentDate: form.payment_date,
        paymentMethod: form.payment_method,
        transactionRef: form.transaction_ref || "",
        remarks: form.remarks || "",
      });
      toast.success(tx(
        `Payment saved — ${r.status}${r.receiptNumber ? ` (receipt ${r.receiptNumber})` : ""}`,
        `അടവ് സംരക്ഷിച്ചു — ${r.status}${r.receiptNumber ? ` (രസീത് ${r.receiptNumber})` : ""}`
      ));
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      refetch();
      refreshCollected();
      refreshPending();
      // Close FIRST, then send — no more waiting inside the dialog.
      if (paidNow > 0 && r?.receiptNumber) backgroundSendReceipt(Number(payingId));
    } catch (err: any) {
      toast.error(err.message || t("ui_failed_save"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: number) => {
    const s = await window.mms.subscriptions.get(id);
    // Receipt-locked months cannot be edited at all (the service enforces it
    // too): the receipt the payee already received must keep matching the
    // register. Cancel the payment and record it again instead.
    if (s?.wa_receipt_generated_at) {
      toast.error(tx("A receipt has already been generated for this month's payment (printed or sent on WhatsApp), so it can no longer be edited. Cancel the payment and record it again if something is wrong.", "ഈ മാസത്തെ അടവിന്റെ രസീത് ഇതിനകം തയ്യാറാക്കിയിട്ടുണ്ട് (പ്രിന്റ് ചെയ്തോ വാട്ട്സ്ആപ്പിൽ അയച്ചോ) — ഇനി തിരുത്താനാകില്ല. എന്തെങ്കിലും തെറ്റാണെങ്കിൽ അടവ് റദ്ദാക്കി വീണ്ടും രേഖപ്പെടുത്തുക."));
      return;
    }
    setForm({ ...emptyForm, ...s, payment_date: s?.payment_date || todayIST() });
    setEditingId(id);
    setDialogOpen(true);
  };

  const openCancel = (row: Subscription) => {
    setCancelTarget(row);
    setCancelOpen(true);
  };

  const executeCancel = async ({ reason, password }: { reason: string; password: string }) => {
    if (!cancelTarget) return;
    await window.mms.subscriptions.cancelPayment(cancelTarget.id, reason, password);
    toast.success(tx("Payment cancelled — the subscription stays with the family", "അടവ് റദ്ദാക്കി — വരിസംഖ്യ കുടുംബത്തിനൊപ്പം തുടരും"));
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
    } catch (e: any) {
      toast.error(friendlySendError(e, t) || tx("Could not save the receipt PDF", "രസീത് PDF സംരക്ഷിക്കാനായില്ല"));
    }
  };
  const sendReceipt = async (id: number, adminPassword?: string) => {
    if (sendingId != null) return; // one message at a time, per privacy rule
    setSendingId(id);
    // IMMEDIATE feedback (user report: the button gave no sign anything was
    // happening, so it got clicked again and again) — the result toast lands
    // when the send actually finishes.
    toast.info(tx("Sending receipt on WhatsApp…", "വാട്ട്സ്ആപ്പിൽ രസീത് അയയ്ക്കുന്നു…"));
    try {
      const r: any = await window.mms.whatsapp.sendSubscriptionReceipt(id, adminPassword);
      // The lock flips ONLY on confirmed delivery — a send that WhatsApp
      // accepted but the phone never confirmed stays open, exactly as the
      // mahallu asked (no false "already sent").
      if (r?.status === "delivered" || (r?.success && r?.delivered)) {
        toast.success(tx("Receipt delivered to the recipient — it is now locked (one admin re-send remains available)", "രസീത് സ്വീകർത്താവിന് ലഭിച്ചു — ഇപ്പോൾ ലോക്ക് ചെയ്തിരിക്കുന്നു (ഒരു അഡ്മിൻ റീ-സെൻഡ് ലഭ്യമാണ്)"));
      } else if (r?.status === "sent" || r?.success) {
        toast.warning(tx("Receipt sent on WhatsApp — delivery is being confirmed. It locks itself the moment the recipient's phone confirms; if it never arrives you can send it again.", "രസീത് വാട്ട്സ്ആപ്പിൽ അയച്ചു — ഡെലിവറി ഉറപ്പാക്കിക്കൊണ്ടിരിക്കുന്നു. സ്വീകർത്താവിന്റെ ഫോൺ ഉറപ്പിച്ച ഉടനെ അത് ലോക്ക് ആകും; ലഭിച്ചില്ലെങ്കിൽ വീണ്ടും അയയ്ക്കാം."));
        // Late delivery check — flip the lock silently when the phone
        // confirms a few seconds later.
        setTimeout(() => { refetch(); }, 15000);
      } else if (r?.status === "already-delivered") {
        toast.info(tx("Already sent to the recipient — the receipt is locked for their privacy.", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു — സ്വകാര്യതയ്ക്കായി രസീത് ലോക്ക് ചെയ്തിരിക്കുന്നു."));
      } else if (r?.status === "already-sent") {
        toast.info(tx("Just sent — delivery is being confirmed. Please wait a moment instead of sending again.", "ഇപ്പോൾ തന്നെ അയച്ചു — ഡെലിവറി ഉറപ്പാക്കുന്നു. വീണ്ടും അയയ്ക്കുന്നതിന് പകരം അല്പനേരം കാക്കുക."));
      } else {
        toast.error(r?.error || tx("Could not send the receipt", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32"));
      }
      refetch();
      if (!(r?.status === "delivered" || (r?.success && r?.delivered))) {
        // Late delivery-ack refresh — see backgroundSendReceipt.
        setTimeout(refetch, 5_000);
        setTimeout(refetch, 15_000);
      }
    } catch (e: any) {
      toast.error(friendlySendError(e, t) || tx("Could not send the receipt", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d3e\u0d28\u0d3e\u0d2f\u0d3f\u0d32\u0d4d\u0d32"));
      refetch();
    } finally {
      setSendingId(null);
    }
  };
  // A delivered receipt is LOCKED (privacy): one admin-password re-send ever,
  // re-verified in the main process before the message leaves the app.
  const openAdminResend = (row: Subscription) => {
    if (Number(row.wa_resends || 0) >= 1) {
      toast.info(tx("Already sent to the recipient — the one admin re-send was already used.", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു — ഒരു അഡ്മിൻ റീ-സെൻഡ് ഉപയോഗിച്ചു കഴിഞ്ഞു."));
      return;
    }
    setResendTarget(row);
    setResendOpen(true);
  };
  const executeAdminResend = async ({ password }: { reason: string; password: string }) => {
    if (!resendTarget) return;
    await sendReceipt(resendTarget.id, password);
    setResendTarget(null);
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
      toast.success(`${count} ${tx("subscriptions marked overdue", "കാലാവധി കഴിഞ്ഞ വരിസംഖ്യകൾ")}`);
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
      accessor: (r) => <span className="inline-flex items-center gap-1.5"><span className="font-medium">{r.house_name || r.family_number || "—"}</span>{(r as any).approval_status === "pending" && <Badge variant="pending" className="whitespace-nowrap">{t("appr_pending_badge")}</Badge>}</span>,
    },
    { header: tx("Head", "കുടുംബനാഥൻ"), accessor: (r) => r.member_name || "—" },
    { header: tx("Month", "മാസം"), accessor: (r) => monthLabel(r.period_start) },
    { header: t("sub_amount"), accessor: (r) => formatCurrency(r.amount) },
    {
      // TRUE dues — the multi-month view: old arrears ("3 months") + this
      // month's uncovered part − advance credit. Overdue families see the
      // whole stack here, not just the current month.
      header: tx("Due (all months)", "കുടിശ്ശിക (എല്ലാ മാസവും)"),
      accessor: (r) => {
        const rate = Number(r.amount || 0);
        const arrears = Number(r.arrears || 0);
        const advance = Number(r.advance || 0);
        const monthOpen = Math.max(0, rate - Number(r.amount_paid || 0));
        const due = Math.max(0, arrears + monthOpen - advance);
        const monthsDue = rate > 0 ? Math.ceil((due + advance) / rate) : 0;
        const sym = getCurrencySymbol();
        if (due <= 0 && advance > 0) {
          return <Badge variant="success">{tx(`Paid ahead ${sym}${advance.toLocaleString("en-IN")}`, `മുൻകൂർ അടവ് ${sym}${advance.toLocaleString("en-IN")}`)}</Badge>;
        }
        if (due <= 0) return <Badge variant="success">{tx("Paid", "അടച്ചു")}</Badge>;
        return (
          <span className="inline-flex flex-col leading-tight">
            <b className="text-danger">{formatCurrency(due)}</b>
            {monthsDue > 1 && (
              <small className="text-muted">{tx(`${monthsDue} months due (incl. ${sym}${arrears.toLocaleString("en-IN")} old)`, `${monthsDue} മാസം കുടിശ്ശിക (പഴയവ ${sym}${arrears.toLocaleString("en-IN")} ഉൾപ്പെടെ)`)}{advance > 0 ? tx(` · less ${sym}${advance.toLocaleString("en-IN")} advance`, ` · മുൻകൂർ ${sym}${advance.toLocaleString("en-IN")} കുറച്ചു`) : ""}</small>
            )}
          </span>
        );
      },
    },
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
          {isPendingRow(r) && canApprove && (
            <button
              className="act-btn act-view"
              title={tx("Approve — the parked first payment is applied and receipts unlock", "അംഗീകരിക്കുക — സൂക്ഷിച്ച ആദ്യ അടവ് ചേർക്കും, രസീതും ലഭ്യമാകും")}
              disabled={approvingId === r.id}
              onClick={() => approveRow(r.id)}
            >
              <Check className="h-4 w-4 text-emerald-600" />
            </button>
          )}
          {Number(r.amount_paid) > 0 && <>
            <button className="act-btn" disabled={isPendingRow(r) && !canApprove} title={isPendingRow(r) && !canApprove ? pendingLockTitle : tx("Save A6 receipt PDF", "\u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d PDF \u0d38\u0d47\u0d35\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15")} onClick={() => saveReceipt(r.id)}>
              <FileDown className="h-4 w-4 text-primary" />
            </button>
            {r.wa_delivered_at ? (
              <button
                className={`act-btn${Number(r.wa_resends || 0) >= 1 ? " opacity-60" : ""}`}
                title={Number(r.wa_resends || 0) >= 1
                  ? tx("Already sent to recipient — the one admin re-send was used", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു — ഒരു അഡ്മിൻ റീ-സെൻഡ് ഉപയോഗിച്ചു കഴിഞ്ഞു")
                  : tx("Already sent to recipient — one admin re-send available", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു — ഒരു അഡ്മിൻ റീ-സെൻഡ് ലഭ്യമാണ്")}
                onClick={() => openAdminResend(r)}
              >
                <Lock className="h-4 w-4 text-emerald-500" />
              </button>
            ) : (
              <button
                className="act-btn"
                disabled={sendingId === r.id || (isPendingRow(r) && !canApprove)}
                title={isPendingRow(r) && !canApprove
                  ? pendingLockTitle
                  : r.wa_sent_at
                  ? tx("Sent earlier but delivery was never confirmed — sending again is allowed", "ഇതിനകം അയച്ചെങ്കിലും ഡെലിവറി ഉറപ്പായില്ല — വീണ്ടും അയയ്ക്കാം")
                  : tx("Send receipt on WhatsApp", "\u0d35\u0d3e\u0d1f\u0d4d\u0d38\u0d3e\u0d2a\u0d4d\u0d2a\u0d3f\u0d7d \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d41\u0d15")}
                onClick={() => sendReceipt(r.id)}
              >
                <MessageCircle className="h-4 w-4 text-primary" />
              </button>
            )}
          </>}
          {r.wa_receipt_generated_at ? (
            <button
              className="act-btn opacity-60"
              style={{ cursor: "not-allowed" }}
              disabled
              title={tx("Receipt already generated and sent — editing is disabled. Cancel the payment to record it again.", "രസീത് ഇതിനകം തയ്യാറാക്കി അയച്ചു — തിരുത്താനാകില്ല. വീണ്ടും രേഖപ്പെടുത്തണമെങ്കിൽ അടവ് റദ്ദാക്കുക.")}
            >
              <Edit2 className="h-4 w-4" />
            </button>
          ) : (
            <button
              className="act-btn act-edit"
              disabled={isPendingRow(r) && !canApprove}
              title={isPendingRow(r) && !canApprove ? pendingLockTitle : tx("Record payment", "അടവ് രേഖപ്പെടുത്തുക")}
              onClick={() => handleEdit(r.id)}
            >
              <Edit2 className="h-4 w-4" />
            </button>
          )}
          <button
            className="act-btn act-del"
            title={tx("Cancel this month's payment", "ഈ മാസത്തെ അടവ് റദ്ദാക്കുക")}
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
        { k: tx("Old arrears (previous months)", "പഴയ കുടിശ്ശിക (മുൻ മാസങ്ങൾ)"), v: formatCurrency(Number(previewRow.arrears || 0)) },
        { k: tx("Advance credit", "മുൻകൂർ തുക"), v: formatCurrency(Number(previewRow.advance || 0)) },
        {
          k: tx("Total due now", "നിലവിലെ ആകെ കുടിശ്ശിക"),
          v: formatCurrency(Math.max(0, Number(previewRow.arrears || 0) + Math.max(0, Number(previewRow.amount || 0) - Number(previewRow.amount_paid || 0)) - Number(previewRow.advance || 0))),
        },
        { k: t("sub_receipt"), v: previewRow.receipt_number || "—" },
        { k: tx("Receipt on WhatsApp", "വാട്ട്സ്ആപ്പിലെ രസീത്"), v: previewRow.wa_delivered_at ? tx("Delivered — locked (privacy)", "രസീത് ലഭിച്ചു — ഇനി ഇത് തിരുത്താനാകില്ല") : previewRow.wa_sent_at ? tx("Sent — delivery not confirmed", "അയച്ചു — ഡെലിവറി ഉറപ്പായിട്ടില്ല") : tx("Not sent", "അയച്ചിട്ടില്ല") },
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
            "മാസിക വരിസംഖ്യ — ഓരോ കുടുംബത്തിനും (കുടുംബനാഥന്) ഒരു വരി, ഓരോ മാസവും അതേ വരിയിൽ തന്നെ"
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
            {tx("New subscription", "പുതിയ വരിസംഖ്യ")}
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
          <div className="slab">{tx("Total collected (all months)", "ആകെ പിരിച്ചത് (എല്ലാ മാസങ്ങളും)")}</div>
        </div>
        <div className="stat t-rose">
          <div className="srow">
            <span className="sic"><AlertCircle size={18} /></span>
            <span className="delta">{t("sub_dues")}</span>
          </div>
          <div className="val">{formatCurrency(totalPending ?? 0)}</div>
          <div className="slab">{tx("Total dues — old arrears + this month − advance", "ആകെ കുടിശ്ശിക — പഴയ കുടിശ്ശിക + ഈ മാസത്തെ തുക − മുൻകൂർ തുക")}</div>
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
              <div className="dlg-sec"><b>{tx("Subscription", "വരിസംഖ്യ")}</b></div>
              <div className="det-grid">
                {previewDetails.slice(0, 6).map((d, i) => (
                  <div key={i} className={`det${d.full ? " full" : ""}`}>
                    <span className="k">{d.k}</span>
                    <span className="v">{d.v}</span>
                  </div>
                ))}
              </div>
              <div className="dlg-sec"><b>{tx("Payment & status", "അടവും അവസ്ഥയും")}</b></div>
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
                  <strong>{tx("Payment history", "അടവ് ചരിത്രം")}</strong>
                </div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {historyRows.length ? historyRows.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                      <div>
                        <div className="text-sm font-medium">
                          {monthLabel(h.period_start)} · {formatCurrency(h.amount)}
                          {Number(h.arrears_cleared || 0) > 0 && (
                            <span className="text-xs text-muted"> · {tx(`incl. ${formatCurrency(Number(h.arrears_cleared || 0))} old dues`, `പഴയ കുടിശ്ശിക ${formatCurrency(Number(h.arrears_cleared || 0))} ഉൾപ്പെടെ`)}</span>
                          )}
                          {Number(h.advance_added || 0) > 0 && (
                            <span className="text-xs text-muted"> · {tx(`${formatCurrency(Number(h.advance_added || 0))} advance`, `${formatCurrency(Number(h.advance_added || 0))} മുൻകൂർ അടവ്`)}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted">
                          {h.receipt_number || "—"} · {formatDate(h.payment_date)} · {h.payment_method}
                          {h.receipt_delivered_at ? ` · ${tx("receipt delivered", "രസീത് എത്തി")}` : ""}
                        </div>
                      </div>
                      <Badge variant={h.status === "Cancelled" ? "danger" : "success"}>{h.status}</Badge>
                    </div>
                  )) : (
                    <div className="text-sm text-muted">{tx("No payments recorded yet", "ഇതുവരെ അടവില്ല")}</div>
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
              {previewRow?.wa_delivered_at ? (
                <Button variant="secondary" onClick={() => previewRow && openAdminResend(previewRow)} disabled={sendingId === previewRow.id}>
                  <Lock size={14} />{tx("Already sent to recipient", "സ്വീകർത്താവിന് ഇതിനകം അയച്ചു")}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => previewRow && sendReceipt(previewRow.id)} disabled={sendingId === previewRow?.id}>
                  <MessageCircle size={14} />{tx("WhatsApp receipt", "\u0d35\u0d3e\u0d1f\u0d4d\u0d38\u0d3e\u0d2a\u0d4d\u0d2a\u0d4d \u0d30\u0d38\u0d40\u0d1f\u0d4d\u0d1f\u0d4d")}
                </Button>
              )}
            </>}
            <Button onClick={switchToEdit}>
              <Edit2 size={14} />
              {tx("Record payment", "അടവ് രേഖപ്പെടുത്തുക")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Record-payment / new-account Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? tx("Record payment", "അടവ് രേഖപ്പെടുത്തുക") : tx("New subscription account", "പുതിയ വരിസംഖ്യ അക്കൗണ്ട്")}
        className="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          {editingId ? (
            <>
              <div className="rounded-lg border border-border-subtle bg-surface-hover/40 px-4 py-3 text-sm flex items-center gap-2">
                <Wallet size={14} className="text-primary" />
                <span className="text-muted">
                  {tx("Recurring subscription for", "ആവർത്തിച്ച് വരുന്ന വരിസംഖ്യ")} <b className="text-text-primary">{form.house_name || form.family_number}</b>
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
                  <Label>{tx("Total due now", "നിലവിലെ ആകെ കുടിശ്ശിക")}</Label>
                  <Input value={formatCurrency(Math.max(0, Number(form.arrears || 0) + Math.max(0, Number(form.amount || 0) - Number(form.amount_paid || 0)) - Number(form.advance || 0)))} readOnly className="bg-surface-muted" />
                  <div className="text-xs text-muted mt-1.5">
                    {Number(form.arrears || 0) > 0 && tx(`includes ${formatCurrency(Number(form.arrears || 0))} from previous months`, `മുൻ മാസങ്ങളിൽ നിന്ന് ${formatCurrency(Number(form.arrears || 0))} ഉൾപ്പെടുന്നു`)}
                    {Number(form.advance || 0) > 0 && (Number(form.arrears || 0) > 0 ? " · " : "") + tx(`${formatCurrency(Number(form.advance || 0))} advance credit applies`, `${formatCurrency(Number(form.advance || 0))} മുൻകൂർ തുക ബാധകം`)}
                  </div>
                </div>
              </div>
              {/* How the cash given this month will be applied (oldest-first):
                  old arrears → this month → advance. The hint updates live as
                  the operator types the amount — "due 150, paid 200" shows the
                  ₹50 becoming advance BEFORE saving. */}
              {(() => {
                const rate = Number(form.amount || 0);
                const oldArrears = Number(form.arrears || 0);
                const oldAdvance = Number(form.advance || 0);
                const cash = Number(form.amount_paid || 0);
                const arrearsTake = Math.min(oldArrears, cash);
                const afterArrears = cash - arrearsTake;
                const monthTake = Math.min(rate, afterArrears);
                const advanceAdded = Math.max(0, afterArrears - monthTake);
                const remaining = Math.max(0, (oldArrears - arrearsTake) + Math.max(0, rate - monthTake) - oldAdvance);
                if (cash <= 0) return null;
                return (
                  <div className="rounded-lg border border-border-subtle bg-surface-hover/40 px-4 py-3 text-xs text-muted leading-relaxed">
                    <b className="text-text-primary">{tx("How this payment will be applied", "ഈ അടവ് എങ്ങനെ കണക്കാക്കും")}</b>
                    <div className="mt-1">
                      {arrearsTake > 0 && <div>· {tx(`${formatCurrency(arrearsTake)} clears previous months' balance`, `${formatCurrency(arrearsTake)} പഴയ മാസങ്ങളുടെ കുടിശ്ശിക അടയ്ക്കും`)}</div>}
                      <div>· {tx(`${formatCurrency(monthTake)} for this month`, `${formatCurrency(monthTake)} ഈ മാസത്തേക്ക്`)}</div>
                      {advanceAdded > 0 && <div>· {tx(`${formatCurrency(advanceAdded)} becomes advance — next month's due will be ${formatCurrency(Math.max(0, rate - advanceAdded))}`, `${formatCurrency(advanceAdded)} മുൻകൂറാകും — അടുത്ത മാസത്തെ കുടിശ്ശിക ${formatCurrency(Math.max(0, rate - advanceAdded))} ആകും`)}</div>}
                      <div className="mt-1">{remaining > 0
                        ? tx(`Balance after this payment: ${formatCurrency(remaining)}`, `ഈ അടവിന് ശേഷമുള്ള കുടിശ്ശിക: ${formatCurrency(remaining)}`)
                        : tx("Fully settled after this payment", "ഇതിനു ശേഷം പൂർണമായി തീരും")}</div>
                    </div>
                  </div>
                );
              })()}
              <div className="sec-divider">
                <SectionLabel>{tx("Payment details (editable)", "അടവ് വിവരങ്ങൾ (തിരുത്താവുന്നത്)")}</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{tx("How much was given", "എത്ര നൽകി")} *</Label>
                    <Input type="number" min="0" value={form.amount_paid ?? 0} disabled={!!form.wa_receipt_generated_at} onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })} />
                    {form.wa_receipt_generated_at
                      ? <div className="text-xs text-muted mt-1.5">{tx("A receipt was already generated for this payment (printed or sent on WhatsApp) — editing is disabled. Cancel the payment to record it again.", "ഈ അടവിന്റെ രസീത് ഇതിനകം തയ്യാറാക്കിയിട്ടുണ്ട് (പ്രിന്റ് ചെയ്തോ വാട്ട്സ്ആപ്പിൽ അയച്ചോ) — തിരുത്താനാകില്ല. വീണ്ടും രേഖപ്പെടുത്തണമെങ്കിൽ അടവ് റദ്ദാക്കുക.")}</div>
                      : <div className="text-xs text-muted mt-1.5">{tx("Family, head, month and rate are fixed — only this can be edited.", "കുടുംബം, കുടുംബനാഥൻ, മാസം, നിരക്ക് എന്നിവ മാറ്റാനാവില്ല — ഇത് മാത്രം തിരുത്താം.")}</div>}
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
                    <Input data-nocap="1" value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
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
                {tx("Use this only for a family that has no subscription yet. Existing families already have their recurring row.", "വരിസംഖ്യ ഇല്ലാത്ത കുടുംബത്തിന് മാത്രം ഉപയോഗിക്കുക. നിലവിലുള്ള കുടുംബങ്ങൾക്ക് അവരുടെ ആവർത്തിക്കുന്ന വരി ഉണ്ട്.")}
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
                  <Label>{tx("First payment (optional)", "ആദ്യ അടവ് (ഓപ്ഷണൽ)")}</Label>
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
                  <Input data-nocap="1" value={form.transaction_ref || ""} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} />
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
            <Button onClick={handleSave} disabled={saving}>{saving ? t("ui_saving") : (editingId ? tx("Save payment", "അടവ് സംരക്ഷിക്കുക") : t("action_save"))}</Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel payment — secure gate (reason + admin password) */}
      <SecureActionDialog
        open={cancelOpen}
        onClose={() => { setCancelOpen(false); setCancelTarget(null); }}
        onConfirm={executeCancel}
        title={tx("Cancel payment", "അടവ് റദ്ദാക്കുക")}
        description={
          cancelTarget
            ? tx(
                `Cancel the ${monthLabel(cancelTarget.period_start)} payment of ${formatCurrency(cancelTarget.amount_paid)} for ${cancelTarget.house_name || cancelTarget.family_number}?`,
                `${cancelTarget.house_name || cancelTarget.family_number} ന്റെ ${monthLabel(cancelTarget.period_start)} അടവ് (${formatCurrency(cancelTarget.amount_paid)}) റദ്ദാക്കണോ?`
              )
            : ""
        }
        confirmLabel={tx("Cancel payment", "അടവ് റദ്ദാക്കുക")}
      />

      {/* WhatsApp receipt privacy lock — the ONE admin-authorized re-send for
          a receipt already delivered to the family. The password is re-verified
          in the MAIN process before the message leaves the app. */}
      <SecureActionDialog
        open={resendOpen}
        onClose={() => { setResendOpen(false); setResendTarget(null); }}
        onConfirm={executeAdminResend}
        title={tx("Re-send receipt (administrator)", "രസീത് വീണ്ടും അയയ്ക്കുക (അഡ്മിൻ)")}
        description={
          resendTarget
            ? tx(
                `This month's receipt for ${resendTarget.house_name || resendTarget.family_number} was already DELIVERED on WhatsApp and is locked for their privacy. Re-send it once more? This is the only re-send this receipt ever gets.`,
                `${resendTarget.house_name || resendTarget.family_number} ന്റെ ഈ മാസത്തെ രസീത് വാട്ട്സ്ആപ്പിൽ എത്തിയിട്ടുണ്ട്; സ്വകാര്യതയ്ക്കായി അത് ലോക്ക് ചെയ്തിരിക്കുന്നു. ഒരിക്കൽ കൂടി അയക്കണോ? ഇതാണ് ഈ രസീതിന് ലഭിക്കുന്ന ഒരേയൊരു റീ-സെൻഡ്.`
              )
            : ""
        }
        confirmLabel={tx("Re-send once", "ഒരിക്കൽ കൂടി അയയ്ക്കുക")}
        danger={false}
      />
    </div>
  );
}
