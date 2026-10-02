/*
 * v2.6.11 — tests for the interaction-aware background chunk warmer.
 *
 * The v2.6.5–v2.6.10 field reports ("splash sits for many seconds", "words
 * will not come / after some words it stops just after splash") trace back
 * to chunk parsing racing the user's first keystrokes. warmAppChunksBackground
 * is the fix: it parses ONE chunk per slice, waits for real idle gaps and
 * never parses while the user recently interacted. These tests pin that
 * contract with injected loaders (no real page chunks in unit tests).
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  getWarmedComponent,
  markInteractionForTests,
  resetInteractionForTests,
  warmAppChunksBackground,
  type ChunkLoader,
} from "./boot-warm";

function fakeLoader(name: string, exportName: string): ChunkLoader {
  return [name, async () => ({ [exportName]: () => null }), exportName];
}

const LOADERS: ChunkLoader[] = [
  fakeLoader("dashboard", "Dashboard"),
  fakeLoader("dashboard-charts", "DashboardCharts"),
  fakeLoader("families", "Families"),
  fakeLoader("members", "Members"),
];

function waitFor(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

beforeEach(() => {
  resetInteractionForTests();
});

describe("warmAppChunksBackground", () => {
  it("warms every chunk with the Dashboard landing page FIRST", async () => {
    const order: string[] = [];
    const loaders: ChunkLoader[] = LOADERS.map(([name, load, exportName]) => [
      name,
      async () => { order.push(name); return load(); },
      exportName,
    ]);
    const p = warmAppChunksBackground({ loaders, sliceGapMs: 1 });
    await p;
    expect(order[0]).toBe("dashboard");
    expect(order).toEqual(["dashboard", "dashboard-charts", "families", "members"]);
    // Warmed components are resolvable synchronously for RoutePage.
    expect(getWarmedComponent("Dashboard")).toBeTruthy();
    expect(getWarmedComponent("DashboardCharts")).toBeTruthy();
    expect(getWarmedComponent("Families")).toBeTruthy();
    expect(getWarmedComponent("Members")).toBeTruthy();
  });

  it("parses NOTHING (not even non-critical chunks) while the user is interacting, then resumes in the quiet gap", async () => {
    // Simulate typing: mark an interaction RIGHT NOW.
    markInteractionForTests();
    const order: string[] = [];
    const loaders: ChunkLoader[] = LOADERS.map(([name, load, exportName]) => [
      name,
      async () => { order.push(name); return load(); },
      exportName,
    ]);
    const done = warmAppChunksBackground({ loaders, quietMs: 10_000, sliceGapMs: 1 });
    // The initial pause gate blocks everything — including the dashboard —
    // while the machine is "busy" (quietMs is 10 s, so still inside it).
    await new Promise((r) => setTimeout(r, 60));
    expect(order).toEqual([]);
    // The user stops interacting → the warmer resumes immediately.
    resetInteractionForTests();
    await waitFor(() => order.length === LOADERS.length);
    await done;
    expect(order[0]).toBe("dashboard");
  });

  it("pauses again between chunks when the user starts typing mid-warm", async () => {
    const order: string[] = [];
    const loaders: ChunkLoader[] = LOADERS.map(([name, load, exportName]) => [
      name,
      async () => { order.push(name); return load(); },
      exportName,
    ]);
    const done = warmAppChunksBackground({ loaders, quietMs: 10_000, sliceGapMs: 1 });
    // Dashboard (critical path is quiet here) warms…
    await waitFor(() => order.length >= 1);
    expect(order[0]).toBe("dashboard");
    // …then the user starts typing — the next chunk must NOT parse.
    markInteractionForTests();
    await new Promise((r) => setTimeout(r, 60));
    expect(order.length).toBe(1);
    // Typing stops → the remaining chunks finish.
    resetInteractionForTests();
    await waitFor(() => order.length === LOADERS.length);
    await done;
  });

  it("stops promptly when shouldStop fires", async () => {
    // Stop as soon as the first chunk has warmed — the warmer must check
    // the predicate before EVERY chunk (and before the very first one).
    const order: string[] = [];
    const loaders: ChunkLoader[] = LOADERS.map(([name, load, exportName]) => [
      name,
      async () => { order.push(name); return load(); },
      exportName,
    ]);
    await warmAppChunksBackground({
      loaders,
      sliceGapMs: 1,
      shouldStop: () => order.length >= 1,
    });
    expect(order).toEqual(["dashboard"]);
  });
});
