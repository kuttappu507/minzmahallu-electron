import { BrowserWindow, ipcMain } from "electron";
import * as data from "./services/data.service.js";
import { changePassword, createInitialAdministrator, needsInitialSetup } from "./services/auth.service.js";
import { security, type Actor } from "./services/security.service.js";

// Install the sender guard before main.ts registers any handlers. This makes
// the protection apply to read, write, export and utility IPC channels alike.
const rawHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = ((channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => {
  return rawHandle(channel, async (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed()) throw new Error("Unauthorized IPC sender");
    return listener(event, ...args);
  });
}) as typeof ipcMain.handle;

type ActorProvider = () => Actor | null;
function register(name: string, handler: (...args: any[]) => any) {
  try { ipcMain.removeHandler(name); } catch {}
  ipcMain.handle(name, async (_event, ...args) => handler(...args));
}
function validatePassword(password: string) {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include uppercase, lowercase, digit, and special character");
  }
}

export function registerSecurityIpc(getActor: ActorProvider) {
  register("auth:setupStatus", () => ({ required: needsInitialSetup() }));
  register("auth:createInitialAdministrator", (username: string, fullName: string, password: string) => {
    const user = createInitialAdministrator(username, fullName, password);
    try { data.audit.log(user.id, user.username, "INITIAL_SETUP", "auth", user.id, "Initial Administrator account created", ""); } catch {}
    return { success: true, user };
  });
  const actor = (): Actor => {
    const current = getActor();
    if (current) return current;
    const authActor = (globalThis as any).__mmsGetActor?.() as Actor | null | undefined;
    if (authActor) return authActor;
    throw new Error("Authentication is required for this operation");
  };
  const admin = (): Actor => {
    const current = actor();
    if (current.role !== "Administrator") throw new Error("Administrator permission is required for this operation");
    return current;
  };
  register("auth:changePassword", (userId: number, newPassword: string) => {
    const a = actor();
    if (userId !== a.id && a.role !== "Administrator") throw new Error("You can only change your own password");
    validatePassword(newPassword); changePassword(userId, newPassword);
    try { data.audit.log(a.id, a.username, "PASSWORD_CHANGE", "auth", userId, "Password changed", ""); } catch {}
    return { success: true };
  });
  register("families:update", (id: number, d: any) => security.updateFamily(actor(), id, d));
  register("members:update", (id: number, d: any) => security.updateMember(actor(), id, d));
  register("families:remove", () => { throw new Error("Families cannot be permanently deleted. Archive the family instead."); });
  register("members:remove", () => { throw new Error("Members cannot be permanently deleted. Archive the member instead."); });
  register("marriages:remove", () => { throw new Error("Marriage records cannot be permanently deleted. Correct or revoke the record instead."); });
  register("deaths:remove", () => { throw new Error("Death records cannot be permanently deleted. Correct or revoke the record instead."); });
  register("certificates:remove", () => { throw new Error("Issued certificates cannot be permanently deleted. Revoke the certificate instead."); });
  register("families:create", (d: any) => { actor(); return data.families.create(d); });
  register("members:create", (d: any) => { actor(); return data.members.create(d); });
  register("subscriptions:create", (d: any) => { const a = actor(); return data.subscriptions.create({ ...d, collectedBy: a.id }); });
  register("subscriptions:update", (id: number, d: any) => { actor(); return data.subscriptions.update(id, d); });
  register("subscriptions:remove", () => { admin(); throw new Error("Financial records cannot be permanently deleted. Use a correction/reversal instead."); });
  register("subscriptions:markOverdue", () => { actor(); return data.subscriptions.markOverdue(); });
  register("donations:create", (d: any) => { const a = actor(); return data.donations.create({ ...d, receivedBy: a.id }); });
  register("donations:update", (id: number, d: any) => { actor(); return data.donations.update(id, d); });
  register("donations:remove", () => { admin(); throw new Error("Financial records cannot be permanently deleted. Use a correction/reversal instead."); });
  register("accounting:create", (d: any) => { const a = actor(); return data.accounting.create({ ...d, createdBy: a.id }); });
  register("accounting:update", (id: number, d: any) => { actor(); return data.accounting.update(id, d); });
  register("accounting:remove", () => { admin(); throw new Error("Financial records cannot be permanently deleted. Use a correction/reversal instead."); });
  register("marriages:create", (d: any) => { const a = actor(); return data.marriages.create({ ...d, createdBy: a.id }); });
  register("marriages:update", (id: number, d: any) => { const a = actor(); return data.marriages.update(id, d); });
  register("deaths:create", (d: any) => { const a = actor(); return data.deaths.create({ ...d, createdBy: a.id }); });
  register("deaths:update", (id: number, d: any) => { const a = actor(); return data.deaths.update(id, d); });
  register("welfare:create", (d: any) => { const a = actor(); return data.welfare.create({ ...d, createdBy: a.id }); });
  register("welfare:update", (id: number, d: any) => {
    const a = actor();
    // Sensitive welfare fields (amount_approved, status transitions, family_id)
    // require Administrator. Non-admins may only edit descriptive fields like
    // applicant_name / reason / remarks on a still-Pending request — but to keep the
    // contract simple and safe, route all welfare edits through admin.
    admin();
    return data.welfare.update(id, d);
  });
  register("welfare:remove", () => { admin(); throw new Error("Welfare records cannot be permanently deleted. Correct or revoke the record instead."); });
  register("welfare:list", (filter: any) => { actor(); return data.welfare.list(filter || {}); });
  register("welfare:get", (id: number) => { actor(); return data.welfare.get(id); });
  register("welfare:categories", () => { actor(); return data.welfare.categories(); });
  register("welfare:approve", (id: number, amount: number, remarks: string) => { const a = admin(); return data.welfare.approve(id, amount, remarks, a.id); });
  register("welfare:reject", (id: number, reason: string) => { const a = admin(); return data.welfare.reject(id, reason, a.id); });
  register("welfare:disburse", (id: number) => { const a = admin(); return data.welfare.disburse(id, a.id); });
  register("certificates:issueMembership", (code: string) => data.certificates.issueMembership(code, actor().id));
  register("certificates:issueResidence", (familyNum: string, issuedTo: string) => data.certificates.issueResidence(familyNum, issuedTo, actor().id));
  register("certificates:issueMarriage", (marriageNum: string) => data.certificates.issueMarriage(marriageNum, actor().id));
  register("certificates:issueMarriageNoc", (marriageNum: string) => data.certificates.issueMarriageNoc(marriageNum, actor().id));
  register("certificates:issueDeath", (deathNum: string) => data.certificates.issueDeath(deathNum, actor().id));
  register("users:list", () => { admin(); return data.users.list(); });
  register("users:create", (d: any) => { const a = admin(); validatePassword(String(d?.password ?? "")); return data.users.create(d, a.role); });
  register("users:update", (id: number, d: any) => { admin(); return data.users.update(id, d); });
  register("users:toggleLock", (id: number, locked: boolean) => { admin(); return data.users.toggleLock(id, locked); });
  register("users:resetPassword", (id: number, p: string) => { const a = admin(); validatePassword(p); changePassword(id, p); try { data.audit.log(a.id, a.username, "PASSWORD_RESET", "users", id, "Administrator reset user password", ""); } catch {} return { success: true }; });
  register("users:remove", (id: number) => { admin(); return data.users.remove(id); });
  register("audit:list", (filter: any) => { actor(); return data.audit.list(filter || {}); });
  register("settings:load", () => { actor(); return data.settings.load(); });
  register("settings:save", (d: any) => { const a = admin(); return data.settings.save({ ...d, updatedBy: a.id }); });
  // Read-side IPC guards — every handler below requires an authenticated actor.
  // The renderer-side ProtectedLayout already redirects unauthenticated users to
  // /login, but defence-in-depth: if an attacker drops XSS into the renderer or
  // calls window.mms.* directly from devtools, the main process must still refuse.
  register("families:list", (filter: any) => { actor(); return data.families.list(filter || {}); });
  register("families:get", (id: number) => { actor(); return data.families.get(id); });
  register("members:list", (filter: any) => { actor(); return data.members.list(filter || {}); });
  register("members:get", (id: number) => { actor(); return data.members.get(id); });
  register("members:relationships", () => { actor(); return data.members.relationships(); });
  register("subscriptions:list", (filter: any) => { actor(); return data.subscriptions.list(filter || {}); });
  register("subscriptions:get", (id: number) => { actor(); return data.subscriptions.get(id); });
  register("subscriptions:markOverdue", () => { actor(); return data.subscriptions.markOverdue(); });
  register("subscriptions:totalCollected", () => { actor(); return data.subscriptions.totalCollected(); });
  register("subscriptions:totalPending", () => { actor(); return data.subscriptions.totalPending(); });
  register("subscriptions:plans", () => { actor(); return data.subscriptions.plans(); });
  register("subscriptions:ensureCurrentMonth", () => { actor(); return data.subscriptions.ensureCurrentMonth(); });
  register("donations:list", (filter: any) => { actor(); return data.donations.list(filter || {}); });
  register("donations:get", (id: number) => { actor(); return data.donations.get(id); });
  register("donations:categories", () => { actor(); return data.donations.categories(); });
  register("donations:categoriesAll", () => { actor(); return data.donations.categoriesAll(); });
  register("donations:createCategory", (name: string, description: string) => { admin(); return data.donations.createCategory(name, description); });
  register("donations:updateCategory", (id: number, name: string, description: string) => { admin(); return data.donations.updateCategory(id, name, description); });
  register("donations:setCategoryActive", (id: number, active: boolean) => { admin(); return data.donations.setCategoryActive(id, active); });
  register("donations:removeCategory", (id: number) => { admin(); return data.donations.removeCategory(id); });
  register("donations:memberBalance", (familyId: number, memberId: number) => { actor(); return data.donations.memberBalance(familyId, memberId); });
  register("donations:totalThisMonth", () => { actor(); return data.donations.totalThisMonth(); });
  register("accounting:list", (filter: any) => { actor(); return data.accounting.list(filter || {}); });
  register("accounting:get", (id: number) => { actor(); return data.accounting.get(id); });
  register("accounting:totalIncome", () => { actor(); return data.accounting.totalIncome(); });
  register("accounting:totalExpense", () => { actor(); return data.accounting.totalExpense(); });
  register("accounting:balance", () => { actor(); return data.accounting.balance(); });
  register("marriages:list", (filter: any) => { actor(); return data.marriages.list(filter || {}); });
  register("marriages:get", (id: number) => { actor(); return data.marriages.get(id); });
  register("deaths:list", (filter: any) => { actor(); return data.deaths.list(filter || {}); });
  register("deaths:get", (id: number) => { actor(); return data.deaths.get(id); });
  register("certificates:list", (filter: any) => { actor(); return data.certificates.list(filter || {}); });
  register("dashboard:summary", () => { actor(); return data.dashboard.summary(); });
  register("dashboard:incomeThisMonth", () => { actor(); return data.dashboard.incomeThisMonth(); });
  register("dashboard:expenseThisMonth", () => { actor(); return data.dashboard.expenseThisMonth(); });
  register("dashboard:balance", () => { actor(); return data.dashboard.balance(); });
  register("dashboard:monthlyCollections", (m?: number) => { actor(); return data.dashboard.monthlyCollections(m || 6); });
  register("dashboard:monthlyDonations", (m?: number) => { actor(); return data.dashboard.monthlyDonations(m || 6); });
  register("dashboard:incomeVsExpense", (m?: number) => { actor(); return data.dashboard.incomeVsExpense(m || 6); });
  register("dashboard:recentActivity", (l?: number) => { actor(); return data.dashboard.recentActivity(l || 10); });
  register("tokens:listEvents", () => { actor(); return data.tokens.listEvents(); });
  register("tokens:getEvent", (id: number) => { actor(); return data.tokens.getEvent(id); });
  register("tokens:list", (filter: any) => { actor(); return data.tokens.list(filter || {}); });
  register("tokens:checkExisting", (eventId: number) => { actor(); return Array.from(data.tokens.checkExisting(eventId)); });
  register("tokens:stats", (eventId: number) => { actor(); return data.tokens.stats(eventId); });
  register("tokens:createEvent", (d: any) => { actor(); return data.tokens.createEvent(d); });
  register("tokens:updateEvent", (id: number, d: any) => { actor(); return data.tokens.updateEvent(id, d); });
  register("tokens:generate", (eventId: number, familyIds: number[]) => data.tokens.generate(eventId, familyIds, actor().id));
  register("tokens:collect", (tokenId: number) => data.tokens.collect(tokenId, actor().id));
  register("tokens:cancel", (tokenId: number, reason: string) => { actor(); return data.tokens.cancel(tokenId, reason); });
  register("tokens:replace", (tokenId: number, reason: string) => data.tokens.replace(tokenId, reason, actor().id));
  register("tokens:removeEvent", () => { admin(); throw new Error("Token events cannot be permanently deleted after creation."); });

  // ================= STAFF =================
  // All staff read operations require an authenticated user; archive/restore
  // and salary payments require Administrator (financial impact).
  register("staff:list", (filter: any) => { actor(); return data.staff.list(filter || {}); });
  register("staff:get", (id: number) => { actor(); return data.staff.get(id); });
  register("staff:roles", () => { actor(); return data.staff.roles(); });
  register("staff:create", (d: any) => { const a = actor(); const r = data.staff.create({ ...d, createdBy: a.id }); try { data.audit.log(a.id, a.username, "ADD", "staff", r.id, `Staff ${r.staffCode} created (${d.role || 'Staff'})`, ""); } catch {} return r; });
  register("staff:update", (id: number, d: any) => { const a = actor(); const r = data.staff.update(id, d); try { data.audit.log(a.id, a.username, "EDIT", "staff", id, `Staff updated: ${d.name || ''}`, ""); } catch {} return r; });
  register("staff:archive", (id: number, reason: string) => { const a = admin(); const r = data.staff.archive(id, reason, a.id); try { data.audit.log(a.id, a.username, "ARCHIVE", "staff", id, `Staff archived: ${reason}`, ""); } catch {} return r; });
  register("staff:restore", (id: number) => { const a = admin(); const r = data.staff.restore(id, a.id); try { data.audit.log(a.id, a.username, "RESTORE", "staff", id, `Staff restored`, ""); } catch {} return r; });
  register("staff:history", (id: number) => { actor(); return data.staff.history(id); });
  register("staff:listPayments", (filter: any) => { actor(); return data.staff.listPayments(filter || {}); });
  register("staff:paySalary", (d: any) => { const a = admin(); const r = data.staff.paySalary(d, a.id); try { data.audit.log(a.id, a.username, "PAY_SALARY", "staff", d.staffId, `Salary paid: ${d.amount} for ${d.periodMonth}/${d.periodYear}`, ""); } catch {} return r; });
  register("staff:cancelPayment", (id: number) => { const a = admin(); const r = data.staff.cancelPayment(id); try { data.audit.log(a.id, a.username, "CANCEL_SALARY", "staff_payments", id, `Salary payment cancelled`, ""); } catch {} return r; });
  register("staff:salarySummary", (year?: number) => { actor(); return data.staff.salarySummary(year || new Date().getFullYear()); });
}
