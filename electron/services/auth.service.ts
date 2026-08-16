import crypto from "node:crypto";
import { one, run } from "../db/connection.js";

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  role: string;
  is_active: number;
  is_locked: number;
  failed_attempts: number;
  locked_until: string | null;
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
let currentUser: AuthUser | null = null;

const globals = globalThis as typeof globalThis & {
  __mmsGetActor?: () => ActorContext | null;
  __mmsGetUser?: () => AuthUser | null;
  __mmsClearActor?: () => void;
};
globals.__mmsGetActor = () => currentActor;
globals.__mmsGetUser = () => currentUser;
globals.__mmsClearActor = () => {
  currentActor = null;
  currentUser = null;
};

function parseStoredHash(stored: string): { iter: number; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return null;
  const iter = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], "base64");
  const hash = Buffer.from(parts[3], "base64");
  if (!Number.isFinite(iter) || iter <= 0 || !salt.length || !hash.length) return null;
  return { iter, salt, hash };
}

function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  try {
    const derived = crypto.pbkdf2Sync(plainPassword, parsed.salt, parsed.iter, parsed.hash.length, "sha256");
    return derived.length === parsed.hash.length && crypto.timingSafeEqual(derived, parsed.hash);
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
    `SELECT id, username, full_name, password_hash, password_salt, role,
            is_active, is_locked, failed_attempts, locked_until, must_change_pwd
     FROM users WHERE username = ?`,
    [username.trim()]
  );

  if (!user) throw new Error("Invalid username or password");
  if (!user.is_active) throw new Error("Account is inactive — contact administrator");

  // A manual lock has no expiry. A failed-login lock expires after 15 minutes.
  if (user.is_locked) {
    if (!user.locked_until) throw new Error("Account is locked — contact administrator");
    const lockedUntil = new Date(user.locked_until.replace(" ", "T") + (user.locked_until.includes("Z") ? "" : "Z"));
    if (!Number.isNaN(lockedUntil.getTime()) && lockedUntil > new Date()) {
      throw new Error("Too many failed login attempts — try again later");
    }
    // Temporary lock has expired; allow this attempt and reset its counter below.
    run("UPDATE users SET is_locked = 0, locked_until = NULL, failed_attempts = 0 WHERE id = ?", [user.id]);
  }

  if (!verifyPassword(password, user.password_hash)) {
    const attempts = (user.failed_attempts || 0) + 1;
    if (attempts >= 5) {
      run(
        "UPDATE users SET failed_attempts = ?, is_locked = 1, locked_until = datetime('now', '+15 minutes'), updated_at = datetime('now') WHERE id = ?",
        [attempts, user.id]
      );
    } else {
      run("UPDATE users SET failed_attempts = ?, updated_at = datetime('now') WHERE id = ?", [attempts, user.id]);
    }
    throw new Error("Invalid username or password");
  }

  run(
    "UPDATE users SET last_login_at = datetime('now'), failed_attempts = 0, is_locked = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    [user.id]
  );

  currentActor = { id: user.id, username: user.username, role: user.role };
  currentUser = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    isActive: !!user.is_active,
    mustChangePwd: !!user.must_change_pwd,
    initials: makeInitials(user.full_name),
  };

  return currentUser;
}

export function changePassword(userId: number, newPassword: string): void {
  if (!currentActor) throw new Error("Authentication is required");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Invalid user");
  if (currentActor.id !== userId && currentActor.role !== "Administrator") {
    throw new Error("You can only change your own password");
  }
  if (!newPassword || newPassword.length < 8) throw new Error("Password must be at least 8 characters");
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw new Error("Password must include uppercase, lowercase, digit, and special character");
  }

  const target = one<{ id: number; is_active: number }>("SELECT id, is_active FROM users WHERE id = ?", [userId]);
  if (!target) throw new Error("User not found");
  if (!target.is_active) throw new Error("Cannot change the password of an inactive user");

  const salt = crypto.randomBytes(16);
  const iter = 200000;
  const hash = crypto.pbkdf2Sync(newPassword, salt, iter, 32, "sha256");
  const stored = `pbkdf2_sha256$${iter}$${salt.toString("base64")}$${hash.toString("base64")}`;
  run(
    "UPDATE users SET password_hash = ?, password_salt = ?, must_change_pwd = 0, failed_attempts = 0, is_locked = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    [stored, salt.toString("base64"), userId]
  );
}
