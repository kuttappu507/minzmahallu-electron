/*
 * Google Drive backup service — uploads every .mmbak straight to the user's
 * Google Drive via the REST API, with NO Drive desktop app installed.
 *
 * Design notes:
 * - Pure Node (fs/http/crypto/fetch only, NO electron imports). Everything
 *   environment-specific is injected via deps: token encryption (Electron
 *   safeStorage in production), browser opening (shell.openExternal), the
 *   Google endpoint URLs and timeouts. That keeps the whole OAuth + upload
 *   flow unit-testable offline against a local fake Google server.
 * - OAuth 2.0 loopback flow (RFC 8252) with PKCE (S256): a one-shot HTTP
 *   server on 127.0.0.1:<random port> receives the authorization code, so
 *   no embedded BrowserWindow or redirect domain is needed. The port is
 *   chosen at runtime — Google allows any port on the 127.0.0.1 loopback
 *   redirect for "Desktop app" OAuth clients.
 * - Scope is the least-privilege `drive.file`: MMS can only see/modify files
 *   it created itself (the MMS-Backups folder and its backups). `openid
 *   email` is requested so the UI can show which account is connected.
 * - `access_type=offline&prompt=consent` guarantees a refresh token on every
 *   connect; the refresh token is stored ENCRYPTED (OS keychain/DPAPI in
 *   production via the injected secret store). Access tokens (1h) are only
 *   cached in memory.
 * - Everything upload-related is best-effort: an offline PC or a revoked
 *   token returns { ok:false, error } and never throws into the backup flow.
 * - Pruning keeps the newest `keep` (default 10) backups in the Drive folder,
 *   ordered by createdTime desc (server-side timestamps — reliable).
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

export interface GDriveEndpoints {
  accountsBase: string; // https://accounts.google.com
  authBase: string;     // https://oauth2.googleapis.com
  userinfoBase: string; // https://openidconnect.googleapis.com/v1
  driveBase: string;    // https://www.googleapis.com/drive/v3
  uploadBase: string;   // https://www.googleapis.com/upload/drive/v3
}

export const REAL_ENDPOINTS: GDriveEndpoints = {
  accountsBase: "https://accounts.google.com",
  authBase: "https://oauth2.googleapis.com",
  userinfoBase: "https://openidconnect.googleapis.com/v1",
  driveBase: "https://www.googleapis.com/drive/v3",
  uploadBase: "https://www.googleapis.com/upload/drive/v3",
};

export const GDRIVE_SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
export const DEFAULT_FOLDER = "MMS-Backups";

export interface SecretStore {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface GDriveConfig {
  clientId: string;
  clientSecret: string;
  folderName: string;
}

export interface GDriveDeps {
  getUserData: () => string;
  getConfig: () => GDriveConfig;
  secretStore: SecretStore;
  openExternal: (url: string) => void | Promise<void>;
  endpoints?: GDriveEndpoints;
  connectTimeoutMs?: number;
  keep?: number;
}

type TokenBlob = { refreshToken: string; email: string; scope: string; connectedAt: string };
type StateBlob = { lastUploadAt: string | null; lastUploadName: string | null; lastError: string | null };

const TOKEN_FILE = "gdrive-token.bin";
const STATE_FILE = "gdrive-state.json";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ISO timestamp embedded in MMS backup filenames (same convention as the mirror). */
function nameStamp(name: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/.exec(name);
  return m ? m[1] : null;
}

export function createGDrive(deps: GDriveDeps) {
  const endpoints = deps.endpoints ?? REAL_ENDPOINTS;
  const timeoutMs = deps.connectTimeoutMs ?? 5 * 60 * 1000;
  const keep = deps.keep ?? 10;
  const tokenPath = () => path.join(deps.getUserData(), TOKEN_FILE);
  const statePath = () => path.join(deps.getUserData(), STATE_FILE);

  // ---- persistence ---------------------------------------------------------

  function readToken(): TokenBlob | null {
    try {
      const raw = fs.readFileSync(tokenPath());
      if (!raw.length) return null;
      return JSON.parse(deps.secretStore.decrypt(raw)) as TokenBlob;
    } catch { return null; }
  }
  function writeToken(blob: TokenBlob): void {
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), deps.secretStore.encrypt(JSON.stringify(blob)));
  }
  function clearToken(): void {
    try { fs.rmSync(tokenPath(), { force: true }); } catch {}
  }
  function readState(): StateBlob {
    try { return { lastUploadAt: null, lastUploadName: null, lastError: null, ...JSON.parse(fs.readFileSync(statePath(), "utf8")) }; } catch { return { lastUploadAt: null, lastUploadName: null, lastError: null }; }
  }
  function patchState(patch: Partial<StateBlob>): void {
    try {
      fs.mkdirSync(path.dirname(statePath()), { recursive: true });
      fs.writeFileSync(statePath(), JSON.stringify({ ...readState(), ...patch }));
    } catch {}
  }
  function safeConfig(): GDriveConfig {
    try {
      const c = deps.getConfig();
      return { clientId: String(c?.clientId || "").trim(), clientSecret: String(c?.clientSecret || "").trim(), folderName: String(c?.folderName || "").trim() || DEFAULT_FOLDER };
    } catch { return { clientId: "", clientSecret: "", folderName: DEFAULT_FOLDER }; }
  }

  // ---- access tokens (in-memory cache + refresh) ---------------------------

  let cached: { token: string; expiresAt: number } | null = null;

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const blob = readToken();
    if (!blob) throw new Error("Google Drive is not connected");
    const { clientId, clientSecret } = safeConfig();
    const body = new URLSearchParams({ client_id: clientId, refresh_token: blob.refreshToken, grant_type: "refresh_token" });
    if (clientSecret) body.set("client_secret", clientSecret);
    const r = await fetch(`${endpoints.authBase}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok) {
      let errCode = "";
      try { errCode = ((await r.json()) as any).error || ""; } catch {}
      if (errCode === "invalid_grant") {
        // The account revoked access (or the token expired server-side) —
        // drop the stored token so the UI cleanly asks for a reconnect.
        clearToken();
        cached = null;
        throw new Error("Google account was disconnected — reconnect it in Settings");
      }
      throw new Error(`token refresh failed (${r.status})`);
    }
    const json: any = await r.json();
    cached = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
    return cached.token;
  }

  /** fetch with Authorization + one automatic retry after a forced refresh on 401. */
  async function authedFetch(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await getAccessToken();
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${token}` };
    const r = await fetch(url, { ...init, headers });
    if (r.status === 401 && retry) {
      const fresh = await getAccessToken(true);
      const retryHeaders: Record<string, string> = { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${fresh}` };
      return fetch(url, { ...init, headers: retryHeaders });
    }
    return r;
  }

  // ---- OAuth loopback connect ---------------------------------------------

  async function connect(): Promise<{ success: boolean; email?: string; error?: string }> {
    const { clientId, clientSecret } = safeConfig();
    if (!clientId) return { success: false, error: "Google Client ID is not configured — save it in Settings first" };
    if (!deps.secretStore.available()) return { success: false, error: "OS secure storage is unavailable — cannot safely store the Google connection" };

    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const state = crypto.randomBytes(16).toString("hex");

    const donePage = (title: string, body: string, status: number) =>
      `<!doctype html><html><head><meta charset="utf-8"><title>MMS — Google Drive</title></head>` +
      `<body style="font-family:system-ui,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdfa;color:#134e4a">` +
      `<div style="text-align:center;max-width:32rem;padding:2rem"><h1 style="margin:0 0 0.5rem">MMS — Google Drive</h1>` +
      `<p style="font-size:1.05rem">${title}</p><p style="color:#0d9484">${body}</p></div></body></html>`;

    let resolveResult: (v: { code?: string; error?: string }) => void = () => {};
    const resultPromise = new Promise<{ code?: string; error?: string }>((resolve) => { resolveResult = resolve; });
    let settled = false;
    const finish = (v: { code?: string; error?: string }) => { if (!settled) { settled = true; resolveResult(v); } };

    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url ?? "/", "http://127.0.0.1");
        const hasCode = u.searchParams.has("code");
        const hasError = u.searchParams.has("error");
        if (u.pathname !== "/" || (!hasCode && !hasError)) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
        if (u.searchParams.get("state") !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(donePage("Security check failed", "Please close this tab and connect again from MMS Settings.", 400));
          finish({ error: "state mismatch (possible CSRF — aborted)" });
          return;
        }
        if (hasError) {
          const desc = u.searchParams.get("error_description") || u.searchParams.get("error") || "denied";
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(donePage("Connection was not completed", String(desc), 400));
          finish({ error: `Google returned: ${desc}` });
          return;
        }
        const code = u.searchParams.get("code") || "";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(donePage("Connected successfully.", "MMS ഗൂഗ്ൾ ഡ്രൈവുമായി ബന്ധിച്ചു. You can close this tab and return to the app.", 200));
        finish({ code });
      } catch { /* connection-level hiccups must not crash the app */ }
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve((server.address() as any).port));
    });
    const redirectUri = `http://127.0.0.1:${port}`;

    try {
      const authUrl = new URL(`${endpoints.accountsBase}/o/oauth2/v2/auth`);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", GDRIVE_SCOPES);
      authUrl.searchParams.set("access_type", "offline");   // ask for a refresh token
      authUrl.searchParams.set("prompt", "consent");        // ... every single time
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      await deps.openExternal(authUrl.toString());

      const timer = setTimeout(() => finish({ error: "timeout — no browser response (5 min)" }), timeoutMs);
      const result = await resultPromise;
      clearTimeout(timer);
      if (result.error) return { success: false, error: result.error };
      if (!result.code) return { success: false, error: "no authorization code returned" };

      // Exchange the code for tokens.
      const body = new URLSearchParams({
        code: result.code, client_id: clientId, redirect_uri: redirectUri,
        grant_type: "authorization_code", code_verifier: verifier,
      });
      if (clientSecret) body.set("client_secret", clientSecret);
      const r = await fetch(`${endpoints.authBase}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!r.ok) return { success: false, error: `token exchange failed (${r.status})` };
      const tokens: any = await r.json();
      if (!tokens.refresh_token) return { success: false, error: "Google did not return a refresh token — connect again" };

      // Who connected? (best-effort; only used as a UI label)
      let email = "Google account";
      try {
        const ui = await fetch(`${endpoints.userinfoBase}/userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (ui.ok) email = ((await ui.json()) as any).email || email;
      } catch {}

      cached = { token: tokens.access_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 };
      writeToken({ refreshToken: tokens.refresh_token, email, scope: tokens.scope || GDRIVE_SCOPES, connectedAt: new Date().toISOString() });
      patchState({ lastError: null });
      return { success: true, email };
    } finally {
      try { server.close(); } catch {}
    }
  }

  // ---- Drive operations ----------------------------------------------------

  async function findOrCreateFolder(name: string): Promise<string> {
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const list = await authedFetch(`${endpoints.driveBase}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
    if (!list.ok) throw new Error(`Drive folder search failed (${list.status})`);
    const found = ((await list.json()) as any).files || [];
    if (found.length) return found[0].id;
    const create = await authedFetch(`${endpoints.driveBase}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
    });
    if (!create.ok) throw new Error(`Drive folder create failed (${create.status})`);
    return ((await create.json()) as any).id;
  }

  async function uploadBackupFile(filePath: string): Promise<{ ok: boolean; fileId?: string; name?: string; error?: string }> {
    try {
      if (!readToken()) return { ok: false, error: "Google Drive is not connected" };
      if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "source backup missing" };
      const { folderName } = safeConfig();
      const folderId = await findOrCreateFolder(folderName);

      const boundary = `mms${crypto.randomBytes(12).toString("hex")}`;
      const meta = JSON.stringify({ name: path.basename(filePath), parents: [folderId] });
      const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, "utf8");
      const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
      const body = Buffer.concat([head, fs.readFileSync(filePath), tail]);

      const up = await authedFetch(`${endpoints.uploadBase}/files?uploadType=multipart&fields=id`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      });
      if (!up.ok) throw new Error(`upload failed (${up.status})`);
      const json: any = await up.json();

      // Prune: keep the newest `keep` files in the folder (server-side
      // createdTime ordering — reliable even for burst uploads).
      try {
        const q = `'${folderId}' in parents and trashed=false`;
        const list = await authedFetch(`${endpoints.driveBase}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime)`);
        if (list.ok) {
          const files = ((await list.json()) as any).files || [];
          for (const old of files.slice(keep)) {
            try { await authedFetch(`${endpoints.driveBase}/files/${old.id}`, { method: "DELETE" }); } catch {}
          }
        }
      } catch {}

      patchState({ lastUploadAt: new Date().toISOString(), lastUploadName: path.basename(filePath), lastError: null });
      return { ok: true, fileId: json.id, name: path.basename(filePath) };
    } catch (e: any) {
      const error = e?.message || String(e);
      patchState({ lastError: error });
      return { ok: false, error };
    }
  }

  /** Upload the newest .mmbak in a directory (used by the "Upload now" button). */
  function uploadNewestBackup(dir: string) {
    // Connection check first so the user gets the actionable error ("not
    // connected") rather than a misleading "no backups found".
    if (!readToken()) return Promise.resolve({ ok: false, error: "Google Drive is not connected" });
    let newest: string | null = null; let newestKey = "";
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".mmbak")) continue;
        const key = nameStamp(f) ?? new Date(fs.statSync(path.join(dir, f)).mtimeMs).toISOString().slice(0, 19).replace(/[:T]/g, "-");
        if (!newest || key > newestKey) { newest = f; newestKey = key; }
      }
    } catch { /* directory unreadable */ }
    if (!newest) return Promise.resolve({ ok: false, error: "no backups found" });
    return uploadBackupFile(path.join(dir, newest));
  }

  async function test(): Promise<{ success: boolean; email?: string; error?: string }> {
    try {
      if (!readToken()) return { success: false, error: "Google Drive is not connected" };
      const { folderName } = safeConfig();
      const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const r = await authedFetch(`${endpoints.driveBase}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
      if (!r.ok) throw new Error(`Drive responded ${r.status}`);
      return { success: true, email: readToken()?.email };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  function disconnect(): { success: boolean } {
    clearToken();
    cached = null;
    patchState({ lastUploadAt: null, lastUploadName: null, lastError: null });
    return { success: true };
  }

  function getStatus() {
    const cfg = safeConfig();
    const blob = readToken();
    const state = readState();
    return {
      configured: !!cfg.clientId,
      connected: !!blob,
      email: blob?.email || null,
      folderName: cfg.folderName,
      lastUploadAt: state.lastUploadAt,
      lastUploadName: state.lastUploadName,
      lastError: state.lastError,
    };
  }

  return { connect, disconnect, test, uploadBackupFile, uploadNewestBackup, getStatus };
}

export type GDriveService = ReturnType<typeof createGDrive>;
