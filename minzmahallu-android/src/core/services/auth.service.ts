/* ============================================================================
 * Authentication — identical rules and identical stored-hash format to the
 * desktop build; only the crypto backend changed.
 *
 *   · PBKDF2-HMAC-SHA256, 200 000 iterations, 32-byte key, random 16-byte salt,
 *     stored as `pbkdf2_sha256$200000$<salt b64>$<hash b64>` — the exact string
 *     a desktop installation writes, so a restored backup still logs in.
 *   · Hashing is async on Android (WebCrypto derives the bits in native code);
 *     verification stays constant-time.
 *   · 5 failed attempts lock the account for 15 minutes.
 *   · There is NO default password: an install whose only account still carries
 *     one of the publicly-known demo hashes is forced through first-run setup.
 * ========================================================================== */
import { one, run, scalar } from "../db/connection.js";
import { fromBase64, pbkdf2Sha256, randomBytes, toBase64, timingSafeEqual } from "../platform/crypto.js";

interface UserRow {
  id: number; username: string; full_name: string; password_hash: string; password_salt: string;
  role: string; is_active: number; is_locked: number; failed_attempts: number; locked_until: string | null;
  must_change_pwd: number;
}
export interface AuthUser {
  id: number; username: string; fullName: string; role: string;
  isActive: boolean; mustChangePwd: boolean; initials: string;
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
globals.__mmsClearActor = () => { currentActor = null; currentUser = null; };

// Hashes of administrator credentials whose plaintext was publicly committed to
// the repository by the old demo seed. An install whose ONLY account is one of
// these must run initial setup instead of accepting a password anyone can read
// from the source. (Unchanged from the desktop build — the strings are hashes,
// never plaintext.)
const SEEDED_ADMIN_HASHES = [
  "pbkdf2_sha256$200000$c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=$dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=", // old placeholder: admin123
  "pbkdf2_sha256$200000$zRLKI0xyc2sYKBzQaWXl6w==$qHO4yvos81/Oah+ECzVbh1ZHPz3rEhRHOJT2criWCPg=", // published demo: Admin@2026
];

function parseStoredHash(stored: string) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return null;
  const iterations = parseInt(parts[1], 10);
  const salt = fromBase64(parts[2]);
  const hash = fromBase64(parts[3]);
  return Number.isFinite(iterations) && iterations > 0 && salt.length && hash.length ? { iterations, salt, hash } : null;
}

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  try {
    const derived = await pbkdf2Sha256(plain, parsed.salt, parsed.iterations, parsed.hash.length);
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

function makeInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].substring(0, 1).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function seededAdmin(): UserRow | undefined {
  return one<UserRow>(
    `SELECT id,username,full_name,password_hash,password_salt,role,is_active,is_locked,failed_attempts,locked_until,must_change_pwd
       FROM users WHERE id=1 AND username='admin' AND password_hash IN (${SEEDED_ADMIN_HASHES.map(() => "?").join(",")})`,
    SEEDED_ADMIN_HASHES
  );
}

export function validatePassword(password: string): void {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include uppercase, lowercase, digit, and special character");
  }
}

async function hashPassword(password: string): Promise<{ stored: string; salt: string }> {
  validatePassword(password);
  const salt = randomBytes(16);
  const iterations = 200000;
  const hash = await pbkdf2Sha256(password, salt, iterations, 32);
  return {
    stored: `pbkdf2_sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`,
    salt: toBase64(salt),
  };
}

/** Shared password-hashing helper (single source of truth for auth + users). */
export async function hashPasswordForStorage(password: string): Promise<{ stored: string; salt: string }> {
  return hashPassword(password);
}

export function needsInitialSetup(): boolean {
  const count = Number(scalar<number>("SELECT COUNT(*) FROM users") || 0);
  return count === 0 || (!!seededAdmin() && count === 1);
}

export async function createInitialAdministrator(username: string, fullName: string, password: string): Promise<AuthUser> {
  if (!needsInitialSetup()) throw new Error("Initial setup has already been completed");
  username = String(username || "").trim();
  fullName = String(fullName || "").trim();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3-32 characters and contain only letters, numbers, dot, underscore or hyphen");
  }
  if (!fullName) throw new Error("Full name is required");
  const { stored, salt } = await hashPassword(password);
  const placeholder = seededAdmin();
  const result = placeholder
    ? run(
        "UPDATE users SET username=?,full_name=?,password_hash=?,password_salt=?,role='Administrator',is_active=1,is_locked=0,failed_attempts=0,locked_until=NULL,must_change_pwd=0,updated_at=datetime('now') WHERE id=?",
        [username, fullName, stored, salt, placeholder.id]
      )
    : run(
        "INSERT INTO users (username,full_name,password_hash,password_salt,role,is_active,is_locked,failed_attempts,must_change_pwd) VALUES (?,?,?,?, 'Administrator',1,0,0,0)",
        [username, fullName, stored, salt]
      );
  const id = placeholder?.id ?? result.id;
  const user: AuthUser = { id, username, fullName, role: "Administrator", isActive: true, mustChangePwd: false, initials: makeInitials(fullName) };
  currentActor = { id: user.id, username: user.username, role: user.role };
  currentUser = user;
  return user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  if (!username || !password) throw new Error("Username and password are required");
  if (needsInitialSetup()) throw new Error("Initial account setup is required");
  const user = one<UserRow>(
    `SELECT id,username,full_name,password_hash,password_salt,role,is_active,is_locked,failed_attempts,locked_until,must_change_pwd FROM users WHERE username = ?`,
    [username.trim()]
  );
  if (!user) throw new Error("Invalid username or password");
  if (!user.is_active) throw new Error("Account is inactive — contact administrator");
  if (user.is_locked) {
    if (!user.locked_until) throw new Error("Account is locked — contact administrator");
    const until = new Date(user.locked_until.replace(" ", "T") + (user.locked_until.includes("Z") ? "" : "Z"));
    if (!Number.isNaN(until.getTime()) && until > new Date()) throw new Error("Too many failed login attempts — try again later");
    run("UPDATE users SET is_locked=0,locked_until=NULL,failed_attempts=0 WHERE id=?", [user.id]);
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    const attempts = (user.failed_attempts || 0) + 1;
    if (attempts >= 5) {
      run("UPDATE users SET failed_attempts=?,is_locked=1,locked_until=datetime('now','+15 minutes'),updated_at=datetime('now') WHERE id=?", [attempts, user.id]);
    } else {
      run("UPDATE users SET failed_attempts=?,updated_at=datetime('now') WHERE id=?", [attempts, user.id]);
    }
    throw new Error("Invalid username or password");
  }
  run("UPDATE users SET last_login_at=datetime('now'),failed_attempts=0,is_locked=0,locked_until=NULL,updated_at=datetime('now') WHERE id=?", [user.id]);
  currentActor = { id: user.id, username: user.username, role: user.role };
  currentUser = {
    id: user.id, username: user.username, fullName: user.full_name, role: user.role,
    isActive: !!user.is_active, mustChangePwd: !!user.must_change_pwd, initials: makeInitials(user.full_name),
  };
  return currentUser;
}

export async function changePassword(userId: number, newPassword: string): Promise<void> {
  if (!currentActor) throw new Error("Authentication is required");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("Invalid user");
  if (currentActor.id !== userId && currentActor.role !== "Administrator") throw new Error("You can only change your own password");
  const target = one<{ id: number; is_active: number }>("SELECT id,is_active FROM users WHERE id=?", [userId]);
  if (!target) throw new Error("User not found");
  if (!target.is_active) throw new Error("Cannot change the password of an inactive user");
  const { stored, salt } = await hashPassword(newPassword);
  run("UPDATE users SET password_hash=?,password_salt=?,must_change_pwd=0,failed_attempts=0,is_locked=0,locked_until=NULL,updated_at=datetime('now') WHERE id=?", [stored, salt, userId]);
}

/** Re-authentication for sensitive actions: verifies the PASSWORD of the
 *  CURRENTLY logged-in administrator before cancellations, disbursements,
 *  resignations and edits of official records. */
export async function verifyCurrentActorPassword(password: string): Promise<{ id: number; username: string; role: string }> {
  if (!currentActor) throw new Error("Authentication is required");
  if (currentActor.role !== "Administrator") throw new Error("Administrator permission is required for this operation");
  if (!password) throw new Error("Administrator password is required");
  const user = one<UserRow>("SELECT id,username,full_name,password_hash,password_salt,role,is_active,is_locked FROM users WHERE id=?", [currentActor.id]);
  if (!user) throw new Error("User not found");
  if (!user.is_active) throw new Error("Account is inactive — contact administrator");
  if (user.is_locked) throw new Error("Account is locked — contact administrator");
  if (!(await verifyPassword(password, user.password_hash))) throw new Error("Incorrect administrator password");
  return { id: user.id, username: user.username, role: user.role };
}

/** Re-check a password against a stored hash (used by the boot-time security
 *  audit; exported so the same verification path is shared everywhere). */
export async function verifyStoredPassword(plain: string, stored: string): Promise<boolean> {
  return verifyPassword(plain, stored);
}

export function currentActorContext(): ActorContext | null {
  return currentActor;
}
export function setActorContext(actor: ActorContext | null, user: AuthUser | null): void {
  currentActor = actor;
  currentUser = user;
}
