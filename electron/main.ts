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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// Track logged-in user (in-memory only — no persistent session token)
const session = { user: null as null | { id: number; username: string; fullName: string; role: string } };

// ===== Global error handlers — show error dialog so user can see what went wrong =====
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  try {
    dialog.showErrorBox(
      "MMS — Unexpected Error",
      `The application encountered an error:\n\n${err.message}\n\nStack: ${err.stack || "(no stack)"}`
    );
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  try {
    dialog.showErrorBox(
      "MMS — Unexpected Error",
      `An async operation failed:\n\n${String(reason)}`
    );
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Window control IPC handlers
  ipcMain.handle("win:minimize", () => mainWindow?.minimize());
  ipcMain.handle("win:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("win:close", () => mainWindow?.close());
}

// ===== HTML escape helper =====
function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// ===== Token sheet HTML builder (A4, 2 cols × 6 rows = 12 per page) =====
function buildTokenSheetHtml(tokenList: any[], event: any): string {
  const eventName = event?.event_name || "Event";
  const eventDate = event?.event_date || "";
  const venue = event?.venue || "";
  const eventTime = event?.event_time || "";

  const tokens = tokenList.map((t: any) => {
    const familyName = t.house_name || t.family_number || "—";
    const houseNo = t.house_number || t.family_number || "";
    const ward = t.ward || "";
    return `
    <div class="token-card">
      <div class="token-border"></div>
      <div class="token-mahallu">MMS · Minz Mahallu</div>
      <div class="token-event">${esc(eventName)}</div>
      <div class="token-meta">${esc(eventDate)}${venue ? " · " + esc(venue) : ""}${eventTime ? " · " + esc(eventTime) : ""}</div>
      <div class="token-code">${esc(t.token_code)}</div>
      <div class="token-info">
        <div class="token-row"><span>Family:</span><b>${esc(familyName)}</b></div>
        ${houseNo ? `<div class="token-row"><span>House:</span><b>${esc(houseNo)}</b></div>` : ""}
        ${ward ? `<div class="token-row"><span>Ward:</span><b>${esc(ward)}</b></div>` : ""}
      </div>
      <div class="token-foot">Present this token at the event</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Poppins, Arial, sans-serif; }
  .token-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .token-card {
    border: 1.5px solid #0eab7f; border-radius: 6px; padding: 6mm 5mm;
    position: relative; overflow: hidden; min-height: 42mm;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    page-break-inside: avoid;
  }
  .token-border { position: absolute; top: 2mm; left: 2mm; right: 2mm; bottom: 2mm; border: 0.5px solid #0eab7f; border-radius: 4px; pointer-events: none; }
  .token-mahallu { font-size: 8px; font-weight: 600; color: #5f7268; letter-spacing: 0.1em; text-transform: uppercase; }
  .token-event { font-size: 11px; font-weight: 600; color: #0eab7f; margin-top: 2px; }
  .token-meta { font-size: 7.5px; color: #8ba096; margin-top: 1px; }
  .token-code { font-size: 28px; font-weight: 700; color: #1e2b25; letter-spacing: 4px; margin: 3mm 0 2mm; font-family: 'Courier New', monospace; }
  .token-info { font-size: 8px; color: #5f7268; width: 100%; }
  .token-row { display: flex; justify-content: space-between; padding: 1px 0; }
  .token-row span { color: #8ba096; }
  .token-row b { color: #1e2b25; font-weight: 600; }
  .token-foot { font-size: 7px; color: #8ba096; margin-top: 2mm; font-style: italic; }
  </style></head><body>
  <div class="token-grid">${tokens}</div>
  </body></html>`;
}

// ===== Collection sheet HTML builder (A4 table) =====
function buildCollectionSheetHtml(tokenList: any[], event: any): string {
  const eventName = event?.event_name || "Event";
  const eventDate = event?.event_date || "";

  const rows = tokenList.map((t: any, i: number) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td class="code">${esc(t.token_code)}</td>
      <td>${esc(t.house_name || t.family_number || "—")}</td>
      <td>${esc(t.house_number || t.family_number || "—")}</td>
      <td>${esc(t.ward || "—")}</td>
      <td class="check">☐</td>
      <td class="sig"></td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Poppins, Arial, sans-serif; font-size: 11px; color: #1e2b25; }
  .header { text-align: center; margin-bottom: 8mm; }
  .header .logo { width: 32px; height: 32px; border-radius: 8px; background: #0eab7f; display: inline-grid; place-items: center; margin-bottom: 4px; }
  .header .logo span { font-size: 16px; font-weight: 700; color: #fff; }
  .header h1 { font-size: 16px; font-weight: 600; }
  .header .sub { font-size: 10px; color: #5f7268; margin-top: 2px; }
  .header .event { font-size: 13px; font-weight: 600; color: #0eab7f; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f6f3; font-size: 9px; font-weight: 600; color: #5f7268; text-transform: uppercase; letter-spacing: 0.1em; padding: 8px 6px; border: 1px solid #d6e2d9; text-align: left; }
  td { padding: 7px 6px; border: 1px solid #e6ede7; font-size: 10px; }
  td.no { text-align: center; font-weight: 600; color: #8ba096; width: 24px; }
  td.code { font-family: 'Courier New', monospace; font-weight: 700; font-size: 12px; color: #0eab7f; letter-spacing: 1px; }
  td.check { text-align: center; font-size: 14px; width: 30px; }
  td.sig { width: 80px; }
  tr { page-break-inside: avoid; }
  </style></head><body>
  <div class="header">
    <div class="logo"><span>M</span></div>
    <h1>MMS · Minz Mahallu</h1>
    <div class="sub">Token Collection / Return Sheet</div>
    <div class="event">${esc(eventName)} · ${esc(eventDate)}</div>
  </div>
  <table>
    <thead><tr><th>No.</th><th>Token</th><th>Family</th><th>House No.</th><th>Ward</th><th>Collected</th><th>Signature</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;
}

// ===== Certificate HTML builder =====
function buildCertificateHtml(cert: any): string {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const typeLabels: Record<string, string> = {
    Membership: "MEMBERSHIP CERTIFICATE",
    Residence: "RESIDENCE CERTIFICATE",
    Marriage: "MARRIAGE CERTIFICATE",
    Death: "DEATH CERTIFICATE",
  };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Poppins', Arial, sans-serif; }
  .cert { width: 210mm; height: 297mm; padding: 20mm 18mm; position: relative; background: #fff; }
  .border { position: absolute; top: 8mm; left: 8mm; right: 8mm; bottom: 8mm; border: 3px solid #0eab7f; border-radius: 8px; }
  .border::before { content: ""; position: absolute; top: 3mm; left: 3mm; right: 3mm; bottom: 3mm; border: 1px solid #0eab7f; border-radius: 4px; }
  .header { text-align: center; margin-bottom: 15mm; position: relative; }
  .logo { width: 60px; height: 60px; border-radius: 14px; background: #0eab7f; display: inline-grid; place-items: center; margin-bottom: 8px; }
  .logo span { font-size: 32px; font-weight: 800; color: #fff; }
  .org { font-size: 22px; font-weight: 700; color: #1e2b25; }
  .sub { font-size: 12px; color: #5f7268; margin-top: 2px; }
  .title { font-size: 28px; font-weight: 700; color: #0eab7f; text-align: center; letter-spacing: 2px; margin: 10mm 0 8mm; }
  .body { text-align: center; position: relative; }
  .body p { font-size: 14px; color: #1e2b25; line-height: 1.8; margin-bottom: 6mm; }
  .name { font-size: 20px; font-weight: 600; color: #0eab7f; border-bottom: 2px solid #0eab7f; display: inline-block; padding: 0 20px 4px; margin: 4mm 0; }
  .cert-no { font-size: 12px; color: #5f7268; margin-top: 8mm; }
  .footer { position: absolute; bottom: 25mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; }
  .sign { text-align: center; }
  .sign-line { width: 50mm; border-top: 1.5px solid #1e2b25; margin-bottom: 4px; }
  .sign-label { font-size: 11px; color: #5f7268; }
  .seal { width: 35mm; height: 35mm; border: 2px dashed #0eab7f; border-radius: 50%; display: grid; place-items: center; font-size: 10px; color: #0eab7f; text-align: center; }
  .pattern { position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 0 L40 20 L20 40 L0 20 Z' fill='none' stroke='%230eab7f' stroke-width='1'/%3E%3C/svg%3E"); pointer-events: none; }
  </style></head><body>
  <div class="cert">
    <div class="border"></div>
    <div class="pattern"></div>
    <div class="header">
      <div class="logo"><span>M</span></div>
      <div class="org">Minz Mahallu Management</div>
      <div class="sub">Community Administration</div>
    </div>
    <div class="title">${typeLabels[cert.type] || "CERTIFICATE"}</div>
    <div class="body">
      <p>This is to certify that</p>
      <div class="name">${cert.issued_to || "—"}</div>
      <p>is a registered member of Minz Mahallu community.</p>
      <p>This certificate is issued on ${today} as per the records of the mahallu.</p>
      <div class="cert-no">Certificate No: <b>${cert.certificate_number}</b><br>Date of Issue: ${today}</div>
    </div>
    <div class="footer">
      <div class="sign">
        <div class="sign-line"></div>
        <div class="sign-label">Secretary</div>
      </div>
      <div class="seal">Official Seal</div>
      <div class="sign">
        <div class="sign-line"></div>
        <div class="sign-label">President</div>
      </div>
    </div>
  </div>
  </body></html>`;
}

app.whenReady().then(() => {
  // ===== Force DB initialization early so we surface errors before login =====
  try {
    console.log("[main] Initializing database...");
    getDB();
    console.log("[main] Database ready");
  } catch (err: any) {
    console.error("[main] Database initialization FAILED:", err);
    dialog.showErrorBox(
      "MMS — Database Error",
      `Failed to initialize the database:\n\n${err.message}\n\n` +
      `The app will continue but most operations will fail. ` +
      `Please check that the app has write permission to its data directory.`
    );
  }

  // ===== IPC: Auth =====
  ipcMain.handle("auth:login", (_e, username: string, password: string) => {
    try {
      const user = login(username, password);
      session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
      try {
        data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, `User logged in`, "");
      } catch {}
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("auth:logout", () => {
    if (session.user) {
      try {
        data.audit.log(session.user.id, session.user.username, "LOGOUT", "auth", session.user.id, "User logged out", "");
      } catch {}
    }
    session.user = null;
    return { success: true };
  });

  ipcMain.handle("auth:currentUser", () => session.user);
  ipcMain.handle("auth:changePassword", (_e, userId: number, newPassword: string) => {
    try {
      changePassword(userId, newPassword);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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

  // ===== IPC: PDF generation (certificates + reports + tokens) =====
  ipcMain.handle("pdf:generate", async (_e, html: string, defaultName: string) => {
    try {
      // Show save dialog first
      const saveResult = await dialog.showSaveDialog(mainWindow!, {
        title: "Save PDF",
        defaultPath: defaultName || "document.pdf",
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true };
      }

      // Create a hidden BrowserWindow to render the HTML
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true },
      });
      const base64Html = Buffer.from(html).toString("base64"); await pdfWin.loadURL("data:text/html;base64," + base64Html);
      // Wait for content to render
      await new Promise(r => setTimeout(r, 500));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      pdfWin.close();
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===== IPC: Certificate PDF generation =====
  ipcMain.handle("certificates:generatePdf", async (_e, certId: number) => {
    try {
      const listResult = data.certificates.list({});
      const certs = listResult?.rows || [];
      const cert = certs.find((c: any) => c.id === certId);
      if (!cert) return { success: false, error: "Certificate not found" };

      const html = buildCertificateHtml(cert);
      const saveResult = await dialog.showSaveDialog(mainWindow!, {
        title: "Save Certificate PDF",
        defaultPath: `certificate-${cert.certificate_number || certId}.pdf`,
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true };
      }
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      // Use loadURL with base64 encoding for large HTML
      const base64Html = Buffer.from(html).toString("base64");
      await pdfWin.loadURL("data:text/html;base64," + base64Html);
      await new Promise(r => setTimeout(r, 800));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4", printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      pdfWin.close();
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===== IPC: Users =====
  ipcMain.handle("users:list", () => data.users.list());
  ipcMain.handle("users:create", (_e, d) => data.users.create(d, session.user?.role ?? ""));
  ipcMain.handle("users:update", (_e, id, d) => data.users.update(id, d));
  ipcMain.handle("users:toggleLock", (_e, id, locked) => data.users.toggleLock(id, locked));
  ipcMain.handle("users:resetPassword", (_e, id, newPwd) => data.users.resetPassword(id, newPwd));
  ipcMain.handle("users:remove", (_e, id) => data.users.remove(id));

  // ===== IPC: Audit =====
  ipcMain.handle("audit:list", (_e, filter) => data.audit.list(filter || {}));

  // ===== IPC: Settings =====
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
      // Ask user where to save the backup
      const defaultName = `mms-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: "Save Backup",
        defaultPath: defaultName,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, error: "cancelled" };
      }
      const backupPath = result.filePath;
      const { getDB } = require("./db/connection.js");
      const db = getDB();
      db.backup(backupPath);
      const stats = fs.statSync(backupPath);
      return { success: true, path: backupPath, size: stats.size };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:list", () => {
    try {
      const userData = app.getPath("userData");
      const files = fs.readdirSync(userData)
        .filter(f => f.startsWith("backup-") && f.endsWith(".db"))
        .map(f => {
          const fullPath = path.join(userData, f);
          const stats = fs.statSync(fullPath);
          return { name: f, path: fullPath, size: stats.size, time: stats.mtime.toISOString() };
        })
        .sort((a, b) => b.time.localeCompare(a.time));
      return { success: true, backups: files };
    } catch (err: any) {
      return { success: false, error: err.message, backups: [] };
    }
  });

  // ===== IPC: File save dialog (for exports) =====
  ipcMain.handle("dialog:showSave", async (_e, defaultName: string, filters: any[]) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: "Save File",
        defaultPath: defaultName,
        filters: filters || [{ name: "All Files", extensions: ["*"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true };
      }
      return { success: true, path: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===== IPC: Token events =====
  ipcMain.handle("tokens:listEvents", () => data.tokens.listEvents());
  ipcMain.handle("tokens:getEvent", (_e, id) => data.tokens.getEvent(id));
  ipcMain.handle("tokens:createEvent", (_e, d) => data.tokens.createEvent(d));
  ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));

  // ===== IPC: Token operations =====
  ipcMain.handle("tokens:list", (_e, filter) => data.tokens.list(filter || {}));
  ipcMain.handle("tokens:checkExisting", (_e, eventId) => data.tokens.checkExisting(eventId));
  ipcMain.handle("tokens:generate", (_e, eventId, familyIds) => data.tokens.generate(eventId, familyIds, session.user?.id ?? 1));
  ipcMain.handle("tokens:collect", (_e, tokenId) => data.tokens.collect(tokenId, session.user?.id ?? 1));
  ipcMain.handle("tokens:cancel", (_e, tokenId, reason) => data.tokens.cancel(tokenId, reason));
  ipcMain.handle("tokens:replace", (_e, tokenId, reason) => data.tokens.replace(tokenId, reason, session.user?.id ?? 1));
  ipcMain.handle("tokens:stats", (_e, eventId) => data.tokens.stats(eventId));
  ipcMain.handle("tokens:listForPdf", (_e, eventId) => data.tokens.listForPdf(eventId));

  // ===== IPC: Token PDF generation =====
  ipcMain.handle("tokens:generateTokenPdf", async (_e, eventId: number) => {
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList || tokenList.length === 0) {
        return { success: false, error: "No tokens found for this event" };
      }
      const event = data.tokens.getEvent(eventId);
      const html = buildTokenSheetHtml(tokenList, event);
      const saveResult = await dialog.showSaveDialog(mainWindow!, {
        title: "Save Token PDF",
        defaultPath: `tokens-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`,
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true };
      }
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      const base64Html = Buffer.from(html).toString("base64"); await pdfWin.loadURL("data:text/html;base64," + base64Html);
      await new Promise(r => setTimeout(r, 500));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4", printBackground: true,
        margins: { top: 8, bottom: 8, left: 8, right: 8 },
      });
      pdfWin.close();
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: tokenList.length };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===== IPC: Collection sheet PDF =====
  ipcMain.handle("tokens:generateCollectionSheet", async (_e, eventId: number) => {
    try {
      const tokenList = data.tokens.listForPdf(eventId);
      if (!tokenList || tokenList.length === 0) {
        return { success: false, error: "No tokens found for this event" };
      }
      const event = data.tokens.getEvent(eventId);
      const html = buildCollectionSheetHtml(tokenList, event);
      const saveResult = await dialog.showSaveDialog(mainWindow!, {
        title: "Save Collection Sheet PDF",
        defaultPath: `collection-sheet-${event?.event_name?.replace(/\s+/g, "-") || eventId}.pdf`,
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true };
      }
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      const base64Html = Buffer.from(html).toString("base64"); await pdfWin.loadURL("data:text/html;base64," + base64Html);
      await new Promise(r => setTimeout(r, 500));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4", printBackground: true,
        margins: { top: 12, bottom: 12, left: 12, right: 12 },
      });
      pdfWin.close();
      fs.writeFileSync(saveResult.filePath, pdfBuffer);
      return { success: true, path: saveResult.filePath, count: tokenList.length };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeDB();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDB();
});
