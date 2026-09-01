/*
 * Electron main process — window creation + IPC handlers
 */
import { app, BrowserWindow, ipcMain, nativeTheme, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { login, changePassword, needsInitialSetup, createInitialAdministrator } from "./services/auth.service.js";
import * as data from "./services/data.service.js";
import { todayIST } from "./services/data.service.js";
import { istDateTimeDm } from "./services/ist-date.js";
import { closeDB, getDB } from "./db/connection.js";
import { createBackup, verifyBackup, extractVerifiedBackup, listBackups } from "./services/backup.service.js";
import { buildTokenSheetHtml } from "./print/token.template.js";
import { buildCollectionSheetHtml } from "./print/collection-sheet.template.js";
import { buildCertificateHtml } from "./print/certificate.template.js";
import { buildQrPayload, qrSvgDataUrl } from "./services/qr-code.js";
import { buildAccountStatementHtml } from "./print/account-statement.template.js";
import { buildAuditPackHtml } from "./print/audit-pack.template.js";
import { buildRegisterBookHtml } from "./print/register-book.template.js";
import { getAnekMalayalamCss } from "./print/utils.js";
import { registerSecurityIpc } from "./security-ipc.js";
import { registerWhatsAppIpc } from "./whatsapp-ipc.js";
import { registerReceiptIpc } from "./receipt-ipc.js";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
const session = { user: null as null | { id: number; username: string; fullName: string; role: string } };

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  try { dialog.showErrorBox("MMS — Unexpected Error", `The application encountered an error:\n\n${err.message}\n\nStack: ${err.stack || "(no stack)"}`); } catch {}
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  try { dialog.showErrorBox("MMS — Unexpected Error", `An async operation failed:\n\n${String(reason)}`); } catch {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640, show: false,
    autoHideMenuBar: true, backgroundColor: "#00000000",
    title: "MMS — Minz Mahallu Management System", transparent: true, frame: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "preload.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: false, zoomFactor: 1.0 },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5174");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
  ipcMain.handle("win:minimize", () => mainWindow?.minimize());
  ipcMain.handle("win:maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
  ipcMain.handle("win:close", () => mainWindow?.close());
}
function esc(s: any): string { return String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)); }
async function renderHtmlToPdf(html: string): Promise<Buffer> {
  // Render untrusted renderer-supplied HTML in a sandboxed, isolated offscreen window.
  // No preload, no node integration, sandbox enforced, no webSecurity tweaks.
  const pdfWin = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    useContentSize: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  try {
    await pdfWin.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
    await pdfWin.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts) {
          await document.fonts.ready;
          await Promise.all([
            document.fonts.load('700 12pt "Anek Malayalam"'),
            document.fonts.load('400 12pt "Anek Malayalam"')
          ]);
        }
        document.documentElement.style.width = 'auto';
        document.body.style.width = 'auto';
        void document.body.offsetHeight;
        return { bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight };
      })()
    `);
    await new Promise(resolve => setTimeout(resolve, 50));
    return await pdfWin.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true });
  } finally { if (!pdfWin.isDestroyed()) pdfWin.destroy(); }
}

app.whenReady().then(() => {
  try { data.subscriptions.ensureCurrentMonth(); } catch (err) { console.warn("[subscriptions] monthly generation deferred:", err); }
  ipcMain.handle("auth:login", (_e, username: string, password: string) => { try { const user = login(username, password); session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role }; try { data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, "User logged in", ""); } catch {} return { success: true, user }; } catch (err: any) { return { success: false, error: err.message }; } });
  ipcMain.handle("auth:logout", () => { if (session.user) { try { data.audit.log(session.user.id, session.user.username, "LOGOUT", "auth", session.user.id, "User logged out", ""); } catch {} } session.user = null; return { success: true }; });
  ipcMain.handle("auth:currentUser", () => session.user);
  ipcMain.handle("auth:setupStatus", () => ({ required: needsInitialSetup() }));
  ipcMain.handle("auth:createInitialAdministrator", (_e, username: string, fullName: string, password: string) => { try { const user = createInitialAdministrator(username, fullName, password); session.user = { id:user.id, username:user.username, fullName:user.fullName, role:user.role }; return { success:true, user }; } catch (err:any) { return { success:false, error:err.message }; } });
  ipcMain.handle("auth:changePassword", (_e, userId: number, newPassword: string) => { try { changePassword(userId, newPassword); return { success: true }; } catch (err: any) { return { success: false, error: err.message }; } });

  ipcMain.handle("families:list", (_e, filter) => data.families.list(filter || {}));
  ipcMain.handle("families:get", (_e, id) => data.families.get(id));
  ipcMain.handle("families:create", (_e, d) => data.families.create(d));
  ipcMain.handle("families:update", (_e, id, d) => data.families.update(id, d));
  ipcMain.handle("families:remove", (_e, id) => data.families.remove(id));
  ipcMain.handle("members:list", (_e, filter) => data.members.list(filter || {}));
  ipcMain.handle("members:get", (_e, id) => data.members.get(id));
  ipcMain.handle("members:create", (_e, d) => data.members.create(d));
  ipcMain.handle("members:update", (_e, id, d) => data.members.update(id, d));
  ipcMain.handle("members:remove", (_e, id) => data.members.remove(id));
  ipcMain.handle("members:relationships", () => data.members.relationships());
  ipcMain.handle("subscriptions:list", (_e, filter) => data.subscriptions.list(filter || {}));
  ipcMain.handle("subscriptions:get", (_e, id) => data.subscriptions.get(id));
  ipcMain.handle("subscriptions:remove", (_e, id) => data.subscriptions.remove(id));
  // NOTE: subscriptions:update / subscriptions:create are re-registered with
  // the security layer (auth + audit + the A6 receipt/WhatsApp hook) in
  // security-ipc.ts, which runs after this and wins. The registrations below
  // are the fail-closed fallbacks if the security layer is ever disabled —
  // they record payments but do not attempt messaging.
  ipcMain.handle("subscriptions:update", (_e, id, d) => data.subscriptions.update(id, d));
  ipcMain.handle("subscriptions:create", (_e, d) => data.subscriptions.create(d));
  ipcMain.handle("subscriptions:markOverdue", () => data.subscriptions.markOverdue());
  ipcMain.handle("subscriptions:totalCollected", () => data.subscriptions.totalCollected());
  ipcMain.handle("subscriptions:totalPending", () => data.subscriptions.totalPending());
  ipcMain.handle("subscriptions:plans", () => data.subscriptions.plans());
  ipcMain.handle("subscriptions:ensureCurrentMonth", () => data.subscriptions.ensureCurrentMonth());
  ipcMain.handle("donations:list", (_e, filter) => data.donations.list(filter || {}));
  ipcMain.handle("donations:get", (_e, id) => data.donations.get(id));
  ipcMain.handle("donations:create", (_e, d) => data.donations.create(d));
  ipcMain.handle("donations:update", (_e, id, d) => data.donations.update(id, d));
  ipcMain.handle("donations:remove", (_e, id) => data.donations.remove(id));
  ipcMain.handle("donations:categories", () => data.donations.categories());
  ipcMain.handle("donations:categoriesAll", () => data.donations.categoriesAll());
  ipcMain.handle("donations:createCategory", (_e, name, description) => data.donations.createCategory(name, description));
  ipcMain.handle("donations:updateCategory", (_e, id, name, description) => data.donations.updateCategory(id, name, description));
  ipcMain.handle("donations:setCategoryActive", (_e, id, active) => data.donations.setCategoryActive(id, active));
  ipcMain.handle("donations:removeCategory", (_e, id) => data.donations.removeCategory(id));
  ipcMain.handle("donations:memberBalance", (_e, familyId, memberId) => data.donations.memberBalance(familyId, memberId));
  ipcMain.handle("donations:totalThisMonth", () => data.donations.totalThisMonth());
  ipcMain.handle("accounting:list", (_e, filter) => data.accounting.list(filter || {}));
  ipcMain.handle("accounting:get", (_e, id) => data.accounting.get(id));
  ipcMain.handle("accounting:create", (_e, d) => data.accounting.create(d));
  ipcMain.handle("accounting:update", (_e, id, d) => data.accounting.update(id, d));
  ipcMain.handle("accounting:remove", (_e, id) => data.accounting.remove(id));
  ipcMain.handle("accounting:totalIncome", () => data.accounting.totalIncome());
  ipcMain.handle("accounting:totalExpense", () => data.accounting.totalExpense());
  ipcMain.handle("accounting:balance", () => data.accounting.balance());

  ipcMain.handle("marriages:list", (_e, filter) => data.marriages.list(filter || {}));
  ipcMain.handle("marriages:get", (_e, id) => data.marriages.get(id));
  ipcMain.handle("marriages:create", (_e, d) => data.marriages.create(d));
  ipcMain.handle("marriages:update", (_e, id, d) => data.marriages.update(id, d));
  ipcMain.handle("marriages:remove", () => { throw new Error("Permanent deletion of marriage records is disabled"); });
  ipcMain.handle("deaths:list", (_e, filter) => data.deaths.list(filter || {}));
  ipcMain.handle("deaths:get", (_e, id) => data.deaths.get(id));
  ipcMain.handle("deaths:create", (_e, d) => data.deaths.create(d));
  ipcMain.handle("deaths:update", (_e, id, d) => data.deaths.update(id, d));
  ipcMain.handle("deaths:remove", () => { throw new Error("Permanent deletion of death records is disabled"); });
  ipcMain.handle("welfare:list", (_e, filter) => data.welfare.list(filter || {}));
  ipcMain.handle("welfare:get", (_e, id) => data.welfare.get(id));
  ipcMain.handle("welfare:create", (_e, d) => data.welfare.create(d));
  ipcMain.handle("welfare:update", (_e, id, d) => data.welfare.update(id, d));
  ipcMain.handle("welfare:approve", (_e, id, amount, remarks) => data.welfare.approve(id, amount, remarks, session.user?.id ?? 1));
  ipcMain.handle("welfare:reject", (_e, id, reason) => data.welfare.reject(id, reason, session.user?.id ?? 1));
  ipcMain.handle("welfare:disburse", (_e, id) => data.welfare.disburse(id, session.user?.id ?? 1));
  ipcMain.handle("welfare:remove", (_e, id) => data.welfare.remove(id));
  ipcMain.handle("welfare:categories", () => data.welfare.categories());
  ipcMain.handle("certificates:list", (_e, filter) => data.certificates.list(filter || {}));
  ipcMain.handle("certificates:issueMembership", (_e, code) => data.certificates.issueMembership(code, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueResidence", (_e, familyNum, issuedTo) => data.certificates.issueResidence(familyNum, issuedTo, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueMarriageNoc", (_e, marriageNum) => data.certificates.issueMarriageNoc(marriageNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueDeath", (_e, deathNum) => data.certificates.issueDeath(deathNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:remove", () => { throw new Error("Permanent deletion of certificate records is disabled"); });

  ipcMain.handle("pdf:generate", async (_e, html: string, defaultName: string) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save PDF", defaultPath: defaultName || "document.pdf", filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath }; } catch (err: any) { return { success: false, error: err.message }; } });
  // Returns the full Anek Malayalam Variable font CSS with all url(...) refs
  // replaced by base64 data URIs. Used by the renderer's TokensWithPrint page
  // to embed the font in client-built HTML so Malayalam glyphs render in the
  // printToPDF BrowserWindow (which doesn't have @fontsource bundled).
  /** QR payload for a certificate: register code + this machine's fingerprint. */
  function buildQrPayloadFor(cert: any): string {
    const row = getDB().prepare("SELECT device_fingerprint FROM settings WHERE id = 1").get() as { device_fingerprint?: string } | undefined;
    const fingerprint = row?.device_fingerprint || "UNBOUND";
    return buildQrPayload({
      certificateNumber: String(cert.certificate_number || cert.id || ""),
      verificationCode: String(cert.verification_code || ""),
      fingerprint,
      issuedDate: String(cert.issued_date || "").slice(0, 10),
    });
  }

  ipcMain.handle("pdf:getAnekFontCss", () => {
    if (!session.user) throw new Error("Authentication required");
    return getAnekMalayalamCss();
  });
  ipcMain.handle("certificates:generatePdf", async (_e, certId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const listResult = data.certificates.list({});
      const cert = (listResult?.rows || []).find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const lang = await mainWindow!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      // Anti-forgery: the NEXT print is a reprint, so it carries a bottom-left
      // "Reprinted on <date time>" note even before the count is persisted
      // (the count only increments if the PDF is actually saved).
      const expectedReprint = (cert.reprint_count || 0) + 1;
      const qrSvg = await qrSvgDataUrl(buildQrPayloadFor(cert));
      const html = buildCertificateHtml(cert, lang, expectedReprint, istDateTimeDm(new Date()), qrSvg);
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Certificate PDF", defaultPath: `certificate-${cert.certificate_number || certId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      try { data.certificates.markReprint(certId); } catch (e) { console.warn("[certificates] reprint count not updated:", e); }
      return { success: true, path: saveResult.filePath, reprint: expectedReprint > 1 };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  // Returns the certificate HTML so the renderer can show a print preview in an iframe.
  ipcMain.handle("certificates:previewHtml", async (_e, certId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const listResult = data.certificates.list({});
      const cert = (listResult?.rows || []).find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const lang = await mainWindow!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      const qrSvg = await qrSvgDataUrl(buildQrPayloadFor(cert));
      const html = buildCertificateHtml(cert, lang, 0, undefined, qrSvg);
      return { success: true, html };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== Accounting export: PDF + Excel =====
  ipcMain.handle("accounting:exportPdf", async (_e, filter: any) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      // Fetch all rows (no pagination) + summary for the given filter.
      const allFilter = { ...filter, page: undefined, pageSize: undefined };
      const [listRes, summary] = await Promise.all([
        data.accounting.unifiedList(allFilter),
        data.accounting.unifiedSummary(allFilter)
      ]);
      const html = buildAccountStatementHtml(listRes.rows || [], summary, allFilter);
      const periodLabel = filter?.period || "all";
      const defaultName = `account-statement-${periodLabel}-${todayIST()}.pdf`;
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Account Statement PDF", defaultPath: defaultName, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: listRes.rows?.length || 0 };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  ipcMain.handle("accounting:exportExcel", async (_e, filter: any) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const allFilter = { ...filter, page: undefined, pageSize: undefined };
      const [listRes, summary] = await Promise.all([
        data.accounting.unifiedList(allFilter),
        data.accounting.unifiedSummary(allFilter)
      ]);
      const rows = listRes.rows || [];
      const periodLabel = filter?.period || "all";

      // Sheet 1: Ledger entries
      const ledgerData = rows.map((r: any) => ({
        "Date": r.ledger_date || "",
        "Source": r.source || "",
        "Type": r.type || "",
        "Description": r.description || "",
        "Receipt No": r.receipt_number || "",
        "Voucher No": r.voucher_no || "",
        "Bill No": r.bill_no || "",
        "Payee": r.payee || "",
        "Payment Method": r.payment_method || "",
        "Transaction Ref": r.transaction_ref || "",
        "Status": r.status === "Void" ? "VOID" : (r.status || "Posted"),
        "Void Reason": r.void_reason || "",
        "Amount": Number(r.amount || 0),
      }));

      // Sheet 2: Summary
      const summaryData = [
        { "Metric": "Total Income", "Value": summary.totalIncome },
        { "Metric": "Total Expense", "Value": summary.totalExpense },
        { "Metric": "Balance", "Value": summary.balance },
        { "Metric": "Entry Count", "Value": summary.entryCount },
        { "Metric": "", "Value": "" },
        { "Metric": "Income — Donations", "Value": summary.incomeDonations },
        { "Metric": "Income — Subscriptions", "Value": summary.incomeSubscriptions },
        { "Metric": "Income — Manual", "Value": summary.incomeManual },
        { "Metric": "", "Value": "" },
        { "Metric": "Expense — Welfare", "Value": summary.expenseWelfare },
        { "Metric": "Expense — Salary", "Value": summary.expenseSalary },
        { "Metric": "Expense — Manual", "Value": summary.expenseManual },
      ];

      const wb = XLSX.utils.book_new();
      const LEDGER_HEADERS = ["Date", "Source", "Type", "Description", "Receipt No", "Voucher No", "Bill No", "Payee", "Payment Method", "Transaction Ref", "Status", "Void Reason", "Amount"];
      const ws1 = XLSX.utils.json_to_sheet(ledgerData, { header: LEDGER_HEADERS });
      // Column widths sized from the actual content so no value is truncated.
      const fitCols = (data: any[], header: string[]) =>
        header.map((k) => {
          let max = String(k ?? "").length;
          for (let i = 0; i < data.length && i < 400; i++) {
            const len = String(data[i]?.[k] ?? "").length;
            if (len > max) max = len;
          }
          return { wch: Math.min(60, Math.max(11, Math.ceil(max * 1.15) + 3)) };
        });
      ws1["!cols"] = fitCols(ledgerData, LEDGER_HEADERS);
      XLSX.utils.book_append_sheet(wb, ws1, "Ledger");

      const ws2 = XLSX.utils.json_to_sheet(summaryData, { header: ["Metric", "Value"] });
      ws2["!cols"] = fitCols(summaryData, ["Metric", "Value"]);
      XLSX.utils.book_append_sheet(wb, ws2, "Summary");

      const defaultName = `account-statement-${periodLabel}-${todayIST()}.xlsx`;
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Account Statement Excel", defaultPath: defaultName, filters: [{ name: "Excel Spreadsheet", extensions: ["xlsx"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      fs.writeFileSync(saveResult.filePath, buffer);
      return { success: true, path: saveResult.filePath, count: rows.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== Annual audit pack (Waqf Board / society auditor format) =====
  ipcMain.handle("accounting:exportAuditPack", async (_e, fyYear: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const pack = data.accounting.auditPack(fyYear);
      const lang = await mainWindow!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      const html = buildAuditPackHtml(pack, lang);
      const defaultName = `audit-pack-${fyYear}-${(fyYear + 1).toString().slice(2)}.pdf`;
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Annual Audit Pack", defaultPath: defaultName, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, receipts: pack.totalReceipts, payments: pack.totalPayments, count: pack.transactions.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== Register-book printing (marriage / death) =====
  const printRegisterPdf = async (type: "marriage" | "death", _e: Electron.IpcMainInvokeEvent) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const settings = data.settings.load();
      const lang = await mainWindow!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      const regData = {
        type,
        mahalluName: settings?.mahallu_name || "Minz Mahallu",
        generatedAt: new Date().toISOString(),
        rows: type === "marriage" ? data.marriages.registerRows() : data.deaths.registerRows(),
      };
      const html = buildRegisterBookHtml(regData, lang);
      const defaultName = type === "marriage" ? "marriage-register.pdf" : "death-register.pdf";
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Register PDF", defaultPath: defaultName, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: regData.rows.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  };
  ipcMain.handle("marriages:registerPdf", (e) => printRegisterPdf("marriage", e));
  ipcMain.handle("deaths:registerPdf", (e) => printRegisterPdf("death", e));

  ipcMain.handle("users:list", () => data.users.list());
  ipcMain.handle("users:create", (_e, d) => data.users.create(d, session.user?.role ?? ""));
  ipcMain.handle("users:update", (_e, id, d) => data.users.update(id, d));
  ipcMain.handle("users:toggleLock", (_e, id, locked) => data.users.toggleLock(id, locked));
  ipcMain.handle("users:resetPassword", (_e, id, newPwd) => data.users.resetPassword(id, newPwd));
  ipcMain.handle("users:remove", (_e, id) => data.users.remove(id));
  ipcMain.handle("audit:list", (_e, filter) => data.audit.list(filter || {}));
  ipcMain.handle("settings:load", () => data.settings.load());
  ipcMain.handle("settings:save", (_e, d) => data.settings.save(d));
  ipcMain.handle("dashboard:summary", () => data.dashboard.summary());
  ipcMain.handle("dashboard:incomeThisMonth", () => data.dashboard.incomeThisMonth());
  ipcMain.handle("dashboard:expenseThisMonth", () => data.dashboard.expenseThisMonth());
  ipcMain.handle("dashboard:balance", () => data.dashboard.balance());
  ipcMain.handle("dashboard:monthlyCollections", (_e, months) => data.dashboard.monthlyCollections(months || 6));
  ipcMain.handle("dashboard:monthlyDonations", (_e, months) => data.dashboard.monthlyDonations(months || 6));
  ipcMain.handle("dashboard:incomeVsExpense", (_e, months) => data.dashboard.incomeVsExpense(months || 6));
  ipcMain.handle("dashboard:recentActivity", (_e, limit) => data.dashboard.recentActivity(limit || 10));
  // Today-at-a-glance + real backup status (auto-backup schedule + last backup file).
  ipcMain.handle("dashboard:todayAtGlance", () => {
    const glance = data.dashboard.todayAtGlance();
    let backupEnabled = false;
    let nextBackup: string | null = null;
    let lastBackup: string | null = null;
    try {
      const settings = data.settings.load();
      backupEnabled = !!settings?.auto_backup;
      lastBackup = listBackups(app.getPath("userData"))[0]?.time ?? null;
      if (backupEnabled) {
        const intervalHours = Number(settings.backup_interval_hours || 24);
        if (intervalHours > 0) {
          const last = lastBackup ? new Date(lastBackup).getTime() : 0;
          nextBackup = new Date(last + intervalHours * 3600 * 1000).toISOString();
        }
      }
    } catch (e) { console.warn("[dashboard:todayAtGlance] backup info failed:", e); }
    return { ...glance, backupEnabled, nextBackup, lastBackup };
  });

  ipcMain.handle("backup:create", async () => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const defaultName = `mms-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mmbak`;
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: "Save Backup",
        defaultPath: defaultName,
        filters: [{ name: "MMS Verified Backup", extensions: ["mmbak"] }],
      });
      if (result.canceled || !result.filePath) return { success: false, error: "cancelled" };
      const meta = await createBackup(result.filePath);
      return { success: true, path: result.filePath, size: meta.size, sha256: meta.sha256 };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("backup:list", () => {
    if (!session.user) return { backups: [] };
    try {
      const userData = app.getPath("userData");
      const backups = listBackups(userData);
      return { backups };
    } catch (e: any) {
      return { backups: [] };
    }
  });
  ipcMain.handle("backup:verify", (_e, backupPath: string) => {
    if (!session.user) throw new Error("Authentication required");
    try {
      if (!backupPath || !fs.existsSync(backupPath)) throw new Error("Backup file not found");
      const result = verifyBackup(backupPath);
      return { success: true, ...result };
    } catch (err: any) {
      throw new Error(err.message);
    }
  });
  ipcMain.handle("backup:restore", async (_e, backupPath: string) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      if (!backupPath || !fs.existsSync(backupPath)) return { success: false, error: "Backup file not found" };
      // 1. Verify the target backup integrity before doing anything destructive.
      verifyBackup(backupPath);
      // 2. Make a safety pre-restore backup of the current live DB.
      const userData = app.getPath("userData");
      const safetyPath = path.join(userData, `backup-pre-restore-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.mmbak`);
      try { await createBackup(safetyPath); } catch (e) { console.warn("[backup] Pre-restore safety backup failed:", e); }
      // 3. Close the live DB connection so the file can be safely replaced.
      try { closeDB(); } catch {}
      // 4. Extract the verified backup into the live DB path.
      const liveDbPath = path.join(userData, "mms.db");
      extractVerifiedBackup(backupPath, liveDbPath);
      // 5. Relaunch the app so the new DB is loaded cleanly.
      setTimeout(() => { app.relaunch(); app.exit(0); }, 250);
      return { success: true, restarted: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("dialog:showSave", async (_e, defaultName: string, filters: any[]) => {
    if (!session.user) return { success: false, cancelled: true, error: "Authentication required" };
    const result = await dialog.showSaveDialog(mainWindow!, { title: "Save", defaultPath: defaultName, filters: filters || [] });
    if (result.canceled || !result.filePath) return { success: false, cancelled: true };
    return { success: true, path: result.filePath };
  });
  ipcMain.handle("tokens:listEvents", () => data.tokens.listEvents());
  ipcMain.handle("tokens:getEvent", (_e, id) => data.tokens.getEvent(id));
  ipcMain.handle("tokens:createEvent", (_e, d) => data.tokens.createEvent(d));
  ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));
  ipcMain.handle("tokens:removeEvent", (_e, id: number) => { getDB().prepare("DELETE FROM token_events WHERE id = ?").run(id); return { success: true }; });
  // NOTE: security-ipc.ts overrides tokens:removeEvent with a guard that throws
  // "Token events cannot be permanently deleted after creation." Because
  // registerSecurityIpc() runs AFTER this registration and uses ipcMain.removeHandler()
  // first, the security version wins and the hard DELETE above is intentionally
  // unreachable. We keep the registration here so that if security-ipc is ever
  // disabled, the operation fails closed (no silent hard delete).
  ipcMain.handle("tokens:list", (_e, filter) => data.tokens.list(filter || {}));
  ipcMain.handle("tokens:checkExisting", (_e, eventId) => Array.from(data.tokens.checkExisting(eventId)));
  ipcMain.handle("tokens:generate", (_e, eventId, familyIds) => data.tokens.generate(eventId, familyIds, session.user?.id ?? 1));
  ipcMain.handle("tokens:collect", (_e, tokenId) => data.tokens.collect(tokenId, session.user?.id ?? 1));
  ipcMain.handle("tokens:cancel", (_e, tokenId, reason) => data.tokens.cancel(tokenId, reason));
  ipcMain.handle("tokens:replace", (_e, tokenId, reason) => data.tokens.replace(tokenId, reason, session.user?.id ?? 1));
  ipcMain.handle("tokens:stats", (_e, eventId) => data.tokens.stats(eventId));
  // tokens:listForPdf — returns the raw token rows (no PDF rendering). Used by
  // TokensWithPrint.tsx to build the HTML client-side and pipe it through
  // pdf:generate, which lets the renderer pick color/B&W mode and apply i18n.
  ipcMain.handle("tokens:listForPdf", (_e, eventId: number) => {
    if (!session.user) throw new Error("Authentication required");
    return data.tokens.listForPdf(eventId);
  });
  // tokens:generateTokenPdf — full server-side render + save dialog. Used by
  // Tokens.tsx when the user clicks "Token PDF" from the success/list views.
  // (Was previously registered as "tokens:generatePdf" — singular — which
  // mismatched the preload's "tokens:generateTokenPdf" invoke and produced
  // "No handlers registered" errors in the renderer.)
  ipcMain.handle("tokens:generateTokenPdf", async (_e, eventId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const tokenList = data.tokens.listForPdf(eventId); if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" }; const event = data.tokens.getEvent(eventId); const html = buildTokenSheetHtml(tokenList, event); const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Token Sheet PDF", defaultPath: `tokens-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath, count: tokenList.length }; } catch (err: any) { return { success: false, error: err.message }; } });
  ipcMain.handle("tokens:generateCollectionSheet", async (_e, eventId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const tokenList = data.tokens.listForPdf(eventId); if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" }; const event = data.tokens.getEvent(eventId); const html = buildCollectionSheetHtml(tokenList, event); const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Collection Sheet PDF", defaultPath: `collection-sheet-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath, count: tokenList.length }; } catch (err: any) { return { success: false, error: err.message }; } });

  registerSecurityIpc(() => session.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null);
  registerWhatsAppIpc(() => session.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null);
  registerReceiptIpc(() => session.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null, () => mainWindow);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // ===== Auto-backup timer =====
  // Checks settings.auto_backup every 10 minutes. If enabled and the last
  // backup is older than backup_interval_hours, creates a .mmbak file in the
  // userData directory automatically (no user interaction needed).
  let autoBackupTimer: NodeJS.Timeout | null = null;
  const runAutoBackup = async () => {
    try {
      const settings = data.settings.load();
      if (!settings?.auto_backup) return;
      const intervalHours = Number(settings.backup_interval_hours || 24);
      if (intervalHours <= 0) return;
      const userData = app.getPath("userData");
      // Check existing backups to see if the last one is older than the interval.
      const backups = listBackups(userData);
      const lastBackup = backups[0]; // sorted by time desc
      const now = Date.now();
      if (lastBackup) {
        const lastTime = new Date(lastBackup.time).getTime();
        const elapsedHours = (now - lastTime) / (1000 * 60 * 60);
        if (elapsedHours < intervalHours) return; // too soon
      }
      const name = `backup-auto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mmbak`;
      const filePath = path.join(userData, name);
      await createBackup(filePath);
      console.log(`[auto-backup] Created: ${name}`);
    } catch (e) {
      console.warn("[auto-backup] Failed:", e);
    }
  };
  autoBackupTimer = setInterval(runAutoBackup, 10 * 60 * 1000); // every 10 min
  // Also run once 30 seconds after startup (to let DB init finish).
  setTimeout(runAutoBackup, 30000);
});
app.on("window-all-closed", () => { closeDB(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { closeDB(); });
