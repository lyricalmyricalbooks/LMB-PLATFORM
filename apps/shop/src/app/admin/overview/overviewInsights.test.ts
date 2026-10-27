import { describe, expect, it } from "vitest";
import {
  change, customerMix, periodKeys, refundedAmount, unitsById, dormantStock, formatMix, lineFormat, newsletterSummary, reprintWatch, reviewSummary,
  splitPeriods, stockValue, titleStock, toFulfil, topCountries, totals,
} from "./overviewInsights";

const NOW = new Date("2026-09-29T12:00:00Z").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const order = (o: any) => ({ paymentStatus: "paid", total: 20, subtotal: 22, discount: 2, shipping: 5, items: [], ...o });

describe("overview insights", () => {
  it("only counts paid, non-test orders in periods", () => {
    const orders = [
      order({ createdAt: ago(1) }),
      order({ createdAt: ago(2), paymentStatus: "unpaid" }),
      order({ createdAt: ago(3), isTest: true }),
      order({ createdAt: ago(40) }),
    ];
    const p = splitPeriods(orders, 30, NOW);
    expect(p.current).toHaveLength(1);
    expect(p.previous).toHaveLength(1);
  });

  it("computes totals, AOV and discount rate", () => {
    const t = totals([order({ items: [{ quantity: 2 }] }), order({ total: 40, subtotal: 44, items: [{ quantity: 1 }] })]);
    expect(t).toMatchObject({ orders: 2, revenue: 60, units: 3, aov: 30, shipping: 10, discounts: 4 });
    expect(t.discountRate).toBeCloseTo(6.06, 1);
    expect(totals([]).aov).toBe(0);
  });

  it("change returns null without a baseline", () => {
    expect(change(5, 0)).toBeNull();
    expect(change(0, 0)).toBe(0);
    expect(change(15, 10)).toBe(50);
  });

  it("splits new vs returning customers", () => {
    const a = order({ createdAt: ago(60), customer: { email: "A@x.com" } });
    const b = order({ createdAt: ago(5), customer: { email: "a@x.com" } });
    const c = order({ createdAt: ago(4), customer: { email: "c@x.com" } });
    const { paid, current, start } = splitPeriods([a, b, c], 30, NOW);
    expect(customerMix(paid, current, start)).toMatchObject({ total: 2, returning: 1, fresh: 1, returningRate: 50 });
  });

  it("ranks countries by revenue", () => {
    const rows = topCountries([
      order({ total: 10, customer: { address: { country: "CA" } } }),
      order({ total: 50, customer: { address: { country: "US" } } }),
      order({ total: 5 }),
    ]);
    expect(rows.map(r => r.country)).toEqual(["US", "CA", "Unknown"]);
  });

  it("splits print and digital revenue", () => {
    const books = [{ id: "p", format: "Paperback" }, { id: "e", format: "E-book (PDF)" }];
    const mix = formatMix([order({ items: [{ id: "p", quantity: 1, price: 30 }, { id: "e", quantity: 1, price: 10 }] })], books);
    expect(mix.printShare).toBe(75);
    expect(mix.digitalShare).toBe(25);
  });

  it("uses one digital rule for the heading and the bar (a line sold as 'E-book' is digital)", () => {
    const books = [{ id: "p", format: "Paperback" }, { id: "x", format: "Paperback" }];
    const mix = formatMix([order({ items: [
      { id: "p", quantity: 1, price: 30 },
      // The edition sold was the e-book: its line format says so, even though the book's own format is print.
      { id: "x", quantity: 1, price: 10, format: "E-book" },
      { id: "x", quantity: 1, price: 10, format: "Audiobook", digital: false },
    ] })], books);
    const barDigital = mix.formats.filter(f => f.digital).reduce((s, f) => s + f.revenue, 0);
    expect(mix.formats.find(f => f.format === "E-book")?.digital).toBe(true);
    expect(mix.digitalShare).toBe(40);
    expect(mix.digitalShare).toBeCloseTo((barDigital / mix.total) * 100);
    expect(lineFormat({ id: "p" }, books[0])).toEqual({ format: "Paperback", digital: false });
    expect(lineFormat({ id: "e" }, { format: "E-book (EPUB)" }).digital).toBe(true);
    expect(lineFormat({ id: "p", digital: true }, books[0]).digital).toBe(true);
  });

  it("flags reprint candidates and dormant stock", () => {
    const books = [
      { id: "hot", title: "Hot", trackInventory: true, stockLevel: 5, format: "Paperback" },
      { id: "cold", title: "Cold", trackInventory: true, stockLevel: 40, format: "Paperback" },
      { id: "ebook", title: "Ebook", stockLevel: 0, format: "E-book (PDF)" },
      { id: "draft", title: "Draft", stockLevel: 9, status: "draft" },
    ];
    const paid = [order({ createdAt: ago(3), items: [{ id: "hot", quantity: 15 }] }), order({ createdAt: ago(200), items: [{ id: "cold", quantity: 1 }] })];
    const rows = titleStock(paid, books, NOW);
    expect(rows.map(r => r.id)).toEqual(["hot", "cold"]);
    expect(reprintWatch(rows).map(r => r.id)).toEqual(["hot"]);
    expect(dormantStock(rows).map(r => r.id)).toEqual(["cold"]);
  });

  it("values print stock", () => {
    const s = stockValue([{ id: "x", trackInventory: true, stockLevel: 3, retailPrice: 10, format: "Paperback" }, { id: "y", trackInventory: true, stockLevel: 0, retailPrice: 8 }, { stockLevel: 99, retailPrice: 5, format: "Audiobook" }]);
    expect(s).toMatchObject({ units: 3, value: 30, soldOut: 1, titles: 2 });
  });

  it("lists unshipped paid orders oldest first", () => {
    const rows = toFulfil([
      order({ id: "new", createdAt: ago(1) }),
      order({ id: "old", createdAt: ago(6) }),
      order({ id: "sent", createdAt: ago(3), fulfillmentStatus: "shipped" }),
      order({ id: "unpaid", createdAt: ago(9), paymentStatus: "unpaid" }),
    ], NOW);
    expect(rows.map(r => r.id)).toEqual(["old", "new"]);
    expect(rows[0].ageDays).toBe(6);
  });

  it("summarises reviews and newsletter", () => {
    expect(reviewSummary([{ status: "pending" }, { status: "approved", rating: 5 }, { status: "approved", rating: 4 }])).toEqual({ pending: 1, approved: 2, average: 4.5 });
    expect(reviewSummary([]).average).toBeNull();
    expect(newsletterSummary([{ subscribedAt: ago(2) }, { subscribedAt: ago(90) }], NOW - 30 * 86_400_000)).toEqual({ total: 2, added: 1 });
  });
});

import { bestSellers } from "./overviewInsights";
describe("bestSellers", () => {
  it("ranks titles by revenue with share and ignores empty lines", () => {
    const orders = [
      { items: [{ id: "a", title: "A", quantity: 2, price: 10 }, { id: "b", title: "B", quantity: 1, price: 5 }] },
      { items: [{ id: "b", title: "B", quantity: 1, price: 5 }, { quantity: 3, price: 9 }, { id: "z", quantity: 0, price: 9 }] },
    ];
    const r = bestSellers(orders, 5);
    expect(r.map(x => x.id)).toEqual(["a", "b"]);
    expect(r[0]).toMatchObject({ units: 2, revenue: 20 });
    expect(Math.round(r[0].share)).toBe(67);
    expect(bestSellers(orders, 1)).toHaveLength(1);
  });
});

describe("calendar-day periods", () => {
  it("covers today plus the previous days, and the equally long block before", () => {
    expect(periodKeys(1, NOW)).toEqual({ endKey: "2026-09-29", startKey: "2026-09-29", prevStartKey: "2026-09-28" });
    expect(periodKeys(30, NOW)).toMatchObject({ startKey: "2026-08-31", prevStartKey: "2026-08-01" });
  });
  it("splits orders by day key: boundary days land on the right side", () => {
    const orders = [
      order({ id: "today", createdAt: "2026-09-29T12:30:00Z" }),
      order({ id: "first", createdAt: "2026-08-31T23:59:00Z" }),
      order({ id: "lastPrev", createdAt: "2026-08-30T10:00:00Z" }),
      order({ id: "tooOld", createdAt: "2026-07-31T10:00:00Z" }),
      order({ id: "future", createdAt: "2026-09-30T05:00:00Z" }),
      order({ id: "nodate" }),
    ];
    const p = splitPeriods(orders, 30, NOW);
    expect(p.current.map(o => o.id)).toEqual(["today", "first"]);
    expect(p.previous.map(o => o.id)).toEqual(["lastPrev"]);
    expect(p.start).toBe(Date.parse("2026-08-31T00:00:00Z"));
  });
});

describe("refunds", () => {
  it("applies the refunded share of the charge to the CAD total, whatever currency was charged", () => {
    // Charged US$ 15.00, refunded US$ 5.00 of it: a third of the CA$ 20 total.
    expect(refundedAmount({ total: 20, refundedAmountMinor: 500, expectedAmountMinor: 1500, checkoutCurrency: "USD" })).toBeCloseTo(6.67, 2);
    expect(refundedAmount({ total: 20, refundedAmountMinor: 500 })).toBe(5);
    expect(refundedAmount({ total: 20, refundedAmountMinor: 500, checkoutCurrency: "USD" })).toBe(0);
    expect(refundedAmount({ total: 20, refundedAmountMinor: 9999, expectedAmountMinor: 2000 })).toBe(20);
    expect(refundedAmount({ total: 20 })).toBe(0);
  });
  it("reports gross, refunded and net, and averages the net", () => {
    const t = totals([order({ total: 40, tax: 4, refundedAmountMinor: 1000, expectedAmountMinor: 4000 }), order({ total: 20, tax: 2 })]);
    expect(t).toMatchObject({ revenue: 60, refunded: 10, net: 50, aov: 25, tax: 6 });
  });
});

describe("unitsById", () => {
  it("adds units per title and skips lines with no id or quantity", () => {
    const m = unitsById([order({ items: [{ id: "a", quantity: 2 }, { quantity: 5 }] }), order({ items: [{ id: "a", quantity: 1 }, { id: "b", quantity: 0 }] })]);
    expect([...m.entries()]).toEqual([["a", 3]]);
  });
});

describe("untracked stock and edition formats", () => {
  it("leaves books with Track inventory off out of the stock panels", async () => {
    const { titleStock, stockValue } = await import("./overviewInsights");
    const books: any[] = [{ id: "pod", title: "POD", stockLevel: 0, trackInventory: false, retailPrice: 10 }];
    expect(titleStock([], books)).toEqual([]);
    expect(titleStock([], [{ ...books[0], trackInventory: true }])).toHaveLength(1);
    expect(stockValue(books).soldOut).toBe(0);
  });
});

describe("format mix", () => {
  it("counts the edition actually sold, not the book's main format", async () => {
    const { formatMix } = await import("./overviewInsights");
    const books: any[] = [{ id: "b", format: "Paperback" }];
    const orders: any[] = [{ items: [{ id: "b", quantity: 1, price: 10, format: "EPUB", digital: true }, { id: "b", quantity: 1, price: 20 }] }];
    const mix: any = formatMix(orders, books);
    expect(mix.formats.map((f: any) => f.format).sort()).toEqual(["EPUB", "Paperback"]);
    expect(mix.digitalShare).toBeCloseTo(100 / 3, 1);
  });
});
