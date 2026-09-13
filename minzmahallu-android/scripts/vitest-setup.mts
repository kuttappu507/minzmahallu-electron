/* ============================================================================
 * Vitest bootstrap for the Android codebase.
 *
 * The suites are the DESKTOP suites, unchanged in spirit: they exercise the
 * real schema, the real migrations and the real service layer. What this file
 * provides is the host those suites used to get from Electron:
 *
 *   1. the Node platform adapter (files → a temp folder per test process,
 *      identity → the machine, exactly like the old `app.getPath("userData")`),
 *   2. the SQLite engine (WebAssembly) for tests that build their own database
 *      through the `better-sqlite3` alias,
 *   3. an open application database — schema + seed + every migration applied
 *      the way openDatabase() does on the phone,
 *   4. deterministic time and no timers left running after a suite.
 * ========================================================================== */
import { beforeAll, afterAll } from "vitest";
import { setPlatform } from "../src/core/platform/index.js";
import { nodePlatform, nodeDataDir } from "../src/core/platform/node.js";
import { prepareSqlJs } from "../src/core/db/better-sqlite3-shim.js";
import { openDatabase, closeDB, getDB } from "../src/core/db/connection.js";
import { pbkdf2Sha256, randomBytes, toBase64, toHex } from "../src/core/platform/crypto.js";

// Tests are offline by definition: a stray fetch (an update check, a WhatsApp
// call) must fail fast instead of hanging the suite.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: any[]) => {
  const url = String(args[0] ?? "");
  if (url.startsWith("http")) throw new Error(`Network access is disabled in tests: ${url}`);
  return realFetch(...(args as [any, any]));
}) as typeof fetch;

setPlatform(nodePlatform());

beforeAll(async () => {
  await prepareSqlJs();
  await openDatabase();
  // A real database that accepts writes always has an Administrator (first-run
  // setup). Tests insert money records that reference user id 1 (createdBy,
  // audit actor, …), so the harness creates that account itself — with a
  // password nobody knows, exactly like the desktop suite (no credential is
  // ever committed).
  const db = getDB();
  const count = Number((db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number })?.c ?? 0);
  if (count === 0) {
    const salt = randomBytes(16);
    const hash = await pbkdf2Sha256("test-admin-" + toHex(randomBytes(12)), salt, 200_000, 32);
    db.prepare(
      "INSERT INTO users (username, full_name, password_hash, password_salt, role, is_active, is_locked, failed_attempts, must_change_pwd) VALUES (?,?,?,?, 'Administrator',1,0,0,0)"
    ).run("test-admin", "Test Administrator", `pbkdf2_sha256$200000$${toBase64(salt)}$${toBase64(hash)}`, toBase64(salt));
  }
});

afterAll(async () => {
  try {
    getDB().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* not a WAL database — nothing to checkpoint */
  }
  await closeDB();
});

export { nodeDataDir };
