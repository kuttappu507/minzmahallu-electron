import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Home, Users, Wallet, Gift, Gem, Flower, ScrollText, ShieldCheck, BarChart3, Loader2, CalendarRange } from "lucide-react";
import { useI18n } from "@/i18n";
import { todayIST, formatDateTime, formatDate } from "@/lib/utils";
import { Select, Input, Button } from "@/components/ui";
import { toast } from "@/lib/toast";
import { getAnekFontCss } from "@/lib/tokenPrint";
import { buildXlsx } from "@/lib/reportXlsx";

type Tint = "t-em"|"t-gold"|"t-sky"|"t-rose"|"t-vio"|"t-pink"|"t-orange"|"t-teal"|"t-blue"|"t-slate";
interface ReportType { id:string; title:string; titleMl:string; description:string; descMl:string; tint:Tint; icon:any; fetch:()=>Promise<any[]>; columns?:string[]; labels?:Record<string,string>; dateKeys:string[]; }

const REPORTS:ReportType[]=[
 {id:"families",title:"Family Register",titleMl:"കുടുംബ രജിസ്റ്റർ",description:"All registered families with house, ward, contact and member count.",descMl:"വീട്, വാർഡ്, കോൺടാക്റ്റ്, അംഗസംഖ്യ എന്നിവയുള്ള രജിസ്റ്റർ ചെയ്ത എല്ലാ കുടുംബങ്ങളും.",tint:"t-em",icon:Home,fetch:async()=>((await window.mms.families.list({pageSize:100000})).rows||[]),columns:["family_number","house_name","house_number","ward","area","phone","status","member_count"],dateKeys:["created_at"]},
 {id:"members",title:"Member Directory",titleMl:"അംഗ ഡയറക്ടറി",description:"Complete member roster with demographics and contact.",descMl:"വിവരങ്ങളും കോൺടാക്റ്റും അടക്കമുള്ള പൂർണ്ണ അംഗ പട്ടിക.",tint:"t-teal",icon:Users,fetch:async()=>((await window.mms.members.list({pageSize:100000})).rows||[]),columns:["member_code","name","family_house_name","family_area","gender","age","blood_group","mobile","email","status"],labels:{member_code:"Member Code",name:"Member Name",family_house_name:"Family Name",family_area:"Area",gender:"Gender",age:"Age",blood_group:"Blood Group",mobile:"Mobile",email:"Email",status:"Status"},dateKeys:["created_at"]},
 {id:"subscriptions",title:"Subscription Summary",titleMl:"സബ്സ്ക്രിപ്ഷൻ സംഗ്രഹം",description:"Subscription receipts, periods, payments and status.",descMl:"സബ്സ്ക്രിപ്ഷൻ രസീതുകൾ, കാലയളവുകൾ, അടവുകൾ, സ്ഥിതി.",tint:"t-gold",icon:Wallet,fetch:async()=>((await window.mms.subscriptions.list({pageSize:100000})).rows||[]),columns:["family_number","house_name","amount","amount_paid","payment_date","receipt_number","payment_method","status"],dateKeys:["payment_date","period_start","created_at"]},
 {id:"donations",title:"Donation Report",titleMl:"സംഭാവന റിപ്പോർട്ട്",description:"Donations by donor, category, date and purpose.",descMl:"ദാതാവ്, വിഭാഗം, തീയതി, ഉദ്ദേശ്യം എന്നിവയുള്ള സംഭാവനകൾ.",tint:"t-pink",icon:Gift,fetch:async()=>((await window.mms.donations.list({pageSize:100000})).rows||[]),dateKeys:["donation_date","created_at"]},
 {id:"accounting",title:"Financial Statement",titleMl:"സാമ്പത്തിക പ്രസ്താവന",description:"Income and expense ledger transactions with totals.",descMl:"വരവ്-ചെലവ് ഇടപാടുകളും ആകെത്തുകകളും.",tint:"t-sky",icon:BarChart3,fetch:async()=>{const [r,inc,exp,bal]=await Promise.all([window.mms.accounting.list({pageSize:100000}),window.mms.accounting.totalIncome(),window.mms.accounting.totalExpense(),window.mms.accounting.balance()]);return [...(r?.rows||[]).map((x:any)=>({date:x.txn_date||"",type:x.type,description:x.description,category:x.category||"",amount:x.amount,payment_method:x.payment_method||""})),{date:"",type:"SUMMARY",description:"TOTAL INCOME",amount:inc??0},{date:"",type:"SUMMARY",description:"TOTAL EXPENSE",amount:exp??0},{date:"",type:"SUMMARY",description:"NET BALANCE",amount:bal??0}]},dateKeys:["date","txn_date","created_at"]},
 {id:"marriages",title:"Marriage Register",titleMl:"നികാഹ് രജിസ്റ്റർ",description:"Nikah registrations and parties.",descMl:"നികാഹ് രജിസ്ട്രേഷനുകളും കക്ഷികളും.",tint:"t-vio",icon:Gem,fetch:async()=>((await window.mms.marriages.list({pageSize:100000})).rows||[]),columns:["marriage_number","nikah_date","bride_name","groom_name","place","mahar"],dateKeys:["nikah_date","registration_date","created_at"]},
 {id:"deaths",title:"Death Register",titleMl:"മരണ രജിസ്റ്റർ",description:"Death and burial records.",descMl:"മരണവും കബറടക്കവും സംബന്ധിച്ച രേഖകൾ.",tint:"t-slate",icon:Flower,fetch:async()=>((await window.mms.deaths.list({pageSize:100000})).rows||[]),columns:["death_number","deceased_name","gender","date_of_death","burial_date","burial_place"],dateKeys:["date_of_death","burial_date","created_at"]},
 {id:"welfare",title:"Welfare Report",titleMl:"ക്ഷേമസഹായ റിപ്പോർട്ട്",description:"Welfare requests and assistance status.",descMl:"ക്ഷേമസഹായ അപേക്ഷകളും സഹായ സ്ഥിതിയും.",tint:"t-orange",icon:ShieldCheck,fetch:async()=>((await window.mms.welfare.list({pageSize:100000})).rows||[]),dateKeys:["request_date","created_at"]},
 {id:"certificates",title:"Certificate Log",titleMl:"സർട്ടിഫിക്കറ്റ് രേഖ",description:"Issued certificates and dates.",descMl:"നൽകിയ സർട്ടിഫിക്കറ്റുകളും തീയതികളും.",tint:"t-blue",icon:ScrollText,fetch:async()=>((await window.mms.certificates.list({pageSize:100000})).rows||[]),columns:["certificate_number","type","issued_to","issued_date","issued_by"],dateKeys:["issued_date","created_at"]},
 {id:"audit",title:"Audit Log",titleMl:"ഓഡിറ്റ് ലോഗ്",description:"User actions across modules.",descMl:"എല്ലാ മൊഡ്യൂളുകളിലെയും ഉപയോക്തൃ പ്രവർത്തനങ്ങൾ.",tint:"t-rose",icon:ShieldCheck,fetch:async()=>((await window.mms.audit.list({pageSize:100000})).rows||[]),columns:["created_at","username","action","module","description"],dateKeys:["created_at"]},
];

// Strip XML-illegal control chars (keep tab/LF/CR) so pasted data can never corrupt the sheet.
const esc=(v:any)=>String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
const escapeCsv=(v:any)=>{const s=String(v??"");return /[,\n\"]/.test(s)?`"${s.replace(/\"/g,'\"\"')}"`:s;};
const cols=(rows:any[],preferred?:string[])=>{const present=preferred?.filter(k=>Object.prototype.hasOwnProperty.call(rows[0]||{},k))||[];return present.length?present:Object.keys(rows[0]||{});};
const csv=(rows:any[],c:string[],r?:ReportType,ml=false)=>[c.map(k=>escapeCsv(colLabel(r as ReportType,k,ml))).join(","),...rows.map(row=>c.map(k=>escapeCsv(mlVal(istCell(row[k])))).join(","))].join("\n");
/* Malayalam column headers for exports and PDFs (user report: "in ml language
   also page and generated pdf are english only"). Keys missing from this map
   fall back to the English label, so dynamic DB columns stay readable. */
const ML_COL:Record<string,string>={family_number:"കുടുംബ നമ്പർ",house_name:"വീട്ടുപേര്",house_number:"വീട്ട് നമ്പർ",ward:"വാർഡ്",area:"പ്രദേശം",phone:"ഫോൺ",status:"സ്ഥിതി",member_count:"അംഗങ്ങളുടെ എണ്ണം",member_code:"അംഗ കോഡ്",name:"പേര്",family_house_name:"വീട്ടുപേര്",family_area:"പ്രദേശം",gender:"ലിംഗം",age:"പ്രായം",blood_group:"രക്തഗ്രൂപ്പ്",mobile:"മൊബൈൽ",email:"ഇമെയിൽ",amount:"തുക",amount_paid:"അടച്ച തുക",payment_date:"പണമടച്ച തീയതി",receipt_number:"രസീത് നമ്പർ",payment_method:"പണമടച്ച രീതി",date:"തീയതി",txn_date:"തീയതി",type:"തരം",description:"വിവരണം",category:"വിഭാഗം",marriage_number:"രജിസ്റ്റർ നമ്പർ",nikah_date:"നികാഹ് തീയതി",bride_name:"വധൂവിന്റെ പേര്",groom_name:"വരന്റെ പേര്",place:"സ്ഥലം",mahar:"മഹർ",death_number:"രജിസ്റ്റർ നമ്പർ",deceased_name:"മരണപ്പെട്ട വ്യക്തിയുടെ പേര്",date_of_death:"മരണ തീയതി",burial_date:"കബറടക്ക തീയതി",burial_place:"കബറടക്ക സ്ഥലം",donation_date:"സംഭാവന തീയതി",donor_name:"ദാതാവിന്റെ പേര്",purpose:"ഉദ്ദേശ്യം",certificate_number:"സർട്ടിഫിക്കറ്റ് നമ്പർ",issued_to:"ലഭിച്ച വ്യക്തി",issued_date:"നൽകിയ തീയതി",issued_by:"നൽകിയത്",created_at:"രേഖപ്പെടുത്തിയ തീയതി",username:"ഉപയോക്തൃനാമം",action:"പ്രവർത്തി",module:"മോഡ്യൂൾ",request_date:"അപേക്ഷ തീയതി",period_start:"കാലയളവ് ആരംഭം",notes:"കുറിപ്പുകൾ"};
/* Cell VALUES the office reads in reports (gender, status, payment methods,
   ledger entry types) — mapped only when the app runs in Malayalam. */
const ML_VAL:Record<string,string>={Male:"പുരുഷൻ",Female:"സ്ത്രീ",Active:"സജീവം",Inactive:"നിഷ്ക്രിയം",Cash:"പണം","Bank Transfer":"ബാങ്ക് ട്രാൻസ്ഫർ",Cheque:"ചെക്ക്",Card:"കാർഡ്",Income:"വരവ്",Expense:"ചെലവ്"};
const deriveLabel=(k:string)=>k.replace(/_/g," ").replace(/\b[a-z]/g,(m)=>m.toUpperCase());
const colLabel=(r:ReportType,k:string,ml=false)=>ml?(ML_COL[k]||r.labels?.[k]||deriveLabel(k)):(r.labels?.[k]||deriveLabel(k));
/* String-only mapping: numbers must pass through untouched so Excel numeric
   cells stay numeric. */
const mlVal=(v:any)=>typeof v==="string"&&Object.prototype.hasOwnProperty.call(ML_VAL,v)?ML_VAL[v]:v;
const rowDate=(row:any,keys:string[])=>{for(const k of keys){if(row?.[k]){const d=new Date(row[k]);if(!Number.isNaN(d.getTime()))return d;}}return null;};
/* SQLite `datetime('now')` stamps are stored in UTC — exports must show the
   Indian time the office actually works with (same rule as formatDateTime()
   on screen; user report: "audit log pdf time is not indian time"). Values
   without a time part (business dates, amounts, text) pass through untouched,
   so Excel numeric cells stay numeric. */
const istCell=(v:any)=>{const s=String(v??"");return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)?formatDateTime(s):v;};
/* Printed PDFs show calendar dates as dd-mm-yyyy — the app-wide print
   convention used by every other template (receipts, registers, audit pack). */
const pdfCell=(v:any)=>{const s=String(v??"");return /^\d{4}-\d{2}-\d{2}$/.test(s)?formatDate(s):istCell(v);};

/* PDF columns sized by their content (same heuristic as the Excel export):
   short columns (Action, Module, Amount) shrink to what they hold and long
   ones (Description) get the space, instead of the old equal-width fixed
   layout that wasted half the sheet on narrow data. Widths are percentages
   of the table, clamped so nothing becomes unreadable. */
function pdfColgroup(rows:any[],c:string[],rpt:ReportType,ml=false):string{
  const lens=c.map(k=>{
    let max=colLabel(rpt,k,ml).length;
    for(let i=0;i<rows.length&&i<400;i++){const len=String(pdfCell(rows[i]?.[k])??"").length;if(len>max)max=len;}
    return Math.min(50,Math.max(8,max));
  });
  const tot=lens.reduce((a,b)=>a+b,0)||1;
  const pct=lens.map(w=>+(w/tot*100).toFixed(2));
  pct[pct.length-1]=+(100-pct.slice(0,-1).reduce((a,b)=>a+b,0)).toFixed(2);
  return `<colgroup>${pct.map(p=>`<col style="width:${p}%">`).join("")}</colgroup>`;
}
/* XLSX writing (crc32/zip/xmlCell/buildXlsx) lives in @/lib/reportXlsx —
   with an Excel-strict stylesheet: the old inline writer's styles.xml lacked
   the "Normal" cell style + gray125 fill that Microsoft Excel hard-requires,
   so the donation report opened as "corrupt" in Excel (LibreOffice tolerated
   it). Data values are pre-transformed (istCell/mlVal) by the caller. */

export function Reports(){
 const {t,lang}=useI18n(); const ml=lang==="ml";
 // Warn when a Chromium download (CSV/Excel/PDF from this page) fails or is interrupted.
 useEffect(()=>{ const off=window.mms.events.onDownloadFailed((name)=>toast.error(name?`${name} — ${ml?"ഡൗൺലോഡ് പരാജയപ്പെട്ടു അല്ലെങ്കിൽ തടസ്സപ്പെട്ടു":"download failed or was interrupted"}`:(ml?"ഡൗൺലോഡ് പരാജയപ്പെട്ടു അല്ലെങ്കിൽ തടസ്സപ്പെട്ടു":"Download failed or was interrupted"))); return ()=>off?.(); },[ml]);
 const [range,setRange]=useState<"all"|"thisMonth"|"lastMonth"|"custom">("all"); const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [busy,setBusy]=useState<string|null>(null); const [busyFmt,setBusyFmt]=useState<string|null>(null);
 // Annual audit pack (financial year Apr 1 → Mar 31).
 const fyStartYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
 const [auditYear,setAuditYear]=useState(String(fyStartYear)); const [auditBusy,setAuditBusy]=useState(false);
 const exportAuditPack=async()=>{const y=Number(auditYear);if(!y||y<2000||y>2100){toast.error(ml?"ശരിയായ വർഷം നൽകുക":"Enter a valid year");return;}setAuditBusy(true);try{const r:any=await window.mms.accounting.exportAuditPack(y);if(r?.success)toast.success(`${ml?"വാർഷിക ഓഡിറ്റ് രേഖകൾ തയ്യാറാക്കി":"Audit pack exported"} — ${y}-${String((y+1)%100).padStart(2,"0")}`);else if(!r?.cancelled)toast.error(r?.error||ml?"എക്സ്പോർട്ട് പരാജയപ്പെട്ടു":"Export failed");}catch(e:any){toast.error(e.message);}finally{setAuditBusy(false);}};
 const bounds=()=>{const now=new Date();if(range==="all")return [null,null] as const;if(range==="custom")return [from?new Date(`${from}T00:00:00`):null,to?new Date(`${to}T23:59:59`):null] as const;const y=now.getFullYear(),m=now.getMonth();return range==="thisMonth"?[new Date(y,m,1),new Date(y,m+1,0,23,59,59)] as const:[new Date(y,m-1,1),new Date(y,m,0,23,59,59)] as const;};
 const filtered=(rows:any[],r:ReportType)=>{const [a,b]=bounds();if(!a&&!b)return rows;return rows.filter(x=>{const d=rowDate(x,r.dateKeys);return d?(!a||d>=a)&&(!b||d<=b):false;});};
 const toBlobBuffer=(bytes:Uint8Array):ArrayBuffer=>{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer;};
 const triggerDownload=(bytes:Uint8Array,mime:string,name:string)=>{const url=URL.createObjectURL(new Blob([toBlobBuffer(bytes)],{type:mime}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const exportReport=async(r:ReportType,f:"csv"|"excel"|"pdf")=>{setBusy(r.id);setBusyFmt(f);try{const raw=await r.fetch();let rows=filtered(raw,r);if(!rows.length){toast.warning(`${t("rpt_no_records")} "${ml?r.titleMl:r.title}"`);return;}if(ml&&r.id==="accounting")rows=rows.map((x:any)=>({...x,type:x.type==="SUMMARY"?"ആകെത്തുക":x.type,description:({"TOTAL INCOME":"ആകെ വരവ്","TOTAL EXPENSE":"ആകെ ചെലവ്","NET BALANCE":"ശേഷിക്കുന്ന ബാലൻസ്"} as Record<string,string>)[x.description]||x.description}));const c=cols(rows,r.columns);const stamp=todayIST();const name=`${r.id}_${range}_${stamp}`;const rptTitle=ml?r.titleMl:r.title;if(f==="csv")triggerDownload(new TextEncoder().encode("\ufeff"+csv(rows,c,r,ml)),"text/csv;charset=utf-8",`${name}.csv`);else if(f==="excel")triggerDownload(buildXlsx(rows.map(x=>Object.fromEntries(c.map(k=>[k,mlVal(istCell(x[k]))]))),c,(k)=>colLabel(r as ReportType,k,ml)),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",`${name}.xlsx`);else{const anekCss=await getAnekFontCss();const capHeader=(k:string)=>esc(colLabel(r,k,ml));const pdfV=(v:any)=>{const s=pdfCell(v);return ml?(ML_VAL[s]||s):s;};const html=`<!doctype html><html><head><meta charset="utf-8"><style>${anekCss}@page{size:A4 landscape;margin:10mm}body{font:11px Poppins,"Anek Malayalam Variable",Arial,sans-serif;color:#1e2b25}h1{font-size:18px;margin:0 0 6px}p{margin:0 0 12px;color:#5f7268}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:5px;border:1px solid #dfe8e1;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}th{background:#f6f9f6}</style></head><body><h1>${esc(rptTitle)}</h1><p>Minz Mahallu Management System · ${rows.length} ${ml?"രേഖകൾ":"records"} · ${labels[range]}</p><table>${pdfColgroup(rows,c,r,ml)}<tr>${c.map(k=>`<th>${capHeader(k)}</th>`).join("")}</tr>${rows.map(x=>`<tr>${c.map(k=>`<td>${esc(pdfV(x[k]))}</td>`).join("")}</tr>`).join("")}</table></body></html>`;const result=await window.mms.pdf.generate(html,`${name}.pdf`);if(result?.success===false&&!result?.cancelled)throw new Error(result.error||t("rpt_pdf_failed"));}toast.success(`${rptTitle}: ${rows.length} ${f.toUpperCase()}`);}catch(e:any){toast.error(e.message||t("ui_failed_save"));}finally{setBusy(null);setBusyFmt(null);}};
 const labels=ml?{all:"എല്ലാ തീയതികളും",thisMonth:"ഈ മാസം",lastMonth:"കഴിഞ്ഞ മാസം",custom:"തീയതി പരിധി"}:{all:"All time",thisMonth:"This month",lastMonth:"Last month",custom:"Custom dates"};
 return <div className="view view-enter"><div className="vhead"><div className="modic t-em"><BarChart3 size={20}/></div><div><h1>{t("rpt_title")}</h1><div className="vs">{t("rpt_subtitle")}</div></div></div>
 <div className="card card-pad-4 mb-4"><div className="flex items-center gap-3 flex-wrap"><div className="flex items-center gap-2 report-range-title"><CalendarRange size={18}/><b>{ml?"റിപ്പോർട്ട് തീയതി":"Report date"}</b></div><div className="report-range-field"><Select value={range} onChange={e=>setRange(e.target.value as any)} className="w-44">{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></div>{range==="custom"&&<><div className="report-range-field"><label className="lbl">{ml?"മുതൽ":"From"}</label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div className="report-range-field"><label className="lbl">{ml?"വരെ":"To"}</label><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div></>}</div></div>
 <div className="card card-pad-4 mt-4"><div className="flex items-center gap-3 flex-wrap"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary"/><b>{ml?"വാർഷിക ഓഡിറ്റ് രേഖകൾ":"Annual Audit Pack"}</b></div><Input type="number" className="w-28" value={auditYear} onChange={e=>setAuditYear(e.target.value)} min={2000} max={2100} title={ml?"സാമ്പത്തിക വർഷം (ഏപ്രിൽ–മാർച്ച്)":"Financial year (Apr–Mar)"}/><span className="text-xs text-muted">{ml?"(ഏപ്രിൽ 1 – മാർച്ച് 31)":"(Apr 1 – Mar 31)"}</span><Button onClick={exportAuditPack} disabled={auditBusy}>{auditBusy?<Loader2 size={14} className="animate-spin"/>:<FileText size={14}/>}{ml?"PDF എക്സ്പോർട്ട്":"Export PDF"}</Button><span className="text-xs text-muted">{ml?"വഖഫ് ബോർഡ് / ഓഡിറ്റർ ഫോർമാറ്റ് — രസീതുകളും പണമടവുകളും, വരവ്-ചെലവ്, 7% സംഭാവന, വൗച്ചർ രജിസ്റ്റർ, 65B സർട്ടിഫിക്കറ്റ്":"Waqf Board / auditor format — Receipts & Payments, Income & Expenditure, 7% contribution, voucher register, 65B certificate"}</span></div></div>
 <div className="rep-sec"><b>{t("rpt_catalogue")}</b></div><div className="rep-grid">{REPORTS.map(r=>{const Icon=r.icon;const loading=busy===r.id;return <div key={r.id} className={`rep-card ${r.tint}`}><div className="ric"><Icon size={20}/></div><div className="rtitle">{ml?r.titleMl:r.title}</div><div className="rdesc">{ml?r.descMl:r.description}</div><div className="rexps"><button className="btn bs bg" onClick={()=>exportReport(r,"csv")} disabled={loading}>{loading&&busyFmt==="csv"?<Loader2 size={12} className="animate-spin"/>:<Download size={12}/>}CSV</button><button className="btn bs bg" onClick={()=>exportReport(r,"excel")} disabled={loading}>{loading&&busyFmt==="excel"?<Loader2 size={12} className="animate-spin"/>:<FileSpreadsheet size={12}/>}Excel</button><button className="btn bs bp" onClick={()=>exportReport(r,"pdf")} disabled={loading}>{loading&&busyFmt==="pdf"?<Loader2 size={12} className="animate-spin"/>:<FileText size={12}/>}PDF</button></div></div>})}</div></div>;
}