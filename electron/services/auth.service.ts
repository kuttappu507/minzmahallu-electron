import crypto from "node:crypto";
import { one, run } from "../db/connection.js";
import "../security-ipc.js";

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  role: string;
  is_active: number;
  must_change_pwd: number;
}

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  mustChangePwd: boolean;
  initials: string;
}

type ActorContext = { id: number; username: string; role: string };
let currentActor: ActorContext | null = null;

const actorGlobals = globalThis as typeof globalThis & {
  __mmsGetActor?: () => ActorContext | null;
  __mmsClearActor?: () => void;
};
actorGlobals.__mmsGetActor = () => currentActor;
actorGlobals.__mmsClearActor = () => { currentActor = null; };

function parseStoredHash(stored: string): { iter: number; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 4) {
    console.error(`[auth] Invalid hash format (parts: ${parts.length})`);
    return null;
  }
  if (parts[0] !== "pbkdf2_sha256") {
    console.error(`[auth] Unknown hash algorithm: ${parts[0]}`);
    return null;
  }
  const iter = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], "base64");
  const hash = Buffer.from(parts[3], "base64");
  return { iter, salt, hash };
}

function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  const { iter, salt, hash } = parsed;
  try {
    const derived = crypto.pbkdf2Sync(plainPassword, salt, iter, hash.length, "sha256");
    if (derived.length !== hash.length) return false;
    return crypto.timingSafeEqual(derived, hash);
  } catch (err) {
    console.error("[auth] Password verification failed:", err);
    return false;
  }
}

function makeInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function login(username: string, password: string): AuthUser {
  if (!username || !password) throw new Error("Username and password are required");

  const user = one<UserRow>(
    "SELECT id, username, full_name, password_hash, password_salt, role, is_active, must_change_pwd FROM users WHERE username = ?",
    [username]
  );
  if (!user) throw new Error("Invalid username or password");
  if (!user.is_active) throw new Error("Account is inactive — contact administrator");
  if (!verifyPassword(password, user.password_hash)) throw new Error("Invalid username or password");

  try { run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]); } catch (err) {
    console.warn("[auth] Could not update last_login:", err);
  }

  currentActor = { id: user.id, username: user.username, role: user.role };

  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    isActive: !!user.is_active,
    mustChangePwd: !!user.must_change_pwd,
    initials: makeInitials(user.full_name),
  };
}

export function changePassword(userId: number, newPassword: string): void {
  if (!newPassword || newPassword.length < 8) throw new Error("Password must be at least 8 characters");
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw new Error("Password must include uppercase, lowercase, digit, and special character");
  }
  const salt = crypto.randomBytes(16);
  const iter = 200000;
  const hash = crypto.pbkdf2Sync(newPassword, salt, iter, 32, "sha256");
  const stored = `pbkdf2_sha256$${iter}$${salt.toString("base64")}$${hash.toString("base64")}`;
  run("UPDATE users SET password_hash = ?, password_salt = ?, must_change_pwd = 0 WHERE id = ?", [stored, salt.toString("base64"), userId]);
}
