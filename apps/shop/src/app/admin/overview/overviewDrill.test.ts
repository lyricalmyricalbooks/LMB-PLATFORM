import { describe, expect, it } from "vitest";
import {
  booksLine, countsByDay, discountedOrders, hoursToShip, orderItem, orderItems, ordersInCategory, ordersOnWeekday, ordersPaidBy,
  ordersToCountry, ordersWithBook, ordersWithCode, ordersWithFormat, shippedSlowestFirst, titlesIn,
} from "./overviewDrill";
import { bestSellers, formatMix, topCountries } from "./overviewInsights";
import { discountPerformance } from "../discountPerformance";
import { operations } from "./overviewCohorts";
import { weekdayMix } from "./overviewTraffic";

const order = (o: any) => ({ paymentStatus: "paid", total: 20, ...o });
const orders = [
  order({ id: "A", createdAt: "2026-10-05T15:00:00Z", paidAt: "2026-10-05T15:00:00Z", shippedAt: "2026-10-06T15:00:00Z", customer: { name: "Ada", email: "ada@x.ca", address: { country: "Canada" } },
    items: [{ id: "b1", title: "Poems", variantName: "Signed", quantity: 2, price: 10, format: "Paperback" }], appliedDiscount: { code: "fall" }, discount: 2, stripePaymentIntentId: "pi" }),
  order({ id: "B", createdAt: "2026-10-07T15:00:00Z", paidAt: "2026-10-07T15:00:00Z", shippedAt: "2026-10-12T15:00:00Z", customer: { email: "bo@x.us", address: { country: "United States" } },
    items: [{ id: "b2", title: "Zine", quantity: 1, price: 20 }], paypalOrderId: "pp", refundedAmountMinor: 500 }),
  order({ id: "C", createdAt: "2026-10-07T18:00:00Z", customer: {}, items: [{ id: "b1", title: "Poems", quantity: 1, price: 10, format: "Paperback" }] }),
];
const books = [{ id: "b1", format: "Paperback", categories: ["POETRY"] }, { id: "b2", format: "Zine" }];

describe("drill-down order picking matches each figure's own grouping", () => {
  it("best seller → orders with that book", () => {
    const top = bestSellers(orders as any)[0];
    expect(ordersWithBook(orders, top.id).map(o => o.id)).toEqual(["A", "C"]);
  });
  it("format, country, weekday, code, payment and category", () => {
    for (const f of formatMix(orders as any, books).formats) expect(ordersWithFormat(orders, books, f.format).length).toBeGreaterThan(0);
    for (const c of topCountries(orders as any)) expect(ordersToCountry(orders, c.country).length).toBe(c.orders);
    for (const d of weekdayMix(orders as any)) expect(ordersOnWeekday(orders, d.day).length).toBe(d.orders);
    for (const [k, p] of discountPerformance(orders)) expect(ordersWithCode(orders, k).length).toBe(p.orders);
    for (const p of operations(orders as any).payments) expect(ordersPaidBy(orders, p.key).length).toBe(p.orders);
    expect(ordersInCategory(orders, books, "poetry").map(o => o.id)).toEqual(["A", "C"]);
    expect(ordersInCategory(orders, books, "PUBLICATIONS").map(o => o.id)).toEqual(["B"]);
    expect(discountedOrders(orders).map(o => o.id)).toEqual(["A"]);
  });
  it("shipped orders slowest first", () => {
    expect(shippedSlowestFirst(orders).map(o => o.id)).toEqual(["B", "A"]);
    expect(hoursToShip(orders[0])).toBe(24);
    expect(hoursToShip(orders[2])).toBeNull();
  });
});

describe("order lines", () => {
  it("names the customer, the books, the facts and links to the order", () => {
    const it = orderItem(orders[0], "why");
    expect(it.title).toBe("Ada · #A");
    expect(String(it.sub)).toContain("2 × Poems (Signed)");
    expect(String(it.sub)).toContain("Canada");
    expect(String(it.sub)).toContain("why");
    expect(it.href).toBe("#orders/A");
    expect(it.value).toBe("CA$20");
    expect(orderItem(orders[1]).value).toBe("CA$15");
    expect(booksLine({ items: [] })).toBe("No books listed");
  });
  it("lists newest first and totals titles", () => {
    expect(orderItems(orders).map(i => i.key)).toEqual(["C", "B", "A"]);
    expect(titlesIn(orders).map(t => [t.title, t.sub])).toEqual([["Poems", "3 sold in 2 orders"], ["Zine", "1 sold in 1 order"]]);
  });
});

describe("countsByDay", () => {
  it("lists only days with a count, newest first", () => {
    const daily = [{ date: "2026-10-01", searches: { poems: 2 } }, { date: "2026-10-03", searches: { zine: 1 } }, { date: "2026-10-04", searches: { poems: 1 } }];
    expect(countsByDay(daily, "searches", "poems", "search").map(d => [d.key, d.value])).toEqual([["2026-10-04", "1 search"], ["2026-10-01", "2 searches"]]);
  });
});
