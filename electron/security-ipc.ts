import { app, ipcMain } from "electron";
import { security, type Actor } from "./services/security.service.js";

type ActorProvider = () => Actor | null;
type UserProvider = () => unknown;

function actor(): Actor {
  const provider = (globalThis as typeof globalThis & { __mmsGetActor?: ActorProvider }).__mmsGetActor;
  const current = provider?.();
  if (!current) throw new Error("Authentication is required for this operation");
  return current;
}

function register(name: string, handler: (...args: any[]) => any) {
  try { ipcMain.removeHandler(name); } catch {}
  ipcMain.handle(name, async (_event, ...args) => handler(...args));
}

export function registerSecurityIpc() {
  register("families:update", (id: number, data: any) => security.updateFamily(actor(), id, data));
  register("members:update", (id: number, data: any) => security.updateMember(actor(), id, data));

  // Protected records have no permanent-delete route.
  register("families:remove", () => { throw new Error("Families cannot be permanently deleted. Archive the family instead."); });
  register("members:remove", () => { throw new Error("Members cannot be permanently deleted. Archive the member instead."); });

  register("security:archiveFamily", (id: number, reason: string) => security.archiveFamily(actor(), id, reason));
  register("security:restoreFamily", (id: number, reason?: string) => security.restoreFamily(actor(), id, reason || ""));
  register("security:archiveMember", (id: number, reason: string) => security.archiveMember(actor(), id, reason));
  register("security:restoreMember", (id: number, reason?: string) => security.restoreMember(actor(), id, reason || ""));
  register("security:familyHistory", (id: number, limit?: number) => {
    actor();
    return security.history("family", id, limit || 100);
  });
  register("security:memberHistory", (id: number, limit?: number) => {
    actor();
    return security.history("member", id, limit || 100);
  });
  register("security:memberMoveHistory", (id: number) => {
    actor();
    return security.familyMoveHistory(id);
  });
  register("security:moveMembers", (ids: number[], familyId: number, reason: string, moveType?: "ExistingFamily" | "NewFamily") =>
    security.moveMembers(actor(), ids, familyId, reason, moveType || "ExistingFamily")
  );
  register("security:createFamilyFromMembers", (ids: number[], familyData: any, headMemberId: number, reason: string) =>
    security.createFamilyFromMembers(actor(), ids, familyData, headMemberId, reason)
  );
}

// main.ts registers its legacy IPC handlers in app.whenReady(). This bootstrap
// runs after those handlers have been registered and replaces the protected routes.
app.whenReady().then(() => {
  setImmediate(() => {
    registerSecurityIpc();

    try { ipcMain.removeHandler("auth:currentUser"); } catch {}
    ipcMain.handle("auth:currentUser", () => {
      const provider = (globalThis as typeof globalThis & { __mmsGetUser?: UserProvider }).__mmsGetUser;
      return provider?.() ?? null;
    });

    try { ipcMain.removeHandler("auth:logout"); } catch {}
    ipcMain.handle("auth:logout", () => {
      const clear = (globalThis as typeof globalThis & { __mmsClearActor?: () => void }).__mmsClearActor;
      clear?.();
      return { success: true };
    });
  });
});
