import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// v2.7.2 — the close gate can never trap the window (user report, third
// time: "Close button still dead on the login window").
//
// Field history:
//   v2.7.0  login ✕/min/max dead            → window resolution fixed (2.7.1)
//   v2.7.1  ✕ STILL dead for the user       → the remaining difference between
//           minimize (works) and close (dead) is the ASK-THE-RENDERER gate:
//           close is preventDefault()ed until a renderer dialog confirms.
//           A renderer that never answers (dialog fails to mount, JS wedged,
//           IPC lost) traps the window; the 2.5 s double-click escape hatch
//           does not match human clicking (second click lands later and
//           just re-asks).
//
// The v2.7.2 contract, pinned here:
//   1. LOGGED OUT (login screen): NO gate at all. The close proceeds
//      natively — the same renderer-independent path as minimize. Nothing
//      on the login screen is unsaved, so there is nothing to confirm.
//   2. LOGGED IN: the gate may still ask, but the renderer must ACK the ask
//      (win:dialog-shown) within CLOSE_ACK_MS. No ack → close for real.
//      Ack → the user decides, with no timeout on their answer.
//   3. The ack is fire-and-forget (ipcMain.on, not handle) and is sent by
//      the dialog BEFORE it opens, so a slow render can never outrun it.

const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);
const PRELOAD = readFileSync(
  fileURLToPath(new URL("./preload.mts", import.meta.url)),
  "utf8"
);
const DIALOG = readFileSync(
  fileURLToPath(new URL("../src/components/CloseConfirmDialog.tsx", import.meta.url)),
  "utf8"
);

describe("close gate: the window can never be trapped", () => {
  it("a logged-out close is instant and native — no gate, no dialog, no renderer round-trip", () => {
    const gate = MAIN.slice(MAIN.indexOf("mainWindow.on(\"close\""), MAIN.indexOf("// DEV-ONLY LOADING"));
    // The logged-out branch must sit BEFORE e.preventDefault() — once the
    // event is prevented, only renderer cooperation can close the window.
    const loggedOutIdx = gate.indexOf("if (!session.user) {");
    const preventIdx = gate.indexOf("e.preventDefault()");
    expect(loggedOutIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeGreaterThan(loggedOutIdx);
    // The branch must not prevent the close and must log its decision (the
    // user's boot.log then PROVES which path a field report took).
    const branch = gate.slice(loggedOutIdx, gate.indexOf("}", gate.indexOf("return; // do NOT preventDefault")));
    expect(branch).toContain("bootLog(\"close:login-instant\")");
    expect(branch).toContain("closeConfirmed = true");
    expect(branch).toContain("releaseHiddenWindows()");
    expect(branch).toContain("do NOT preventDefault");
  });

  it("a logged-in ask is watchdogged: no renderer ack within CLOSE_ACK_MS closes for real", () => {
    expect(MAIN).toContain("const CLOSE_ACK_MS = 2_000;");
    expect(MAIN).toContain("ipcMain.on(\"win:dialog-shown\"");
    const watchdog = MAIN.slice(MAIN.indexOf("closeAckTimer = setTimeout(() => {"), MAIN.indexOf("}, CLOSE_ACK_MS);"));
    expect(watchdog).toContain("if (closeDialogAckAt || closeConfirmed) return;");
    expect(watchdog).toContain("bootLog(\"close:no-ack-force\")");
    expect(watchdog).toContain("closeConfirmed = true");
    // The ack cancels the watchdog — a dialog the user is READING must never
    // be closed over their head.
    const ackHandler = MAIN.slice(MAIN.indexOf("ipcMain.on(\"win:dialog-shown\""), MAIN.indexOf("ipcMain.handle(\"win:confirm-close\""));
    expect(ackHandler).toContain("clearCloseAckTimer()");
    expect(ackHandler).toContain("closeDialogAckAt = Date.now()");
  });

  it("dismiss and confirm both clear the watchdog state", () => {
    expect(MAIN).toContain("ipcMain.handle(\"win:cancel-close\", () => { closeAskAt = 0; clearCloseAckTimer(); });");
    const confirm = MAIN.slice(MAIN.indexOf("ipcMain.handle(\"win:confirm-close\""), MAIN.indexOf("ipcMain.on(\"win:renderer-ready\""));
    expect(confirm).toContain("clearCloseAckTimer()");
  });

  it("the preload bridge exposes dialogShown as a fire-and-forget send", () => {
    expect(PRELOAD).toContain("dialogShown:()=>{ ipcRenderer.send(\"win:dialog-shown\"); }");
  });

  it("the confirm dialog ACKs the ask before it opens (render can never outrun the ack)", () => {
    const cb = DIALOG.slice(DIALOG.indexOf("window.mms.win.onAskClose(() => {"), DIALOG.indexOf("setOpen(true);"));
    expect(cb).toContain("dialogShown?.()");
    // ack FIRST, then open:
    expect(cb.indexOf("dialogShown?.()")).toBeLessThan(cb.length);
    expect(DIALOG.indexOf("dialogShown?.()")).toBeLessThan(DIALOG.indexOf("setOpen(true);"));
  });

  it("the v2.7.1 double-click force hatch remains as the final backstop", () => {
    expect(MAIN).toContain("const CLOSE_FORCE_MS = 2_500;");
    expect(MAIN).toContain("bootLog(\"close:force-unanswered\")");
  });
});
