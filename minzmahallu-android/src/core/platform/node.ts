/* ============================================================================
 * Node adapter — used by the vitest suite so the ported service layer (and the
 * real SQLite schema/migrations) can be exercised without a device. Mirrors the
 * old Electron `app.getPath("userData")` layout: one temp folder per process.
 * ========================================================================== */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Platform, StoredFile } from "./types";

const ROOT = process.env.MMS_DATA_DIR || path.join(os.tmpdir(), `mms-android-${process.pid}`);

function ensureRoot(): string {
  fs.mkdirSync(ROOT, { recursive: true });
  return ROOT;
}

function resolveLogical(logical: string): string {
  const rel = String(logical).replace(/^\/+/, "").replace(/\.\./g, "");
  const full = path.join(ensureRoot(), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
}

function listDir(folder: string): StoredFile[] {
  const dir = path.join(ensureRoot(), folder);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, mtime: stat.mtimeMs };
    });
}

export function nodePlatform(): Platform {
  return {
    kind: "node",
    files: {
      async read(logical) {
        const full = resolveLogical(logical);
        return fs.existsSync(full) ? new Uint8Array(fs.readFileSync(full)) : null;
      },
      async write(logical, data) {
        fs.writeFileSync(resolveLogical(logical), Buffer.from(data));
      },
      async readText(logical) {
        const full = resolveLogical(logical);
        return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
      },
      async writeText(logical, text) {
        fs.writeFileSync(resolveLogical(logical), text, "utf8");
      },
      async exists(logical) {
        return fs.existsSync(resolveLogical(logical));
      },
      async remove(logical) {
        const full = resolveLogical(logical);
        if (fs.existsSync(full)) fs.rmSync(full, { force: true });
      },
      async list(folder) {
        return listDir(folder);
      },
      async uri(logical) {
        return resolveLogical(logical);
      },
    },
    share: {
      async saveFile({ name, data }) {
        const target = path.join(os.tmpdir(), name);
        fs.writeFileSync(target, Buffer.from(data));
        return { saved: true, path: target };
      },
      async openUrl() {
        /* no-op in tests */
      },
    },
    device: {
      async identityParts() {
        return [
          `host:${os.hostname()}`,
          `platform:${os.platform()}`,
          `arch:${os.arch()}`,
          `cpu:${(os.cpus()[0]?.model || "unknown").trim()}`,
          `mem:${Math.round(os.totalmem() / (1024 * 1024 * 1024))}`,
        ];
      },
      async info() {
        return { model: "test", platform: os.platform(), osVersion: os.release(), appVersion: "2.0.0", appId: "com.mms.minzmahallu" };
      },
    },
    prefs: {
      async get(key) {
        const full = resolveLogical(`prefs/${key}.txt`);
        return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
      },
      async set(key, value) {
        fs.writeFileSync(resolveLogical(`prefs/${key}.txt`), value, "utf8");
      },
      async remove(key) {
        const full = resolveLogical(`prefs/${key}.txt`);
        if (fs.existsSync(full)) fs.rmSync(full, { force: true });
      },
    },
    ui: {
      async alert(message) {
        console.log(`[platform.alert] ${message}`);
      },
      async setStatusBarColor() {},
      async minimize() {
        /* tests have no window to background */
      },
    },
    onBackButton() {
      return () => {};
    },
    onAppStateChange() {
      return () => {};
    },
  };
}

export const nodeDataDir = ROOT;
