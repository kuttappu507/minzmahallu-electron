/*
 * Shared auth session singleton (split from main.ts, v2.6.3 housekeeping).
 *
 * The logged-in user is MAIN-process state: the login handlers write it, and
 * every secured IPC handler reads it. main.ts used to own this object and
 * hand it to the security layer through closures; after the IPC handlers
 * moved into their own modules (crud-ipc, export-ipc, backup-ipc) those
 * modules need the same live reference — a copied getter would freeze the
 * value at call time. A module-level singleton keeps exactly one session.
 */
import type { Actor } from "./services/security.service.js";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

// eslint-disable-next-line prefer-const — the OBJECT is const; its `user`
// property is deliberately reassignable (login/logout handlers swap it).
export const session: { user: SessionUser | null } = { user: null };

/** The security-layer shape used by security-ipc / receipt-ipc / whatsapp-ipc.
 *  Returns null when nobody is signed in (every secured handler then fails
 *  closed). This is the same accessor main.ts used to build inline. */
export function getActor(): Actor | null {
  return session.user ? { id: session.user.id, username: session.user.username, role: session.user.role } : null;
}

/** Accessor signature every window-needing IPC module receives from main.ts
 *  (handlers must never cache a BrowserWindow reference — it can be destroyed
 *  and recreated by the activate/second-instance revival paths). */
export type GetWindow = () => import("electron").BrowserWindow | null;
