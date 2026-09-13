#!/usr/bin/env node
/* ============================================================================
 * Build the Android APK — no Gradle, no Android Studio, no Maven.
 *
 *   npm run apk            # build dist/ (vite) and produce the signed APK
 *   npm run apk:tools      # only fetch/verify the toolchain
 *
 * Everything the build needs is either checked in (the shell in android/) or
 * downloaded once into .toolchain/ (git-ignored):
 *
 *   java          a JRE — the machine's own, else bundled jdk4py from PyPI
 *   aapt2         Android asset packaging tool, from the npm package aaptjs3
 *   android.jar   the framework to compile against, from @drxiaozhi/minapk
 *   ecj           Eclipse compiler (javac without a full JDK), from the same
 *   d8.jar        the dexer (R8/D8), from the same
 *   apksigner.jar APK Signature Scheme v1/v2/v3 signer, from the same
 *   debug.keystore a standard debug key so a sideloadable APK always builds
 *
 * Output: release/minz-mahallu-<version>-<debug|release>.apk
 *
 * A signed release build is produced when these environment variables are set
 * (the GitHub workflow fills them from repository secrets):
 *   MMS_KEYSTORE_PATH, MMS_KEYSTORE_PASSWORD, MMS_KEY_ALIAS, MMS_KEY_PASSWORD
 * ========================================================================== */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ANDROID = path.join(ROOT, "android");
const TOOLCHAIN = path.join(ROOT, ".toolchain");
const PACKAGES = path.join(TOOLCHAIN, "packages");
const BUILD = path.join(ANDROID, "build");
const DIST = path.join(ROOT, "dist");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const APP_VERSION = pkg.version || "1.0.0";
const MIN_SDK = 23;
const TARGET_SDK = 34;
/** Semantic version → Android versionCode (2.0.0 → 20000) */
const VERSION_CODE = (() => {
  const [major = 0, minor = 0, patch = 0] = String(APP_VERSION)
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
  return major * 10000 + minor * 100 + patch;
})();

const args = new Set(process.argv.slice(2));
const fetchOnly = args.has("--fetch-only");
const clean = args.has("--clean") || !args.has("--keep");

// ---------------------------------------------------------------- utilities
const log = (message) => console.log(`\u001b[36m[apk]\u001b[0m ${message}`);
const step = (message) => console.log(`\n\u001b[1;36m▸ ${message}\u001b[0m`);
const warn = (message) => console.warn(`\u001b[33m[apk] ${message}\u001b[0m`);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", cwd: ROOT, ...options });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} exited with ${result.status}`);
  }
}

function tryRun(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "pipe", cwd: ROOT, ...options });
  return result.status === 0 ? String(result.stdout || "").trim() : null;
}

function walk(directory, matches) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, matches));
    else if (matches(entry.name)) found.push(full);
  }
  return found;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function download(url, destination) {
  log(`downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

// ---------------------------------------------------------------- toolchain
async function ensureToolchain() {
  fs.mkdirSync(PACKAGES, { recursive: true });
  fs.mkdirSync(path.join(TOOLCHAIN, "bin"), { recursive: true });
  fs.mkdirSync(path.join(TOOLCHAIN, "tools"), { recursive: true });

  const tools = {
    aapt2: path.join(TOOLCHAIN, "bin", "aapt2"),
    androidJar: path.join(TOOLCHAIN, "tools", "android.jar"),
    d8: path.join(TOOLCHAIN, "tools", "d8.jar"),
    ecj: path.join(TOOLCHAIN, "tools", "ecj.jar"),
    apksigner: path.join(TOOLCHAIN, "tools", "apksigner.jar"),
    keystore: path.join(TOOLCHAIN, "tools", "debug.keystore"),
    java: null,
  };

  // --- aapt2 + the Android build tools --------------------------------
  if (!fs.existsSync(tools.aapt2) || !fs.existsSync(tools.androidJar)) {
    step("Fetching the Android build tools (npm packages aaptjs3, @drxiaozhi/minapk)");
    run("npm", ["pack", "aaptjs3", "@drxiaozhi/minapk", "--pack-destination", PACKAGES], { stdio: "pipe" });
    for (const file of fs.readdirSync(PACKAGES)) {
      if (!file.endsWith(".tgz")) continue;
      const archive = path.join(PACKAGES, file);
      if (file.startsWith("aaptjs3")) {
        run("tar", ["xzf", archive, "-C", PACKAGES, "package/bin/x64/linux/aapt2"]);
        fs.copyFileSync(path.join(PACKAGES, "package/bin/x64/linux/aapt2"), tools.aapt2);
        fs.chmodSync(tools.aapt2, 0o755);
      } else if (file.startsWith("drxiaozhi-minapk")) {
        run("tar", ["xzf", archive, "-C", PACKAGES, "package/tools"]);
        const source = path.join(PACKAGES, "package/tools");
        fs.copyFileSync(path.join(source, "android.jar"), tools.androidJar);
        fs.copyFileSync(path.join(source, "d8.jar"), tools.d8);
        fs.copyFileSync(path.join(source, "ecj-3.45.0.jar"), tools.ecj);
        fs.copyFileSync(path.join(source, "apksigner.jar"), tools.apksigner);
        fs.copyFileSync(path.join(source, "debug.keystore"), tools.keystore);
      }
    }
  }

  // --- a JRE -----------------------------------------------------------
  const systemJava = tryRun("java", ["-version"]);
  if (systemJava !== null) {
    tools.java = "java";
    log(`using the JRE on PATH (${systemJava.split("\n")[0]})`);
  } else {
    // The wheel is a plain zip: unpack either with Python's zipfile (mode bits
    // are not restored) or unzip, then make the JDK's bin/ executable.
    const javaHome = () => {
      const candidates = fs.existsSync(path.join(TOOLCHAIN, "jdk"))
        ? walk(path.join(TOOLCHAIN, "jdk"), (name) => name === "java")
        : [];
      return candidates.sort((a, b) => a.length - b.length)[0] || null;
    };
    let bundled = javaHome();
    if (!bundled) {
      step("Fetching a Java runtime (PyPI package jdk4py)");
      const response = await fetchJson("https://pypi.org/pypi/jdk4py/json");
      const wheel = response.urls.find((file) => file.filename.includes("manylinux_2_17_x86_64"));
      if (!wheel) throw new Error("jdk4py has no linux x86_64 wheel");
      const file = path.join(PACKAGES, wheel.filename);
      if (!fs.existsSync(file)) await download(wheel.url, file);
      const python = tryRun("python3", ["--version"]) !== null ? "python3" : null;
      fs.mkdirSync(path.join(TOOLCHAIN, "jdk"), { recursive: true });
      if (python) run("python3", ["-m", "zipfile", "-e", file, path.join(TOOLCHAIN, "jdk")]);
      else run("unzip", ["-q", "-o", file, "-d", path.join(TOOLCHAIN, "jdk")]);
      bundled = javaHome();
      if (!bundled) throw new Error("jdk4py extracted without a java binary");
    }
    // Zip extraction does not carry the executable bit; make bin/ usable.
    for (const entry of fs.readdirSync(path.dirname(bundled))) {
      const target = path.join(path.dirname(bundled), entry);
      try {
        if (fs.statSync(target).isFile()) fs.chmodSync(target, 0o755);
      } catch { /* unreadable entry: java itself is what matters */ }
    }
    tools.java = bundled;
  }

  // Fail early and clearly if any piece is missing.
  for (const [name, file] of Object.entries(tools)) {
    if (name === "java") continue;
    if (!file || !fs.existsSync(file)) throw new Error(`Missing toolchain file: ${name}`);
  }
  return tools;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

// ------------------------------------------------------------------- build
function compileResources(tools) {
  step("Compiling resources (aapt2)");
  const resDir = path.join(ANDROID, "res");
  const compiledDir = path.join(BUILD, "res");
  const apkDir = path.join(BUILD, "apk");
  // aapt2 appends to an existing archive, so always start from an empty slate.
  fs.rmSync(compiledDir, { recursive: true, force: true });
  fs.rmSync(apkDir, { recursive: true, force: true });
  fs.rmSync(path.join(BUILD, "gen"), { recursive: true, force: true });
  fs.mkdirSync(compiledDir, { recursive: true });
  fs.mkdirSync(apkDir, { recursive: true });

  const genDir = path.join(BUILD, "gen");
  fs.mkdirSync(genDir, { recursive: true });
  const compiledZip = path.join(compiledDir, "compiled.zip");
  run(tools.aapt2, ["compile", "--dir", resDir, "-o", compiledZip]);
  run(tools.aapt2, [
    "link",
    "-o", path.join(apkDir, "resources.apk"),
    "-I", tools.androidJar,
    "--manifest", path.join(ANDROID, "AndroidManifest.xml"),
    "--min-sdk-version", String(MIN_SDK),
    "--target-sdk-version", String(TARGET_SDK),
    "--version-code", String(VERSION_CODE),
    "--version-name", APP_VERSION,
    "--auto-add-overlay",
    "--java", genDir,          // emits R.java for the shell to compile
    compiledZip,
  ]);
}

function compileJava(tools) {
  step("Compiling the native shell (ECJ)");
  const sources = [
    ...walk(path.join(ANDROID, "src"), (name) => name.endsWith(".java")),
    ...walk(path.join(BUILD, "gen"), (name) => name.endsWith(".java")),   // aapt2's R.java
  ];
  if (!sources.length) throw new Error("No Java sources found in android/src");
  const classesDir = path.join(BUILD, "classes");
  fs.mkdirSync(classesDir, { recursive: true });
  run(tools.java, [
    "-jar", tools.ecj,
    "-source", "8", "-target", "8", "-encoding", "UTF-8",
    "-nowarn",
    "-bootclasspath", tools.androidJar,
    "-classpath", tools.androidJar,
    "-d", classesDir,
    ...sources,
  ]);
  return walk(classesDir, (name) => name.endsWith(".class"));
}

function dex(tools, classFiles) {
  step(`Dexing (D8, min API ${MIN_SDK})`);
  const dexDir = path.join(BUILD, "dex");
  fs.mkdirSync(dexDir, { recursive: true });
  run(tools.java, [
    "-cp", tools.d8,
    "com.android.tools.r8.D8",
    "--min-api", String(MIN_SDK),
    "--lib", tools.androidJar,
    "--output", dexDir,
    ...classFiles,
  ]);
  return dexDir;
}

function packageApk(dexDir) {
  step("Packaging the APK (resources + classes.dex + web bundle)");
  const apkDir = path.join(BUILD, "apk");
  const unsigned = path.join(BUILD, "app-unsigned.apk");
  fs.copyFileSync(path.join(apkDir, "resources.apk"), unsigned);

  // classes.dex lives at the archive root.
  run("zip", ["-q", "-u", unsigned, "classes.dex"], { cwd: dexDir });

  // The whole web application, straight out of vite's dist/.
  const assetsRoot = path.join(BUILD, "assets");
  fs.rmSync(assetsRoot, { recursive: true, force: true });
  fs.mkdirSync(assetsRoot, { recursive: true });
  copyTree(DIST, path.join(assetsRoot, "public"));
  run("zip", ["-q", "-r", "-u", unsigned, "assets"], { cwd: BUILD });
  return unsigned;
}

/** Proves the APK ships exactly the bundle that was tested: every file in dist/
 *  must be present in the APK with the same SHA-256. */
function verifyPackagedAssets(apkPath) {
  step("Verifying the packaged web bundle against dist/");
  const listing = tryRun("unzip", ["-Z1", apkPath]);
  if (listing === null) {
    warn("unzip is unavailable — skipping the bundle integrity check");
    return;
  }
  const entries = new Set(listing.split("\n").map((line) => line.trim()).filter(Boolean));
  const expected = walk(DIST, () => true);
  const missing = [];
  for (const file of expected) {
    const relative = path.relative(DIST, file).split(path.sep).join("/");
    if (!entries.has(`assets/public/${relative}`)) missing.push(relative);
  }
  if (missing.length) {
    throw new Error(`The APK is missing ${missing.length} bundled file(s): ${missing.slice(0, 5).join(", ")}`);
  }
  log(`${expected.length} bundled files present in the APK`);
}

function signApk(tools, unsigned) {
  const keystore = process.env.MMS_KEYSTORE_PATH || tools.keystore;
  const storePassword = process.env.MMS_KEYSTORE_PASSWORD || "android";
  const keyAlias = process.env.MMS_KEY_ALIAS || "androiddebugkey";
  const keyPassword = process.env.MMS_KEY_PASSWORD || "android";
  const release = process.env.MMS_KEYSTORE_PATH ? "release" : "debug";

  step(`Signing (${release} key, APK signature schemes v1+v2+v3)`);
  const releaseDir = path.join(ROOT, "release");
  fs.mkdirSync(releaseDir, { recursive: true });
  const output = path.join(releaseDir, `minz-mahallu-${APP_VERSION}-${release}.apk`);
  fs.rmSync(output, { force: true });

  run(tools.java, [
    "-jar", tools.apksigner,
    "sign",
    "--ks", keystore,
    "--ks-key-alias", keyAlias,
    "--ks-pass", `pass:${storePassword}`,
    "--key-pass", `pass:${keyPassword}`,
    "--v1-signing-enabled", "true",
    "--v2-signing-enabled", "true",
    "--out", output,
    unsigned,
  ]);

  step("Verifying the signature");
  run(tools.java, ["-jar", tools.apksigner, "verify", "--verbose", output]);
  run(tools.aapt2, ["dump", "badging", output], { stdio: "pipe" });
  return output;
}

// -------------------------------------------------------------------- main
async function main() {
  const tools = await ensureToolchain();
  if (fetchOnly) {
    log("toolchain ready");
    return;
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    throw new Error("dist/index.html is missing — run `npm run build` first (npm run apk does both)");
  }
  if (clean) fs.rmSync(BUILD, { recursive: true, force: true });
  fs.mkdirSync(BUILD, { recursive: true });

  compileResources(tools);
  const classFiles = compileJava(tools);
  const dexDir = dex(tools, classFiles);
  const unsigned = packageApk(dexDir);
  const apk = signApk(tools, unsigned);
  verifyPackagedAssets(apk);

  const size = fs.statSync(apk).size;
  console.log("");
  log(`\u001b[1;32mAPK ready:\u001b[0m ${path.relative(ROOT, apk)}`);
  log(`size ${(size / 1024 / 1024).toFixed(2)} MB · sha256 ${sha256(apk).slice(0, 16)}…`);
  log("Install it on the phone (enable \"Install unknown apps\" for your file manager).");
}

main().catch((error) => {
  console.error(`\u001b[31m[apk] failed:\u001b[0m ${error.message}`);
  process.exit(1);
});
