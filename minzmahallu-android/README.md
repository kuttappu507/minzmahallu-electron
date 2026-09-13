# Minz Mahallu Management System — Android

The mahallu office software, rebuilt as a real Android app. Same pages, same data
model, same security rules as the Windows/desktop edition — running on a phone or
tablet, **fully offline**, with the whole database living on the device.

| | |
|---|---|
| Package | `com.mms.minzmahallu` |
| Version | 2.0.0 (versionCode 20000) |
| Android | 6.0 (API 23) and newer, phones and tablets |
| Internet | Not required. The app never talks to a server; the only network use is the optional "message on WhatsApp" hand-off (click-to-chat). |
| Stack | React 18 + TypeScript + Vite inside a framework-only native WebView shell, SQLite compiled to WebAssembly, no Gradle and no Maven anywhere in the build |
| Verification | `npm run typecheck` clean · `npm test` → 21 files / 196 tests green · `npm run smoke` boots the built bundle · `npm run smoke:apk` re-opens the built APK, checks its signature and boots the bundle inside it · APK built by GitHub Actions on every push |

---

## 1. Install it on a phone

The APK is built by CI — you do not need a computer with Android Studio.

1. Open the repository's **Actions** tab → the newest **Android APK** run.
2. Download the artifact **`minz-mahallu-debug-apk`** and unzip it → `app-debug.apk`.
3. Copy the file to the phone (USB, Google Drive, WhatsApp to yourself — anything).
4. Tap the APK. Android asks to allow installing from this source — allow it for
   that one app, then install.
5. Open **Minz Mahallu**. The first screen is **Initial Setup**: create the
   Administrator account (username, full name, password).

> The debug APK is self-signed, which is exactly what a side-loaded app needs.
> If you want a *signed release* APK (Play Store style), add the four keystore
> secrets listed in `.github/workflows/android.yml` and the workflow will build
> and upload `minz-mahallu-release-apk` too. Tag a commit `v2.0.0` and the APK is
> attached to a GitHub Release automatically.

### First run

1. **Initial Setup** — there is no default password anywhere in the code. Pick a
   strong one (8+ characters, upper, lower, digit, symbol). It is stored as
   PBKDF2-SHA256, 200 000 iterations, exactly the format the desktop edition
   writes, so a database restored from the office PC still logs in with the same
   password.
2. **Families → Add family** — create a house, then add its members (one Head per
   family).
3. Subscriptions, donations, welfare, marriages, deaths, certificates, tokens,
   staff, committee, accounting and reports work as in the desktop edition.

### Backups (do this weekly)

**Backup & Restore → Create backup** writes a verified `.mmbak` file, then opens
the Android share sheet so you can send it to Drive, WhatsApp or a pen drive.
Restore reads the file back, checks its SHA-256 against the manifest inside, and
replaces the database in place. The app also keeps an automatic rolling mirror of
the last few backups in its private storage.

---

## 2. Build it yourself

Requirements: Node 20+ (22 recommended), JDK 21, Android SDK with platform 35
(Android Studio brings all of it).

```bash
npm ci                 # dependencies (uses .npmrc: legacy-peer-deps)
npm run typecheck      # TypeScript, must be clean
npm test               # 196 tests, includes a full app-boot integration suite
npm run build          # web bundle → dist/
npm run smoke          # boots dist/ in a DOM and renders the first-run screen
npx cap sync android   # copy the bundle + plugins into android/
npm run icons          # regenerate launcher icons + splash screens (optional)

# APK
npm run android:apk                       # → android/app/build/outputs/apk/debug/app-debug.apk
# or open the project in Android Studio
npm run android                           # build, sync and open Android Studio
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm run dev` | web preview of the same UI in a browser (`localhost:5173`) |
| `npm run typecheck` | full TypeScript build check |
| `npm test` / `npm run test:watch` | the test suite |
| `npm run smoke` | boots the built bundle in a DOM and checks the first-run screen renders |
| `npm run verify` | typecheck + tests + build + bundle smoke test, in one go |
| `npm run sync` | build + copy into the Android project |
| `npm run android:apk` | build a installable debug APK |
| `npm run android:release` | build a release APK (needs a keystore) |
| `npm run icons` | regenerate Android launcher/splash art from `public/icon-512.png` |
| `npm run audit:i18n` | reports missing Malayalam translations |

---

## 3. What is inside

* **Every module of the desktop app**: families and members, subscriptions and
  arrears, donations and donors, welfare, marriages, deaths, certificates with QR
  verification, event tokens, staff, committee, double-entry accounting, reports
  and the tamper-evident audit log.
* **A real database on the phone.** SQLite compiled to WebAssembly (`sql.js`),
  the same `schema.sql`, `seed.sql` and 27 migrations the desktop edition uses.
  The file is persisted to the app's private storage after writes and on
  background/unload, so nothing is lost when Android kills the app. Only
  `android.permission.INTERNET` is ever requested — no storage permission.
* **The desktop's security model**, ported unchanged: PBKDF2-SHA256 passwords,
  5-failure / 15-minute lockout, admin password re-verification before
  cancellations, disbursements, resignations and edits of official records, and
  an append-only history (`record_history`) plus hash-chained `audit_log`.
* **Printing and PDFs.** Documents (certificates, receipts, tokens, registers,
  statements) are rendered offline in an iframe and rasterised to PDF with jsPDF;
  the Malayalam font is embedded in the bundle, so no internet and no system font
  is needed. On Android the PDF goes through the share sheet — WhatsApp, Gmail,
  Drive or a Bluetooth printer app.
* **Malayalam + English** UI with the same language toggle and Anek Malayalam /
  Poppins typography.
* **Mobile shell**: the desktop sidebar becomes a slide-over drawer, dialogs
  become bottom sheets, wide tables scroll sideways instead of squashing, all
  controls keep 44 px touch targets, and safe-area insets are respected so
  nothing hides behind the status bar or the gesture bar.

### WhatsApp messaging on a phone

The desktop edition drove WhatsApp through a headless browser engine (WAHA)
running on the office PC. An Android app cannot host that engine, so the message
templates, recipient selection, logging and delivery status are all still there —
what changes is the last step: **the message is handed to the WhatsApp app on the
phone** (click-to-chat, text pre-filled) instead of being sent by a background
service. Every outbound message is still recorded with its recipient, template
and state, and the pending-recipients list, per-family recipient rules and
campaign screens work as before. The rest of the WhatsApp module (templates,
logs, per-event token messages, receipt PDF attachment) is unchanged.

---

## 4. Repository layout

```
src/                  the application
  pages/              one file per screen (Dashboard, Families, Donations, …)
  components/         shared UI (DataTable, Modal, Topbar, Sidebar, …)
  bridge/             the layer that replaces Electron IPC: registry, handlers,
                      window.mms API, boot sequence
  core/
    db/               SQLite-on-WebAssembly: connection, schema, migrations,
                      persistence, sql.js shim
    platform/         crypto (WebCrypto) + the host adapters: webview (Android
                      shell), web (browser), node (tests)
    services/         all business logic (auth, security, receipts, backup, …)
    services/data/    the data modules behind every screen
    print/            HTML document templates + PDF renderer
sql/                  schema.sql, seed.sql and 27 migrations (shared with desktop)
android/              the native shell (manifest, Java, resources) — the APK's
                      only non-web code
scripts/              APK builder, bundle/APK smoke tests, icon generator,
                      i18n audits, test setup
.github/workflows/    the APK pipeline
docs/ANDROID-PORT.md  how the port works, module by module
```

## 5. Licence

MIT — see `LICENSE`.
