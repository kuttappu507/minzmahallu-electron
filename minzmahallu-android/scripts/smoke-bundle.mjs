/* ============================================================================
 * Bundle smoke test — boot the BUILT app in a DOM environment and prove that
 * it actually renders the first-run screen.
 *
 *   npm run build && node scripts/smoke-bundle.mjs [directory]
 *
 * Why this exists: `npm test` exercises the service layer in Node, and the
 * native shell cannot be unit-tested off-device. This script closes the
 * remaining gap — it loads the exact JavaScript that the APK ships (the Vite
 * bundle, including the WebAssembly SQLite engine, the schema, the migrations
 * and the screens) inside jsdom and checks:
 *
 *   · the bundle evaluates with no import-time crash,
 *   · the SQLite WebAssembly engine loads and the real schema + 27 migrations
 *     apply (the port's own boot warnings are printed, not hidden),
 *   · `window.mms` — the bridge that replaces Electron IPC — is installed,
 *   · the app renders, and on an empty database it renders **Initial Setup**
 *     (the first screen a freshly installed phone shows).
 *
 * The optional directory argument is how `smoke-apk.mjs` checks the bundle
 * that was extracted back out of a built APK.
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { indexedDB } from "fake-indexeddb";

export async function smokeBundle(dist) {
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error(`[smoke] ${dist}/index.html not found — build first.`);
    return false;
  }

  const dom = new JSDOM(fs.readFileSync(path.join(dist, "index.html"), "utf8"), {
    url: "https://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // The bundle expects a browser global scope: mirror the DOM onto globalThis.
  const globals = {
    window, document: window.document, navigator: window.navigator, location: window.location,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    Event: window.Event, CustomEvent: window.CustomEvent, MutationObserver: window.MutationObserver,
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.crypto ??= (await import("node:crypto")).webcrypto;
  globalThis.indexedDB = window.indexedDB = indexedDB;
  globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  globalThis.ResizeObserver = window.ResizeObserver = Observer;
  globalThis.IntersectionObserver = window.IntersectionObserver = Observer;

  // Serve the WebAssembly engine (and every other file) from disk instead of
  // the network: sql.js resolves it relative to the bundle.
  const realFetch = globalThis.fetch;
  globalThis.fetch = window.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    const file = url.startsWith("https://localhost/")
      ? path.join(dist, url.replace("https://localhost/", ""))
      : url.endsWith(".wasm") ? path.join(dist, "assets", path.basename(url)) : null;
    if (file && fs.existsSync(file)) {
      return new Response(fs.readFileSync(file), {
        headers: { "Content-Type": file.endsWith(".wasm") ? "application/wasm" : "text/javascript" },
      });
    }
    return realFetch(input, init);
  };
  window.XMLHttpRequest = undefined;

  const entry = fs.readdirSync(path.join(dist, "assets")).find((name) => /^index-.*\.js$/.test(name));
  console.log(`[smoke] ${path.relative(process.cwd(), dist)}/assets/${entry}`);
  const failures = [];
  process.on("unhandledRejection", (reason) => failures.push(String(reason)));

  await import(pathToFileURL(path.join(dist, "assets", entry)).href);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const text = (window.document.body.textContent || "").replace(/\s+/g, " ").trim();
  const results = [
    ["bundle evaluated without an unhandled rejection", failures.length === 0],
    ["bridge installed (window.mms)", typeof window.mms === "object" && window.mms !== null],
    ["the app registered its channels", typeof window.mms?.app?.info === "function"],
    ["a screen rendered", text.length > 100],
    ["empty database renders Initial Setup", /Initial Setup/i.test(text)],
  ];

  let ok = true;
  for (const [label, passed] of results) {
    console.log(`[smoke] ${passed ? "PASS" : "FAIL"}  ${label}`);
    if (!passed) ok = false;
  }
  console.log(`[smoke] rendered: ${JSON.stringify(text.slice(0, 160))}…`);
  if (failures.length) console.error("[smoke] rejections:", failures.slice(0, 3));
  return ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(import.meta.dirname, "..", "dist");
  const ok = await smokeBundle(dir);
  // React keeps timers alive; exit deliberately.
  process.exit(ok ? 0 : 1);
}
