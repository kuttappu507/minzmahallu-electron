/*
 * Preload build step — CommonJS emit for the sandboxed renderer.
 *
 * WHY THIS EXISTS (security hardening):
 *   Electron loads sandboxed preload scripts as plain CommonJS with a
 *   limited `require` shim (electron + events/timers/url only). An ESM
 *   preload (the old dist-electron/preload.mjs) requires sandbox:false —
 *   the exact configuration this build removes. The preload source stays
 *   electron/preload.mts (typed, typechecked by tsconfig.preload.json) and
 *   is transformed here into dist-electron/preload.cjs.
 *
 * The preload only imports from "electron" (contextBridge/ipcRenderer), so
 * the output is a single CJS file with an external require("electron") —
 * exactly the shape the sandboxed preload loader expects.
 */
import { build } from "esbuild";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "dist-electron");
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "electron", "preload.mts")],
  outfile: path.join(outDir, "preload.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});

// Remove stale ESM preload artifacts from earlier builds so a packaged app
// can never ship (or accidentally load) the unsandboxed variant.
for (const stale of ["preload.mjs", "preload.d.mts", "preload.mjs.map", "preload.js.map"]) {
  const p = path.join(outDir, stale);
  if (existsSync(p)) rmSync(p);
}
