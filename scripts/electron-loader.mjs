// ESM loader: resolve bare specifiers "electron" and "better-sqlite3" to local
// shims so the real electron/db/connection.ts can run under plain Node.
const electronStub = new URL("./electron-stub.mjs", import.meta.url).href;
const bsqliteShim = new URL("./better-sqlite3-shim.mjs", import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") return { url: electronStub, shortCircuit: true };
  if (specifier === "better-sqlite3") return { url: bsqliteShim, shortCircuit: true };
  return nextResolve(specifier, context);
}
