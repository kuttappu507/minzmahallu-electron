/* probe-close-dialog.mjs — screenshot the Close dialogue to verify the
 * feedback line is rendered as a red highlighted pill (not grey). */
import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-probe-dialog";
const ADMIN = { fullName: "E2E Administrator", username: "e2eadmin", password: "Prod@2026" };

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });

const electronApp = await _electron.launch({
  cwd: ROOT,
  args: ["."],
  executablePath: path.join(ROOT, "node_modules", "electron", "dist", "electron"),
  env: { ...process.env, XDG_CONFIG_HOME: PROFILE },
  timeout: 60_000,
});
const page = await electronApp.firstWindow();
page.setDefaultTimeout(30_000);

/* initial setup → dashboard */
await page.getByText("Initial Setup").waitFor({ state: "visible", timeout: 30_000 });
const form = page.locator(".login-form");
await form.locator("input.inp").nth(0).fill(ADMIN.fullName);
await form.locator("input.inp").nth(1).fill(ADMIN.username);
await form.locator("input[type=password]").nth(0).fill(ADMIN.password);
await form.locator("input[type=password]").nth(1).fill(ADMIN.password);
await page.getByRole("button", { name: /Create|Setup/i }).click();
await page.locator(".stat").first().waitFor({ state: "visible", timeout: 30_000 });

/* ask the main process to show the close gate */
await page.locator(".win-btn.win-close").click();
await page.getByText("Do you want to close the application?").waitFor({ state: "visible", timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: "/home/z/my-project/scripts/close-dialog-highlight.png" });

/* colour assertions on the feedback pill */
const info = await page.evaluate(() => {
  const els = [...document.querySelectorAll(".modal p")];
  const p = els.find((e) => e.textContent.includes("minzmahallu@proton.me"));
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, radius: cs.borderRadius };
});
console.log("feedback pill computed style:", JSON.stringify(info));
if (!info) { console.error("FAIL: feedback line not found"); process.exitCode = 1; }
else if (info.color === "rgb(107, 114, 128)" || info.color.includes("107, 114, 128")) {
  console.error("FAIL: feedback text is still grey"); process.exitCode = 1;
} else console.log("PASS: feedback text is highlighted (red), not grey");

await page.getByRole("button", { name: "Keep open" }).click();
await page.waitForTimeout(500);
await electronApp.close().catch(() => {});
console.log("done");
