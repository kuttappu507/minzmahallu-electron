/* ============================================================================
 * Business handlers — the Android replacement for electron/main.ts.
 *
 * Every `ipcMain.handle("channel", …)` in the desktop build becomes a
 * `register("channel", …)` here. The bodies are the desktop bodies: same
 * services, same validation, same audit calls, same return shapes, because the
 * renderer's call sites are unchanged. What had to change is only what talked
 * to the host:
 *
 *   · dialog.showSaveDialog → the platform share sheet (Android has no modal
 *     file dialogs; files leave through the share sheet or a download),
 *   · BrowserWindow.printToPDF → ./pdf.ts (jsPDF, same page sizes),
 *   · app.getPath("userData") → the platform file store,
 *   · app.relaunch() after a restore → an in-place database reopen,
 *   · the monthly GitHub update check → dropped (Play Store / APK updates),
 *   · the NSIS uninstall gate → dropped (Android settings uninstall the app).
 * ========================================================================== */
import * as data from "../core/services/data.service.js";
import { currentActorContext } from "../core/services/auth.service.js";
import { getDB } from "../core/db/connection.js";
import { platform } from "../core/platform/index.js";
import { getAnekMalayalamCss, getPreviewScreenCss } from "../core/print/utils.js";
import { renderHtmlToPdf } from "../core/print/pdf-renderer.js";
import { buildTokenSheetHtml } from "../core/print/token.template.js";
import { buildCollectionSheetHtml } from "../core/print/collection-sheet.template.js";
import { buildCertificateHtml } from "../core/print/certificate.template.js";
import { buildAccountStatementHtml } from "../core/print/account-statement.template.js";
import { buildAuditPackHtml } from "../core/print/audit-pack.template.js";
import { buildRegisterBookHtml } from "../core/print/register-book.template.js";
import { todayIST } from "../core/services/data.service.js";
import { istDateTimeDm } from "../core/services/ist-date.js";
import { createBackup, listBackups, verifyBackup, extractVerifiedBackup, mirrorBackup, backupFileName, BACKUP_FOLDER, MIRROR_FOLDER, shareBackup, deleteBackup } from "../core/services/backup.service.js";
import { toBase64 } from "../core/platform/crypto.js";
import type { Actor } from "../core/services/security.service.js";
import type { IpcRegistrar } from "./registry.js";
import { register } from "./registry.js";

type SessionProvider = () => Actor | null;

/** Active UI language — the desktop asked the renderer via executeJavaScript;
 *  on Android the language is the one stored in Settings (same value). */
function uiLang(): "en" | "ml" {
  try {
    const row = getDB().prepare("SELECT language FROM settings WHERE id = 1").get() as { language?: string } | undefined;
    return row?.language === "ml" ? "ml" : "en";
  } catch {
    return "en";
  }
}

async function sharePdf(fileName: string, bytes: Uint8Array, title: string) {
  const host = await platform();
  const result = await host.share.saveFile({ name: fileName, mime: "application/pdf", data: bytes, title });
  if (!result.saved) return { success: false, cancelled: !!result.cancelled, error: result.error };
  return { success: true, path: result.path };
}

export interface BusinessHandlerOptions {
  registrar?: IpcRegistrar;
  getSession: SessionProvider;
}

export function registerBusinessHandlers(options: BusinessHandlerOptions): void {
  const register_ = options.registrar ?? register;
  const session = () => ({ get user() { return options.getSession(); } });
  const requireAuth = () => {
    const user = options.getSession();
    if (!user) throw new Error("Authentication is required");
    return user;
  };

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  register_("auth:login", async (username: string, password: string) => {
    const { login } = await import("../core/services/auth.service.js");
    try {
      const user = await login(username, password);
      try { data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, "User logged in", ""); } catch { /* audit best-effort */ }
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  register_("auth:logout", () => {
    const user = session().user;
    if (user) {
      try { data.audit.log(user.id, user.username, "LOGOUT", "auth", user.id, "User logged out", ""); } catch { /* ignore */ }
    }
    (globalThis as any).__mmsClearActor?.();
    return { success: true };
  });
  register_("auth:currentUser", () => {
    const actor = currentActorContext();
    return actor ? { id: actor.id, username: actor.username, role: actor.role } : null;
  });

  // -------------------------------------------------------------------------
  // Modules (read paths; writes to sensitive records are re-registered by
  // security-ipc.ts, which is loaded after this file — exactly the desktop
  // ordering, where the secured handler replaced the permissive one.)
  // -------------------------------------------------------------------------
  register_("families:list", (_filter: any) => data.families.list(_filter || {}));
  register_("families:get", (_e: any, id: number) => data.families.get(id));
  register_("members:list", (_filter: any) => data.members.list(_filter || {}));
  register_("members:get", (_e: any, id: number) => data.members.get(id));
  register_("members:relationships", () => data.members.relationships());
  register_("subscriptions:list", (filter: any) => data.subscriptions.list(filter || {}));
  register_("subscriptions:get", (_e: any, id: number) => data.subscriptions.get(id));
  register_("subscriptions:plans", () => data.subscriptions.plans());
  register_("subscriptions:ensureCurrentMonth", () => data.subscriptions.ensureCurrentMonth());
  register_("subscriptions:totalCollected", () => data.subscriptions.totalCollected());
  register_("subscriptions:totalPending", () => data.subscriptions.totalPending());
  register_("donations:list", (filter: any) => data.donations.list(filter || {}));
  register_("donations:get", (_e: any, id: number) => data.donations.get(id));
  register_("donations:categories", () => data.donations.categories());
  register_("donations:categoriesAll", () => data.donations.categoriesAll());
  register_("donations:memberBalance", (familyId: number, memberId?: number) => data.donations.memberBalance(familyId, memberId));
  register_("donations:totalThisMonth", () => data.donations.totalThisMonth());
  register_("accounting:list", (filter: any) => data.accounting.list(filter || {}));
  register_("accounting:get", (_e: any, id: number) => data.accounting.get(id));
  register_("accounting:totalIncome", () => data.accounting.totalIncome());
  register_("accounting:totalExpense", () => data.accounting.totalExpense());
  register_("accounting:balance", () => data.accounting.balance());
  register_("accounting:receiptSequence", () => data.accounting.receiptSequence());
  register_("accounting:unifiedList", (filter: any) => data.accounting.unifiedList(filter || {}));
  register_("accounting:unifiedSummary", (filter: any) => data.accounting.unifiedSummary(filter || {}));
  register_("accounting:detail", (source: string, id: number) => data.accounting.unifiedDetail(String(source || ""), Number(id)));
  register_("marriages:list", (filter: any) => data.marriages.list(filter || {}));
  register_("marriages:get", (_e: any, id: number) => data.marriages.get(id));
  register_("deaths:list", (filter: any) => data.deaths.list(filter || {}));
  register_("deaths:get", (_e: any, id: number) => data.deaths.get(id));
  register_("welfare:list", (filter: any) => data.welfare.list(filter || {}));
  register_("welfare:get", (_e: any, id: number) => data.welfare.get(id));
  register_("welfare:categories", () => data.welfare.categories());
  register_("certificates:list", (filter: any) => data.certificates.list(filter || {}));
  register_("certificates:verify", (code: string) => data.certificates.verify(code));
  register_("certificates:verifyQr", (payload: string) => data.certificates.verifyQr(payload));
  register_("staff:list", (filter: any) => data.staff.list(filter || {}));
  register_("staff:get", (_e: any, id: number) => data.staff.get(id));
  register_("staff:roles", () => data.staff.roles());
  register_("staff:history", (_e: any, id: number) => data.staff.history(id));
  register_("staff:listPayments", (filter: any) => data.staff.listPayments(filter || {}));
  register_("staff:salarySummary", (_e: any, year?: number) => data.staff.salarySummary(year));
  register_("committee:list", (filter: any) => data.committee.list(filter || {}));
  register_("committee:get", (_e: any, id: number) => data.committee.get(id));
  register_("committee:positions", () => data.committee.positions());
  register_("committee:types", () => data.committee.types());
  register_("committee:summary", () => data.committee.summary());
  register_("committee:history", (_e: any, id: number) => data.committee.history(id));
  register_("audit:list", (filter: any) => data.audit.list(filter || {}));
  register_("audit:verify", () => data.audit.verify());
  register_("settings:load", () => data.settings.load());
  register_("settings:save", (payload: any) => data.settings.save(payload));
  register_("dashboard:summary", () => data.dashboard.summary());
  register_("dashboard:incomeThisMonth", () => data.dashboard.incomeThisMonth());
  register_("dashboard:expenseThisMonth", () => data.dashboard.expenseThisMonth());
  register_("dashboard:balance", () => data.dashboard.balance());
  register_("dashboard:monthlyCollections", (months?: number) => data.dashboard.monthlyCollections(months || 6));
  register_("dashboard:monthlyDonations", (months?: number) => data.dashboard.monthlyDonations(months || 6));
  register_("dashboard:incomeVsExpense", (months?: number) => data.dashboard.incomeVsExpense(months || 6));
  register_("dashboard:recentActivity", (limit?: number) => data.dashboard.recentActivity(limit || 10));
  register_("dashboard:alerts", () => data.dashboard.alerts());

  /** Today-at-a-glance + real backup status (schedule + last backup file). */
  register_("dashboard:todayAtGlance", async () => {
    requireAuth();
    const glance = data.dashboard.todayAtGlance();
    let backupEnabled = false;
    let nextBackup: string | null = null;
    let lastBackup: string | null = null;
    try {
      const settings = data.settings.load();
      backupEnabled = !!settings?.auto_backup;
      lastBackup = (await listBackups())[0]?.time ?? null;
      if (backupEnabled) {
        const intervalHours = Number(settings.backup_interval_hours || 24);
        if (intervalHours > 0) {
          const last = lastBackup ? new Date(lastBackup).getTime() : Date.now();
          nextBackup = new Date(last + intervalHours * 3600 * 1000).toISOString();
        }
      }
    } catch (err) {
      console.warn("[dashboard:todayAtGlance] backup info failed:", err);
    }
    return { ...glance, backupEnabled, nextBackup, lastBackup };
  });

  // -------------------------------------------------------------------------
  // App information (Settings → About)
  // -------------------------------------------------------------------------
  register_("app:info", async () => {
    const host = await platform();
    const info = await host.device.info();
    return {
      version: info.appVersion,
      appId: info.appId,
      platform: "android",
      device: info.model,
      osVersion: info.osVersion,
      dataDir: "app storage",
      host: host.kind,
    };
  });

  // -------------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------------
  register_("tokens:listEvents", () => data.tokens.listEvents());
  register_("tokens:getEvent", (_e: any, id: number) => data.tokens.getEvent(id));
  register_("tokens:createEvent", (_e: any, payload: any) => data.tokens.createEvent(payload));
  register_("tokens:updateEvent", (_e: any, id: number, payload: any) => data.tokens.updateEvent(id, payload));
  register_("tokens:removeEvent", () => {
    // Fail-closed: the secured layer (security-ipc.ts) registers the real,
    // date-guarded deletion flow after this file. If it were ever skipped,
    // this handler refuses instead of performing an unguarded hard delete.
    throw new Error("Token events can only be deleted through the secured layer");
  });
  register_("tokens:list", (filter: any) => data.tokens.list(filter || {}));
  register_("tokens:checkExisting", (_e: any, eventId: number) => Array.from(data.tokens.checkExisting(eventId)));
  register_("tokens:generate", (_e: any, eventId: number, familyIds: number[]) => data.tokens.generate(eventId, familyIds, options.getSession()?.id ?? 1));
  register_("tokens:collect", (_e: any, tokenId: number) => data.tokens.collect(tokenId, options.getSession()?.id ?? 1));
  register_("tokens:cancel", (_e: any, tokenId: number, reason: string) => data.tokens.cancel(tokenId, reason));
  register_("tokens:replace", (_e: any, tokenId: number, reason: string) => data.tokens.replace(tokenId, reason, options.getSession()?.id ?? 1));
  register_("tokens:stats", (_e: any, eventId: number) => data.tokens.stats(eventId));
  register_("tokens:listForPdf", (_e: any, eventId: number) => {
    requireAuth();
    return data.tokens.listForPdf(eventId);
  });
  register_("tokens:generateTokenPdf", async (_e: any, eventId: number) => {
    requireAuth();
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList?.length) return { success: false, error: "No tokens found for this event" };
      const event = data.tokens.getEvent(eventId);
      const html = buildTokenSheetHtml(tokenList, event);
      const bytes = await renderHtmlToPdf(html);
      const name = `tokens-${String((event as any)?.event_name || eventId).replace(/\s+/g, "-")}.pdf`;
      const shared = await sharePdf(name, bytes, "Save Token Sheet PDF");
      return shared.success ? { ...shared, count: tokenList.length } : shared;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  register_("tokens:generateCollectionSheet", async (_e: any, eventId: number) => {
    requireAuth();
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList?.length) return { success: false, error: "No tokens found for this event" };
      const event = data.tokens.getEvent(eventId);
      const html = buildCollectionSheetHtml(tokenList, event);
      const bytes = await renderHtmlToPdf(html);
      const name = `collection-sheet-${String((event as any)?.event_name || eventId).replace(/\s+/g, "-")}.pdf`;
      const shared = await sharePdf(name, bytes, "Save Collection Sheet PDF");
      return shared.success ? { ...shared, count: tokenList.length } : shared;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // -------------------------------------------------------------------------
  // Print / PDF
  // -------------------------------------------------------------------------
  register_("pdf:getAnekFontCss", () => {
    requireAuth();
    return getAnekMalayalamCss();
  });

  /** Generic HTML → PDF (used by Reports and the token print page). */
  register_("pdf:generate", async (html: string, defaultName: string) => {
    requireAuth();
    try {
      const bytes = await renderHtmlToPdf(html);
      return sharePdf(defaultName || "document.pdf", bytes, "Save PDF");
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  const printRegisterPdf = async (type: "marriage" | "death") => {
    requireAuth();
    try {
      const settings = data.settings.load();
      const regData = {
        type,
        mahalluName: settings?.mahallu_name || "Minz Mahallu",
        generatedAt: new Date().toISOString(),
        rows: type === "marriage" ? data.marriages.registerRows() : data.deaths.registerRows(),
      };
      const html = buildRegisterBookHtml(regData, uiLang());
      const bytes = await renderHtmlToPdf(html);
      const name = type === "marriage" ? "marriage-register.pdf" : "death-register.pdf";
      const shared = await sharePdf(name, bytes, "Save Register PDF");
      return shared.success ? { ...shared, count: regData.rows.length } : shared;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };
  register_("marriages:registerPdf", () => printRegisterPdf("marriage"));
  register_("deaths:registerPdf", () => printRegisterPdf("death"));

  // -------------------------------------------------------------------------
  // Certificates (PDF + preview)
  // -------------------------------------------------------------------------
  const findCertificate = (certId: number) => {
    const list = data.certificates.list({});
    return (list?.rows || []).find((row: any) => row.id === certId);
  };
  register_("certificates:generatePdf", async (certId: number) => {
    requireAuth();
    try {
      const cert = findCertificate(certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const lang = uiLang();
      // Anti-forgery: the NEXT print is a reprint, so it carries a bottom-left
      // "Reprinted on <date time>" note even before the count is persisted
      // (the count only increments if the PDF is actually shared).
      const expectedReprint = ((cert as any).reprint_count || 0) + 1;
      data.certificates.ensureVerificationCode(cert);
      const html = buildCertificateHtml(cert, lang, expectedReprint, istDateTimeDm(new Date()));
      const bytes = await renderHtmlToPdf(html);
      const shared = await sharePdf(`certificate-${(cert as any).certificate_number || certId}.pdf`, bytes, "Save Certificate PDF");
      if (shared.success) {
        try { data.certificates.markReprint(certId); } catch (err) { console.warn("[certificates] reprint count not updated:", err); }
      }
      return shared.success ? { ...shared, reprint: expectedReprint > 1 } : shared;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  register_("certificates:previewHtml", async (certId: number) => {
    requireAuth();
    try {
      const cert = findCertificate(certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      data.certificates.ensureVerificationCode(cert);
      const html = buildCertificateHtml(cert, uiLang(), 0, undefined, getPreviewScreenCss());
      return { success: true, html };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // -------------------------------------------------------------------------
  // Accounting exports (PDF / Excel / annual audit pack)
  // -------------------------------------------------------------------------
  register_("accounting:exportPdf", async (filter: any) => {
    requireAuth();
    try {
      const allFilter = { ...filter, page: undefined, pageSize: undefined };
      const [listResult, summary] = await Promise.all([
        data.accounting.unifiedList(allFilter),
        data.accounting.unifiedSummary(allFilter),
      ]);
      const html = buildAccountStatementHtml(listResult.rows || [], summary, allFilter);
      const periodLabel = filter?.period || "all";
      const bytes = await renderHtmlToPdf(html);
      const shared = await sharePdf(`account-statement-${periodLabel}-${todayIST()}.pdf`, bytes, "Save Account Statement PDF");
      return shared.success ? { ...shared, count: listResult.rows?.length || 0 } : shared;
    } catch (err: any) {
      return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message };
    }
  });

  register_("accounting:exportExcel", async (filter: any) => {
    requireAuth();
    try {
      const allFilter = { ...filter, page: undefined, pageSize: undefined };
      const [listResult, summary] = await Promise.all([
        data.accounting.unifiedList(allFilter),
        data.accounting.unifiedSummary(allFilter),
      ]);
      const rows = listResult.rows || [];
      const periodLabel = filter?.period || "all";
      const ledgerData = rows.map((row: any) => ({
        Date: row.ledger_date || "",
        Source: row.source || "",
        Type: row.type || "",
        Description: row.description || "",
        Category: row.category || "",
        "Receipt No": row.receipt_number || "",
        "Voucher No": row.voucher_no || "",
        "Bill No": row.bill_no || "",
        Payee: row.payee || "",
        "Payment Method": row.payment_method || "",
        "Transaction Ref": row.transaction_ref || "",
        Status: row.status === "Void" ? "VOID" : row.status || "Posted",
        "Void Reason": row.void_reason || "",
        Amount: Number(row.amount || 0),
      }));
      const summaryData = [
        { Metric: "Total Income", Value: summary.totalIncome },
        { Metric: "Total Expense", Value: summary.totalExpense },
        { Metric: "Balance", Value: summary.balance },
        { Metric: "Entry Count", Value: summary.entryCount },
        { Metric: "", Value: "" },
        { Metric: "Income — Donations", Value: summary.incomeDonations },
        { Metric: "Income — Subscriptions", Value: summary.incomeSubscriptions },
        { Metric: "Income — Manual", Value: summary.incomeManual },
        { Metric: "", Value: "" },
        { Metric: "Expense — Welfare", Value: summary.expenseWelfare },
        { Metric: "Expense — Salary", Value: summary.expenseSalary },
        { Metric: "Expense — Manual", Value: summary.expenseManual },
      ];
      // ExcelJS is heavy — loaded on demand so the app shell stays small.
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const fitWidth = (dict: any[], key: string) => {
        let max = String(key ?? "").length;
        for (let i = 0; i < dict.length && i < 400; i++) {
          const length = String(dict[i]?.[key] ?? "").length;
          if (length > max) max = length;
        }
        return Math.min(60, Math.max(11, Math.ceil(max * 1.15) + 3));
      };
      const LEDGER_HEADERS = ["Date", "Source", "Type", "Description", "Category", "Receipt No", "Voucher No", "Bill No", "Payee", "Payment Method", "Transaction Ref", "Status", "Void Reason", "Amount"];
      const sheet1 = workbook.addWorksheet("Ledger");
      sheet1.columns = LEDGER_HEADERS.map((header) => ({ header, key: header, width: fitWidth(ledgerData, header) }));
      sheet1.addRows(ledgerData);
      sheet1.getRow(1).font = { bold: true };
      sheet1.views = [{ state: "frozen", ySplit: 1 }];
      const sheet2 = workbook.addWorksheet("Summary");
      sheet2.columns = ["Metric", "Value"].map((header) => ({ header, key: header, width: fitWidth(summaryData, header) }));
      sheet2.addRows(summaryData);
      sheet2.getRow(1).font = { bold: true };
      sheet2.views = [{ state: "frozen", ySplit: 1 }];
      const buffer = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
      const host = await platform();
      const name = `account-statement-${periodLabel}-${todayIST()}.xlsx`;
      const saved = await host.share.saveFile({
        name,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: buffer,
        title: "Save Account Statement Excel",
      });
      return saved.saved ? { success: true, path: saved.path, size: buffer.length, count: rows.length } : { success: false, cancelled: !!saved.cancelled, error: saved.error };
    } catch (err: any) {
      return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message };
    }
  });

  /** Annual audit pack (Waqf Board / society auditor format) — a PDF. */
  register_("accounting:exportAuditPack", async (fyYear: number) => {
    requireAuth();
    try {
      const pack = data.accounting.auditPack(fyYear);
      const currency = String((data.settings.load() as any)?.currency_symbol || "\u20B9");
      const html = buildAuditPackHtml(pack, uiLang(), currency);
      const bytes = await renderHtmlToPdf(html);
      const name = `audit-pack-${fyYear}-${String(fyYear + 1).slice(2)}.pdf`;
      const shared = await sharePdf(name, bytes, "Save Annual Audit Pack");
      return shared.success
        ? { ...shared, receipts: (pack as any).totalReceipts, payments: (pack as any).totalPayments, count: (pack as any).transactions?.length || 0 }
        : shared;
    } catch (err: any) {
      return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message };
    }
  });

  // -------------------------------------------------------------------------
  // Backups — created inside the app's documents folder, then shared out
  // (WhatsApp / Drive / another phone) with one tap, which is what actually
  // keeps a mahallu's data safe on a mobile device.
  // -------------------------------------------------------------------------
  register_("backup:create", async (requestedName?: string) => {
    const user = options.getSession();
    if (!user) return { success: false, error: "Authentication required" };
    // A backup is a full copy of the database (every money record) — only
    // administrators may export it.
    if (user.role !== "Administrator") return { success: false, error: "Administrator permission is required" };
    try {
      const meta = await createBackup(requestedName || backupFileName());
      try {
        const settings: any = data.settings.load();
        const mirrorDir = String(settings?.backup_mirror_dir || "").trim() || MIRROR_FOLDER;
        const mirrored = await mirrorBackup(meta.file, mirrorDir);
        if (!mirrored.ok) console.warn("[backup] Mirror failed:", mirrored.error);
      } catch (mirrorError: any) {
        console.warn("[backup] Mirror failed:", mirrorError?.message || mirrorError);
      }
      return { success: true, path: meta.file, size: meta.size, sha256: meta.sha256 };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  register_("backup:list", async () => {
    if (!options.getSession()) return { backups: [] };
    try {
      return { backups: await listBackups() };
    } catch {
      return { backups: [] };
    }
  });

  register_("backup:verify", async (backupPath: string) => {
    requireAuth();
    try {
      if (!backupPath) throw new Error("Backup file not found");
      return { success: true, ...(await verifyBackup(backupPath)) };
    } catch (err: any) {
      throw new Error(err.message);
    }
  });

  register_("backup:restore", async (backupPath: string) => {
    const user = options.getSession();
    if (!user) return { success: false, error: "Authentication required" };
    // Restoring REPLACES the live database (rolling back every financial
    // record) — administrator only.
    if (user.role !== "Administrator") return { success: false, error: "Administrator permission is required" };
    try {
      if (!backupPath) return { success: false, error: "Backup file not found" };
      // 1. Verify integrity before doing anything destructive.
      await verifyBackup(backupPath);
      // 2. Keep a safety copy of the current database.
      try {
        const safety = await createBackup(backupFileName("backup-pre-restore"));
        console.log(`[backup] Safety copy created: ${safety.file}`);
      } catch (err) {
        console.warn("[backup] Pre-restore safety backup failed:", err);
      }
      // 3. Replace the live database in place (no relaunch needed: the app
      //    reopens the engine and the UI keeps running).
      const { replaceDatabase } = await import("../core/db/connection.js");
      const image = await extractVerifiedBackup(backupPath);
      await replaceDatabase(image);
      return { success: true, restarted: false, reloadedAt: new Date().toISOString() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  /** Share a stored backup off the device (Android share sheet). */
  register_("backup:share", async (backupPath: string) => {
    requireAuth();
    return shareBackup(backupPath);
  });

  register_("backup:delete", async (backupPath: string) => {
    const user = options.getSession();
    if (!user) return { success: false, error: "Authentication required" };
    if (user.role !== "Administrator") return { success: false, error: "Administrator permission is required" };
    try {
      await deleteBackup(backupPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  /** The mirror folder is fixed on Android (an app-private folder that the
   *  admin can still share from) — this reports it instead of opening a
   *  desktop-style folder picker. */
  register_("backup:chooseMirrorDir", async () => {
    requireAuth();
    const host = await platform();
    return {
      success: true,
      path: MIRROR_FOLDER,
      uri: await host.files.uri(MIRROR_FOLDER),
      message: "Backups are kept in the app's documents folder and mirrored to a second folder on the device. Use “Send” to copy one to Drive or another phone.",
    };
  });

  // -------------------------------------------------------------------------
  // Files — the renderer saves CSV/XLSX/PDF reports through the share sheet.
  // -------------------------------------------------------------------------
  register_("files:save", async (name: string, mime: string, base64: string) => {
    requireAuth();
    const host = await platform();
    const { fromBase64 } = await import("../core/platform/crypto.js");
    const result = await host.share.saveFile({ name, mime, data: fromBase64(base64), title: name });
    return result.saved ? { success: true, path: result.path } : { success: false, cancelled: !!result.cancelled, error: result.error };
  });

  register_("files:saveText", async (name: string, mime: string, text: string) => {
    requireAuth();
    const host = await platform();
    const { utf8Bytes } = await import("../core/platform/crypto.js");
    const result = await host.share.saveFile({ name, mime, data: utf8Bytes(text), title: name });
    return result.saved ? { success: true, path: result.path } : { success: false, cancelled: !!result.cancelled, error: result.error };
  });

  // Keep the unused imports honest for the bundler.
  void toBase64;
}

/**
 * Auto-backup timer — same policy as the desktop build: every 10 minutes check
 * whether the configured interval has elapsed, write a `.mmbak`, prune old
 * automatic backups beyond the retention count, and mirror the copy.
 */
export function startAutoBackup(getDb: () => unknown = getDB): () => void {
  const runAutoBackup = async () => {
    try {
      const settings = data.settings.load();
      if (!settings?.auto_backup) return;
      const intervalHours = Number(settings.backup_interval_hours || 24);
      if (intervalHours <= 0) return;
      const backups = await listBackups();
      const lastBackup = backups[0];
      if (lastBackup) {
        const elapsedHours = (Date.now() - new Date(lastBackup.time).getTime()) / 3600000;
        if (elapsedHours < intervalHours) return;
      }
      const meta = await createBackup(backupFileName("backup-auto"));
      console.log(`[auto-backup] Created: ${meta.file}`);
      // Retention: keep only the newest N automatic backups (manual backups
      // and mirrored copies are never touched).
      try {
        const keepRaw = Number((settings as any)?.backup_keep_count ?? 30);
        const keep = Number.isFinite(keepRaw) && keepRaw > 0 ? Math.min(200, Math.max(3, Math.floor(keepRaw))) : 30;
        const auto = (await listBackups())
          .filter((entry) => /^backup-auto-.*\.mmbak$/i.test(entry.name))
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        for (const old of auto.slice(keep)) {
          try {
            await deleteBackup(old.path);
            console.log(`[auto-backup] Pruned old: ${old.name}`);
          } catch (err) {
            console.warn("[auto-backup] prune failed:", err);
          }
        }
      } catch (err) {
        console.warn("[auto-backup] retention check failed:", err);
      }
      const mirrorDir = String((settings as any)?.backup_mirror_dir || "").trim() || MIRROR_FOLDER;
      const mirrored = await mirrorBackup(meta.file, mirrorDir);
      if (!mirrored.ok) console.warn("[auto-backup] Mirror failed:", mirrored.error);
    } catch (err) {
      console.warn("[auto-backup] Failed:", err);
    }
  };
  void getDb;
  const timer = setInterval(() => void runAutoBackup(), 10 * 60 * 1000);
  const initial = setTimeout(() => void runAutoBackup(), 30_000);
  return () => {
    clearInterval(timer);
    clearTimeout(initial);
  };
}

export { BACKUP_FOLDER, MIRROR_FOLDER };
