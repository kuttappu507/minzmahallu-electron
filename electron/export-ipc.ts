/*
 * Export / print IPC handlers (split from main.ts, v2.6.3 housekeeping).
 *
 * Certificates PDF + preview, account-statement PDF/Excel, the annual audit
 * pack, marriage/death register books, token sheets and collection sheets,
 * plus the generic pdf:generate channel and the shared verified export
 * writer. Handler text moved verbatim — behaviour unchanged. exceljs stays
 * a lazy dynamic import (Task 44 — never on the boot path).
 */
import { app, dialog, ipcMain } from "electron";
import fs from "node:fs";
import * as data from "./services/data.service.js";
import { todayIST } from "./services/data.service.js";
import { istDateTimeDm } from "./services/ist-date.js";
import { renderHtmlToPdf } from "./print/pdf-renderer.js";
import { getAnekMalayalamCss, getPoppinsCss, getPreviewScreenCss } from "./print/utils.js";
import { buildTokenSheetHtml } from "./print/token.template.js";
import { buildCollectionSheetHtml } from "./print/collection-sheet.template.js";
import { buildCertificateHtml } from "./print/certificate.template.js";
import { buildAccountStatementHtml } from "./print/account-statement.template.js";
import { buildAuditPackHtml } from "./print/audit-pack.template.js";
import { buildRegisterBookHtml } from "./print/register-book.template.js";
import { fileNameSafe } from "./services/doc-number.service.js";
import { session, type GetWindow } from "./session.js";

// Verified export writer used by all save-dialog exports: guarantees the file
// extension, writes, then stat-verifies the output so a silent Windows failure
// (antivirus quarantine, Controlled Folder Access, OneDrive sync) can never
// masquerade as success. Error results carry the OS error code for diagnosis.
type ExportWriteResult = { status: "cancelled" } | { status: "written"; path: string; size: number } | { status: "failed"; error: string };
async function saveExportFile(getWindow: GetWindow, opts: { title: string; defaultName: string; ext: string; filterName: string }, produce: () => Promise<Buffer> | Buffer): Promise<ExportWriteResult> {
  try {
    const saveResult = await dialog.showSaveDialog(getWindow()!, { title: opts.title, defaultPath: opts.defaultName, filters: [{ name: opts.filterName, extensions: [opts.ext] }] });
    if (saveResult.canceled || !saveResult.filePath) return { status: "cancelled" };
    const filePath = /\.[A-Za-z0-9]+$/.test(saveResult.filePath) ? saveResult.filePath : `${saveResult.filePath}.${opts.ext}`;
    const buffer = await produce();
    fs.writeFileSync(filePath, buffer);
    const size = fs.statSync(filePath).size;
    if (!size) throw new Error("Output file is empty - the location may be blocked by antivirus or folder protection");
    return { status: "written", path: filePath, size };
  } catch (err: any) {
    return { status: "failed", error: (err?.code ? `${err.code}: ` : "") + String(err?.message ?? err) };
  }
}

export function registerExportIpc(getWindow: GetWindow): void {
  ipcMain.handle("pdf:generate", async (_e, html: string, defaultName: string) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const saveResult = await dialog.showSaveDialog(getWindow()!, { title: "Save PDF", defaultPath: defaultName || "document.pdf", filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath }; } catch (err: any) { return { success: false, error: err.message }; } });

  /** Certificates issued before the anti-forgery feature have no security
   *  code yet — it is minted here (lazily, once) so EVERY print carries the
   *  code, and issued codes never change afterwards. */
  function ensureCertCode(cert: any): void {
    data.certificates.ensureVerificationCode(cert);
  }

  // Returns the full Anek Malayalam Variable font CSS with all url(...) refs
  // replaced by base64 data URIs. Used by the renderer's TokensWithPrint page
  // to embed the font in client-built HTML so Malayalam glyphs render in the
  // printToPDF BrowserWindow (which doesn't have @fontsource bundled).
  ipcMain.handle("pdf:getAnekFontCss", () => {
    if (!session.user) throw new Error("Authentication required");
    // Poppins (Latin) + Anek Malayalam — report PDFs use the same composite
    // face stack as the on-screen app, instead of falling back to Arial.
    return getPoppinsCss() + getAnekMalayalamCss();
  });
  ipcMain.handle("certificates:generatePdf", async (_e, certId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const listResult = data.certificates.list({});
      const cert = (listResult?.rows || []).find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const lang = await getWindow()!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      // Anti-forgery reprint note (user report: the FIRST print also carried
      // the "Reprinted on" badge). The note must appear only when the sheet
      // being printed is genuinely a reprint — i.e. the stored count from the
      // PREVIOUS successful save is > 0. The count increments via markReprint()
      // below AFTER the PDF is actually saved, so a cancelled save never
      // stamps a phantom reprint, and the first print of every certificate is
      // always clean.
      const reprintNo = cert.reprint_count || 0;
      ensureCertCode(cert);
      const html = buildCertificateHtml(cert, lang, reprintNo, istDateTimeDm(new Date()));
      // certificate_number carries slashes (PREFIX/CODE/YYYY/MM/NNN) — in a
      // save dialog those become FOLDER separators and only the trailing
      // serial ("001.pdf") survived as the filename (user report). fileNameSafe
      // turns the number into PREFIX-CODE-YYYY-MM-NNN for the file name.
      const certFileBase = fileNameSafe(cert.certificate_number || `certificate-${certId}`) || `certificate-${certId}`;
      const saveResult = await dialog.showSaveDialog(getWindow()!, { title: "Save Certificate PDF", defaultPath: `certificate-${certFileBase}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      try { data.certificates.markReprint(certId); } catch (e) { console.warn("[certificates] reprint count not updated:", e); }
      return { success: true, path: saveResult.filePath, reprint: reprintNo > 0 };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  // Returns the certificate HTML so the renderer can show a print preview in an iframe.
  ipcMain.handle("certificates:previewHtml", async (_e, certId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const listResult = data.certificates.list({});
      const cert = (listResult?.rows || []).find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const lang = await getWindow()!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      // On-screen preview styles come from the separate stylesheet
      // (resources/templates/preview-screen.css) — no inline <style> in the UI.
      ensureCertCode(cert);
      const html = buildCertificateHtml(cert, lang, 0, undefined, getPreviewScreenCss());
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
      const written = await saveExportFile(getWindow, { title: "Save Account Statement PDF", defaultName, ext: "pdf", filterName: "PDF Document" }, async () => await renderHtmlToPdf(html));
      if (written.status === "cancelled") return { success: false, cancelled: true };
      if (written.status === "failed") return { success: false, error: written.error };
      return { success: true, path: written.path, size: written.size, count: listRes.rows?.length || 0 };
    } catch (err: any) { return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message }; }
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
        "Category": r.category || "",
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
      // Category filter (user request) — record it on the Summary sheet so a
      // single-category export states what it covers.
      if (filter?.category && filter.category !== "All") {
        summaryData.push({ "Metric": "Category Filter", "Value": String(filter.category) });
      }

      // exceljs on demand (Task 44): the workbook library (~1MB CJS bundle)
      // is only ever needed when an office user exports the ledger, so it is
      // imported lazily instead of paying its load time on every app start.
      // Default-import + destructure: cjs-module-lexer cannot see through
      // exceljs's bundled dist, so a named import would crash the packaged
      // ESM main process (same interop rule as electron-updater).
      const { Workbook } = (await import("exceljs")).default;
      const wb = new Workbook();
      const LEDGER_HEADERS = ["Date", "Source", "Type", "Description", "Category", "Receipt No", "Voucher No", "Bill No", "Payee", "Payment Method", "Transaction Ref", "Status", "Void Reason", "Amount"];
      // Column widths sized from the actual content so no value is truncated.
      const fitWidth = (data: any[], k: string) => {
        let max = String(k ?? "").length;
        for (let i = 0; i < data.length && i < 400; i++) {
          const len = String(data[i]?.[k] ?? "").length;
          if (len > max) max = len;
        }
        return Math.min(60, Math.max(11, Math.ceil(max * 1.15) + 3));
      };

      const ws1 = wb.addWorksheet("Ledger");
      ws1.columns = LEDGER_HEADERS.map((h) => ({ header: h, key: h, width: fitWidth(ledgerData, h) }));
      ws1.addRows(ledgerData);
      ws1.getRow(1).font = { bold: true };
      ws1.views = [{ state: "frozen", ySplit: 1 }];

      const ws2 = wb.addWorksheet("Summary");
      ws2.columns = ["Metric", "Value"].map((h) => ({ header: h, key: h, width: fitWidth(summaryData, h) }));
      ws2.addRows(summaryData);
      ws2.getRow(1).font = { bold: true };
      ws2.views = [{ state: "frozen", ySplit: 1 }];

      const defaultName = `account-statement-${periodLabel}-${todayIST()}.xlsx`;
      const written = await saveExportFile(getWindow, { title: "Save Account Statement Excel", defaultName, ext: "xlsx", filterName: "Excel Spreadsheet" }, async () => Buffer.from(await wb.xlsx.writeBuffer()));
      if (written.status === "cancelled") return { success: false, cancelled: true };
      if (written.status === "failed") return { success: false, error: written.error };
      return { success: true, path: written.path, size: written.size, count: rows.length };
    } catch (err: any) { return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message }; }
  });

  // ===== Annual audit pack (Waqf Board / society auditor format) =====
  ipcMain.handle("accounting:exportAuditPack", async (_e, fyYear: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const pack = data.accounting.auditPack(fyYear);
      const lang = await getWindow()!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      const html = buildAuditPackHtml(pack, lang, String((data.settings.load() as any)?.currency_symbol || "₹"), app.getVersion());
      const defaultName = `audit-pack-${fyYear}-${(fyYear + 1).toString().slice(2)}.pdf`;
      const written = await saveExportFile(getWindow, { title: "Save Annual Audit Pack", defaultName, ext: "pdf", filterName: "PDF Document" }, async () => await renderHtmlToPdf(html));
      if (written.status === "cancelled") return { success: false, cancelled: true };
      if (written.status === "failed") return { success: false, error: written.error };
      return { success: true, path: written.path, size: written.size, receipts: pack.totalReceipts, payments: pack.totalPayments, count: pack.transactions.length };
    } catch (err: any) { return { success: false, error: (err?.code ? `${err.code}: ` : "") + err.message }; }
  });

  // ===== Register-book printing (marriage / death) =====
  const printRegisterPdf = async (type: "marriage" | "death", _e: Electron.IpcMainInvokeEvent) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const settings = data.settings.load();
      const lang = await getWindow()!.webContents.executeJavaScript("document.documentElement.classList.contains('lang-ml') ? 'ml' : 'en'");
      const regData = {
        type,
        mahalluName: settings?.mahallu_name || "Minz Mahallu",
        generatedAt: new Date().toISOString(),
        rows: type === "marriage" ? data.marriages.registerRows() : data.deaths.registerRows(),
      };
      const html = buildRegisterBookHtml(regData, lang);
      const defaultName = type === "marriage" ? "marriage-register.pdf" : "death-register.pdf";
      const saveResult = await dialog.showSaveDialog(getWindow()!, { title: "Save Register PDF", defaultPath: defaultName, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: regData.rows.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  };
  ipcMain.handle("marriages:registerPdf", (e) => printRegisterPdf("marriage", e));
  ipcMain.handle("deaths:registerPdf", (e) => printRegisterPdf("death", e));

  // tokens:generateTokenPdf — full server-side render + save dialog. Used by
  // Tokens.tsx when the user clicks "Token PDF" from the success/list views.
  // (Was previously registered as "tokens:generatePdf" — singular — which
  // mismatched the preload's "tokens:generateTokenPdf" invoke and produced
  // "No handlers registered" errors in the renderer.)
  ipcMain.handle("tokens:generateTokenPdf", async (_e, eventId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const tokenList = data.tokens.listForPdf(eventId); if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" }; const event = data.tokens.getEvent(eventId); const html = buildTokenSheetHtml(tokenList, event); const saveResult = await dialog.showSaveDialog(getWindow()!, { title: "Save Token Sheet PDF", defaultPath: `tokens-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath, count: tokenList.length }; } catch (err: any) { return { success: false, error: err.message }; } });
  ipcMain.handle("tokens:generateCollectionSheet", async (_e, eventId: number) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try { const tokenList = data.tokens.listForPdf(eventId); if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" }; const event = data.tokens.getEvent(eventId); const html = buildCollectionSheetHtml(tokenList, event); const saveResult = await dialog.showSaveDialog(getWindow()!, { title: "Save Collection Sheet PDF", defaultPath: `collection-sheet-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] }); if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true }; const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer); return { success: true, path: saveResult.filePath, count: tokenList.length }; } catch (err: any) { return { success: false, error: err.message }; } });
}
