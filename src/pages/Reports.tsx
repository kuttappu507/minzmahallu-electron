import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Home, Users, Wallet, Gift, Gem, Flower, Heart, Skull, ScrollText, ShieldCheck, BarChart3, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { toast } from "@/lib/toast";

type Tint = "t-em" | "t-gold" | "t-sky" | "t-rose" | "t-vio" | "t-pink" | "t-orange" | "t-teal" | "t-blue" | "t-slate";
interface ReportType { id: string; title: string; description: string; tint: Tint; icon: typeof Home; fetch: () => Promise<any[]>; columns?: string[]; }

const REPORTS: ReportType[] = [
  { id: "families", title: "Family Register", description: "All registered families with house, ward, contact and member count.", tint: "t-em", icon: Home, fetch: async () => (await window.mms.families.list({ pageSize: 100000 })).rows || [], columns: ["family_number", "house_name", "house_number", "ward", "area", "phone", "alternative_phone", "status", "member_count"] },
  { id: "members", title: "Member Directory", description: "Complete member roster with code, family, demographics and contact.", tint: "t-teal", icon: Users, fetch: async () => (await window.mms.members.list({ pageSize: 100000 })).rows || [], columns: ["member_code", "name", "gender", "age", "blood_group", "mobile", "email", "house_name", "family_number", "status"] },
  { id: "subscriptions", title: "Subscription Summary", description: "All subscription receipts with plan, amount, period and payment status.", tint: "t-gold", icon: Wallet, fetch: async () => (await window.mms.subscriptions.list({ pageSize: 100000 })).rows || [] },
  { id: "donations", title: "Donation Report", description: "Donations by category, donor, date and purpose — includes totals.", tint: "t-pink", icon: Gift, fetch: async () => (await window.mms.donations.list({ pageSize: 100000 })).rows || [] },
  { id: "accounting", title: "Financial Statement", description: "Income & expense ledger transactions with running balance summary.", tint: "t-sky", icon: BarChart3, fetch: async () => {
    const [listRes, inc, exp, bal] = await Promise.all([window.mms.accounting.list({ pageSize: 100000 }), window.mms.accounting.totalIncome(), window.mms.accounting.totalExpense(), window.mms.accounting.balance()]);
    const rows = (listRes?.rows || []).map((r: any) => ({ date: r.txn_date || r.date || "", type: r.type, description: r.description, amount: r.amount, method: r.payment_method || r.method || "" }));
    rows.push({ date: "—", type: "SUMMARY", description: "TOTAL INCOME", amount: inc ?? 0, method: "" }, { date: "—", type: "SUMMARY", description: "TOTAL EXPENSE", amount: exp ?? 0, method: "" }, { date: "—", type: "SUMMARY", description: "NET BALANCE", amount: bal ?? 0, method: "" });
    return rows;
  } },
  { id: "marriages", title: "Marriage Register", description: "Nikah registrations — bride, groom, witnesses, mahar and dates.", tint: "t-vio", icon: Gem, fetch: async () => (await window.mms.marriages.list({ pageSize: 100000 })).rows || [], columns: ["marriage_number", "nikah_date", "bride_name", "bride_father", "groom_name", "groom_father", "place", "mahar"] },
  { id: "deaths", title: "Death Register", description: "Death and burial records with deceased, date and burial place.", tint: "t-slate", icon: Flower, fetch: async () => (await window.mms.deaths.list({ pageSize: 100000 })).rows || [], columns: ["death_number", "deceased_name", "father_name", "gender", "date_of_death", "burial_date", "burial_place"] },
  { id: "welfare", title: "Welfare Report", description: "Welfare assistance requests with approved amounts and disbursement status.", tint: "t-orange", icon: ShieldCheck, fetch: async () => (await window.mms.welfare.list({ pageSize: 100000 })).rows || [] },
  { id: "certificates", title: "Certificate Log", description: "Issued certificates with dates and recipients.", tint: "t-blue", icon: ScrollText, fetch: async () => (await window.mms.certificates.list({ pageSize: 100000 })).rows || [], columns: ["certificate_number", "type", "issued_to", "issued_date", "issued_by"] },
  { id: "audit", title: "Audit Log", description: "All user actions across modules — full tamper-evident trail.", tint: "t-rose", icon: ShieldCheck, fetch: async () => (await window.mms.audit.list({ pageSize: 100000 })).rows || [], columns: ["created_at", "username", "action", "module", "description"] },
  { id: "deaths_extra", title: "Burial Sites Index", description: "Quick index of burial places referenced in the death register.", tint: "t-teal", icon: Skull, fetch: async () => {
    const rows = (await window.mms.deaths.list({ pageSize: 100000 })).rows || [];
    const seen = new Map<string, { place: string; count: number; latest: string }>();
    for (const r of rows as any[]) { const place = (r.burial_place || "Unknown").trim(); const cur = seen.get(place) || { place, count: 0, latest: "" }; cur.count++; if (!cur.latest || (r.burial_date || "") > cur.latest) cur.latest = r.burial_date || ""; seen.set(place, cur); }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  } },
  { id: "marriages_extra", title: "Nikah Officiant Index", description: "Marriage events grouped by place with annual counts.", tint: "t-pink", icon: Heart, fetch: async () => {
    const rows = (await window.mms.marriages.list({ pageSize: 100000 })).rows || [];
    const seen = new Map<string, { place: string; count: number; latest: string }>();
    for (const r of rows as any[]) { const place = (r.place || "Unknown").trim(); const cur = seen.get(place) || { place, count: 0, latest: "" }; cur.count++; if (!cur.latest || (r.nikah_date || "") > cur.latest) cur.latest = r.nikah_date || ""; seen.set(place, cur); }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  } },
];

const escapeCsv = (v: any) => { if (v === null || v === undefined) return ""; const s = String(v); return /[,\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const escapeHtml = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pickColumns = (rows: any[], preferred?: string[]) => preferred?.length ? preferred.filter(c => Object.prototype.hasOwnProperty.call(rows[0] || {}, c)) : [];
const columnsFor = (rows: any[], preferred?: string[]) => pickColumns(rows, preferred).length ? pickColumns(rows, preferred) : Object.keys(rows[0] || {});
const buildCsv = (rows: any[], cols: string[]) => [cols.join(","), ...rows.map(r => cols.map(c => escapeCsv(r[c])).join(","))].join("\n");
const buildExcel = (rows: any[], cols: string[]) => `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
const downloadBlob = (content: string, mime: string, filename: string) => { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const stamp = () => new Date().toISOString().slice(0, 10);

function buildPdfHtml(title: string, rows: any[], cols: string[]) {
  const landscape = cols.length >= 7;
  const head = cols.map(c => `<th>${escapeHtml(c.replace(/_/g, " "))}</th>`).join("");
  const body = rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm}*{box-sizing:border-box}body{font:12px Poppins,system-ui,sans-serif;color:#1e2b25}h1{font-size:18px;margin:0 0 4px}.sub{color:#5f7268;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{padding:5px 6px;border:1px solid #dfe8e1;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f6f9f6;text-transform:uppercase;font-size:11px}tr:nth-child(even) td{background:#f8faf8}</style></head><body><h1>${escapeHtml(title)}</h1><div class="sub">Minz Mahallu Management System · Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} records</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function Reports() {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyFmt, setBusyFmt] = useState<"csv" | "excel" | "pdf" | null>(null);

  const handleExport = async (rpt: ReportType, fmt: "csv" | "excel" | "pdf") => {
    setBusyId(rpt.id); setBusyFmt(fmt);
    try {
      const rows = await rpt.fetch();
      if (!rows.length) { toast.warning(`${t("rpt_no_records")} "${rpt.title}"`); return; }
      const cols = columnsFor(rows, rpt.columns);
      const base = `${rpt.id}_${stamp()}`;
      if (fmt === "csv") {
        downloadBlob("\ufeff" + buildCsv(rows, cols), "text/csv;charset=utf-8", `${base}.csv`);
        toast.success(`${rpt.title}: ${rows.length} ${t("rpt_exported_as")} CSV`);
      } else if (fmt === "excel") {
        downloadBlob(buildExcel(rows, cols), "application/vnd.ms-excel;charset=utf-8", `${base}.xls`);
        toast.success(`${rpt.title}: ${rows.length} ${t("rpt_exported_as")} Excel`);
      } else {
        const result = await window.mms.pdf.generate(buildPdfHtml(rpt.title, rows, cols), `${base}.pdf`);
        if (result?.success === false && !result?.cancelled) throw new Error(result.error || t("rpt_pdf_failed"));
        if (!result?.cancelled) toast.success(`${rpt.title}: ${t("rpt_pdf_generated")}`);
      }
    } catch (err: any) {
      toast.error(err.message || (fmt === "pdf" ? t("rpt_pdf_failed") : `Failed to export ${rpt.title}`));
    } finally { setBusyId(null); setBusyFmt(null); }
  };

  return <div className="view view-enter">
    <div className="vhead"><div className="modic t-em"><BarChart3 size={20} /></div><div><h1>{t("rpt_title")}</h1><div className="vs">{t("rpt_subtitle")}</div></div></div>
    <div className="rep-sec"><b>{t("rpt_catalogue")}</b></div>
    <div className="rep-grid">{REPORTS.map(rpt => { const Icon = rpt.icon; const busy = busyId === rpt.id; return <div key={rpt.id} className={`rep-card ${rpt.tint}`}><div className="ric"><Icon size={20} /></div><div className="rtitle">{rpt.title}</div><div className="rdesc">{rpt.description}</div><div className="rexps">
      <button className="btn bs bg" onClick={() => handleExport(rpt, "csv")} disabled={busy} title={t("rpt_export_csv")}>{busy && busyFmt === "csv" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}CSV</button>
      <button className="btn bs bg" onClick={() => handleExport(rpt, "excel")} disabled={busy} title={t("rpt_export_excel")}>{busy && busyFmt === "excel" ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}Excel</button>
      <button className="btn bs bp" onClick={() => handleExport(rpt, "pdf")} disabled={busy} title={t("rpt_save_pdf")}>{busy && busyFmt === "pdf" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}PDF</button>
    </div></div>; })}</div>
    <div className="rep-sec mt-4"><b>{t("rpt_how_works")}</b></div>
    <div className="card card-pad-5"><div className="rep-info"><p><b>CSV</b> — {t("rpt_csv_desc")}</p><p><b>Excel</b> — {t("rpt_excel_desc")}</p><p><b>PDF</b> — {t("rpt_pdf_desc")}</p><p className="rep-info-foot">{t("rpt_foot")}</p></div></div>
  </div>;
}
