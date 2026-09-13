# How the port works

The desktop edition is Electron: a React renderer talking over IPC to a Node main
process that owns `better-sqlite3`, `node:crypto`, `fs`, `dialog` and `print`.

An Android app has no Node process — everything runs inside one WebView. The port
therefore keeps **all** of the application code and replaces only the four things
that talked to Node:

| Desktop (Electron) | Android (this project) |
|---|---|
| `ipcRenderer.invoke("module:action", …)` | `window.mms.module.action(…)` → `src/bridge/registry.ts` |
| `better-sqlite3` (native Node addon) | `sql.js` — SQLite compiled to WebAssembly (`src/core/db/sqlite.ts`), wrapped to expose the *same* `prepare/run/get/all/exec/transaction/pragma` API (`better-sqlite3-shim.ts`) |
| `node:crypto` (`pbkdf2`, `randomBytes`, `timingSafeEqual`) | WebCrypto (`subtle.deriveBits`) + `getRandomValues`, in `src/core/platform/crypto.ts` |
| `fs` / `dialog` / `shell.openExternal` / `webContents.print` | the native shell: `window.mmsNative` → `android/src/com/mms/minzmahallu/NativeBridge.java` |

Nothing above the platform layer was rewritten. Services, pages, components, the
i18n dictionary, the SQL schema and the migrations are the same files.

## 1. Two layers, one app

```
   web layer (src/)                          native layer (android/)
   ┌───────────────────────────────┐         ┌──────────────────────────────────┐
   │ pages · components · i18n     │         │ MainActivity · WebView host      │
   │ bridge: registry + handlers   │         │   https://app.mms ← assets/public│
   │ services: auth, receipts, …   │  ⇄      │ NativeBridge (window.mmsNative)  │
   │ SQLite in WebAssembly         │         │   files · share · device · prefs │
   │ platform adapter: webview.ts  │         │ ShareProvider (content:// files) │
   └───────────────────────────────┘         └──────────────────────────────────┘
```

* **The bridge** (`src/bridge/`) replaces Electron IPC: a channel→handler Map, the
  business handlers, the secured (audited) layer, WhatsApp/receipt channels, the
  `window.mms` API the UI calls, and `bootApp()` — the boot sequence
  (database → migrations → security guards → handlers → background backup timer).
  `src/bridge/bridge.test.ts` drives all of it end-to-end.
* **The native shell** (`android/`) is deliberately tiny and dependency-free:
  framework classes only, so the APK can be built without Gradle, Android Studio,
  AndroidX or Maven. It provides exactly what a browser cannot:
  * an `https://app.mms` origin served straight out of `assets/public`, which
    makes the WebView a secure context — WebCrypto, WebAssembly and `fetch` all
    work, and `localStorage` has a stable origin;
  * app-private file storage for the database and backups (no storage permission);
  * the Android share sheet for the generated PDFs/backups/spreadsheets, through a
    read-only `content://` provider (what replaces the desktop "Save as…" dialog);
  * device identity (`Build.*`, `Settings.Secure.ANDROID_ID`, a per-install random
    id) for the anti-forgery fingerprint;
  * preferences, status-bar colour, native alerts, the hardware back button, the
    foreground/background lifecycle (the database flushes on `pause`), and the
    `mms://verify/<code>` deep link a scanned QR code opens.

The Java/JS contract is a single method — `mmsNative.call(method, json)` returning
JSON — so adding a capability never changes the interface, and native→JS events
(`back`, `resume`, `pause`, `deeplink`) go through one callback that queues
anything fired before the page is ready (a cold start from a QR scan, typically).

## 2. The database

* `sql/schema.sql` + `sql/seed.sql` build a fresh database; `sql/migrations/*.sql`
  (27 files) bring an existing one up to date.
* On first launch the app builds the schema in memory (`sqlite.ts`), then persists
  the exported image into the app's private storage — `filesDir/data/mms.db`
  (`/data/data/com.mms.minzmahallu/files/data/mms.db`).
* Writes mark the database dirty; `persistNow()` exports and writes the file after
  writes, and on `visibilitychange` / `pagehide` / the native `pause` event.
  `PRAGMA foreign_keys=ON` is re-asserted after every export (sql.js drops it when
  the image round-trips).
* The migration applier (`src/core/db/connection.ts → applyMigration`) runs each
  file inside a transaction; if a file cannot apply as a whole — because the
  runtime schema pass already added a column, or because only part of it applies
  to the current shape — it replays statement by statement, retrying until no
  further progress, and records which statements were skipped as boot warnings.
  A migration is never silently dropped, and reconciliations are tagged
  `(compatibility-reconciled)` in `schema_version`.
* Backup format is unchanged: `.mmbak` = manifest + SHA-256 + the SQLite image.
  Restore verifies the hash, then replaces the file and reopens the connection.

Logical paths map onto app-private storage (see `NativeBridge.resolveLogical`):

| Logical path | Where it really lives |
|---|---|
| `data/mms.db` | `filesDir/data/mms.db` — the live database |
| `docs/*.mmbak`, `docs/mirror/…` | `filesDir/docs/…` — verified backups + rolling mirror |
| `cache/…`, `mms-share/…` | `cacheDir/…` — share-sheet scratch copies |

## 3. Security model (unchanged)

* Passwords: `pbkdf2_sha256$200000$<salt>$<hash>`, PBKDF2-HMAC-SHA256, 200 000
  iterations, 32-byte key, constant-time comparison. A database created on the
  office PC logs in on the phone and vice versa.
* No default password ships: an install whose only row carries a publicly known
  demo hash is forced through **Initial Setup**, and `login()` refuses until then.
* 5 failed attempts lock the account for 15 minutes.
* Sensitive operations (cancellations, disbursements, resignations, edits of
  official records) require the administrator's password again.
* `record_history` (append-only, enforced by triggers from migration V010) stores
  old/new values for every audited edit; `audit_log` is a hash chain with an
  anchor row, so deleting or editing a historic event breaks verification.

## 4. Printing and PDFs

Documents are built as HTML strings (`src/core/print/*.template.ts`), rendered
into a hidden iframe, rasterised, and written as a PDF with jsPDF. On Android the
finishing move is the share sheet instead of a "Save as…" dialog, which covers
WhatsApp, Gmail, Drive and printer apps in one step. The Anek Malayalam and
Poppins faces are embedded in the bundle as data URIs (`anek-font-css.ts`,
generated from `@fontsource-variable/anek-malayalam`), so Malayalam documents
render identically with no internet and no system fonts.

The preview popup's screen styles live in `src/core/print/preview-screen.ts`
(exported as a plain string): they must be inlined into a print document, and a
string is the one form that behaves the same in the WebView, in the bundler and
under the test runner.

## 5. Mobile shell

`src/styles/mobile.css` (≤900 px) is layered on top of the desktop CSS and only
touches the shell:

* sidebar → slide-over drawer, opened by the hamburger in the top bar, closed by
  navigation or by tapping the backdrop (`src/lib/mobileNav.ts`, `Topbar.tsx`,
  `App.tsx` add the `nav-open` class);
* desktop window buttons hidden, dialogs become bottom sheets capped at 92 dvh;
* `.tbl` scrolls horizontally with a 640 px minimum width instead of squeezing
  columns;
* 44 px touch targets and 16 px form text (prevents Android's focus zoom;
  pinch-zoom stays available for reading a register);
* `env(safe-area-inset-*)` padding for notch and gesture bar;
* hardware back button → the app closes a dialog/drawer or walks history, and
  asks the shell to minimise (`ui.minimize()`) at the root screen; the database
  flushes on every `pause`.

## 6. Tests and verification

`npm test` runs 21 files / 196 tests in a Node environment (no device needed):

* every service suite ported from the desktop edition (subscriptions, receipts,
  tokens, certificates, accounting, backup mirror, QR, i18n, audit chain…);
* `src/bridge/bridge.test.ts` boots the real app — real SQLite schema,
  migrations, security layer — and drives it through `window.mms`: auth gating,
  family + member CRUD, a secured edit that writes history, donations and the
  dashboard, the token module, the audit chain, a full backup
  create → verify → list → share → delete cycle, and generated-file hand-off.

`scripts/vitest-setup.mts` opens the database once per process (the node file
adapter honours `MMS_DATA_DIR`, defaulting to a per-PID temp dir) and creates the
Administrator row a real installation would have after first-run setup — with a
password nobody knows, because the repo must not contain credentials.

Two smoke tests cover what unit tests cannot:

| Command | What it proves |
|---|---|
| `npm run smoke` | the **built bundle** boots in jsdom: the WebAssembly SQLite engine applies the real schema + 27 migrations, `window.mms` installs, and an empty database renders the Initial Setup screen |
| `npm run smoke:apk` | the **APK** is properly signed (v1+v2+v3), declares no permission except `INTERNET`, and the bundle extracted back out of `assets/public` still boots and renders Initial Setup |

## 7. Build pipeline

```
npm ci → typecheck → tests → vite build → bundle smoke test
       → node scripts/build-apk.mjs   (aapt2 → ecj → d8 → zip → apksigner)
       → npm run smoke:apk            (signature + manifest + packaged bundle)
       → upload release/*-debug.apk
```

`scripts/build-apk.mjs` is the whole Android build. There is no Gradle: the script

1. fetches its toolchain once into `.toolchain/` (git-ignored) — aapt2 from the
   npm package `aaptjs3`; `android.jar`, D8, ECJ and apksigner from
   `@drxiaozhi/minapk`; a JRE from the PyPI wheel `jdk4py` when the machine has no
   Java of its own;
2. compiles `android/res` with aapt2 and links it against the manifest (which is
   also where `R.java` comes from);
3. compiles `android/src` with ECJ (a `javac` that needs no JDK);
4. dexes the result with D8 (`--min-api 23`, `--lib android.jar`);
5. packages `resources.apk` + `classes.dex` + the entire `dist/` bundle as
   `assets/public/`;
6. signs it — v1+v2+v3 — with the bundled debug keystore, or with the release
   keystore from the environment, and verifies the signature;
7. checks that every file in `dist/` really is inside the APK.

With the keystore secrets set, CI also produces a signed release APK, and a `v*`
tag attaches the APKs to a GitHub Release.

## 8. Maintenance notes

* **Icons / splash**: `npm run icons` regenerates every density from
  `public/icon-512.png` (they are checked in, so a clone builds as-is).
* **New migration**: drop the `.sql` file into `sql/migrations/` like on desktop.
  The applier handles both clean and partially-applied databases.
* **Version bump**: `package.json` `version` (the APK version code is
  `major*10000 + minor*100 + patch`, set in `scripts/build-apk.mjs`), and the same
  numbers in `android/AndroidManifest.xml`'s `versionCode`/`versionName` comment.
* **New native capability**: add a case to `NativeBridge.dispatch`, call it from
  `src/core/platform/webview.ts`, and (if the browser build should degrade
  gracefully) from `web.ts`. No build files change.
* **Rebuilding the APK without re-running vite**: `npm run apk:fast`.
* **Do not** disable `PRAGMA foreign_keys` — the port keeps the desktop's
  relational integrity, and the suites fail loudly if a fixture is missing.
