#!/usr/bin/env node
/* ============================================================================
 * End-to-end check on a BUILT APK.
 *
 *   npm run apk && npm run smoke:apk [path/to/app.apk]
 *
 * The APK is opened as the installer would, its web bundle is extracted back
 * out of `assets/public`, and the same smoke test that guards `dist/` runs
 * against it — the WebAssembly SQLite engine applies the real schema and
 * migrations and the app renders its first-run screen.
 *
 * It also re-checks the things a store or a phone looks at: the signature
 * schemes and the manifest (package, version, SDK levels, permissions).
 * ========================================================================== */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { smokeBundle } from "./smoke-bundle.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const usage = "usage: node scripts/smoke-apk.mjs [path/to/app.apk]";

function fail(message) {
  console.error(`\u001b[31m[smoke:apk] ${message}\u001b[0m`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || "");
}

// ---------------------------------------------------------------- the APK
let apk = process.argv[2];
if (!apk) {
  const releaseDir = path.join(ROOT, "release");
  if (!fs.existsSync(releaseDir)) fail(`no APK given and ${path.relative(ROOT, releaseDir)}/ does not exist`);
  const candidates = fs.readdirSync(releaseDir).filter((name) => name.endsWith(".apk")).sort();
  if (!candidates.length) fail("no APK in release/ — run `npm run apk` first");
  apk = path.join(releaseDir, candidates[candidates.length - 1]);
}
if (!fs.existsSync(apk)) fail(`APK not found: ${apk}`);
console.log(`[smoke:apk] ${path.relative(ROOT, apk)}  (${(fs.statSync(apk).size / 1024 / 1024).toFixed(2)} MB)`);

// ------------------------------------------------------------ signature
const tools = path.join(ROOT, ".toolchain", "tools");
const java = run("java", ["-version"]) !== null
  ? "java"
  : path.join(ROOT, ".toolchain", "jdk", "jdk4py", "java-runtime", "bin", "java");
let signatureChecked = false;
if (fs.existsSync(path.join(tools, "apksigner.jar"))) {
  const verified = run(java, ["-jar", path.join(tools, "apksigner.jar"), "verify", "--verbose", apk]);
  if (verified === null) fail("the APK signature does not verify");
  const schemes = ["v1", "v2", "v3"].filter((scheme) => {
    // apksigner words v1 differently ("JAR signing") from v2/v3.
    const pattern = scheme === "v1"
      ? /v1 scheme \(JAR signing\): true/
      : new RegExp("scheme \\(APK Signature Scheme " + scheme + "\\): true");
    return pattern.test(verified);
  });
  console.log(`[smoke:apk] signature verifies — ${schemes.join(" + ") || "no schemes"}`);
  if (!schemes.includes("v2")) fail("the APK is not signed with the v2 scheme (Android 7+ requires it)");
  signatureChecked = true;
} else {
  console.warn("[smoke:apk] apksigner not fetched — skipping the signature check");
}

// ------------------------------------------------------------- manifest
const aapt2 = path.join(ROOT, ".toolchain", "bin", "aapt2");
if (fs.existsSync(aapt2)) {
  const badging = run(aapt2, ["dump", "badging", apk]);
  if (badging === null) fail("aapt2 could not read the APK");
  const pick = (pattern) => (badging.match(pattern) || [])[1] || "?";
  console.log(`[smoke:apk] package ${pick(/package: name='([^']+)'/)} · versionName ${pick(/versionName='([^']+)'/)} · versionCode ${pick(/versionCode='([^']+)'/)}`);
  console.log(`[smoke:apk] minSdk ${pick(/minSdkVersion:'([^']+)'/)} · targetSdk ${pick(/targetSdkVersion:'([^']+)'/)}`);
  const permissions = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((match) => match[1]);
  console.log(`[smoke:apk] permissions: ${permissions.join(", ") || "none"}`);
  const risky = permissions.filter((permission) => !/INTERNET/.test(permission));
  if (risky.length) fail(`unexpected permissions: ${risky.join(", ")}`);
}

// -------------------------------------------------- the bundle inside it
const extractDir = path.join(ROOT, ".toolchain", "apk-contents");
fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });
const unzipped = spawnSync("unzip", ["-q", apk, "assets/public/*", "-d", extractDir], { stdio: "inherit" });
if (unzipped.error || unzipped.status !== 0) fail("could not extract assets/public from the APK");

const bundle = path.join(extractDir, "assets", "public");
const ok = await smokeBundle(bundle);
if (!ok) fail("the bundle packaged inside the APK does not boot");

console.log(`\u001b[32m[smoke:apk] OK\u001b[0m — the APK boots the application${signatureChecked ? " and is properly signed" : ""}.`);
process.exit(0);
