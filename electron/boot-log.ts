/*
 * boot-log — startup diagnostics for the "nothing comes up" class of bugs.
 *
 * v2.5.1 (user report after v2.5.0: "first run takes time no splash … then
 * splash comes then same"): every startup failure until now was invisible —
 * the main process had nowhere to record WHAT it was doing or HOW LONG each
 * step took, so "splash comes then nothing" could mean a slow baileys load,
 * a wedged import, a thrown handler registration or a hung updater, and the
 * report could not tell them apart.
 *
 * This module appends one line per boot step to
 *   <userData>/logs/boot.log
 * stamped with process.uptime() — the time since the EXE was launched, NOT
 * since our JS started. That distinction is the whole point: a huge uptime
 * at the very first step means the delay happened BEFORE any of our code ran
 * (Electron init, antivirus scanning a fresh install), while a growing gap
 * between later steps points at our own boot chain.
 *
 * Design constraints:
 *   - Best-effort ONLY: a failing log write must never affect the boot.
 *   - Electron is resolved lazily (createRequire, same pattern as
 *     splash-window.ts) so vitest can import this module without the
 *     electron runtime; when it is unavailable the log becomes a no-op.
 *   - The file is capped: past 128 KB it is rewritten for the new boot, so
 *     months of daily launches cannot grow it unbounded.
 */

const MAX_BYTES = 128 * 1024;

/** Test hook: redirect the log file (vitest writes to a temp dir). */
let dirOverride: string | null = null;
export function __setBootLogDirForTests(dir: string | null): void {
  dirOverride = dir;
}

export function bootLogFilePath(): string {
  const dir = dirOverride ?? (electronApp()?.getPath?.("userData") ?? "");
  return dir ? `${dir}/logs/boot.log`.replace(/\\/g, "/") : "";
}

function electronApp(): import("electron").App | null {
  try {
    const require = createRequire(import.meta.url);
    const { app } = require("electron") as typeof import("electron");
    if (!app || typeof app.getPath !== "function") return null;
    return app;
  } catch {
    return null;
  }
}

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

/** Formats one log line: `[+  3.142s] step — detail` (uptime in seconds). */
export function formatBootLine(uptimeMs: number, step: string, detail?: string): string {
  const secs = (Math.max(0, uptimeMs) / 1000).toFixed(3).padStart(8, " ");
  return `[+${secs}s] ${step}${detail ? ` — ${detail}` : ""}`;
}

/**
 * Records one boot step. Never throws; silently no-ops when the userData
 * directory is unavailable (tests, exotic sandboxes).
 */
export function bootLog(step: string, detail?: string): void {
  try {
    const file = bootLogFilePath();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      // Cap reached: start a fresh log for this boot.
      fs.rmSync(file, { force: true });
    }
    const first = !fs.existsSync(file);
    const header = first
      ? `==== boot v${electronApp()?.getVersion?.() ?? "?"} ${process.platform} ${process.arch} ====\n`
      : "";
    fs.appendFileSync(file, header + formatBootLine(process.uptime() * 1000, step, detail) + "\n", "utf8");
  } catch { /* diagnostics must never break the boot */ }
}

/** Records an error condition (boot failure, unhandled rejection, …). */
export function bootLogError(kind: string, err: unknown): void {
  const msg = String((err as { message?: unknown } | null)?.message ?? err ?? "unknown");
  bootLog(`ERROR:${kind}`, msg.slice(0, 400));
}
