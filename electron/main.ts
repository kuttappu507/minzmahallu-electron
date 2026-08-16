/*
 * Electron main process — window creation + IPC handlers
 */
import { app, BrowserWindow, ipcMain, nativeTheme, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { login, changePassword } from "./services/auth.service.js";
import * as data from "./services/data.service.js";
import { closeDB, getDB } from "./db/connection.js";
import { buildTokenSheetHtml } from "./print/token.template.js";
import { buildCollectionSheetHtml } from "./print/collection-sheet.template.js";
import { buildCertificateHtml } from "./print/certificate.template.js";
import { registerSecurityIpc } from "./security-ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

const session = { user: null as null | { id: number; username: string; fullName: string; role: string } };

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  try {
    dialog.showErrorBox("MMS — Unexpected Error", `The application encountered an error:\n\n${err.message}\n\nStack: ${err.stack || "(no stack)"}`);
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  try {
    dialog.showErrorBox("MMS — Unexpected Error", `An async operation failed:\n\n${String(reason)}`);
  } catch {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    title: "MMS — Minz Mahallu Management System",
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: 1.0,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5174");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  mainWindow.on("closed", () => { mainWindow = null; });
  ipcMain.handle("win:minimize", () => mainWindow?.minimize());
  ipcMain.handle("win:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("win:close", () => mainWindow?.close());
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const pdfWin = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    useContentSize: true,
    backgroundColor: "#ffffff",
    webPreferences: { offscreen: false, sandbox: false },
  });
  try {
    await pdfWin.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
    await pdfWin.webContents.executeJavaScript(`
      document.documentElement.style.width = '210mm';
      document.body.style.width = '210mm';
      void document.body.offsetHeight;
      ({bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight});
    `);
    await new Promise(resolve => setTimeout(resolve, 150));
    return await pdfWin.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    });
  } finally {
    if (!pdfWin.isDestroyed()) pdfWin.destroy();
  }
}

// All IPC handlers run after Electron is ready.
app.whenReady().then(() => {
  // ===== IPC: Auth =====
  ipcMain.handle("auth:login", (_e, username: string, password: string) => {
    try {
      const user = login(username, password);
      session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
      try { data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, "User logged in", ""); } catch {}
      return { success: true, user };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  ipcMain.handle("auth:logout", () => {
    if (session.user) { try { data.audit.log(session.user.id, session.user.username, "LOGOUT", "auth", session.user.id, "User logged out", ""); } catch {} }
    session.user = null;
    return { success: true };
  });
  ipcMain.handle("auth:currentUser", () => session.user);
  ipcMain.handle("auth:changePassword", (_e, userId: number, newPassword: string) => {
    try { changePassword(userId, newPassword); return { success: true }; }
    catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== IPC: Families =====
  ipcMain.handle("families:list", (_e, filter) => data.families.list(filter || {}));
  ipcMain.handle("families:get", (_e, id) => data.families.get(id));
  ipcMain.handle("families:create", (_e, d) => data.families.create(d));
  ipcMain.handle("families:update", (_e, id, d) => data.families.update(id, d));
  ipcMain.handle("families:remove", (_e, id) => data.families.remove(id));

  // ===== IPC: Members =====
  ipcMain.handle("members:list", (_e, filter) => data.members.list(filter || {}));
  ipcMain.handle("members:get", (_e, id) => data.members.get(id));
  ipcMain.handle("members:create", (_e, d) => data.members.create(d));
  ipcMain.handle("members:update", (_e, id, d) => data.members.update(id, d));
  ipcMain.handle("members:remove", (_e, id) => data.members.remove(id));
  ipcMain.handle("members:relationships", () => data.members.relationships());

  // ===== IPC: Subscriptions =====
  ipcMain.handle("subscriptions:list", (_e, filter) => data.subscriptions.list(filter || {}));
  ipcMain.handle("subscriptions:get", (_e, id) => data.subscriptions.get(id));
  ipcMain.handle("subscriptions:create", (_e, d) => data.subscriptions.create(d));
  ipcMain.handle("subscriptions:update", (_e, id, d) => data.subscriptions.update(id, d));
  ipcMain.handle("subscriptions:remove", (_e, id) => data.subscriptions.remove(id));
  ipcMain.handle("subscriptions:markOverdue", () => data.subscriptions.markOverdue());
  ipcMain.handle("subscriptions:totalCollected", () => data.subscriptions.totalCollected());
  ipcMain.handle("subscriptions:totalPending", () => data.subscriptions.totalPending());
  ipcMain.handle("subscriptions:plans", () => data.subscriptions.plans());

  // ===== IPC: Donations =====
  ipcMain.handle("donations:list", (_e, filter) => data.donations.list(filter || {}));
  ipcMain.handle("donations:get", (_e, id) => data.donations.get(id));
  ipcMain.handle("donations:create", (_e, d) => data.donations.create(d));
  ipcMain.handle("donations:update", (_e, id, d) => data.donations.update(id, d));
  ipcMain.handle("donations:remove", (_e, id) => data.donations.remove(id));
  ipcMain.handle("donations:categories", () => data.donations.categories());
  ipcMain.handle("donations:totalThisMonth", () => data.donations.totalThisMonth());

  // ===== IPC: Accounting =====
  ipcMain.handle("accounting:list", (_e, filter) => data.accounting.list(filter || {}));
  ipcMain.handle("accounting:get", (_e, id) => data.accounting.get(id));
  ipcMain.handle("accounting:create", (_e, d) => data.accounting.create(d));
  ipcMain.handle("accounting:update", (_e, id, d) => data.accounting.update(id, d));
  ipcMain.handle("accounting:remove", (_e, id) => data.accounting.remove(id));
  ipcMain.handle("accounting:totalIncome", () => data.accounting.totalIncome());
  ipcMain.handle("accounting:totalExpense", () => data.accounting.totalExpense());
  ipcMain.handle("accounting:balance", () => data.accounting.balance());

  // ===== IPC: Marriages =====
  ipcMain.handle("marriages:list", (_e, filter) => data.marriages.list(filter || {}));
  ipcMain.handle("marriages:get", (_e, id) => data.marriages.get(id));
  ipcMain.handle("marriages:create", (_e, d) => data.marriages.create(d));
  ipcMain.handle("marriages:update", (_e, id, d) => data.marriages.update(id, d));
  ipcMain.handle("marriages:remove", (_e, id) => data.marriages.remove(id));

  // ===== IPC: Deaths =====
  ipcMain.handle("deaths:list", (_e, filter) => data.deaths.list(filter || {}));
  ipcMain.handle("deaths:get", (_e, id) => data.deaths.get(id));
  ipcMain.handle("deaths:create", (_e, d) => data.deaths.create(d));
  ipcMain.handle("deaths:update", (_e, id, d) => data.deaths.update(id, d));
  ipcMain.handle("deaths:remove", (_e, id) => data.deaths.remove(id));

  // ===== IPC: Welfare =====
  ipcMain.handle("welfare:list", (_e, filter) => data.welfare.list(filter || {}));
  ipcMain.handle("welfare:get", (_e, id) => data.welfare.get(id));
  ipcMain.handle("welfare:create", (_e, d) => data.welfare.create(d));
  ipcMain.handle("welfare:update", (_e, id, d) => data.welfare.update(id, d));
  ipcMain.handle("welfare:approve", (_e, id, amount, remarks) => data.welfare.approve(id, amount, remarks, session.user?.id ?? 1));
  ipcMain.handle("welfare:reject", (_e, id, reason) => data.welfare.reject(id, reason, session.user?.id ?? 1));
  ipcMain.handle("welfare:disburse", (_e, id) => data.welfare.disburse(id, session.user?.id ?? 1));
  ipcMain.handle("welfare:remove", (_e, id) => data.welfare.remove(id));
  ipcMain.handle("welfare:categories", () => data.welfare.categories());

  // ===== IPC: Certificates =====
  ipcMain.handle("certificates:list", (_e, filter) => data.certificates.list(filter || {}));
  ipcMain.handle("certificates:issueMembership", (_e, code) => data.certificates.issueMembership(code, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueResidence", (_e, familyNum, issuedTo) => data.certificates.issueResidence(familyNum, issuedTo, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueDeath", (_e, deathNum) => data.certificates.issueDeath(deathNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:remove", (_e, id) => data.certificates.remove(id));

  // ===== IPC: PDF generation =====
  ipcMain.handle("pdf:generate", async (_e, html: string, defaultName: string) => {
    try {
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save PDF", defaultPath: defaultName || "document.pdf", filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  ipcMain.handle("certificates:generatePdf", async (_e, certId: number) => {
    try {
      const listResult = data.certificates.list({});
      const cert = (listResult?.rows || []).find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };
      const html = buildCertificateHtml(cert);
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Certificate PDF", defaultPath: `certificate-${cert.certificate_number || certId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html);
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== IPC: Users =====
  ipcMain.handle("users:list", () => data.users.list());
  ipcMain.handle("users:create", (_e, d) => data.users.create(d, session.user?.role ?? ""));
  ipcMain.handle("users:update", (_e, id, d) => data.users.update(id, d));
  ipcMain.handle("users:toggleLock", (_e, id, locked) => data.users.toggleLock(id, locked));
  ipcMain.handle("users:resetPassword", (_e, id, newPwd) => data.users.resetPassword(id, newPwd));
  ipcMain.handle("users:remove", (_e, id) => data.users.remove(id));
  ipcMain.handle("audit:list", (_e, filter) => data.audit.list(filter || {}));
  ipcMain.handle("settings:load", () => data.settings.load());
  ipcMain.handle("settings:save", (_e, d) => data.settings.save(d));

  // ===== IPC: Dashboard =====
  ipcMain.handle("dashboard:summary", () => data.dashboard.summary());
  ipcMain.handle("dashboard:incomeThisMonth", () => data.dashboard.incomeThisMonth());
  ipcMain.handle("dashboard:expenseThisMonth", () => data.dashboard.expenseThisMonth());
  ipcMain.handle("dashboard:balance", () => data.dashboard.balance());
  ipcMain.handle("dashboard:monthlyCollections", (_e, months) => data.dashboard.monthlyCollections(months || 6));
  ipcMain.handle("dashboard:monthlyDonations", (_e, months) => data.dashboard.monthlyDonations(months || 6));
  ipcMain.handle("dashboard:incomeVsExpense", (_e, months) => data.dashboard.incomeVsExpense(months || 6));
  ipcMain.handle("dashboard:recentActivity", (_e, limit) => data.dashboard.recentActivity(limit || 10));

  // ===== IPC: Backup =====
  ipcMain.handle("backup:create", async () => {
    try {
      const defaultName = `mms-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;
      const result = await dialog.showSaveDialog(mainWindow!, { title: "Save Backup", defaultPath: defaultName, filters: [{ name: "SQLite Database", extensions: ["db"] }] });
      if (result.canceled || !result.filePath) return { success: false, error: "cancelled" };
      const db = getDB();
      db.backup(result.filePath);
      const stats = fs.statSync(result.filePath);
      return { success: true, path: result.filePath, size: stats.size };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  ipcMain.handle("backup:list", () => {
    try {
      const userData = app.getPath("userData");
      const files = fs.readdirSync(userData).filter(f => f.startsWith("backup-") && f.endsWith(".db")).map(f => {
        const fullPath = path.join(userData, f); const stats = fs.statSync(fullPath);
        return { name: f, path: fullPath, size: stats.size, time: stats.mtime.toISOString() };
      }).sort((a, b) => b.time.localeCompare(a.time));
      return { success: true, backups: files };
    } catch (err: any) { return { success: false, error: err.message, backups: [] }; }
  });

  ipcMain.handle("dialog:showSave", async (_e, defaultName: string, filters: any[]) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, { title: "Save File", defaultPath: defaultName, filters: filters || [{ name: "All Files", extensions: ["*"] }] });
      if (result.canceled || !result.filePath) return { success: false, cancelled: true };
      return { success: true, path: result.filePath };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ===== IPC: Token events =====
  ipcMain.handle("tokens:listEvents", () => data.tokens.listEvents());
  ipcMain.handle("tokens:getEvent", (_e, id) => data.tokens.getEvent(id));
  ipcMain.handle("tokens:createEvent", (_e, d) => data.tokens.createEvent(d));
  ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));
  ipcMain.handle("tokens:list", (_e, filter) => data.tokens.list(filter || {}));
  ipcMain.handle("tokens:checkExisting", (_e, eventId) => data.tokens.checkExisting(eventId));
  ipcMain.handle("tokens:generate", (_e, eventId, familyIds) => data.tokens.generate(eventId, familyIds, session.user?.id ?? 1));
  ipcMain.handle("tokens:collect", (_e, tokenId) => data.tokens.collect(tokenId, session.user?.id ?? 1));
  ipcMain.handle("tokens:cancel", (_e, tokenId, reason) => data.tokens.cancel(tokenId, reason));
  ipcMain.handle("tokens:replace", (_e, tokenId, reason) => data.tokens.replace(tokenId, reason, session.user?.id ?? 1));
  ipcMain.handle("tokens:stats", (_e, eventId) => data.tokens.stats(eventId));
  ipcMain.handle("tokens:listForPdf", (_e, eventId) => data.tokens.listForPdf(eventId));
  ipcMain.handle("tokens:generateTokenPdf", async (_e, eventId: number) => {
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" };
      const event = data.tokens.getEvent(eventId);
      const html = buildTokenSheetHtml(tokenList, event);
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Token PDF", defaultPath: `tokens-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: tokenList.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
  ipcMain.handle("tokens:generateCollectionSheet", async (_e, eventId: number) => {
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList || tokenList.length === 0) return { success: false, error: "No tokens found for this event" };
      const event = data.tokens.getEvent(eventId);
      const html = buildCollectionSheetHtml(tokenList, event);
      const saveResult = await dialog.showSaveDialog(mainWindow!, { title: "Save Collection Sheet PDF", defaultPath: `collection-sheet-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
      if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };
      const pdfBuffer = await renderHtmlToPdf(html); fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: tokenList.length };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // Replace the legacy family/member mutation routes with protected handlers
  // after every legacy handler has been registered.
  registerSecurityIpc(() => session.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null);

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeDB();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => { closeDB(); });
