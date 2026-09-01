// Prepare the pinned local WAHA runtime under resources/waha (NOWEB engine).
// Downloads the source tarball straight from GitHub codeload, installs with
// --legacy-peer-deps (WAHA declares a stale peer range that breaks npm>=7),
// builds, prunes dev deps, and copies dist + node_modules into resources/waha.
// Skips instantly when the marker matches or MMS_SKIP_WAHA=1 is set.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const VERSION = "2026.8.1";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "resources", "waha");
const MARKER = path.join(OUT, ".version");

// Windows cannot spawn .cmd files directly (EINVAL) — run them through a shell.
const IS_WIN = process.platform === "win32";
const NPM = IS_WIN ? "npm.cmd" : "npm";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { ...opts, stdio: "inherit", env: { ...process.env, ...(opts.env || {}) }, ...(IS_WIN ? { shell: true } : {}) });
// Skip Chromium/browser downloads for puppeteer and playwright (incl. the
// nested git-dependency prep installs npm performs) — the NOWEB engine does
// not need a browser, and downloading one per platform in CI is wasteful.
const WAHA_ENV = { PUPPETEER_SKIP_DOWNLOAD: "true", PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "true" };

if (fs.existsSync(path.join(OUT, "dist", "main.js")) && fs.existsSync(MARKER) && fs.readFileSync(MARKER, "utf8").trim() === VERSION) {
  console.log(`[WAHA] bundled ${VERSION} already prepared`);
  process.exit(0);
}

if (process.env.MMS_SKIP_WAHA === "1") {
  console.log("[WAHA] preparation skipped by MMS_SKIP_WAHA=1");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mms-waha-"));
const tarball = path.join(tmp, "waha.tar.gz");
const url = `https://codeload.github.com/devlikeapro/waha/tar.gz/${VERSION}`;
console.log(`[WAHA] downloading pinned source ${VERSION} (NOWEB build, no Chromium download)`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Unable to download WAHA source: HTTP ${response.status} for ${url}`);
fs.writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));

execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "inherit" });
const dirs = fs.readdirSync(tmp, { withFileTypes: true }).filter(e => e.isDirectory());
const source = dirs.find(e => e.name.startsWith("package"))?.name || dirs.find(e => e.name.startsWith("waha-"))?.name;
if (!source) throw new Error("Unable to locate extracted WAHA source");
const wahaRoot = path.join(tmp, source);

// --legacy-peer-deps: WAHA 2026.8.1 declares @liaoliaots/nestjs-redis@9 (peer
// @nestjs/common@^9) alongside @nestjs/common@^11 — a stale upstream peer
// range that makes npm >=7 fail with ERESOLVE. The runtime works fine.
console.log(`[WAHA] installing dependencies of pinned source ${VERSION}`);
run(NPM, ["install", "--no-audit", "--no-fund", "--legacy-peer-deps"], { cwd: wahaRoot, env: WAHA_ENV });

// WAHA runs under Electron's utilityProcess, whose Node ABI is set by the
// Electron version, not by the system Node that ran npm install above. Rebuild
// native modules (better-sqlite3 etc.) against the app's Electron so the
// bundled runtime loads regardless of which Node prepared it.
const appPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const electronVersion = String(appPkg.devDependencies?.electron || "").replace(/[^0-9.]/g, "");
if (electronVersion) {
  console.log(`[WAHA] rebuilding native modules for Electron ${electronVersion}`);
  run(NPM, ["exec", "--", "electron-rebuild", "-f", "-m", wahaRoot, "-v", electronVersion], { cwd: ROOT, env: WAHA_ENV });
} else {
  console.warn("[WAHA] no Electron version found in devDependencies — skipping native rebuild");
}

console.log(`[WAHA] building ${VERSION}`);
run(NPM, ["run", "build"], { cwd: wahaRoot, env: { ...WAHA_ENV, WHATSAPP_DEFAULT_ENGINE: "NOWEB" } });
run(NPM, ["prune", "--omit=dev", "--no-audit", "--no-fund"], { cwd: wahaRoot, env: WAHA_ENV });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(wahaRoot, "dist"), path.join(OUT, "dist"), { recursive: true });
fs.cpSync(path.join(wahaRoot, "node_modules"), path.join(OUT, "node_modules"), { recursive: true });
fs.copyFileSync(path.join(wahaRoot, "package.json"), path.join(OUT, "package.json"));
fs.writeFileSync(MARKER, VERSION + "\n", "utf8");
fs.writeFileSync(path.join(OUT, "README.txt"), `Mahallu Manager bundled WAHA runtime\nVersion: ${VERSION}\nEngine: NOWEB\nManaged automatically by Mahallu Manager. Do not edit or run manually.\n`, "utf8");

console.log(`[WAHA] prepared ${VERSION} at ${OUT}`);
