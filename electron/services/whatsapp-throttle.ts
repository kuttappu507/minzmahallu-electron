// WhatsApp send throttle — the anti-ban pacing layer for bulk sending.
//
// Baileys speaks WhatsApp's protocol directly, which WhatsApp's Terms of
// Service do not permit. The single biggest signal WhatsApp uses to detect
// and BAN such accounts is machine-gun sending: many messages in a short
// window, evenly spaced like a robot. This throttle makes every bulk
// campaign behave like a careful human:
//
//   • a random 5–10 s gap between EVERY message (robots space evenly;
//     jitter does not),
//   • a long 4-minute rest after every 20 messages (bulk rest),
//   • hard caps — 50 messages per rolling hour, 250 per day — after which
//     the campaign PAUSES instead of pushing on,
//   • counters PERSIST to <userData>/whatsapp/throttle.json so restarting
//     the app cannot bypass a cap.
//
// Receipt sends (one PDF to one recipient, human-paced by button clicks)
// do NOT go through this throttle — the volume risk that gets numbers
// banned is bulk campaigns, and receipts already carry their own privacy
// lock.
//
// Everything (clock, sleep, persistence) is injectable so the unit tests
// run instantly without timers or disk.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ThrottleConfig {
  minGapMs: number;      // smallest gap between two sends
  maxGapMs: number;      // largest gap (jitter upper bound)
  hourlyCap: number;     // max sends per clock-hour bucket
  dailyCap: number;      // max sends per calendar day (local time)
  restEvery: number;     // sends after which a long rest is taken
  restMs: number;        // length of that rest
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  minGapMs: 5_000,
  maxGapMs: 10_000,
  hourlyCap: 50,
  dailyCap: 250,
  restEvery: 20,
  restMs: 4 * 60_000,
};

export type TurnResult =
  | { ok: true }
  | { ok: false; reason: "hourly-cap" | "daily-cap"; retryAtMs: number };

interface PersistedCounters {
  hourKey: number;   // epoch-ms bucket: Math.floor(now / 3_600_000)
  hourCount: number;
  dayKey: string;    // local YYYY-MM-DD
  dayCount: number;
  lastSentAt: number;
}

export interface ThrottleDeps {
  config?: Partial<ThrottleConfig>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Where the counter file lives (…/whatsapp). Null = memory-only (tests). */
  storeDir?: () => string | null;
  /** Override persistence for tests (defaults to a JSON file in storeDir). */
  load?: () => PersistedCounters | null;
  save?: (data: PersistedCounters) => void;
}

const HOUR_MS = 3_600_000;

function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class SendThrottle {
  readonly config: ThrottleConfig;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly loadFn: () => PersistedCounters | null;
  private readonly saveFn: (data: PersistedCounters) => void;
  private counters: PersistedCounters;

  constructor(deps: ThrottleDeps = {}) {
    this.config = { ...DEFAULT_THROTTLE, ...(deps.config || {}) };
    this.now = deps.now || (() => Date.now());
    this.sleep = deps.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const file = deps.storeDir ? deps.storeDir() : null;
    const filePath = file ? `${file}/throttle.json` : null;
    this.loadFn = deps.load || (() => {
      if (!filePath) return null;
      try {
        const fs = require("node:fs") as typeof import("node:fs");
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as PersistedCounters;
      } catch { return null; }
    });
    this.saveFn = deps.save || ((data) => {
      if (!filePath) return;
      try {
        const fs = require("node:fs") as typeof import("node:fs");
        const path = require("node:path") as typeof import("node:path");
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
      } catch { /* best effort — a lost counter file only resets pacing */ }
    });
    this.counters = this.loadFn() || { hourKey: 0, hourCount: 0, dayKey: "", dayCount: 0, lastSentAt: 0 };
  }

  /** Roll the counters when the hour/day bucket rotated or the process napped. */
  private rolled(): void {
    const ts = this.now();
    const hk = Math.floor(ts / HOUR_MS);
    if (this.counters.hourKey !== hk) {
      this.counters.hourKey = hk;
      this.counters.hourCount = 0;
    }
    const dk = localDayKey(ts);
    if (this.counters.dayKey !== dk) {
      this.counters.dayKey = dk;
      this.counters.dayCount = 0;
    }
  }

  private persist(): void {
    try { this.saveFn({ ...this.counters }); } catch { /* never break sends */ }
  }

  /** Gap the next send must wait, from the jitter window plus the bulk rest
   *  (the rest applies when `restEvery` sends have already gone out). */
  private nextGapMs(): number {
    const { minGapMs, maxGapMs } = this.config;
    const jitter = minGapMs + Math.random() * Math.max(0, maxGapMs - minGapMs);
    const dueRest = this.counters.hourCount > 0
      && this.config.restEvery > 0
      && this.counters.hourCount % this.config.restEvery === 0;
    return Math.round(dueRest ? Math.max(jitter, this.config.restMs) : jitter);
  }

  /** Reserve the next send slot: sleeps the human-gap (jitter + bulk rest)
   *  and answers whether the send may proceed. Caps are re-checked after
   *  every sleep so an hour/day rollover during a long rest re-opens the
   *  throttle instead of falsely pausing the campaign. */
  async beforeSend(): Promise<TurnResult> {
    for (let round = 0; round < 3; round++) {
      this.rolled();
      if (this.counters.hourCount >= this.config.hourlyCap) {
        const retryAtMs = (this.counters.hourKey + 1) * HOUR_MS;
        return { ok: false, reason: "hourly-cap", retryAtMs };
      }
      if (this.counters.dayCount >= this.config.dailyCap) {
        // Retry at local midnight (approximate: next day-key change).
        const ts = this.now();
        const nextMidnight = new Date(ts);
        nextMidnight.setHours(24, 0, 0, 0);
        return { ok: false, reason: "daily-cap", retryAtMs: nextMidnight.getTime() };
      }
      const wait = this.counters.lastSentAt
        ? Math.max(0, this.counters.lastSentAt + this.nextGapMs() - this.now())
        : 0;
      if (wait > 0) await this.sleep(wait);
      // Re-check caps once after the wait (the bucket may have rolled).
      this.rolled();
      const stillCapped = this.counters.hourCount >= this.config.hourlyCap
        || this.counters.dayCount >= this.config.dailyCap;
      if (!stillCapped) return { ok: true };
    }
    return { ok: false, reason: "hourly-cap", retryAtMs: (this.counters.hourKey + 1) * HOUR_MS };
  }

  /** Call right after the socket accepted the message. */
  recordSent(): void {
    this.rolled();
    this.counters.hourCount++;
    this.counters.dayCount++;
    this.counters.lastSentAt = this.now();
    this.persist();
  }

  /** UI/status snapshot — what the WhatsApp page can show the office. */
  snapshot(): { sentLastHour: number; hourlyCap: number; sentToday: number; dailyCap: number } {
    this.rolled();
    return {
      sentLastHour: this.counters.hourCount,
      hourlyCap: this.config.hourlyCap,
      sentToday: this.counters.dayCount,
      dailyCap: this.config.dailyCap,
    };
  }

  /** Test/reset helper — wipes counters in memory (persistence is separate). */
  resetForTests(): void {
    this.counters = { hourKey: 0, hourCount: 0, dayKey: "", dayCount: 0, lastSentAt: 0 };
  }
}
