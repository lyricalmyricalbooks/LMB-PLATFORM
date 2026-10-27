import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Combined analytics counter writes (lib/commerce.ts planCounterWrites / flushCounters). Every planned write is
// checked against the analytics rules read from firestore.rules itself, so a rules change that the planner doesn't
// follow fails here (scripts/firestore-rules-emulator.mjs checks the same shapes against the real rules engine).
const setDoc = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("../../lib/lite", () => ({
  lite: async () => ({
    doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
    increment: (n: number) => ({ inc: n }),
    setDoc: (...a: unknown[]) => setDoc(...a),
    liteDb: {},
  }),
}));
vi.mock("./trackingGuard", () => ({ trackingAllowed: async () => true, inEditorPreview: () => false }));
vi.mock("./ga4", () => ({ ga4BookItem: vi.fn(), ga4Event: vi.fn(), purchaseEvent: vi.fn() }));

import { CHECKOUT_STEPS, COUNTER_FLUSH_MS, MAX_WRITE_RULE_COST, flushCounters, funnelApi, planCounterWrites, queueVisit, ruleCost, type CounterBump, type CounterWrite } from "./commerce";

const rules = readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf8");
const analytics = rules.slice(rules.indexOf("match /analytics/{docId}"), rules.indexOf("match /giftCards/"));
const listIn = (fn: string) => {
  const body = analytics.slice(analytics.indexOf(`function ${fn}(`));
  const m = /hasOnly\(\[([^\]]*)\]\)/.exec(body)!;
  return m[1].split(",").map(s => s.trim().replace(/'/g, ""));
};
const FIXED: Record<string, string[]> = { funnel: listIn("funnelStepOk"), devices: listIn("devicesStepOk"), checkout: listIn("checkoutStepOk") };
const stepsBody = analytics.slice(analytics.indexOf("function analyticsStepsOk("), analytics.indexOf("function analyticsDayOk("));
const FREE = [...stepsBody.matchAll(/freeMapStepOk\(d\.(\w+),/g)].map(m => m[1]);
const UPDATABLE = /affectedKeys\(\)\s*\.hasOnly\(\[([^\]]*)\]\)/.exec(analytics)![1].split(",").map(s => s.trim().replace(/'/g, ""));

// Rules-engine work per changed field, counted from the rule text: stepOk calls in a fixed-key map's check, else 1.
const stepCalls = (fn: string) => {
  const body = analytics.slice(analytics.indexOf(`function ${fn}(`));
  return (body.slice(0, body.indexOf("}")).match(/stepOk\(n, o,/g) || []).length;
};
const COST: Record<string, number> = { visits: 0, funnel: stepCalls("funnelStepOk"), devices: stepCalls("devicesStepOk"), checkout: stepCalls("checkoutStepOk") };
// The emulator refused writes costing 16 (see ruleCost in commerce.ts); anything planned must stay at 12 or less.
const ENGINE_REFUSED_AT = 16;

/** The analytics update rule, applied to the change one write makes (Firestore applies increments server side). */
function rulesAccept(w: CounterWrite): string | null {
  const cost = Object.keys(w.counts).reduce((s, f) => s + (COST[f] ?? 1), 0);
  if (cost > MAX_WRITE_RULE_COST || MAX_WRITE_RULE_COST >= ENGINE_REFUSED_AT) return `rules cost ${cost}`;
  for (const [field, keys] of Object.entries(w.counts)) {
    if (!UPDATABLE.includes(field)) return `${field} not writable`;
    if (field === "visits") {
      if (Object.keys(keys).join() !== "" || !Number.isInteger(keys[""]) || keys[""] < 0 || keys[""] > 1) return "visits step";
    } else if (FIXED[field]) {
      for (const [k, n] of Object.entries(keys)) {
        if (!FIXED[field].includes(k)) return `${field}.${k} unknown`;
        if (!Number.isInteger(n) || n < 0 || n > 1) return `${field}.${k} step ${n}`;
      }
    } else if (FREE.includes(field)) {
      if (Object.keys(keys).length > 1) return `${field} changes ${Object.keys(keys).length} entries`;
    } else return `${field} has no step rule`;
  }
  return null;
}

const day = "2026-10-20";
const b = (field: string, key: string, n = 1, d = day): CounterBump => ({ day: d, field, key, n });

describe("planCounterWrites", () => {
  it("reads the rule lists it mirrors from firestore.rules", () => {
    expect(FIXED.funnel).toEqual(["view", "add_to_cart", "checkout_start", "purchase"]);
    expect(FIXED.checkout).toEqual([...CHECKOUT_STEPS]);
    expect(FREE).toEqual(expect.arrayContaining(["sources", "categoryViews", "bookViews", "unbuyableViews", "vitals", "searches", "noResults", "bookAdds", "wishlistAdds"]));
    expect(UPDATABLE).toContain("visits");
    // commerce.ts ruleCost follows the rules' own check sizes.
    for (const f of [...Object.keys(COST), ...FREE]) expect(ruleCost(f)).toBe(COST[f] ?? 1);
  });

  it("splits a write before it gets too heavy for the rules engine", () => {
    const plan = planCounterWrites([b("checkout", "pay"), b("funnel", "view"), b("devices", "mobile"), b("sources", "x"), b("searches", "y")]);
    expect(plan).toHaveLength(2);
    for (const w of plan) expect(rulesAccept(w)).toBeNull();
  });

  it("puts a session's visit, source and device in one write", () => {
    const plan = planCounterWrites([b("visits", ""), b("sources", "google"), b("devices", "mobile")]);
    expect(plan).toEqual([{ day, counts: { visits: { "": 1 }, sources: { google: 1 }, devices: { mobile: 1 } } }]);
  });

  it("a book page: view, book, unbuyable and first category in one write, each further category in its own", () => {
    const plan = planCounterWrites([b("funnel", "view"), b("bookViews", "bk1"), b("unbuyableViews", "bk1"),
      b("categoryViews", "POETRY"), b("categoryViews", "ZINES"), b("categoryViews", "ART")]);
    expect(plan).toHaveLength(3);
    expect(plan[0].counts).toEqual({ funnel: { view: 1 }, bookViews: { bk1: 1 }, unbuyableViews: { bk1: 1 }, categoryViews: { POETRY: 1 } });
    expect(plan[1].counts).toEqual({ categoryViews: { ZINES: 1 } });
    expect(plan[2].counts).toEqual({ categoryViews: { ART: 1 } });
  });

  it("never raises a fixed key or visits by more than one per write", () => {
    const plan = planCounterWrites([b("visits", ""), b("visits", ""), b("funnel", "view"), b("funnel", "view"), b("funnel", "purchase"), b("checkout", "pay", 2)]);
    for (const w of plan) expect(rulesAccept(w)).toBeNull();
    const total = (f: string, k: string) => plan.reduce((s, w) => s + (w.counts[f]?.[k] || 0), 0);
    expect(total("visits", "")).toBe(2);
    expect(total("funnel", "view")).toBe(2);
    expect(total("checkout", "pay")).toBe(2);
    expect(plan).toHaveLength(2);
  });

  it("adds repeats of one free-map entry together (the rules allow it)", () => {
    expect(planCounterWrites([b("searches", "poems"), b("searches", "poems")])).toEqual([{ day, counts: { searches: { poems: 2 } } }]);
  });

  it("keeps different days in different writes", () => {
    const plan = planCounterWrites([b("visits", "", 1, "2026-10-19"), b("sources", "x", 1, "2026-10-20")]);
    expect(plan.map(w => w.day)).toEqual(["2026-10-19", "2026-10-20"]);
  });

  it("every plan of random signals passes the rules and loses no count", () => {
    const fields = ["visits", ...Object.keys(FIXED), ...FREE];
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let round = 0; round < 300; round++) {
      const bumps: CounterBump[] = Array.from({ length: 1 + rnd(25) }, () => {
        const field = fields[rnd(fields.length)];
        const key = field === "visits" ? "" : FIXED[field] ? FIXED[field][rnd(FIXED[field].length)] : `k${rnd(4)}`;
        return b(field, key, 1, rnd(5) === 0 ? "2026-10-21" : day);
      });
      const plan = planCounterWrites(bumps);
      for (const w of plan) expect(rulesAccept(w)).toBeNull();
      const sum = (list: { day: string; field: string; key: string; n: number }[]) => {
        const m = new Map<string, number>();
        for (const x of list) m.set(`${x.day}|${x.field}|${x.key}`, (m.get(`${x.day}|${x.field}|${x.key}`) || 0) + x.n);
        return m;
      };
      const planned = plan.flatMap(w => Object.entries(w.counts).flatMap(([field, keys]) => Object.entries(keys).map(([key, n]) => ({ day: w.day, field, key, n }))));
      expect(sum(planned)).toEqual(sum(bumps));
      // Combining is worth it: never more writes than signals.
      expect(plan.length).toBeLessThanOrEqual(bumps.length);
    }
  });
});

describe("flushCounters", () => {
  beforeEach(() => {
    setDoc.mockReset();
    setDoc.mockImplementation(async () => undefined);
    (globalThis as any).window = { location: { search: "" }, innerWidth: 400, addEventListener: vi.fn(), sessionStorage: { getItem: () => null, setItem: () => undefined } };
  });
  afterEach(async () => { await flushCounters(); delete (globalThis as any).window; vi.useRealTimers(); });

  it("sends a visit and the session's source/device as one write after the short wait", async () => {
    vi.useFakeTimers();
    const visit = queueVisit();
    const session = funnelApi.trackSession();
    await vi.advanceTimersByTimeAsync(COUNTER_FLUSH_MS - 10);
    expect(setDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all([visit, session]);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, patch, opts] = setDoc.mock.calls[0] as any[];
    expect(ref.path).toMatch(/^analytics\/\d{4}-\d{2}-\d{2}$/);
    expect(patch).toMatchObject({ visits: { inc: 1 }, sources: { direct: { inc: 1 } }, devices: { mobile: { inc: 1 } } });
    expect(patch.date).toBe(ref.path.split("/")[1]);
    expect(opts).toEqual({ merge: true });
  });

  it("falls back to one write per counter when the rules refuse the combined one", async () => {
    setDoc.mockImplementationOnce(async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); });
    void funnelApi.track("view");
    void funnelApi.trackProductView("bk9");
    await new Promise(r => setTimeout(r, 0));
    await flushCounters();
    expect(setDoc).toHaveBeenCalledTimes(3);
    const singles = setDoc.mock.calls.slice(1).map(c => Object.keys(c[1] as object).filter(k => k !== "date"));
    expect(singles).toEqual([["funnel"], ["bookViews"]]);
  });

  it("doesn't retry counter by counter on a network failure", async () => {
    setDoc.mockImplementationOnce(async () => { throw Object.assign(new Error("offline"), { code: "unavailable" }); });
    void funnelApi.track("add_to_cart");
    void funnelApi.trackBookAdd("bk1");
    await new Promise(r => setTimeout(r, 0));
    await flushCounters();
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("sends at once when the page is already hidden (page speed on leaving)", async () => {
    vi.useFakeTimers();
    (globalThis as any).document = { visibilityState: "hidden", addEventListener: vi.fn() };
    try {
      await funnelApi.trackPageSpeed("phone_ggg");
      expect(setDoc).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as any).document;
    }
  });
});
