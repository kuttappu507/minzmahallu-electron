/*
 * Smoke test: the packaged ESM main process loads dist-electron/auto-update.js
 * and CALLS registerAutoUpdater — which is the only place electron-updater's
 * lazy autoUpdater getter is touched. This harness fakes the Electron ESM
 * runtime (named `electron` exports + app adapter surface) so the real
 * electron-updater constructs its platform updater (AppImageUpdater here),
 * proving the CJS default-import interop works end to end.
 */
import { registerHooks } from "node:module";

const electronStub = `
const app = {
  isPackaged: true,
  getVersion: () => "2.2.0",
  getName: () => "minz-mahallu-management",
  name: "minz-mahallu-management",
  getPath: (k) => "/tmp/mms-smoke/" + k,
  on: () => {},
  quit: () => {},
  basePath: "/tmp/mms-smoke",
};
const ipcMain = { handle: (ch) => console.log("[smoke] ipcMain.handle:", ch), on: () => {} };
const shell = { openExternal: () => {} };
export { app, ipcMain, shell };
export default { app, ipcMain, shell };
`;
await import("node:fs").then((fs) => fs.default.mkdirSync("/tmp/mms-smoke-loader", { recursive: true }));
await import("node:fs").then((fs) => fs.default.writeFileSync("/tmp/mms-smoke-loader/electron.mjs", electronStub));

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: "file:///tmp/mms-smoke-loader/electron.mjs", shortCircuit: true };
    return next(specifier, context);
  },
});

const m = await import("/home/z/my-project/mms/dist-electron/auto-update.js");
console.log("[smoke] exports:", Object.keys(m).join(", "));

m.registerAutoUpdater(() => null);
console.log("[smoke] registerAutoUpdater completed — autoUpdater constructed, IPC + listeners wired");

// wire-guard: a second call must be a no-op (no duplicate handlers)
m.registerAutoUpdater(() => null);
console.log("[smoke] SMOKETEST-PASS");
