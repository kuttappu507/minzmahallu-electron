import { ipcMain } from "electron";
import { security, type Actor } from "./services/security.service.js";

type ActorProvider = () => Actor | null;

function register(name: string, handler: (...args: any[]) => any) {
  try { ipcMain.removeHandler(name); } catch {}
  ipcMain.handle(name, async (_event, ...args) => handler(...args));
}

/**
 * Registers the protected record operations using the main-process session as
 * the sole source of authority. The renderer can never supply an actor.
 */
export function registerSecurityIpc(getActor: ActorProvider) {
  const actor = (): Actor => {
    const current = getActor();
    if (!current) throw new Error("Authentication is required for this operation");
    return current;
  };

  register("families:update", (id: number, data: any) => security.updateFamily(actor(), id, data));
  register("members:update", (id: number, data: any) => security.updateMember(actor(), id, data));

  // Protected records have no permanent-delete route.
  register("families:remove", () => { throw new Error("Families cannot be permanently deleted. Archive the family instead."); });
  register("members:remove", () => { throw new Error("Members cannot be permanently deleted. Archive the member instead."); });

  register("security:archiveFamily", (id: number, reason: string) => security.archiveFamily(actor(), id, reason));
  register("security:restoreFamily", (id: number, reason?: string) => security.restoreFamily(actor(), id, reason || ""));
  register("security:archiveMember", (id: number, reason: string) => security.archiveMember(actor(), id, reason));
  register("security:restoreMember", (id: number, reason?: string) => security.restoreMember(actor(), id, reason || ""));
  register("security:familyHistory", (id: number, limit?: number) => security.history("family", id, limit || 100));
  register("security:memberHistory", (id: number, limit?: number) => security.history("member", id, limit || 100));
  register("security:memberMoveHistory", (id: number) => security.familyMoveHistory(id));
  register("security:moveMembers", (ids: number[], familyId: number, reason: string, moveType?: "ExistingFamily" | "NewFamily") =>
    security.moveMembers(actor(), ids, familyId, reason, moveType || "ExistingFamily")
  );
  register("security:createFamilyFromMembers", (ids: number[], familyData: any, headMemberId: number, reason: string) =>
    security.createFamilyFromMembers(actor(), ids, familyData, headMemberId, reason)
  );
}
