/* capture-rotation-evidence.mjs — screenshots of the FIXED rotation error
 * states (en + ml) for the user. Uses the rotation E2E's profile. */
import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-rotation-profile";
const OUT = "/home/z/my-project/download";
const COMMON_HASH = "pbkdf2_sha256$200000$c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=$dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=";
fs.mkdirSync(OUT, { recursive: true });

const db = new DatabaseSync(path.join(PROFILE, "mms", "mms.db"));
db.prepare("UPDATE users SET password_hash=?, must_change_pwd=1 WHERE username='e2estaff2'").run(COMMON_HASH);
db.close();

for (const lang of ["en", "ml"]) {
  const electronApp = await _electron.launch({
    cwd: ROOT, args: [".", "--disable-dev-shm-usage", "--disable-gpu"],
    executablePath: path.join(ROOT, "node_modules", "electron", "dist", "electron"),
    env: { ...process.env, XDG_CONFIG_HOME: PROFILE }, timeout: 60_000,
  });
  const page = await electronApp.firstWindow();
  await page.addInitScript((l) => localStorage.setItem("mms-i18n", JSON.stringify({ state: { lang: l }, version: 0 })), lang);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill("e2estaff2");
  await inputs.nth(1).fill("admin123");
  await page.getByRole("button", { name: /^(Login|ലോഗിൻ)$/ }).click();
  await page.getByText(lang === "ml" ? "പാസ്‌വേഡ് അപ്ഡേറ്റ് ചെയ്യുക" : "Update your password").waitFor({ state: "visible", timeout: 15_000 });
  await inputs.nth(0).fill("abc");
  await inputs.nth(1).fill("abc");
  await page.getByRole("button", { name: lang === "ml" ? "പാസ്‌വേഡ് സജ്ജമാക്കുക" : "Set new password" }).click();
  await page.locator(".login-error").waitFor({ state: "visible", timeout: 8_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/rotation-error-${lang}.png` });
  console.log(`saved ${OUT}/rotation-error-${lang}.png`);
  await electronApp.close();
}
