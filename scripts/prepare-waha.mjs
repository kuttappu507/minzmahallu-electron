import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const VERSION = "2026.8.1";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "resources", "waha");
const MARKER = path.join(OUT, ".version");

if (fs.existsSync(path.join(OUT, "dist", "main.js")) && fs.existsSync(MARKER) && fs.readFileSync(MARKER, "utf8").trim() === VERSION) {
  console.log(`[WAHA] bundled ${VERSION} already prepared`);
  process.exit(0);
}

if (process.env.MMS_SKIP_WAHA === "1") {
  console.log("[WAHA] preparation skipped by MMS_SKIP_WAHA=1");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mms-waha-"));
const tarName = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", `github:devlikeapro/waha#${VERSION}`, "--silent"], { cwd: tmp, encoding: "utf8" }).trim().split(/\r?\n/).pop();
if (!tarName) throw new Error("Unable to download WAHA source package");
execFileSync("tar", ["-xzf", tarName], { cwd: tmp, stdio: "inherit" });
const dirs = fs.readdirSync(tmp, { withFileTypes: true }).filter(e => e.isDirectory());
const source = dirs.find(e => e.name.startsWith("package"))?.name || dirs.find(e => e.name.startsWith("waha-"))?.name;
if (!source) throw new Error("Unable to locate extracted WAHA source");
const wahaRoot = path.join(tmp, source);

console.log(`[WAHA] installing pinned source ${VERSION} (NOWEB build, no Chromium download)`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["install", "--no-audit", "--no-fund"], { cwd: wahaRoot, stdio: "inherit", env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true" } });
execFileSync(npm, ["run", "build"], { cwd: wahaRoot, stdio: "inherit", env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true", WHATSAPP_DEFAULT_ENGINE: "NOWEB" } });
execFileSync(npm, ["prune", "--omit=dev", "--no-audit", "--no-fund"], { cwd: wahaRoot, stdio: "inherit", env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true" } });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(wahaRoot, "dist"), path.join(OUT, "dist"), { recursive: true });
fs.cpSync(path.join(wahaRoot, "node_modules"), path.join(OUT, "node_modules"), { recursive: true });
fs.copyFileSync(path.join(wahaRoot, "package.json"), path.join(OUT, "package.json"));
fs.writeFileSync(MARKER, VERSION + "\n", "utf8");
fs.writeFileSync(path.join(OUT, "README.txt"), `Mahallu Manager bundled WAHA runtime\nVersion: ${VERSION}\nEngine: NOWEB\nManaged automatically by Mahallu Manager. Do not edit or run manually.\n`, "utf8");

console.log(`[WAHA] prepared ${VERSION} at ${OUT}`);
