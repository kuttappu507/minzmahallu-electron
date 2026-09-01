// Node 20 (Electron 33) require(esm) interop for the bundled WAHA runtime.
//
// WAHA 2026.8.1 is built for Node >= 22.12: its compiled output freely
// `require()`s ESM-only packages (@adiwajshing/baileys 7, ...), relying on
// the require(esm) support Node 22.12+ ships. The app runs WAHA inside
// Electron 33's utilityProcess, whose Node is 20.18 — there `require(esm)`
// throws ERR_REQUIRE_ESM. Upstream WAHA only runs on Node 24 in Docker,
// which is why this never shows there.
//
// Fix strategy:
//   * a small generated CJS hook (dist/esm-interop.cjs) is required at the
//     very top of dist/main.js — before any WAHA module loads
//   * the hook preloads every ESM-only package referenced by the compiled
//     dist via dynamic `import()` (the async ESM loader handles cycles —
//     the synchronous experimental require(esm) of Node 20 overflows on
//     baileys' import graph) and patches Module._load to serve the
//     namespaces to require()
//   * dist/vendor/esm.js (WAHA's own ESM bootstrap shim) awaits the hook's
//     ready promise, so engines only load once the cache is warm
//
// DUAL-PACKAGE SAFETY (the subtle part): packages like `long` ship both a
// CJS and an ESM build behind conditional `exports`. Their require() works
// natively on every Node and must NOT be intercepted — serving the ESM
// namespace instead breaks consumers that expect the CJS shape
// (protobufjs: "$util.Long.fromBits is not a function"). The prepare-time
// scan therefore resolves each require() target statically and only
// intercepts specifiers that resolve to ESM files (.mjs or .js in a
// "type": "module" scope) — i.e. exactly the ones Node 20 cannot require.
//
// This module runs at PREPARE time (system Node 20/24): resolution rules
// used here are identical on both versions, so the classification is stable
// across local (Node 24) and CI (Node 20) runs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const REQ_RE = /require\(\s*["']([^"']+)["']\s*\)/g;
const preparerRequire = createRequire(import.meta.url);

function isEsmFlagged(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).type === "module";
  } catch {
    return false;
  }
}

/** Bare names of every "type": "module" package in the final node_modules. */
function esmFlaggedPackages(nodeModulesDir) {
  const found = new Set();
  if (!fs.existsSync(nodeModulesDir)) return found;
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      for (const sub of fs.readdirSync(path.join(nodeModulesDir, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory() && isEsmFlagged(path.join(nodeModulesDir, entry.name, sub.name))) {
          found.add(`${entry.name}/${sub.name}`);
        }
      }
    } else if (isEsmFlagged(path.join(nodeModulesDir, entry.name))) {
      found.add(entry.name);
    }
  }
  return found;
}

/** require() specifiers found under a directory that point at ESM-flagged packages. */
function scanRequires(dir, esmSet) {
  const hits = new Set();
  const SKIP_DIRS = new Set([".bin", ".yarn", ".cache"]);
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(d, entry.name));
      } else if (/\.(js|cjs)$/.test(entry.name)) {
        const full = path.join(d, entry.name);
        let src;
        try {
          if (fs.statSync(full).size > 8 * 1024 * 1024) continue; // huge bundles: require() targets there are bundled internals
          src = fs.readFileSync(full, "utf8");
        } catch { continue; }
        if (!src.includes("require(")) continue;
        let m;
        REQ_RE.lastIndex = 0;
        while ((m = REQ_RE.exec(src))) {
          const spec = m[1];
          if (spec.startsWith(".") || spec.startsWith("node:")) continue;
          const base = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          if (esmSet.has(base)) hits.add(spec);
        }
      }
    }
  };
  walk(dir);
  return hits;
}

/** Package type governing a file — nearest package.json walking upward. */
function nearestPackageType(file) {
  let dir = path.dirname(path.resolve(file));
  for (;;) {
    const pj = path.join(dir, "package.json");
    if (fs.existsSync(pj)) {
      try {
        return JSON.parse(fs.readFileSync(pj, "utf8")).type || "commonjs";
      } catch {
        return "commonjs";
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return "commonjs";
    dir = parent;
  }
}

/** Would require() of this file load an ES module? (resolution is Node-version-stable) */
function resolvesToEsm(file) {
  if (typeof file !== "string") return false;
  if (file.endsWith(".mjs")) return true;
  if (file.endsWith(".cjs") || file.endsWith(".json") || file.endsWith(".node")) return false;
  if (file.endsWith(".js")) return nearestPackageType(file) === "module";
  return false;
}

/**
 * Only intercept a specifier when its CJS require would genuinely fail on
 * Node 20: the resolved target is an ES module. Dual packages (CJS build
 * behind the `require`/`default` exports condition) keep their native
 * require path untouched.
 */
function needsInterop(spec, wahaRoot) {
  let resolved;
  try {
    resolved = preparerRequire.resolve(spec, { paths: [wahaRoot] });
  } catch {
    // Resolution fails identically on every Node — not ours to fix.
    return false;
  }
  return resolvesToEsm(resolved);
}

/**
 * import() (unlike require()) performs no extension resolution, so a
 * `require("pkg/lib/Mod")` needs "pkg/lib/Mod.js" as an import specifier.
 */
function importCandidates(spec) {
  if (/\.(js|mjs|cjs|json|node|wasm)$/.test(spec)) return [spec];
  return [spec, `${spec}.js`, `${spec}/index.js`];
}

function generateHook(coreSpecs, backgroundSpecs) {
  const core = coreSpecs.map((spec) => [spec, importCandidates(spec)]);
  return `"use strict";
/* Generated by scripts/prepare-waha.mjs (waha-esm-interop) — do not edit.
 *
 * Node 20 / Electron 33 utilityProcess has no require(esm). This hook
 * preloads the ESM-only packages the compiled WAHA output requires via
 * dynamic import() and serves their namespaces from Module._load.
 * globalThis.__esmInterop.ready resolves once the core set is loaded —
 * dist/vendor/esm.js awaits it before letting WAHA require engines.
 */
const Module = require("node:module");
const CORE = ${JSON.stringify(core)};
const BACKGROUND = ${JSON.stringify(backgroundSpecs)};
const cache = Object.create(null);
function note(msg) { try { console.warn("[WAHA][esm-interop] " + msg); } catch {} }
async function importFirst(spec, candidates) {
  let lastErr = null;
  for (const candidate of candidates) {
    try { cache[spec] = await import(candidate); return; } catch (err) { lastErr = err; }
  }
  note("unable to preload " + spec + ": " + ((lastErr && (lastErr.code || lastErr.message)) || "unknown error"));
}
const jobs = CORE.map(([spec, candidates]) => importFirst(spec, candidates));
for (const pkg of BACKGROUND) { import(pkg).then((ns) => { cache[pkg] = ns; }, (err) => note("background warm-up failed for " + pkg)); }
globalThis.__esmInterop = { cache, ready: Promise.allSettled(jobs) };
const origLoad = Module._load;
if (typeof origLoad === "function") {
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(cache, request)) return cache[request];
    return origLoad.call(this, request, parent, isMain);
  };
}
`;
}

/**
 * Apply the interop to a prepared WAHA tree (dist/ + node_modules/). Safe to
 * re-run: every patch is idempotent.
 */
export function applyEsmInterop(wahaRoot) {
  const distDir = path.join(wahaRoot, "dist");
  const nodeModulesDir = path.join(wahaRoot, "node_modules");
  const mainPath = path.join(distDir, "main.js");
  const shimPath = path.join(distDir, "vendor", "esm.js");
  if (!fs.existsSync(mainPath)) throw new Error(`[WAHA][esm-interop] ${mainPath} not found — run after the build step`);
  if (!fs.existsSync(shimPath)) throw new Error(`[WAHA][esm-interop] ${shimPath} not found`);

  const esmSet = esmFlaggedPackages(nodeModulesDir);
  // Scan BOTH the compiled dist and the pruned node_modules: packages like
  // @wppconnect-team/wppconnect (CJS) transitively require ESM-only deps
  // such as `latest-version` from their own compiled output.
  const refs = new Set([...scanRequires(distDir, esmSet), ...scanRequires(nodeModulesDir, esmSet)]);

  // Every ESM-only specifier any bundled code requires (dist + node_modules).
  const coreSpecs = [...refs].filter((spec) => needsInterop(spec, wahaRoot)).sort();
  const skippedDual = [...refs].filter((spec) => !needsInterop(spec, wahaRoot)).sort();
  // Insurance for transitive CJS->ESM requires: warm the ESM-only packages
  // among WAHA's direct runtime dependencies (dual packages excluded —
  // their native require path must stay untouched).
  let backgroundSpecs = [];
  try {
    const wahaPkg = JSON.parse(fs.readFileSync(path.join(wahaRoot, "package.json"), "utf8"));
    backgroundSpecs = Object.keys(wahaPkg.dependencies || {})
      .filter((name) => esmSet.has(name) && !refs.has(name) && needsInterop(name, wahaRoot))
      .sort();
  } catch {
    backgroundSpecs = [];
  }

  // 1. Generate the hook.
  fs.writeFileSync(path.join(distDir, "esm-interop.cjs"), generateHook(coreSpecs, backgroundSpecs));

  // 2. Make WAHA's own ESM bootstrap wait for the core imports. Its
  //    require('@adiwajshing/baileys') is then served from the warm cache
  //    (and still works unpatched on Node >= 22.12 without the hook).
  let shim = fs.readFileSync(shimPath, "utf8");
  if (!shim.includes("__esmInterop")) {
    const anchor = "async function loadESMModules() {";
    if (!shim.includes(anchor)) throw new Error("[WAHA][esm-interop] esm.js: loadESMModules anchor not found");
    shim = shim.replace(anchor, `${anchor}\n    if (globalThis.__esmInterop) { await globalThis.__esmInterop.ready; }`);
    fs.writeFileSync(shimPath, shim);
  }

  // 3. Load the hook before any WAHA module.
  let main = fs.readFileSync(mainPath, "utf8");
  if (!main.includes("esm-interop.cjs")) {
    const lines = main.split("\n");
    let insertAt = 0;
    if (lines.length && /^["']use strict["'];?\s*$/.test(lines[0].trim())) insertAt = 1;
    lines.splice(insertAt, 0, 'require("./esm-interop.cjs"); // Node 20 require(esm) interop (injected by prepare-waha)');
    fs.writeFileSync(mainPath, lines.join("\n"));
  }

  if (skippedDual.length) console.log(`[WAHA][esm-interop] dual-package require() left native (CJS build): ${skippedDual.join(", ")}`);
  console.log(`[WAHA][esm-interop] hook generated: ${coreSpecs.length} core spec(s) [${coreSpecs.join(", ")}], ${backgroundSpecs.length} background warm-up package(s)`);
}
