// Prepare the pinned local WAHA runtime under resources/waha (NOWEB engine).
//
// WAHA is a YARN project (yarn 4 via corepack, see `packageManager` in its
// package.json) and its source only compiles against the exact versions
// pinned in its yarn.lock — building it with npm resolves fresh versions
// and the TypeScript build breaks (e.g. @nestjs/common 11.2.x type drift,
// nested puppeteer-core mismatches). This script therefore mirrors WAHA's
// official Dockerfile build:
//
//   corepack yarn install  ->  yarn build  ->  prune dev deps  ->  copy
//
// Two deliberate deviations from the official image, both validated:
//   * .yarnrc.yml `supportedArchitectures` is dropped so yarn installs
//     optional platform binaries (sharp, esbuild, ...) for the CURRENT
//     platform only instead of every os/cpu combination.
//   * `@grpc/grpc-js` is moved from devDependencies to dependencies
//     before pruning: the GOWS engine module is imported eagerly by
//     dist/main.js and requires it at runtime even with NOWEB.
//
// Native modules are then rebuilt against the app's Electron ABI because
// WAHA runs inside Electron's utilityProcess, not the system Node.
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
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { ...opts, stdio: "inherit", env: { ...process.env, ...(opts.env || {}) }, ...(IS_WIN ? { shell: true } : {}) });

// WAHA ships `packageManager: yarn@4.17.1`; corepack (bundled with Node >= 20)
// downloads and pins exactly that version. `COREPACK_INTEGRITY_KEYS=0` keeps
// older bundled corepacks from failing signature checks against newer yarn
// releases, and COREPACK_ENABLE_DOWNLOAD_PROMPT=0 avoids the interactive
// first-download prompt in CI.
const YARN_ENV = {
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  COREPACK_INTEGRITY_KEYS: "0",
  // Mirror WAHA's Dockerfile: tolerate lockfile checksum drift on git deps.
  YARN_CHECKSUM_BEHAVIOR: "update",
  // The NOWEB engine does not need a browser — skip the big downloads.
  PUPPETEER_SKIP_DOWNLOAD: "true",
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "true",
};
const yarn = (args, opts = {}) => run("corepack", ["yarn", ...args], { ...opts, env: YARN_ENV });

if (fs.existsSync(path.join(OUT, "dist", "main.js")) && fs.existsSync(MARKER) && fs.readFileSync(MARKER, "utf8").trim() === VERSION) {
  console.log(`[WAHA] bundled ${VERSION} already prepared`);
  process.exit(0);
}

if (process.env.MMS_SKIP_WAHA === "1") {
  console.log("[WAHA] preparation skipped by MMS_SKIP_WAHA=1");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mms-waha-"));
try {
  const tarball = path.join(tmp, "waha.tar.gz");
  const url = `https://codeload.github.com/devlikeapro/waha/tar.gz/${VERSION}`;
  console.log(`[WAHA] downloading pinned source ${VERSION}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download WAHA source: HTTP ${response.status} for ${url}`);
  fs.writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));

  execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "inherit" });
  const dirs = fs.readdirSync(tmp, { withFileTypes: true }).filter((e) => e.isDirectory());
  const source = dirs.find((e) => e.name.startsWith("package"))?.name || dirs.find((e) => e.name.startsWith("waha-"))?.name;
  if (!source) throw new Error("Unable to locate extracted WAHA source");
  const wahaRoot = path.join(tmp, source);

  // Install optional platform-specific packages for the current platform
  // only (WAHA's .yarnrc.yml requests every os/cpu combination for its
  // multi-arch docker builds — useless bloat here).
  const yarnrcPath = path.join(wahaRoot, ".yarnrc.yml");
  if (fs.existsSync(yarnrcPath)) {
    const kept = [];
    let skipping = false;
    for (const line of fs.readFileSync(yarnrcPath, "utf8").split(/\r?\n/)) {
      if (/^supportedArchitectures:/.test(line)) { skipping = true; continue; }
      if (skipping) {
        if (/^\s+\S/.test(line)) continue; // indented child of the block
        skipping = false;
      }
      kept.push(line);
    }
    fs.writeFileSync(yarnrcPath, kept.join("\n").trim() + "\n");
  }

  console.log(`[WAHA] installing dependencies of pinned source ${VERSION} (yarn.lock, no Chromium download)`);
  yarn(["install"], { cwd: wahaRoot });

  console.log(`[WAHA] building ${VERSION}`);
  yarn(["build"], { cwd: wahaRoot, env: { WHATSAPP_DEFAULT_ENGINE: "NOWEB" } });

  // @grpc/grpc-js sits in devDependencies but is required at runtime by the
  // eagerly imported GOWS engine module — move it before pruning so the
  // production tree still contains it (verified: WAHA fails to boot without it).
  const pkgPath = path.join(wahaRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.devDependencies?.["@grpc/grpc-js"] && !pkg.dependencies?.["@grpc/grpc-js"]) {
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies["@grpc/grpc-js"] = pkg.devDependencies["@grpc/grpc-js"];
    delete pkg.devDependencies["@grpc/grpc-js"];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log("[WAHA] moved @grpc/grpc-js to dependencies (runtime requirement)");
  }

  console.log("[WAHA] pruning development dependencies");
  yarn(["workspaces", "focus", "--production"], { cwd: wahaRoot });

  // Mirror the official Dockerfile: declaration files are dead weight at
  // runtime. Also drop *.d.ts maps if any.
  (function stripTypes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stripTypes(full);
      else if (/\.d\.ts$|\.d\.ts\.map$/.test(entry.name)) fs.rmSync(full, { force: true });
    }
  })(path.join(wahaRoot, "dist"));

  // WAHA runs under Electron's utilityProcess, whose Node ABI is set by the
  // Electron version, not by the system Node that ran yarn install. Rebuild
  // native modules (better-sqlite3, sqlite3, bufferutil, ...) against the
  // app's Electron so the bundled runtime loads regardless of which Node
  // prepared it.
  const appPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const electronVersion = String(appPkg.devDependencies?.electron || "").replace(/[^0-9.]/g, "");
  if (electronVersion) {
    console.log(`[WAHA] rebuilding native modules for Electron ${electronVersion}`);
    run("npm", ["exec", "--", "electron-rebuild", "-f", "-m", wahaRoot, "-v", electronVersion], { cwd: ROOT, env: YARN_ENV });
  } else {
    console.warn("[WAHA] no Electron version found in devDependencies — skipping native rebuild");
  }

  // .bin folders contain absolute symlinks into the temp build tree; they
  // dangle after copying and upset some packagers. Runtime never uses them.
  (function stripBins(dir) {
    const bin = path.join(dir, ".bin");
    if (fs.existsSync(bin)) fs.rmSync(bin, { recursive: true, force: true });
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === ".bin" || entry.name.startsWith(".")) continue;
      stripBins(path.join(dir, entry.name));
    }
  })(path.join(wahaRoot, "node_modules"));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(wahaRoot, "dist"), path.join(OUT, "dist"), { recursive: true });
  fs.cpSync(path.join(wahaRoot, "node_modules"), path.join(OUT, "node_modules"), { recursive: true });
  fs.copyFileSync(pkgPath, path.join(OUT, "package.json"));
  fs.writeFileSync(MARKER, VERSION + "\n", "utf8");
  fs.writeFileSync(
    path.join(OUT, "README.txt"),
    `Mahallu Manager bundled WAHA runtime\nVersion: ${VERSION}\nEngine: NOWEB\nManaged automatically by Mahallu Manager. Do not edit or run manually.\n`,
    "utf8"
  );

  console.log(`[WAHA] prepared ${VERSION} at ${OUT}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
