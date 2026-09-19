import { useCallback, useEffect, useState } from "react";
import { Check, X, Inbox, Loader2, RefreshCw, ShieldCheck, Wallet, Home, User, Gem, Flower, Gift, Receipt } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button, Badge, Dialog, Textarea, EmptyState } from "@/components/ui";
import { toast } from "@/lib/toast";
import { formatDateTime, statusVariant } from "@/lib/utils";

type ApprovalRow = {
  kind: string;
  id: number;
  title: string;
  detail: string;
  amount: number | null;
  createdAt: string;
};

const KIND_ICONS: Record<string, any> = {
  donations: Gift, subscriptions: Receipt, families: Home,
  members: User, marriages: Gem, deaths: Flower,
};

/** Pending-approval queue (Administrator/Secretary only). Entries added by
 *  Member/Staff accounts wait here: approve to make them official and counted
 *  in every ledger, reject to remove them (they were never official). */
export function Approvals() {
  const { t, isMalayalam } = useI18n();
  const tx = (en: string, ml: string) => (isMalayalam() ? ml : en);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectRow, setRejectRow] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const refetch = useCallback(async () => {
    try {
      const r: any = await window.mms.approvals.list();
      setRows(r?.rows || []);
    } catch (e: any) {
      toast.error(e?.message || t("ui_failed_save"));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { refetch(); }, [refetch]);

  const approve = async (row: ApprovalRow) => {
    const key = `${row.kind}-${row.id}`;
    setBusyId(key);
    try {
      await window.mms.approvals.approve(row.kind, row.id);
      toast.success(tx("Entry approved — it is now counted in the records.", "രേഖ അംഗീകരിച്ചു — ഇനി കണക്കിൽ എടുക്കും."));
      await refetch();
    } catch (e: any) { toast.error(e?.message || t("ui_failed_save")); }
    finally { setBusyId(null); }
  };

  const reject = async () => {
    if (!rejectRow) return;
    const key = `${rejectRow.kind}-${rejectRow.id}`;
    setBusyId(key);
    try {
      await window.mms.approvals.reject(rejectRow.kind, rejectRow.id, rejectReason);
      toast.success(tx("Entry rejected and removed.", "രേഖ നിരാകരിച്ചു, നീക്കം ചെയ്തു."));
      setRejectRow(null); setRejectReason("");
      await refetch();
    } catch (e: any) { toast.error(e?.message || t("ui_failed_save")); }
    finally { setBusyId(null); }
  };

  const kindLabel = (kind: string) => ({
    donations: t("nav_donations"), subscriptions: t("nav_subscriptions"),
    families: t("nav_families"), members: t("nav_members"),
    marriages: t("nav_marriage"), deaths: t("nav_death"),
  } as Record<string, string>)[kind] || kind;

  return <div className="view view-enter">
    <div className="vhead">
      <div className="modic t-gold"><ShieldCheck size={20}/></div>
      <div>
        <h1>{t("appr_title")}</h1>
        <div className="vs">{t("appr_subtitle")}</div>
      </div>
      <div className="vr"><Button variant="secondary" onClick={refetch} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>{t("ui_refresh") || "Refresh"}</Button></div>
    </div>

    <div className="card card-pad-4">
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-muted"><Loader2 className="animate-spin" size={18}/>{t("ui_loading")}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Inbox size={28}/>} title={t("appr_empty")} description={t("appr_empty_hint")}/>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="pending">{rows.length} {t("appr_waiting")}</Badge>
            <span className="text-xs text-muted">{t("appr_queue_hint")}</span>
          </div>
          {rows.map((row) => {
            const Icon = KIND_ICONS[row.kind] || Inbox;
            const key = `${row.kind}-${row.id}`;
            return (
              <div key={key} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-surface-hover/40 transition-colors">
                <div className="ric"><Icon size={18}/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="font-medium">{row.title}</b>
                    <Badge variant={statusVariant("pending")}>{kindLabel(row.kind)}</Badge>
                    {row.amount != null && Number(row.amount) > 0 && (
                      <span className="text-sm font-semibold text-primary">₹{Number(row.amount).toLocaleString("en-IN")}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5 truncate">{row.detail}</div>
                </div>
                <div className="text-xs text-muted whitespace-nowrap hidden md:block">{formatDateTime(row.createdAt)}</div>
                <div className="flex gap-2 flex-none">
                  <Button size="sm" onClick={() => approve(row)} disabled={busyId === key}>
                    {busyId === key ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}{t("appr_approve")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setRejectRow(row); setRejectReason(""); }} disabled={busyId === key}>
                    <X size={13}/>{t("appr_reject")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <Dialog open={!!rejectRow} onClose={() => setRejectRow(null)} title={t("appr_reject_title")} description={t("appr_reject_hint")}>
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-surface-hover/40 px-4 py-3 text-sm">
          <b>{rejectRow?.title}</b>
          <div className="text-xs text-muted mt-1">{rejectRow?.detail}</div>
        </div>
        <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={tx("Reason (recorded in the audit log)", "കാരണം (ഓഡിറ്റ് ലോഗിൽ രേഖപ്പെടുത്തുന്നു)")}/>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectRow(null)}>{t("action_cancel")}</Button>
          <Button variant="danger" onClick={reject} disabled={busyId !== null}><X size={14}/>{t("appr_reject")}</Button>
        </div>
      </div>
    </Dialog>
  </div>;
}
