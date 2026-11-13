import { describe, expect, it } from "vitest";
import { analyticsModel, change, daysOf, sourceWord } from "./analyticsModel";
import { resolveRange } from "../overview/overviewRange";
import type { Ga4Report } from "../googleAnalytics";

// Noon in Toronto on 11 November 2026: Toronto and UTC are on the same day, so the counter needs no shift.
const NOW = Date.parse("2026-11-11T17:00:00Z");
const range = resolveRange("7d", { now: NOW }); // 5–11 Nov, compared with 29 Oct–4 Nov
const paid = (id: string, day: string, extra: Record<string, unknown> = {}) =>
  ({ id, paymentStatus: "paid", status: "paid", total: 30, createdAt: `${day}T15:00:00Z`, items: [{ id: "b1", quantity: 1 }], customer: { email: "reader@example.com" }, ...extra });

const daily = [
  { id: "2026-11-01", date: "2026-11-01", visits: 10 },
  { id: "2026-11-06", date: "2026-11-06", visits: 20, sources: { instagram: 12, direct: 8 }, devices: { phone: 15, computer: 5 }, bookViews: { b1: 9 },
    funnel: { view: 9, add_to_cart: 3, checkout_start: 2, purchase: 1 }, searches: { poetry: 4 }, noResults: { "cook book": 2 } },
  { id: "2026-11-10", date: "2026-11-10", visits: 20 },
];
const books = [{ id: "b1", title: "Small Hours" }];

describe("analyticsModel on the shop's own counter", () => {
  const m = analyticsModel({ range, shift: 0, daily, orders: [paid("o1", "2026-11-06", { referralSource: "instagram" }), paid("o0", "2026-11-02")], books });

  it("counts visitors and orders against the period before", () => {
    expect(m.source).toBe("shop");
    expect(m.visitors).toEqual({ cur: 40, prev: 10 });
    expect(m.orders).toEqual({ cur: 1, prev: 1 });
    expect(m.conversion.cur).toBeCloseTo(2.5);
    expect(m.sessions).toBeNull();
    expect(m.views).toEqual({ cur: 9, prev: 0, what: "products" });
  });

  it("draws one bar per day with the day's orders", () => {
    expect(m.grain).toBe("day");
    expect(m.bars).toHaveLength(7);
    expect(m.bars.find(b => b.key === "2026-11-06")).toMatchObject({ visitors: 20, orders: 1 });
  });

  it("joins sources to the orders they brought and names direct visits plainly", () => {
    expect(m.sources?.[0]).toMatchObject({ key: "instagram", value: 12, sub: "1 order" });
    expect(m.sources?.find(r => r.key === "direct")?.label).toBe("Typed in or bookmarked");
  });

  it("lists products, devices, searches and the path to a purchase", () => {
    expect(m.products?.[0]).toMatchObject({ label: "Small Hours", value: 9, sub: "1 sold" });
    expect(m.devices?.[0]).toMatchObject({ label: "Phone", value: 15, extra: "75%" });
    expect(m.searches).toEqual([{ key: "poetry", label: "poetry", value: 4 }]);
    expect(m.noResults?.[0].value).toBe(2);
    expect(m.funnel?.map(s => s.count)).toEqual([9, 3, 2, 1]);
  });

  it("needs Google for pages and countries", () => {
    expect(m.pages).toBeNull();
    expect(m.countries).toBeNull();
  });
});

describe("never a made-up zero", () => {
  it("leaves signals the counter never recorded as not recorded", () => {
    const m = analyticsModel({ range, shift: 0, daily: [{ id: "2026-11-06", date: "2026-11-06", visits: 3 }], orders: [], books });
    expect(m.sources).toBeNull();
    expect(m.products).toBeNull();
    expect(m.devices).toBeNull();
    expect(m.searches).toBeNull();
    expect(m.funnel).toBeNull();
    expect(m.views).toBeNull();
  });

  it("has no visitor figures when nothing could be read", () => {
    const m = analyticsModel({ range, shift: 0, daily: null, orders: null, books: [] });
    expect(m.source).toBeNull();
    expect(m.visitors).toBeNull();
    expect(m.conversion.cur).toBeNull();
  });

  it("leaves the owner's own orders out", () => {
    const m = analyticsModel({ range, shift: 0, daily, orders: [paid("mine", "2026-11-06", { customer: { email: "" }, isTest: true })], books });
    expect(m.orders.cur).toBe(0);
  });
});

describe("with Google Analytics", () => {
  const report = {
    totals: { current: { activeUsers: 120, sessions: 150, screenPageViews: 600 }, previous: { activeUsers: 100, sessions: 130, screenPageViews: 500 } },
    byDate: { current: [{ date: "2026-11-06", activeUsers: 70 }, { date: "2026-11-07", activeUsers: 50 }], previous: [] },
    channels: [{ sessionDefaultChannelGroup: "Organic Social", sessions: 90, activeUsers: 80 }, { sessionDefaultChannelGroup: "Direct", sessions: 60, activeUsers: 40 }],
    sources: [], landing: [], visitorType: [],
    countries: [{ country: "Canada", activeUsers: 100 }],
    devices: [{ deviceCategory: "mobile", activeUsers: 90 }, { deviceCategory: "desktop", activeUsers: 30 }],
    pages: [{ pagePath: "/books/small-hours", screenPageViews: 200, activeUsers: 70 }],
    events: { current: { view_item: 80, add_to_cart: 10, begin_checkout: 5, purchase: 2 }, previous: {} },
    activeNow: 3,
  } as unknown as Ga4Report;

  it("uses Google's people, visits, page views, channels, pages, countries and devices", () => {
    const m = analyticsModel({ range, shift: 0, daily, report, orders: [paid("o1", "2026-11-06")], books });
    expect(m.source).toBe("google");
    expect(m.visitors).toEqual({ cur: 120, prev: 100 });
    expect(m.sessions).toEqual({ cur: 150, prev: 130 });
    expect(m.views).toEqual({ cur: 600, prev: 500, what: "pages" });
    expect(m.sources?.[0]).toMatchObject({ label: "Organic Social", value: 90, extra: "60%" });
    expect(m.pages?.[0]).toMatchObject({ label: "/books/small-hours", value: 200 });
    expect(m.countries?.[0]).toMatchObject({ label: "Canada", value: 100 });
    expect(m.devices?.map(d => d.label)).toEqual(["Phone", "Computer"]);
    expect(m.funnel?.map(s => s.count)).toEqual([80, 10, 5, 2]);
    expect(m.bars.find(b => b.key === "2026-11-06")?.visitors).toBe(70);
    // Products still come from the shop's counter.
    expect(m.products?.[0].label).toBe("Small Hours");
  });

  it("falls back to the counter when Google recorded nobody", () => {
    const empty = { ...report, totals: { current: {}, previous: {} }, byDate: { current: [], previous: [] } } as unknown as Ga4Report;
    const m = analyticsModel({ range, shift: 0, daily, report: empty, orders: [], books });
    expect(m.source).toBe("shop");
    expect(m.gap?.kind).toBe("fallback");
  });
});

describe("helpers", () => {
  it("says the change in plain words", () => {
    expect(change({ cur: 12, prev: 10 })).toBe("+20%");
    expect(change({ cur: 8, prev: 10 })).toBe("−20%");
    expect(change({ cur: 5, prev: 0 })).toBe("New");
    expect(change({ cur: 0, prev: 0 })).toBeNull();
    expect(change({ cur: 10, prev: 10 })).toBe("No change");
  });
  it("writes sources the way people do", () => {
    expect(sourceWord("google com")).toBe("Google.com");
    expect(sourceWord("instagram")).toBe("Instagram");
    expect(sourceWord("direct")).toBe("Typed in or bookmarked");
  });
  it("lists every day of a range", () => {
    expect(daysOf({ startKey: "2026-10-30", endKey: "2026-11-02" })).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("groups a year by month", () => {
    const year = resolveRange("365d", { now: NOW });
    expect(analyticsModel({ range: year, shift: 0, daily, orders: [], books }).grain).toBe("month");
  });
});

describe("sales from ads and campaigns", () => {
  it("lists campaign orders in the period with their sales", () => {
    const m = analyticsModel({ range, shift: 0, daily, books, orders: [
      paid("c1", "2026-11-06", { total: 45, acquisition: JSON.stringify({ source: "instagram", medium: "paid_social", campaign: "Fall launch" }) }),
      paid("c2", "2026-11-07", { acquisition: JSON.stringify({ source: "newsletter", medium: "email" }) }),
      paid("c0", "2026-11-01", { acquisition: JSON.stringify({ source: "google", medium: "cpc" }) }),
    ] });
    expect(m.campaigns).toEqual([
      { key: "instagram|fall launch", label: "Instagram", value: 1, sub: "Campaign: Fall launch", extra: "$45.00" },
      { key: "newsletter|~email", label: "Newsletter", value: 1, sub: "Email", extra: "$30.00" },
    ]);
  });
});
