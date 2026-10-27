import { describe, expect, it } from "vitest";
import { autoGrain, bucketKey, resolveRange, trafficShift, trafficWindow, yearEarlier } from "./overviewRange";
import { bucketSeries, buildRangeSeries, metricValue, monthPace, seriesSummary } from "./overviewSeries";
import { whatChanged } from "./overviewChanges";
import { costOf, profitSummary, sortTitles, titlePerformance, titlesCsv } from "./overviewProfit";
import { cohortRetention, hourHeatmap, newVsReturningRevenue, operations, repeatTiming } from "./overviewCohorts";
import { funnelSteps, googleRecordedNothing, googleTraffic, pickTraffic, shopTraffic } from "./overviewSources";
import { totals } from "./overviewInsights";

const NOON = Date.parse("2026-10-13T16:00:00Z"); // noon in Toronto
const EVENING = Date.parse("2026-10-14T02:00:00Z"); // 10 pm on the 13th in Toronto, already the 14th in UTC
const money = (n: number) => `$${n.toFixed(2)}`;
const order = (over: Record<string, any> = {}) => ({
  paymentStatus: "paid", createdAt: "2026-10-10T16:00:00Z", total: 50, subtotal: 50, discount: 0,
  customer: { email: "a@x.com", address: { country: "Canada" } }, items: [{ id: "b1", title: "Salt", price: 25, quantity: 2 }], ...over,
});

describe("resolveRange", () => {
  it("rolling windows match the old behaviour", () => {
    const r = resolveRange("30d", { now: NOON });
    expect(r).toMatchObject({ startKey: "2026-09-14", endKey: "2026-10-13", prevStartKey: "2026-08-15", prevEndKey: "2026-09-13", days: 30, before: "the 30 days before" });
    expect(resolveRange("today", { now: NOON }).before).toBe("yesterday");
  });
  it("calendar periods", () => {
    expect(resolveRange("mtd", { now: NOON })).toMatchObject({ startKey: "2026-10-01", endKey: "2026-10-13", days: 13, phrase: "this month so far" });
    expect(resolveRange("lastMonth", { now: NOON })).toMatchObject({ startKey: "2026-09-01", endKey: "2026-09-30", days: 30, prevEndKey: "2026-08-31" });
    expect(resolveRange("ytd", { now: NOON })).toMatchObject({ startKey: "2026-01-01", days: 286 });
  });
  it("custom dates are clamped to today and fall back when unreadable", () => {
    expect(resolveRange("custom", { now: NOON, custom: { from: "2026-10-01", to: "2026-12-01" } })).toMatchObject({ startKey: "2026-10-01", endKey: "2026-10-13" });
    expect(resolveRange("custom", { now: NOON, custom: { from: "x", to: "2026-10-01" } })).toMatchObject({ preset: "30d", days: 30 });
    expect(resolveRange("custom", { now: NOON, custom: { from: "2026-10-05", to: "2026-10-01" } }).preset).toBe("30d");
  });
  it("compares with the same days last year", () => {
    const r = resolveRange("mtd", { now: NOON, compare: "lastYear" });
    expect(r).toMatchObject({ prevStartKey: "2025-10-01", prevEndKey: "2025-10-13", before: "the same days last year" });
    expect(yearEarlier("2028-02-29")).toBe("2027-02-28");
  });
  it("shifts traffic onto UTC days only in Toronto's evening for ranges ending today", () => {
    expect(trafficShift(resolveRange("7d", { now: NOON }), NOON)).toBe(0);
    expect(trafficShift(resolveRange("7d", { now: EVENING }), EVENING)).toBe(1);
    expect(trafficShift(resolveRange("lastMonth", { now: EVENING }), EVENING)).toBe(0);
    expect(trafficWindow(resolveRange("30d", { now: NOON }), NOON)).toEqual({ fromKey: "2026-08-14", toKey: "2026-10-14" });
    expect(trafficWindow(resolveRange("7d", { now: EVENING }), EVENING)).toEqual({ fromKey: "2026-09-30", toKey: "2026-10-15" });
    // A long custom range from years ago still reads its whole comparison window.
    expect(trafficWindow(resolveRange("custom", { now: NOON, custom: { from: "2023-01-01", to: "2024-12-31" } }), NOON)).toEqual({ fromKey: "2020-12-30", toKey: "2025-01-01" });
  });
  it("buckets", () => {
    expect(autoGrain(30)).toBe("day"); expect(autoGrain(90)).toBe("week"); expect(autoGrain(365)).toBe("month");
    expect(bucketKey("2026-10-11", "week")).toBe("2026-10-05"); // Sunday → its Monday
    expect(bucketKey("2026-10-12", "week")).toBe("2026-10-12");
    expect(bucketKey("2026-10-12", "month")).toBe("2026-10-01");
  });
});

describe("chart series", () => {
  const range = resolveRange("7d", { now: NOON });
  const paid = [order({ createdAt: "2026-10-12T16:00:00Z" }), order({ createdAt: "2026-10-05T16:00:00Z", total: 20, items: [{ id: "b1", price: 20, quantity: 1 }] })];
  const visits: Record<string, number> = { "2026-10-12": 10, "2026-10-05": 4 };
  const series = buildRangeSeries(paid, range, k => visits[k] || 0);
  it("one point per day with the comparison day beside it", () => {
    expect(series).toHaveLength(7);
    const last = series[6];
    expect(last).toMatchObject({ date: "2026-10-13", revenue: 0 });
    const oct12 = series.find(p => p.date === "2026-10-12")!;
    expect(oct12).toMatchObject({ revenue: 50, orders: 1, units: 2, visits: 10, prevDate: "2026-10-05", prevRevenue: 20, prevVisits: 4 });
  });
  it("metrics and summary", () => {
    const weeks = bucketSeries(series, "week");
    expect(weeks.reduce((s, b) => s + b.days, 0)).toBe(7);
    expect(metricValue(series[5], "conversion")).toBe(10);
    expect(metricValue(series[0], "aov")).toBeNull();
    const s = seriesSummary(bucketSeries(series, "day"), "revenue");
    expect(s).toMatchObject({ value: 50, previous: 20, best: { value: 50 } });
    expect(s.perDay).toBeCloseTo(50 / 7);
  });
  it("month pace needs three days of history", () => {
    expect(monthPace(paid, "2026-10-02")).toBeNull();
    const p = monthPace(paid, "2026-10-13")!;
    expect(p.soFar).toBe(70);
    expect(p.projected).toBeCloseTo((70 / 13) * 31);
  });
});

describe("whatChanged", () => {
  it("names the revenue move and its driver, the climbing title and a new one", () => {
    const current = [order({ total: 100, items: [{ id: "b1", title: "Salt", price: 25, quantity: 4 }] }), order({ total: 30, customer: { email: "b@x.com", address: { country: "France" } }, items: [{ id: "b2", title: "New", price: 30, quantity: 1 }] })];
    const previous = [order({ total: 50 })];
    const list = whatChanged({ cur: totals(current), prev: totals(previous), current, previous, before: "the 30 days before", money });
    expect(list[0]).toMatchObject({ id: "revenue", tone: "up", title: "Revenue rose by 160%",
      detail: "$130.00 now, $50.00 in the 30 days before, mostly from more orders (2 orders now, 1 before)." });
    expect(list.some(c => c.id === "rise-b1")).toBe(true);
    expect(list.some(c => c.id === "new-b2")).toBe(true);
  });
  it("flags refunds and conversion, never more than six lines", () => {
    const current = [order({ total: 100, refundedAmountMinor: 2000, expectedAmountMinor: 10000 })];
    const list = whatChanged({ cur: totals(current), prev: totals([order()]), current, previous: [order()], visits: { cur: 10, prev: 100 }, before: "x", money });
    expect(list.some(c => c.id === "refunds" && c.tone === "warn")).toBe(true);
    expect(list.some(c => c.id === "conversion" && c.tone === "up")).toBe(true);
    expect(list.length).toBeLessThanOrEqual(6);
  });
  it("names the country in words and counts a code and a name as one destination", () => {
    const at = (country: string, total: number) => order({ total, customer: { email: `${country}@x.com`, address: { country } } });
    const current = [at("CA", 40), at("Canada", 40), at("France", 30)];
    const previous = [at("Canada", 200), at("FR", 30)];
    const list = whatChanged({ cur: totals(current), prev: totals(previous), current, previous, before: "the 30 days before", money });
    const country = list.find(c => c.id.startsWith("country-"));
    expect(country).toMatchObject({ id: "country-CA", tone: "down", title: "Sales to Canada fell by $120.00" });
    expect(country?.detail).toBe("$80.00 now, $200.00 in the 30 days before. The biggest move by destination.");
  });
  it("says how much a title rose or fell in plain words", () => {
    const line = (id: string, title: string, quantity: number) => order({ total: quantity * 20, items: [{ id, title, price: 20, quantity }] });
    const current = [line("up", "Soft Machines", 7), line("down", "Tidal Notes", 3)];
    const previous = [line("up", "Soft Machines", 2), line("down", "Tidal Notes", 8)];
    const list = whatChanged({ cur: totals(current), prev: totals(previous), current, previous, before: "the 30 days before", money });
    expect(list.find(c => c.id === "rise-up")).toMatchObject({ tone: "up", title: "Sales of Soft Machines rose by $100.00",
      detail: "$140.00 from 7 copies now, $40.00 from 2 in the 30 days before. The biggest rise among your titles." });
    expect(list.find(c => c.id === "fall-down")).toMatchObject({ tone: "down", title: "Sales of Tidal Notes fell by $100.00",
      detail: "$60.00 from 3 copies now, $160.00 from 8 in the 30 days before. The biggest drop among your titles." });
  });
  it("says how visitors and the share who bought moved in plain words", () => {
    const current = [order(), order(), order()];
    const previous = [order({ total: 49 })];
    const list = whatChanged({ cur: totals(current), prev: totals(previous), current, previous, visits: { cur: 120, prev: 100 }, before: "the 30 days before", money });
    expect(list.find(c => c.id === "visits")).toMatchObject({ tone: "up", title: "Visitors rose by 20%", detail: "120 visitors now, 100 in the 30 days before." });
    expect(list.find(c => c.id === "conversion")).toMatchObject({ tone: "up", title: "2.5% of visitors bought, up from 1.0%",
      detail: "3 paid orders from 120 visitors now; 1 from 100 in the 30 days before." });
  });
  it("says how revenue, discounts and refunds moved in plain words", () => {
    const fresh = whatChanged({ cur: totals([order()]), prev: totals([]), current: [order()], previous: [], before: "the 30 days before", money });
    expect(fresh.find(c => c.id === "revenue")).toMatchObject({ title: "Revenue of $50.00, none in the 30 days before", detail: "1 paid order now, none in the 30 days before." });
    const current = [order({ subtotal: 50, discount: 10, total: 40, refundedAmountMinor: 1000, expectedAmountMinor: 4000 })];
    const previous = [order()];
    const list = whatChanged({ cur: totals(current), prev: totals(previous), current, previous, before: "the 30 days before", money });
    expect(list.find(c => c.id === "discounts")).toMatchObject({ tone: "warn", title: "Discounts took 20% off list price, up from 0%",
      detail: "$10.00 off in codes and offers now, $0.00 in the 30 days before." });
    expect(list.find(c => c.id === "refunds")).toMatchObject({ tone: "warn", title: "$10.00 refunded",
      detail: "25% of what customers paid now; $0.00 refunded in the 30 days before." });
  });
  it("says nothing about revenue for a quiet change", () => {
    const list = whatChanged({ cur: totals([order()]), prev: totals([order({ total: 49 })]), current: [order()], previous: [order({ total: 49 })], before: "x", money });
    expect(list.some(c => c.id === "revenue")).toBe(false);
  });
});

describe("profit", () => {
  const books = [{ id: "b1", title: "Salt", costPrice: 8 }, { id: "b2", title: "Ebook", format: "E-book (EPUB)" }, { id: "b3", title: "Unknown" }];
  it("uses Inventory's cost first, then the book's", () => {
    const m = new Map(books.map(b => [b.id, b]));
    expect(costOf("b1", m, { b1: 10 })).toBe(10);
    expect(costOf("b1", m, {})).toBe(8);
    expect(costOf("b3", m, {})).toBeNull();
  });
  it("shares discounts and refunds across lines, skips gift cards, counts digital as free to send", () => {
    const o = order({ subtotal: 100, discount: 10, total: 90, items: [
      { id: "b1", price: 25, quantity: 2 }, { id: "b2", price: 20, quantity: 1 }, { id: "b3", price: 30, quantity: 1 }, { id: "gc", price: 50, quantity: 1, giftCard: true },
    ] });
    const p = profitSummary([o], books, {});
    // b1: 50 × 0.9 = 45 revenue, cost 16; b2: 18, cost 0; b3 unknown cost.
    expect(p.revenue).toBeCloseTo(63);
    expect(p.cost).toBe(16);
    expect(p.profit).toBeCloseTo(47);
    expect(p.units).toBe(4); expect(p.costedUnits).toBe(3); expect(p.coverage).toBe(75);
  });
  it("a gift card in the same order doesn't dilute the book's discount", () => {
    const o = order({ subtotal: 120, discount: 10, total: 110, items: [{ id: "b1", price: 20, quantity: 1 }, { id: "gc", price: 100, quantity: 1, giftCard: true }] });
    const p = profitSummary([o], books, {});
    expect(p.revenue).toBeCloseTo(10);
    expect(p.profit).toBeCloseTo(2);
  });
  it("builds the title table with change, views, profit and stock", () => {
    const rows = titlePerformance({
      current: [order()], previous: [order({ items: [{ id: "b1", price: 25, quantity: 1 }] })], books, costs: {},
      viewsById: { b1: 20, b3: 5, ghost: 9 }, stock: [{ id: "b1", title: "Salt", stock: 4, sold30: 2, coverDays: 60, lastSaleDays: 1 }],
    });
    const salt = rows.find(r => r.id === "b1")!;
    expect(salt).toMatchObject({ units: 2, revenue: 50, prevUnits: 1, views: 20, viewToSale: 10, profit: 34, stock: 4, coverDays: 60 });
    expect(rows.find(r => r.id === "b3")).toMatchObject({ units: 0, views: 5, profit: null });
    expect(rows.some(r => r.id === "ghost")).toBe(false);
    expect(sortTitles(rows, "views")[0].id).toBe("b1");
    expect(titlesCsv(rows, "a", "b").split("\n")[2]).toContain('"Salt"');
  });
  it("leaves views empty when they were never recorded", () => {
    const rows = titlePerformance({ current: [order()], previous: [], books, costs: {}, viewsById: null, stock: [] });
    expect(rows[0].views).toBeNull();
  });
});

describe("cohorts and operations", () => {
  const paid = [
    order({ createdAt: "2026-08-03T16:00:00Z", customer: { email: "a@x.com" } }),
    order({ createdAt: "2026-09-10T16:00:00Z", customer: { email: "a@x.com" } }),
    order({ createdAt: "2026-08-20T16:00:00Z", customer: { email: "b@x.com" } }),
    order({ createdAt: "2026-10-01T16:00:00Z", customer: { email: "c@x.com" } }),
  ];
  it("monthly cohorts with repeat rates; future months are null", () => {
    const rows = cohortRetention(paid, "2026-10-13", 12, 3);
    expect(rows.map(r => r.month)).toEqual(["2026-10", "2026-08"]);
    expect(rows[1]).toMatchObject({ customers: 2, cells: [50, 0, null] });
    expect(rows[0].cells).toEqual([null, null, null]);
  });
  it("repeat timing and new vs returning revenue", () => {
    const t = repeatTiming(paid, NOON);
    expect(t).toMatchObject({ medianDays: 38, returned: 1 });
    const split = newVsReturningRevenue(paid, paid.filter(o => o.createdAt >= "2026-09"), "2026-09-01");
    expect(split).toMatchObject({ fresh: 50, returning: 50, returningShare: 50 });
  });
  it("ship speed, payment and currency mix, hour heatmap", () => {
    const ops = operations([
      order({ paidAt: "2026-10-10T16:00:00Z", shippedAt: "2026-10-11T16:00:00Z", stripePaymentIntentId: "pi" }),
      order({ paidAt: "2026-10-10T16:00:00Z", shippedAt: "2026-10-14T16:00:00Z", paypalOrderId: "pp", checkoutCurrency: "usd" }),
    ]);
    expect(ops).toMatchObject({ shipped: 2, medianHoursToShip: 60, within2DaysRate: 50 });
    expect(ops.payments.map(p => p.key).sort()).toEqual(["Card", "PayPal"]);
    expect(ops.currencies.map(c => c.key).sort()).toEqual(["CAD", "USD"]);
    const heat = hourHeatmap([order({ createdAt: "2026-10-12T16:30:00Z" })]); // Monday 12:30 Toronto
    expect(heat.grid[0].hours[12]).toBe(1);
    expect(heat.max).toBe(1);
  });
});

describe("traffic sources", () => {
  const range = resolveRange("7d", { now: NOON });
  it("shop counters per range, with the UTC shift", () => {
    const daily = [{ date: "2026-10-13", visits: 3, funnel: { view: 5, add_to_cart: 2 } }, { date: "2026-10-06", visits: 7 }, { date: "2026-09-20", visits: 100 }];
    const t = shopTraffic(daily, range, 0);
    expect(t).toMatchObject({ source: "shop", visitors: { cur: 3, prev: 7 }, sessions: null, firstKey: "2026-09-20" });
    expect(t.funnel).toEqual({ view: 5, add_to_cart: 2, checkout_start: 0, purchase: 0 });
    expect(shopTraffic(daily, range, 1).visitsOn("2026-10-12")).toBe(3);
  });
  it("Google's figures in the same shape", () => {
    const t = googleTraffic({
      totals: { current: { activeUsers: 40, sessions: 55 }, previous: { activeUsers: 20, sessions: 25 } },
      byDate: { current: [{ date: "2026-10-12", activeUsers: 9 }], previous: [] },
      events: { current: { view_item: 30, add_to_cart: 6, begin_checkout: 3, purchase: 1 }, previous: {} },
      channels: [], sources: [], landing: [], countries: [], devices: [], pages: [], visitorType: [], activeNow: 2,
    });
    expect(t).toMatchObject({ source: "google", visitors: { cur: 40, prev: 20 }, sessions: { cur: 55, prev: 25 } });
    expect(t.visitsOn("2026-10-12")).toBe(9);
    expect(funnelSteps(t.funnel).map(s => s.ofPrevious)).toEqual([null, 20, 50, expect.closeTo(33.33, 1)]);
  });

  describe("pickTraffic: a silent Google is never drawn as a real 0", () => {
    const ga = (cur: number, days: any[] = cur ? [{ date: "2026-10-12", activeUsers: cur }] : []) => ({
      totals: { current: { activeUsers: cur }, previous: { activeUsers: 12 } },
      byDate: { current: days, previous: [{ date: "2026-10-05", activeUsers: 12 }] },
      events: { current: {}, previous: {} }, channels: [], sources: [], landing: [], countries: [], devices: [], pages: [], visitorType: [], activeNow: 0,
    }) as any;
    const range = resolveRange("7d", { now: NOON });
    const shop = (visits: number) => shopTraffic(visits ? [{ date: "2026-10-12", visits }] : [], range, 0);

    it("knows when Google recorded nobody for the window", () => {
      expect(googleRecordedNothing(ga(0))).toBe(true);
      expect(googleRecordedNothing(ga(0, [{ date: "2026-10-12", activeUsers: 0 }]))).toBe(true);
      expect(googleRecordedNothing(ga(5))).toBe(false);
    });
    it("uses Google whenever it recorded visitors", () => {
      const { traffic, gap } = pickTraffic(ga(5), shop(9));
      expect(traffic?.source).toBe("google");
      expect(gap).toBeNull();
    });
    it("falls back to the shop's counter when Google is empty but the counter isn't", () => {
      const { traffic, gap } = pickTraffic(ga(0), shop(9));
      expect(traffic?.source).toBe("shop");
      expect(traffic?.visitors.cur).toBe(9);
      expect(gap).toEqual({ kind: "fallback", mismatch: null });
    });
    it("says nothing was recorded when both are empty", () => {
      expect(pickTraffic(ga(0), shop(0)).gap).toEqual({ kind: "empty", mismatch: null });
      expect(pickTraffic(ga(0), null).gap?.kind).toBe("empty");
    });
    it("flags a property that doesn't hold the shop's tag, and only when Google listed its tags", () => {
      expect(pickTraffic(ga(0), shop(0), { streamIds: ["G-OLD111"], shopTag: "g-new222" }).gap)
        .toEqual({ kind: "empty", mismatch: { tag: "G-NEW222", propertyTags: ["G-OLD111"] } });
      expect(pickTraffic(ga(5), shop(0), { streamIds: ["G-OLD111"], shopTag: "G-NEW222" }).gap?.kind).toBeNull();
      expect(pickTraffic(ga(5), shop(0), { streamIds: ["g-new222"], shopTag: "G-NEW222" }).gap).toBeNull();
      expect(pickTraffic(ga(5), shop(0), { streamIds: null, shopTag: "G-NEW222" }).gap).toBeNull();
    });
    it("without Google, the shop's counter as before", () => {
      expect(pickTraffic(undefined, shop(4))).toMatchObject({ traffic: { source: "shop" }, gap: null });
    });
  });
});
