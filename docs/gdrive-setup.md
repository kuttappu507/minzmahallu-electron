# Google Drive Backup — Setup & Operations Guide

MMS can upload every backup straight to the mahallu's Google Drive using
Google's REST API. **No Google Drive desktop app, no browser extension, and
no Google password inside MMS.** After a one-time setup below, each install
just clicks *Connect Google account* → signs in → *Allow*, and every backup
(auto and manual) is uploaded automatically to a folder named `MMS-Backups`
(newest 10 kept).

## How it works (architecture)

- **OAuth 2.0 loopback flow with PKCE (RFC 8252)** — MMS starts a one-shot
  local HTTP server on `127.0.0.1:<random port>`, opens the user's default
  browser at Google's consent screen, and receives the authorization code on
  the loopback redirect. A random `state` parameter blocks CSRF; the code is
  exchanged with a PKCE verifier so no confidential client secret is required
  (the optional secret is still sent when provided).
- **Least-privilege scope** — `drive.file`: MMS can only see and manage files
  it created itself (the `MMS-Backups` folder and the `.mmbak` files inside).
  It cannot read or touch anything else in the account. `openid email` is
  requested only to show *which* account is connected.
- **Refresh token storage** — never in the database, never in plaintext.
  It is encrypted with Electron `safeStorage` (Windows DPAPI, bound to the
  Windows user account) and stored as `gdrive-token.bin` inside the app-data
  folder. Consequence (intended): copying the data folder to another PC or
  another Windows user does **not** carry the Google connection — you simply
  reconnect.
- **Best-effort, non-blocking** — an offline PC, a missing folder, or a
  revoked token never fails the backup itself; the failure is recorded in
  `gdrive-state.json` and shown as *Last error* in Settings.
- **Auto-prune** — the Drive folder keeps the newest 10 backups (Drive-side
  `createdTime` ordering), so a free 15 GB account never fills up.

## One-time setup (whoever owns the mahallu's Google account, ~10 minutes)

You only do this **once** — either the maintainer once for all installs, or
each mahallu for itself (see "Who should create the OAuth client?" below).

1. Go to **console.cloud.google.com** and sign in with the mahallu's Google
   account (dedicated account recommended, e.g. `minzmahalluXXX@gmail.com`,
   so the login can be handed over when the committee changes).
2. **Create a project** (any name, e.g. "MMS") → open **APIs & Services →
   Library** → search **Google Drive API** → **Enable**.
3. **OAuth consent screen**: choose **External**, app name `MMS`, fill the
   user-support email, Save. **Then click PUBLISH APP (Production).**
   This step matters: while the consent screen stays in *Testing*, Google
   expires refresh tokens after **7 days** and MMS would need reconnecting
   weekly. Published with only the `drive.file` scope, no verification review
   is needed; users may see a one-time "unverified app" warning during
   consent — click **Advanced → Go to MMS (unsafe)** to proceed.
4. **Credentials → Create Credentials → OAuth client ID** → Application
   type: **Desktop app** → Create.
5. Copy the **Client ID** (looks like
   `1234567890-abc123.apps.googleusercontent.com`) and, if shown, the
   **Client secret** (`GOCSPX-…`).
6. In MMS: **Settings → Backup → Google Drive backup** → paste both values →
   **Save Settings** → **Connect Google account** → choose the mahallu
   account → **Allow**. Done — the browser shows a confirmation page and can
   be closed.

The same steps are available inside the app via the
*How to get the Client ID?* link on the Settings page.

## Daily use

| Action | Where | What happens |
|---|---|---|
| Automatic upload | — (no action) | Every auto-backup and manual backup is uploaded right after it is written |
| Upload the newest backup now | Settings → Backup → Google Drive backup → **Upload now** | Forces an upload without waiting for the next backup |
| Check it works | Settings → **Test** | Refreshes the token and queries the Drive folder |
| Stop using it | Settings → **Disconnect** | Deletes the stored token; backups continue locally |
| See problems | Settings → *Last error* | Last upload failure (e.g. PC was offline) |

## Restoring after the PC is lost

1. New PC: install MMS.
2. Open drive.google.com (any device) → `MMS-Backups` folder → download the
   newest `.mmbak` file.
3. MMS → **Backup page → Restore backup** → choose the downloaded file →
   **Verify & Restore**. The app verifies the sha-256 inside the file and
   restarts with the restored database.

## Who should create the OAuth client?

- **Maintainer creates it once and shares the two values** (fastest): every
  mahallu pastes the same Client ID/Secret and connects its own Google
  account — each install stores its own refresh token. Caveat: Google grants
  unverified apps a limited number of consented users (~100), and every
  mahallu account counts against that single client.
- **Each mahallu creates its own** (cleanest, no shared limit): the 10-minute
  setup above is done per mahallu by whoever owns the account.

Either way, all credentials entered in Settings live only in that install's
local database, and refresh tokens are DPAPI-encrypted.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Google account was disconnected — reconnect" | Access was revoked in the Google account (Google Account → Security → Third-party access) or the consent screen is still in *Testing* mode (7-day token expiry — publish it, see step 3) |
| Connect button disabled | Client ID field is empty — paste it and **Save Settings** first |
| "OS secure storage unavailable" | Windows DPAPI is not accessible (rare, e.g. some broken profiles); MMS refuses to store the token rather than saving it in plaintext |
| Last error: `upload failed (403)` | Drive quota full or file-scope violation — check the account's storage on drive.google.com |
| Nothing uploads, no error | Uploads are best-effort: check the PC is online and that a backup actually ran (Backup page) |
