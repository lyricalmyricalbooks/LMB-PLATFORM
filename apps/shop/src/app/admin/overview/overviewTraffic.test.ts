import { describe, expect, it } from "vitest";
import {
  bookInterest, buildSeries, cartRecovery, cartRows, categoryBreakdown, categoryNames, cleanSearchTerm, conversionRate, dailyWindow,
  deviceOf, funnelRates, funnelTotals, rankMap, recordedSince, sourcePerformance, stockDemand, sumMap, weekdayMix,
} from "./overviewTraffic";

const NOW = new Date("2026-09-29T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
const ago = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const paid = (o: any = {}) => ({ paymentStatus: "paid", total: 20, items: [], ...o });

describe("dailyWindow", () => {
  it("windows by calendar day, not by how many docs exist", () => {
    // Only 3 docs over 50 days: the old slice(-30) would have taken all of them.
    const daily = [{ date: day(50), visits: 5 }, { date: day(10), visits: 7 }, { date: day(0), visits: 3 }];
    const w = dailyWindow(daily, 30, NOW);
    expect(w.current.map(d => d.visits)).toEqual([7, 3]);
    expect(w.previous.map(d => d.visits)).toEqual([5]); // 50 days ago sits in the block before
    expect(w.firstKey).toBe(day(50));
  });
  it("'today' is today's doc only, even when yesterday has one", () => {
    const w = dailyWindow([{ date: day(1), visits: 9 }, { date: day(0), visits: 4 }], 1, NOW);
    expect(w.current).toHaveLength(1);
    expect(w.previous.map(d => d.visits)).toEqual([9]);
  });
  it("accepts ISO date strings", () => {
    expect(dailyWindow([{ date: `${day(2)}T05:00:00Z`, visits: 1 }], 7, NOW).current).toHaveLength(1);
  });
});

describe("maps and recorded signals", () => {
  const rows = [{ date: day(2), sources: { google: 3, direct: 1 } }, { date: day(1), sources: { google: 2 } }, { date: day(0) }];
  it("adds maps across days and ranks them", () => {
    expect(sumMap(rows, "sources")).toEqual({ google: 5, direct: 1 });
    expect(rankMap(sumMap(rows, "sources"), 1)).toEqual([{ key: "google", count: 5 }]);
    expect(sumMap(rows, "missing")).toEqual({});
  });
  it("reports when a signal started, or null when it never was recorded", () => {
    expect(recordedSince(rows, "sources")).toBe(day(2));
    expect(recordedSince(rows, "devices")).toBeNull();
  });
});

describe("conversion and funnel", () => {
  it("never divides by zero", () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(2, 100)).toBe(2);
    expect(conversionRate(3, 0)).toBe(0);
  });
  it("gives each step's share of the previous step and of the first", () => {
    const f = funnelTotals([{ funnel: { view: 100, add_to_cart: 20 } }, { funnel: { view: 100, add_to_cart: 20, checkout_start: 10, purchase: 5 } }]);
    const r = funnelRates(f);
    expect(r[0]).toMatchObject({ count: 200, ofPrevious: null, ofFirst: 100 });
    expect(r[1]).toMatchObject({ count: 40, ofPrevious: 20 });
    expect(r[3]).toMatchObject({ count: 5, ofPrevious: 50 });
    expect(funnelRates(funnelTotals([]))[1].ofPrevious).toBeNull();
  });
});

describe("sourcePerformance", () => {
  it("joins recorded visits with paid orders by source, treating missing as direct", () => {
    const rows = sourcePerformance({ Google: 100, direct: 50 }, [
      paid({ referralSource: "google", total: 30 }), paid({ total: 10 }), paid({ referralSource: "newsletter", total: 5 }),
      paid({ referralSource: "google", isTest: true }), { paymentStatus: "unpaid", referralSource: "google" },
    ]);
    expect(rows.find(r => r.source === "google")).toMatchObject({ visits: 100, orders: 1, revenue: 30, conversion: 1 });
    expect(rows.find(r => r.source === "direct")).toMatchObject({ visits: 50, orders: 1, conversion: 2 });
    // A source with orders but no recorded visits has no conversion rate, not 0%.
    expect(rows.find(r => r.source === "newsletter")!.conversion).toBeNull();
  });
  it("takes partial refunds off revenue", () => {
    const [r] = sourcePerformance({}, [paid({ total: 40, refundedAmountMinor: 1000, expectedAmountMinor: 4000 })]);
    expect(r.revenue).toBe(30);
  });
});

describe("bookInterest", () => {
  const books = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  it("lists views beside sales and flags titles looked at but never bought", () => {
    const r = bookInterest({ a: 20, b: 8, gone: 6, tiny: 1 }, [paid({ items: [{ id: "a", quantity: 2 }] })], books);
    expect(r.rows[0]).toMatchObject({ id: "a", views: 20, sold: 2, viewToSale: 10 });
    expect(r.watch.map(x => x.id)).toEqual(["b", "gone"]);
    expect(r.rows.find(x => x.id === "gone")!.title).toBe("Removed book");
  });
});

describe("buildSeries", () => {
  it("fills every day, uses paid orders for revenue and lines up the previous block", () => {
    const s = buildSeries(
      [paid({ createdAt: ago(0), total: 25 }), paid({ createdAt: ago(3), total: 10 }), paid({ createdAt: ago(8), total: 7 }), paid({ createdAt: ago(0), total: 40, refundedAmountMinor: 2000, expectedAmountMinor: 4000 })],
      [{ date: day(0), visits: 11 }, { date: day(7), visits: 4 }], 7, NOW);
    expect(s).toHaveLength(7);
    expect(s[6]).toMatchObject({ date: day(0), revenue: 45, orders: 2, visits: 11, prevVisits: 4 });
    expect(s[3]).toMatchObject({ date: day(3), revenue: 10, orders: 1 });
    expect(s[0]).toMatchObject({ date: day(6), revenue: 0, orders: 0 });
    // day(8) is the previous block's day aligned with day(1).
    expect(s[5].prevRevenue).toBe(7);
  });
});

describe("weekdayMix", () => {
  it("groups by the shop's weekday, so a late Toronto evening stays that evening", () => {
    // 2026-09-29 is a Tuesday; 02:00Z on the 30th is still Tuesday evening in Toronto.
    const rows = weekdayMix([paid({ createdAt: "2026-09-30T02:00:00Z", total: 12 }), paid({ createdAt: "2026-09-29T15:00:00Z", total: 8 })]);
    expect(rows.map(r => r.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(rows.find(r => r.day === "Tue")).toMatchObject({ orders: 2, revenue: 20 });
    expect(rows.find(r => r.day === "Wed")!.orders).toBe(0);
  });
});

describe("cartRecovery", () => {
  it("counts only carts started in the period", () => {
    const start = NOW - 30 * 86_400_000;
    const r = cartRecovery([
      { createdAt: ago(2), subtotal: 30, recovered: true, notified: true },
      { createdAt: ago(3), subtotal: 20, recovered: false, notified: true },
      { createdAt: ago(4), subtotal: 10, recovered: false },
      { createdAt: ago(90), subtotal: 99 },
    ], start);
    expect(r).toMatchObject({ total: 3, recovered: 1, reminded: 2, openValue: 30, recoveredValue: 30 });
    expect(r.recoveryRate).toBeCloseTo(33.3, 1);
    expect(cartRecovery([], start).recoveryRate).toBe(0);
  });
});

describe("stockDemand", () => {
  it("groups waiting alerts by title and edition, biggest first, ignoring sent ones", () => {
    const rows = stockDemand([
      { bookId: "a", status: "waiting" }, { bookId: "a", status: "waiting" }, { bookId: "a", status: "sent" },
      { bookId: "b", status: "waiting", variantName: "Hardcover", bookTitle: "B old" }, { bookId: "b", status: "waiting", variantName: "Paperback" },
    ], [{ id: "a", title: "A", stockLevel: 0 }]);
    expect(rows[0]).toEqual({ bookId: "a", title: "A", edition: "", waiting: 2, stock: 0 });
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.edition === "Hardcover")).toMatchObject({ title: "B old", stock: null });
  });
});

describe("categories", () => {
  it("normalises names and falls back to the defaults", () => {
    expect(categoryNames([{ name: "Poetry" }, "poetry", "Zines", { name: "" }])).toEqual(["Poetry", "Zines"]);
    expect(categoryNames(undefined)).toContain("PUBLICATIONS");
  });
  it("sums period sales and recorded visits per category, case-insensitively", () => {
    const rows = categoryBreakdown(
      [paid({ items: [{ id: "a", quantity: 2, price: 10 }, { id: "x", quantity: 1, price: 5 }] })],
      [{ id: "a", categories: ["Poetry"] }],
      ["Poetry", "PUBLICATIONS"], [{ categoryViews: { POETRY: 4 } }, { categoryViews: { poetry: 1 } }]);
    expect(rows[0]).toEqual({ name: "Poetry", views: 5, sold: 2, revenue: 20 });
    // A book with no category lands in PUBLICATIONS, as the storefront treats it.
    expect(rows[1]).toEqual({ name: "PUBLICATIONS", views: 0, sold: 1, revenue: 5 });
  });
});

describe("tracking helpers", () => {
  it("buckets the viewport", () => {
    expect([deviceOf(375), deviceOf(820), deviceOf(1440)]).toEqual(["mobile", "tablet", "desktop"]);
  });
  it("keeps harmless search terms and drops anything personal", () => {
    expect(cleanSearchTerm("  Poetry   Zines ")).toBe("poetry zines");
    expect(cleanSearchTerm("a.b/c")).toBe("a b c");
    expect(cleanSearchTerm("jane@example.com")).toBeNull();
    expect(cleanSearchTerm("order 123456")).toBeNull();
    expect(cleanSearchTerm("604-555-0199")).toBeNull();
    expect(cleanSearchTerm("https://x.test")).toBeNull();
    expect(cleanSearchTerm("a")).toBeNull();
    expect(cleanSearchTerm("x".repeat(80))).toHaveLength(40);
    expect(cleanSearchTerm(null)).toBeNull();
  });
});

describe("cartRows", () => {
  const start = Date.parse("2026-10-01T00:00:00Z");
  const carts = [
    { id: "old", email: "a@x.ca", createdAt: "2026-09-20T10:00:00Z", subtotal: 9 },
    { id: "c1", email: "Reader@X.ca", createdAt: "2026-10-02T10:00:00Z", subtotal: 40, customer: { name: "Ada Reader", address: { city: "Toronto", country: "Canada" } },
      items: [{ title: "Poems", variantName: "Signed", quantity: 2, price: 20 }], notified: true, notifiedAt: "2026-10-02T11:00:00Z", recovered: true, recoveredAt: "2026-10-03T09:00:00Z" },
    { id: "c2", email: "b@x.ca", createdAt: "2026-10-05T10:00:00Z", subtotal: 15, notified: true, notifySkipped: "throttled", items: [{ title: "Zine", quantity: 1, price: 15 }] },
    { id: "c3", email: "c@x.ca", createdAt: "2026-10-06T10:00:00Z", subtotal: 30, recovered: true, recoveredAt: "2026-10-06T12:00:00Z" },
  ];
  const orders = [
    { id: "ORD1", cartId: "c1", createdAt: "2026-10-03T09:00:00Z", customer: { email: "reader@x.ca" } },
    { id: "ORD-EARLY", createdAt: "2026-10-01T09:00:00Z", customer: { email: "c@x.ca" } },
    { id: "ORD3", createdAt: "2026-10-06T11:59:00Z", customer: { email: "c@x.ca" } },
  ] as any[];
  const rows = cartRows(carts, start, orders);

  it("lists only carts started in the period, newest first", () => {
    expect(rows.map(r => r.id)).toEqual(["c3", "c2", "c1"]);
  });
  it("keeps who, where, which books, the reminder and the outcome", () => {
    const c1 = rows.find(r => r.id === "c1")!;
    expect(c1).toMatchObject({ email: "reader@x.ca", name: "Ada Reader", place: "Toronto, Canada", value: 40, reminder: "sent", recovered: true, orderId: "ORD1" });
    expect(c1.books).toEqual([{ title: "Poems", edition: "Signed", quantity: 2, price: 20 }]);
    expect(rows.find(r => r.id === "c2")).toMatchObject({ reminder: "skipped", recovered: false, orderId: null });
  });
  it("links a came-back cart without a cartId to that email's first order after the cart", () => {
    expect(rows.find(r => r.id === "c3")!.orderId).toBe("ORD3");
  });
});
