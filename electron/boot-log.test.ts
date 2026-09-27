/*
 * boot-log — unit tests (v2.5.1 startup diagnostics).
 *
 * boot.log is the answer to the "splash comes then same" class of reports:
 * every boot step is appended with a process.uptime() stamp so a failing
 * machine can be diagnosed from the file alone. These tests pin the
 * contract: append-only, header on the first line of a boot, error-proof,
 * and the 128 KB cap that keeps months of launches from growing it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setBootLogDirForTests, bootLog, bootLogError, bootLogFilePath, formatBootLine } from "./boot-log.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mms-bootlog-"));
  __setBootLogDirForTests(dir);
});

afterEach(() => {
  __setBootLogDirForTests(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("boot log format", () => {
  it("stamps uptime seconds with 3 decimals into a fixed-width field", () => {
    expect(formatBootLine(0, "whenReady:enter")).toBe("[+   0.000s] whenReady:enter");
    expect(formatBootLine(3142.6, "splash:created")).toBe("[+   3.143s] splash:created");
    expect(formatBootLine(61_234.4, "whatsapp:registered")).toBe("[+  61.234s] whatsapp:registered");
    // Negative/NaN input is clamped, never crashes the line.
    expect(formatBootLine(-5, "x")).toBe("[+   0.000s] x");
  });

  it("appends the detail after an em dash when provided", () => {
    expect(formatBootLine(100, "ERROR:whenReady", "boom")).toBe("[+   0.100s] ERROR:whenReady — boom");
  });
});

describe("boot log writing", () => {
  it("writes a version/platform header on the first line of a fresh boot", () => {
    bootLog("main-module-loaded");
    const text = readFileSync(bootLogFilePath(), "utf8");
    expect(text).toMatch(/^==== boot v\S+ \S+ \S+ ====\n/);
    expect(text).toContain("main-module-loaded");
  });

  it("appends later steps without repeating the header", () => {
    bootLog("main-module-loaded");
    bootLog("whenReady:enter");
    bootLog("splash:created");
    const lines = readFileSync(bootLogFilePath(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(4); // header + 3 steps
    expect(lines.filter((l) => l.startsWith("===="))).toHaveLength(1);
    // Monotonic step order is preserved (append-only).
    expect(lines[1]).toContain("main-module-loaded");
    expect(lines[3]).toContain("splash:created");
  });

  it("records errors with the ERROR: prefix and the extracted message", () => {
    bootLogError("whenReady", new Error("duplicate handler"));
    bootLogError("unhandledRejection", "plain string reason");
    bootLogError("x", undefined);
    const text = readFileSync(bootLogFilePath(), "utf8");
    expect(text).toContain("ERROR:whenReady — duplicate handler");
    expect(text).toContain("ERROR:unhandledRejection — plain string reason");
    expect(text).toContain("ERROR:x — unknown");
  });

  it("never throws when the log directory cannot be created", () => {
    const fileAsDir = join(dir, "not-a-dir");
    writeFileSync(fileAsDir, "blocked", "utf8");
    __setBootLogDirForTests(join(fileAsDir, "sub"));
    expect(() => bootLog("whenReady:enter")).not.toThrow();
    expect(() => bootLogError("whenReady", new Error("x"))).not.toThrow();
  });

  it("rewrites the file once it exceeds the 128 KB cap", () => {
    bootLog("main-module-loaded");
    const file = bootLogFilePath();
    writeFileSync(file, ("x".repeat(1024) + "\n").repeat(140) + "STALE-MARKER\n", "utf8"); // > 128 KB
    bootLog("whenReady:enter");
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain("STALE-MARKER");
    expect(text).toContain("whenReady:enter");
    expect(existsSync(file)).toBe(true);
  });
});
