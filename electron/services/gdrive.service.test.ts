import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createGDrive } from "./gdrive.service.js";

/*
 * Full offline tests for the Google Drive backup service. A local HTTP server
 * impersonates every Google endpoint (token, userinfo, drive, upload), and the
 * injected openExternal "browser" is a stub — the test drives the loopback
 * redirect directly, so the complete OAuth+PKCE+upload+prune flow runs with
 * zero network access.
 */

// Same file format as real .mmbak files (header + manifest + payload).
function makeFakeBackup(file: string, payload = "demo-payload") {
  const manifest = Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), size: Buffer.byteLength(payload), sha256: "x" }), "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(manifest.length, 0);
  header.writeUInt32BE(0x4d4d5342, 4);
  fs.writeFileSync(file, Buffer.concat([header, manifest, Buffer.from(payload)]));
}

async function waitFor(fn: () => boolean, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("waitFor timeout");
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// Parse the multipart/related body the service builds (metadata JSON + bytes).
function parseMultipart(raw: Buffer, boundary: string) {
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let idx = raw.indexOf(delim);
  while (idx !== -1) {
    const next = raw.indexOf(delim, idx + delim.length);
    if (next === -1) { parts.push(raw.subarray(idx + delim.length)); break; }
    parts.push(raw.subarray(idx + delim.length, next));
    idx = next;
  }
  const jsonPart = parts[0] ?? Buffer.alloc(0);
  const jsonStart = jsonPart.indexOf("\r\n\r\n");
  const meta = JSON.parse(jsonPart.subarray(jsonStart + 4).toString("utf8").trim());
  const bytesPart = parts[1] ?? Buffer.alloc(0);
  const bytesStart = bytesPart.indexOf("\r\n\r\n");
  const bytes = bytesPart.subarray(bytesStart + 4);
  // strip the trailing \r\n before the closing boundary
  const trailing = bytes.subarray(0, bytes.length >= 2 ? bytes.length - 2 : 0);
  return { meta, bytes: trailing };
}

type FakeState = {
  folders: { id: string; name: string }[];
  filesInFolder: { id: string; name: string; createdTime: string }[];
  uploads: { name: string; bytes: Buffer }[];
  deletes: string[];
  tokens: Record<string, string>[];
  invalidGrant: boolean;
  denyBearer: string | null;
  refreshTokenValue: string;
  accessCounter: number;
};

function startFakeGoogle() {
  const state: FakeState = {
    folders: [], filesInFolder: [], uploads: [], deletes: [], tokens: [],
    invalidGrant: false, denyBearer: null, refreshTokenValue: "REF1", accessCounter: 0,
  };
  let seq = 0;
  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";
    const auth = req.headers["authorization"] || "";
    // Simulate an expired access token: the fake 401s it, the service must
    // refresh and retry (a second refresh then mints a fresh token).
    const deny = state.denyBearer;
    if (deny && auth === `Bearer ${deny}` && (url.startsWith("/drive") || url.startsWith("/upload"))) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_token" }));
      return;
    }
    if (req.method === "POST" && url === "/token") {
      const body = (await readBody(req)).toString("utf8");
      const params: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(body)) params[k] = v;
      state.tokens.push(params);
      if (params.grant_type === "authorization_code") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: "ACC1", refresh_token: state.refreshTokenValue, expires_in: 3600, scope: "openid email drive.file" }));
        return;
      }
      // refresh_token grant
      if (state.invalidGrant || params.refresh_token !== state.refreshTokenValue) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }
      state.accessCounter += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: `ACC${1 + state.accessCounter}`, expires_in: 3600 }));
      return;
    }
    if (url === "/v1/userinfo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ email: "mahallu@example.com" }));
      return;
    }
    if (req.method === "GET" && url.startsWith("/drive/v3/files")) {
      const q = decodeURIComponent(new URL(url, "http://x").searchParams.get("q") || "");
      if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ files: state.folders }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ files: state.filesInFolder })); // caller expects sorted desc
      return;
    }
    if (req.method === "POST" && url.startsWith("/drive/v3/files")) {
      const json = JSON.parse((await readBody(req)).toString("utf8"));
      if (json.mimeType === "application/vnd.google-apps.folder") {
        const folder = { id: `FOLDER-${++seq}`, name: json.name };
        state.folders.push(folder);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(folder));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `OBJ-${++seq}` }));
      return;
    }
    if (req.method === "POST" && url.startsWith("/upload/drive/v3/files")) {
      const contentType = req.headers["content-type"] || "";
      const boundary = /boundary=(.+)$/.exec(contentType)?.[1] || "";
      const raw = await readBody(req);
      const { meta, bytes } = parseMultipart(raw, boundary);
      state.uploads.push({ name: meta.name, bytes });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `FILE-${++seq}`, name: meta.name }));
      return;
    }
    if (req.method === "DELETE" && url.startsWith("/drive/v3/files/")) {
      state.deletes.push(url.split("/").pop() || "");
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise<{ state: FakeState; url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        state,
        url: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("google drive backup service", () => {
  let userData: string;
  let fake: Awaited<ReturnType<typeof startFakeGoogle>>;
  let seenUrls: string[];
  let svc: ReturnType<typeof createGDrive>;
  let secretStore: { available: () => boolean; encrypt: (s: string) => Buffer; decrypt: (b: Buffer) => string };

  const buildService = (opts: { clientId?: string; secretAvailable?: boolean; timeout?: number } = {}) => {
    secretStore = {
      available: () => opts.secretAvailable ?? true,
      encrypt: (s: string) => Buffer.from("enc:" + s, "utf8"),
      decrypt: (b: Buffer) => b.toString("utf8").slice(4),
    };
    seenUrls = [];
    svc = createGDrive({
      getUserData: () => userData,
      getConfig: () => ({ clientId: opts.clientId ?? "CID-123", clientSecret: "SECRET-456", folderName: "MMS-Backups" }),
      secretStore,
      openExternal: async (u: string) => { seenUrls.push(u); },
      endpoints: {
        accountsBase: fake.url, authBase: fake.url, userinfoBase: `${fake.url}/v1`,
        driveBase: `${fake.url}/drive/v3`, uploadBase: `${fake.url}/upload/drive/v3`,
      },
      connectTimeoutMs: opts.timeout,
    });
  };

  beforeEach(async () => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "mms-gdrive-test-"));
    fake = await startFakeGoogle();
    buildService();
  });
  afterEach(async () => {
    await fake.close();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  /** Runs the full connect() flow: stub browser, drive the loopback redirect. */
  async function connectNow() {
    const p = svc.connect();
    await waitFor(() => seenUrls.length === 1);
    const authUrl = new URL(seenUrls[0]);
    const state = authUrl.searchParams.get("state");
    const res = await fetch(`${authUrl.searchParams.get("redirect_uri")}?code=CODE1&state=${state}`);
    if (res.status !== 200) throw new Error("loopback redirect failed");
    return p;
  }

  it("connects via the loopback OAuth+PKCE flow and stores an encrypted refresh token", async () => {
    const r = await connectNow();
    expect(r.success).toBe(true);
    expect(r.email).toBe("mahallu@example.com");
    // The auth URL carried PKCE + least-privilege scope + loopback redirect.
    const authUrl = new URL(seenUrls[0]);
    expect(authUrl.pathname).toBe("/o/oauth2/v2/auth");
    expect(authUrl.searchParams.get("client_id")).toBe("CID-123");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(authUrl.searchParams.get("scope")).toContain("drive.file");
    expect(authUrl.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // The code exchange carried the verifier + client secret.
    const exchange = fake.state.tokens.find((t) => t.grant_type === "authorization_code");
    expect(exchange?.code).toBe("CODE1");
    expect(exchange?.code_verifier).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(exchange?.client_secret).toBe("SECRET-456");
    // The token file is encrypted (fake store prefixes "enc:").
    const raw = fs.readFileSync(path.join(userData, "gdrive-token.bin"), "utf8");
    expect(raw.startsWith("enc:")).toBe(true);
    expect(svc.getStatus()).toMatchObject({ configured: true, connected: true, email: "mahallu@example.com", folderName: "MMS-Backups" });
  });

  it("rejects a redirect with a mismatched state and never exchanges the code", async () => {
    const p = svc.connect();
    await waitFor(() => seenUrls.length === 1);
    const authUrl = new URL(seenUrls[0]);
    const res = await fetch(`${authUrl.searchParams.get("redirect_uri")}?code=CODE1&state=WRONG-STATE`);
    expect(res.status).toBe(400);
    const r = await p;
    expect(r.success).toBe(false);
    expect(r.error).toContain("state");
    expect(fake.state.tokens.length).toBe(0);
    expect(svc.getStatus().connected).toBe(false);
  });

  it("times out when the browser never completes the consent", async () => {
    buildService({ timeout: 150 });
    const r = await svc.connect();
    expect(r.success).toBe(false);
    expect(r.error).toContain("timeout");
  });

  it("refuses to connect without a configured client id, without opening a browser", async () => {
    buildService({ clientId: "" });
    const r = await svc.connect();
    expect(r.success).toBe(false);
    expect(r.error).toContain("not configured");
    expect(seenUrls.length).toBe(0);
  });

  it("refuses to connect when OS secure storage is unavailable", async () => {
    buildService({ secretAvailable: false });
    const r = await svc.connect();
    expect(r.success).toBe(false);
    expect(r.error).toContain("secure storage");
    expect(seenUrls.length).toBe(0);
  });

  it("creates the folder, uploads byte-identical backups, and records status", async () => {
    await connectNow();
    const src = path.join(userData, "backup-auto-2026-09-05-10-00-00.mmbak");
    makeFakeBackup(src, "payload-abc-123");
    const up = await svc.uploadBackupFile(src);
    expect(up.ok).toBe(true);
    expect(up.name).toBe("backup-auto-2026-09-05-10-00-00.mmbak");
    expect(fake.state.folders.map((f) => f.name)).toContain("MMS-Backups");
    expect(fake.state.uploads.length).toBe(1);
    expect(fake.state.uploads[0].bytes.equals(fs.readFileSync(src))).toBe(true);
    expect(svc.getStatus().lastUploadAt).toBeTruthy();
    expect(svc.getStatus().lastUploadName).toBe("backup-auto-2026-09-05-10-00-00.mmbak");
    expect(svc.getStatus().lastError).toBeNull();
  });

  it("retries with a refreshed access token after a 401", async () => {
    await connectNow();
    fake.state.denyBearer = "ACC1"; // the token cached from connect is now stale
    const src = path.join(userData, "backup-auto-2026-09-05-11-00-00.mmbak");
    makeFakeBackup(src);
    const up = await svc.uploadBackupFile(src);
    expect(up.ok).toBe(true);
    expect(fake.state.tokens.some((t) => t.grant_type === "refresh_token")).toBe(true);
    expect(fake.state.uploads.length).toBe(1);
  });

  it("clears the connection when Google invalidates the refresh token (revoked access)", async () => {
    await connectNow();
    fake.state.denyBearer = "ACC1";
    fake.state.invalidGrant = true;
    const src = path.join(userData, "backup-auto-2026-09-05-12-00-00.mmbak");
    makeFakeBackup(src);
    const up = await svc.uploadBackupFile(src);
    expect(up.ok).toBe(false);
    expect(up.error).toContain("reconnect");
    expect(fs.existsSync(path.join(userData, "gdrive-token.bin"))).toBe(false);
    expect(svc.getStatus().connected).toBe(false);
  });

  it("prunes the Drive folder to the newest 10 backups", async () => {
    await connectNow();
    // 12 files, newest first (Drive returns orderBy=createdTime desc).
    fake.state.filesInFolder = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i + 1}`, name: `remote-${i}.mmbak`, createdTime: `2026-09-0${(i % 9) + 1}T00:00:00.000Z`,
    }));
    const src = path.join(userData, "backup-auto-2026-09-05-13-00-00.mmbak");
    makeFakeBackup(src);
    const up = await svc.uploadBackupFile(src);
    expect(up.ok).toBe(true);
    expect(fake.state.deletes).toEqual(["f11", "f12"]);
  });

  it("uploads the newest local backup (filename ISO stamp ordering)", async () => {
    await connectNow();
    makeFakeBackup(path.join(userData, "backup-auto-2026-09-01-10-00-00.mmbak"), "old");
    makeFakeBackup(path.join(userData, "backup-auto-2026-09-02-10-00-00.mmbak"), "new");
    const r = await svc.uploadNewestBackup(userData);
    expect(r.ok).toBe(true);
    expect(fake.state.uploads.length).toBe(1);
    expect(fake.state.uploads[0].name).toBe("backup-auto-2026-09-02-10-00-00.mmbak");
  });

  it("does not upload when not connected or no backup exists (best-effort, never throws)", async () => {
    const missing = await svc.uploadBackupFile(path.join(userData, "nope.mmbak"));
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("not connected");
    // Connection is checked before scanning, so "Upload now" while
    // disconnected reports the actionable error.
    const notConnected = await svc.uploadNewestBackup(userData);
    expect(notConnected.ok).toBe(false);
    expect(notConnected.error).toContain("not connected");
    // Connected but no backups yet → truthful "no backups found".
    await connectNow();
    const none = await svc.uploadNewestBackup(userData);
    expect(none.ok).toBe(false);
    expect(none.error).toContain("no backups");
    const st = svc.getStatus();
    expect(st.configured).toBe(true);
    expect(st.connected).toBe(true);
  });

  it("test() verifies the live connection and disconnect() wipes the token", async () => {
    const before = await svc.test();
    expect(before.success).toBe(false);
    await connectNow();
    const ok = await svc.test();
    expect(ok.success).toBe(true);
    expect(ok.email).toBe("mahallu@example.com");
    const d = svc.disconnect();
    expect(d.success).toBe(true);
    expect(fs.existsSync(path.join(userData, "gdrive-token.bin"))).toBe(false);
    expect(svc.getStatus().connected).toBe(false);
  });
});
