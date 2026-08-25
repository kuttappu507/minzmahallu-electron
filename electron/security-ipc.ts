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
  register("welfare:update", (id: number, d: any) => { const a = actor(); return data.welfare.update(id, d); });
  register("welfare:approve", (id: number, amount: number, remarks: string) => { const a = admin(); return data.welfare.approve(id, amount, remarks, a.id); });
  register("welfare:reject", (id: number, reason: string) => { const a = admin(); return data.welfare.reject(id, reason, a.id); });
  register("welfare:disburse", (id: number) => { const a = admin(); return data.welfare.disburse(id, a.id); });
  register("welfare:remove", () => { admin(); throw new Error("Welfare records cannot be permanently deleted. Correct or revoke the record instead."); });
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
  register("settings:save", (d: any) => { const a = admin(); return data.settings.save({ ...d, updatedBy: a.id }); });
  register("tokens:createEvent", (d: any) => { actor(); return data.tokens.createEvent(d); });
  register("tokens:updateEvent", (id: number, d: any) => { actor(); return data.tokens.updateEvent(id, d); });
  register("tokens:generate", (eventId: number, familyIds: number[]) => data.tokens.generate(eventId, familyIds, actor().id));
  register("tokens:collect", (tokenId: number) => data.tokens.collect(tokenId, actor().id));
  register("tokens:cancel", (tokenId: number, reason: string) => { actor(); return data.tokens.cancel(tokenId, reason); });
  register("tokens:replace", (tokenId: number, reason: string) => data.tokens.replace(tokenId, reason, actor().id));
  register("tokens:removeEvent", () => { admin(); throw new Error("Token events cannot be permanently deleted after creation."); });
}
