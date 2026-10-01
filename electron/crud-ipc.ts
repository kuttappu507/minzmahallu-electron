/*
 * CRUD + auth IPC handlers (split from main.ts, v2.6.3 housekeeping).
 *
 * Every handler here is a straight pass-through into the data/auth service
 * layer with the shared session read from ./session.js. Handler text was
 * moved verbatim out of main.ts — no behaviour change. Registered from
 * main.ts' whenReady AFTER the splash has painted (ordering pinned in
 * startup-imports.test.ts) and BEFORE the security layer, which re-takes
 * the channels it guards (subscriptions:update/create, tokens:removeEvent);
 * the handlers below stay as the fail-closed fallbacks for those channels.
 */
import { app, dialog, ipcMain } from "electron";
import { login, loginAsync, changePassword, needsInitialSetup, createInitialAdministrator, warmAuthSubsystem } from "./services/auth.service.js";
import * as data from "./services/data.service.js";
import { listBackups } from "./services/backup.service.js";
import { session, type GetWindow } from "./session.js";

let cachedLastBackup: { at: number; time: string | null } | null = null;
function getCachedLastBackupTime(): string | null {
  const now = Date.now();
  if (cachedLastBackup && now - cachedLastBackup.at < 15_000) return cachedLastBackup.time;
  try {
    const time = listBackups(app.getPath("userData"))[0]?.time ?? null;
    cachedLastBackup = { at: now, time };
    return time;
  } catch {
    return null;
  }
}

/** Pre-warms auth crypto + initial-setup check + dashboard aggregates + backup
 *  status under the splash screen so login and the post-login Dashboard render
 *  with zero main-process stalls. */
export function warmStartupData(): void {
  try { warmAuthSubsystem(); } catch {}
  try { data.dashboard.warmCache(); } catch {}
  try { getCachedLastBackupTime(); } catch {}
}

export function registerCrudIpc(getWindow: GetWindow): void {
  ipcMain.handle("auth:login", async (_e, username: string, password: string) => {
    try {
      const user = await loginAsync(username, password);
      session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
      try { data.audit.log(user.id, user.username, "LOGIN", "auth", user.id, "User logged in", ""); } catch {}
      try { data.dashboard.refreshWarmStampAfterLogin(); } catch {}
      return { success: true, user };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
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
  ipcMain.handle("subscriptions:advanceReady", () => data.subscriptions.advanceReady());
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

  // ---- Asset register (V036) — buildings, lands, rentable goods ----
  ipcMain.handle("assets:list", (_e, filter) => data.assets.list(filter || {}));
  ipcMain.handle("assets:get", (_e, id) => data.assets.get(id));
  ipcMain.handle("assets:create", (_e, d) => data.assets.create(d));
  ipcMain.handle("assets:update", (_e, id, d) => data.assets.update(id, d));
  ipcMain.handle("assets:remove", (_e, id) => data.assets.remove(id));
  ipcMain.handle("assets:options", () => data.assets.options());
  ipcMain.handle("assets:summary", () => data.assets.summary());
  ipcMain.handle("assets:statement", (_e, id) => data.assets.statement(id));

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
  ipcMain.handle("welfare:disburse", (_e, id) => {
    const result = data.welfare.disburse(id, session.user?.id ?? 1);
    // WhatsApp notification to the family — best-effort, fire-and-forget:
    // a missing number / opted-out family / unpaired session must never fail
    // the disbursement itself. The attempt (or its reason) lands in the
    // WhatsApp message history either way. The whatsapp.service module (the
    // whole baileys chain) is imported on demand so it never costs startup
    // time (Task 44).
    void import("./services/whatsapp.service.js")
      .then(({ sendWelfareDisbursedMessage }) => sendWelfareDisbursedMessage(Number(id)))
      .catch(() => { /* recorded */ });
    return result;
  });
  ipcMain.handle("welfare:remove", (_e, id) => data.welfare.remove(id));
  ipcMain.handle("welfare:categories", () => data.welfare.categories());
  ipcMain.handle("certificates:list", (_e, filter) => data.certificates.list(filter || {}));
  ipcMain.handle("certificates:issueMembership", (_e, code) => data.certificates.issueMembership(code, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueResidence", (_e, familyNum, issuedTo) => data.certificates.issueResidence(familyNum, issuedTo, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueMarriageNoc", (_e, marriageNum) => data.certificates.issueMarriageNoc(marriageNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:issueDeath", (_e, deathNum) => data.certificates.issueDeath(deathNum, session.user?.id ?? 1));
  ipcMain.handle("certificates:remove", () => { throw new Error("Permanent deletion of certificate records is disabled"); });

  ipcMain.handle("users:list", () => data.users.list());
  ipcMain.handle("users:create", (_e, d) => data.users.create(d, session.user?.role ?? ""));
  ipcMain.handle("users:update", (_e, id, d) => data.users.update(id, d));
  ipcMain.handle("users:toggleLock", (_e, id, locked) => data.users.toggleLock(id, locked));
  ipcMain.handle("users:resetPassword", (_e, id, newPwd) => data.users.resetPassword(id, newPwd));
  ipcMain.handle("users:remove", (_e, id) => data.users.remove(id));
  ipcMain.handle("audit:list", (_e, filter) => data.audit.list(filter || {}));
  ipcMain.handle("settings:load", () => data.settings.load());
  ipcMain.handle("settings:save", (_e, d) => data.settings.save(d));
  // Read-only app information for the Settings → About card (version, data
  // folder). No sensitive values — helps the office quote the exact build
  // when reporting an issue.
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron || "",
    platform: process.platform,
    dataDir: app.getPath("userData"),
  }));
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
    // Defence-in-depth: this read surfaces the fund balance, so it requires a
    // session like every other dashboard read in security-ipc.ts (this raw
    // registration predates that layer and was missed — audit finding A5).
    if (!session.user) throw new Error("Authentication required");
    const glance = data.dashboard.todayAtGlance();
    let backupEnabled = false;
    let nextBackup: string | null = null;
    let lastBackup: string | null = null;
    try {
      const settings = data.settings.load();
      backupEnabled = !!settings?.auto_backup;
      lastBackup = getCachedLastBackupTime();
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

  ipcMain.handle("dialog:showSave", async (_e, defaultName: string, filters: any[]) => {
    if (!session.user) return { success: false, cancelled: true, error: "Authentication required" };
    const result = await dialog.showSaveDialog(getWindow()!, { title: "Save", defaultPath: defaultName, filters: filters || [] });
    if (result.canceled || !result.filePath) return { success: false, cancelled: true };
    return { success: true, path: result.filePath };
  });
  ipcMain.handle("tokens:listEvents", () => data.tokens.listEvents());
  ipcMain.handle("tokens:getEvent", (_e, id) => data.tokens.getEvent(id));
  ipcMain.handle("tokens:createEvent", (_e, d) => data.tokens.createEvent(d));
  ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));
  ipcMain.handle("tokens:removeEvent", () => { throw new Error("Token events can only be deleted through the secured IPC layer"); });
  // Fail-closed fallback: registerSecurityIpc() runs AFTER this registration
  // and re-registers the channel with the real date-guarded flow
  // (Administrator + reason + data.tokens.removeEvent, backed by the DB
  // triggers in token-guard.ts). If the security layer were ever disabled,
  // this handler refuses instead of performing an unguarded hard delete.
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
}

/** Re-take auth:createInitialAdministrator from security-ipc.ts (whose
 *  registration — main.ts calls registerSecurityIpc BEFORE this — wins).
 *  The setup handler must ALSO establish the main-process session — first-run
 *  setup IS an auto-login — otherwise every session-gated export (PDF
 *  registers, receipts, audit pack) answers "Authentication required" until
 *  the user logs out and back in. */
export function registerAuthRetakeIpc(): void {
  ipcMain.removeHandler("auth:createInitialAdministrator");
  ipcMain.handle("auth:createInitialAdministrator", (_e, username: string, fullName: string, password: string) => {
    try {
      const user = createInitialAdministrator(username, fullName, password);
      session.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
      try { data.audit.log(user.id, user.username, "INITIAL_SETUP", "auth", user.id, "Initial Administrator account created", ""); } catch {}
      return { success: true, user };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
}
