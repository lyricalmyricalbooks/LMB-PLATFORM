import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseSchedule, isDue, lastOccurrence, createTickRegistry, runTick } = require("./tick");

const T = iso => Date.parse(iso);
// Firestore's set-with-merge merges nested maps; a transaction sees the stored document as it is when it runs.
const mergeDeep = (a, b) => {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? mergeDeep(out[k], v) : v;
  return out;
};
function fakeDb(initial) {
  let doc = initial;
  const ref = {
    get: async () => ({ exists: Boolean(doc), data: () => JSON.parse(JSON.stringify(doc)) }),
    set: async (value) => { doc = mergeDeep(doc, value); },
  };
  return {
    get doc() { return doc; },
    collection: () => ({ doc: () => ref }),
    runTransaction: async fn => fn({ get: r => r.get(), set: (r, value) => { doc = mergeDeep(doc, value); } }),
  };
}

describe("parseSchedule", () => {
  it("reads every schedule the shop uses", () => {
    expect(parseSchedule("every 5 minutes").ms).toBe(300000);
    expect(parseSchedule("every 3 hours").ms).toBe(10800000);
    expect(parseSchedule("every 60 minutes").ms).toBe(3600000);
    expect(parseSchedule("every day 03:17", "America/Toronto")).toMatchObject({ kind: "daily", hour: 3, minute: 17 });
    expect(parseSchedule("every monday 08:00", "America/Toronto")).toMatchObject({ kind: "weekly", weekday: 1 });
    expect(() => parseSchedule("0 8 * * *")).toThrow();
  });
});

describe("isDue", () => {
  it("runs an interval sweep once its interval has passed, and at once the first time", () => {
    const spec = parseSchedule("every 15 minutes");
    expect(isDue(spec, T("2026-11-02T12:00:00Z"), 0)).toBe(true);
    expect(isDue(spec, T("2026-11-02T12:10:00Z"), T("2026-11-02T12:00:00Z"))).toBe(false);
    expect(isDue(spec, T("2026-11-02T12:15:00Z"), T("2026-11-02T12:00:00Z"))).toBe(true);
  });
  it("runs a daily sweep once after its time in the shop's time zone", () => {
    const spec = parseSchedule("every day 08:00", "America/Toronto"); // 13:00 UTC in November
    const lastRun = T("2026-11-01T13:00:00Z");
    expect(isDue(spec, T("2026-11-02T12:55:00Z"), lastRun)).toBe(false);
    expect(isDue(spec, T("2026-11-02T13:00:00Z"), lastRun)).toBe(true);
    expect(isDue(spec, T("2026-11-02T13:05:00Z"), T("2026-11-02T13:00:00Z"))).toBe(false);
  });
  it("follows daylight saving time", () => {
    const spec = parseSchedule("every day 08:00", "America/Toronto");
    expect(lastOccurrence(spec, T("2026-07-02T12:30:00Z"))).toBe(T("2026-07-02T12:00:00Z")); // 8:00 EDT
    expect(lastOccurrence(spec, T("2026-12-02T13:30:00Z"))).toBe(T("2026-12-02T13:00:00Z")); // 8:00 EST
  });
  it("runs a weekly sweep on its weekday only", () => {
    const spec = parseSchedule("every monday 08:00", "America/Toronto");
    const lastRun = T("2026-10-26T13:00:00Z");
    expect(isDue(spec, T("2026-11-01T14:00:00Z"), lastRun)).toBe(false); // Sunday
    expect(isDue(spec, T("2026-11-02T13:01:00Z"), lastRun)).toBe(true); // Monday
  });
  it("does not fire a daily sweep that has never run", () => {
    expect(isDue(parseSchedule("every day 03:17", "America/Toronto"), T("2026-11-02T20:00:00Z"), 0)).toBe(false);
  });
});

describe("runTick", () => {
  it("runs only the due sweeps and records them", async () => {
    const reg = createTickRegistry();
    const often = vi.fn(async () => {});
    const daily = vi.fn(async () => {});
    reg.register({ name: "often", schedule: "every 5 minutes" }, often);
    reg.register({ name: "daily", schedule: "every day 08:00", timeZone: "America/Toronto" }, daily);
    const db = fakeDb(null);
    expect((await runTick({ jobs: reg.jobs, db, now: T("2026-11-02T20:00:00Z") })).ran).toEqual(["often"]);
    expect(daily).not.toHaveBeenCalled();
    expect(db.doc.jobs.daily.started).toBe(true);
    // next morning
    expect((await runTick({ jobs: reg.jobs, db, now: T("2026-11-03T13:00:00Z") })).ran.sort()).toEqual(["daily", "often"]);
    expect(daily).toHaveBeenCalledTimes(1);
    // five minutes later: only the interval sweep
    expect((await runTick({ jobs: reg.jobs, db, now: T("2026-11-03T13:05:00Z") })).ran).toEqual(["often"]);
    expect(daily).toHaveBeenCalledTimes(1);
  });
  it("records a failure and keeps the other sweeps running", async () => {
    const reg = createTickRegistry();
    const good = vi.fn(async () => {});
    reg.register({ name: "bad", schedule: "every 5 minutes" }, async () => { throw new Error("boom"); });
    reg.register({ name: "good", schedule: "every 5 minutes" }, good);
    const db = fakeDb(null);
    const log = { error: vi.fn() };
    await runTick({ jobs: reg.jobs, db, now: T("2026-11-02T20:00:00Z"), log });
    expect(good).toHaveBeenCalled();
    expect(db.doc.jobs.bad).toMatchObject({ ok: false, error: "boom" });
  });
  it("does not run a daily sweep twice when a slow tick overlaps the next one, and keeps the newer records", async () => {
    const reg = createTickRegistry();
    const digest = vi.fn(async () => {});
    let release;
    let slowCalls = 0;
    reg.register({ name: "dailyOrderDigest", schedule: "every day 08:00", timeZone: "America/Toronto" }, digest);
    reg.register({ name: "slow", schedule: "every 5 minutes", timeoutSeconds: 540 }, () => {
      slowCalls++;
      return slowCalls === 1 ? new Promise(r => { release = r; }) : Promise.resolve();
    });
    const at8 = T("2026-11-03T13:00:00Z");
    const db = fakeDb({ jobs: { dailyOrderDigest: { at: at8 - 86400000, ok: true }, slow: { at: at8 - 300000, ok: true } } });
    const first = runTick({ jobs: reg.jobs, db, now: at8 });
    await new Promise(r => setTimeout(r, 5));
    // 8:05: the slow sweep from 8:00 is still running, so this tick leaves it alone; the digest already went out.
    expect((await runTick({ jobs: reg.jobs, db, now: at8 + 300000 })).ran).toEqual([]);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(slowCalls).toBe(1);
    // 8:10: the running mark is older than the slow sweep's own timeout (a crashed run), so it runs again.
    expect((await runTick({ jobs: reg.jobs, db, now: at8 + 600000 })).ran).toEqual(["slow"]);
    release();
    await first;
    expect(digest).toHaveBeenCalledTimes(1);
    // The 8:00 tick finishing late writes only its own sweeps' entries, never an old copy of the whole state.
    expect(db.doc.jobs.dailyOrderDigest).toMatchObject({ at: at8, ok: true, running: null });
    expect(db.doc.lastTickAt).toBe(at8 + 600000);
  });
  it("refuses an unnamed or duplicate sweep", () => {
    const reg = createTickRegistry();
    expect(() => reg.register({ schedule: "every 5 minutes" }, () => {})).toThrow();
    reg.register({ name: "a", schedule: "every 5 minutes" }, () => {});
    expect(() => reg.register({ name: "a", schedule: "every 5 minutes" }, () => {})).toThrow();
  });
});

describe("wiring", () => {
  const index = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const jobsSrc = readFileSync(new URL("./scheduledJobs.js", import.meta.url), "utf8");
  it("registers all fourteen sweeps by name and keeps exactly one real scheduler job", () => {
    const names = [...(index + jobsSrc).matchAll(/onSchedule\(\s*\{[^}]*?name: "(\w+)"/g)].map(m => m[1]);
    expect(names.sort()).toEqual(["abandonedCartSweep", "backInStockSweep", "bankFeedSweep", "dailyOrderDigest", "fairDaySummary", "inventoryLinkSweep",
      "moveReminder", "nightlyFirestoreBackup", "paymentPageSweep", "receiptInboxSweep", "refreshExchangeRates", "socialPostSweep", "storageImageSweep", "teamExpirySweep", "unpaidPaymentSweep", "weeklySummary"]);
    expect(index.match(/onScheduleReal\(/g)).toHaveLength(1);
    expect(index).toMatch(/exports\.tick = onScheduleReal\(/);
  });
});
