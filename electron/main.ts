/*
 * Electron main process — window creation + IPC handlers
 */
import { app, BrowserWindow, ipcMain, nativeTheme, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { login, changePassword, needsInitialSetup, createInitialAdministrator } from "./services/auth.service.js";
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
  const pdfWin = new BrowserWindow({ show: false, width: 794, height: 1123, useContentSize: true, backgroundColor: "#ffffff", webPreferences: { offscreen: false, sandbox: false } });
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
  ipcMain.handle("auth:login", (_e, username: string, password: string) => { try { const user = login(username, password); session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role }; try { data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, "User logged in", ""); } catch {} return { success: true, user }; } catch (err: any) { return { success: false, error: err.message }; } });
  ipcMain.handle("auth:logout", () => { if (session.user) { try { data.audit.log(session.user.id, session.user.username, "LOGOUT", "auth", session.user.id, "User logged out", ""); } catch {} } session.user = null; return { success: true }; });
  ipcMain.handle("auth:currentUser", () => session.user);
  ipcMain.handle("auth:setupStatus", () => ({ required: needsInitialSetup() }));
  ipcMain.handle("auth:createInitialAdministrator", (_e, username: string, fullName: string, password: string) => { try { const user = createInitialAdministrator(username, fullName, password); session.user = { id:user.id, username:user.username, fullName:user.fullName, role:user.role }; return { success:true, user }; } catch (err:any) { return { success:false, error:err.message }; } });
  ipcMain.handle("auth:changePassword", (_e, userId: number, newPassword: string) => { try { changePassword(userId, newPassword); return { success: true }; } catch (err: any) { return { success: false, error: err.message }; } });

  ipcMain.handle("families:list", (_e, filter) => data.families.list(filter || {}));
