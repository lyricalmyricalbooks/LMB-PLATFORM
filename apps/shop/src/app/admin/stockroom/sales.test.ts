import { describe, expect, it } from "vitest";

import { buildCustomers, customerSummary, filterCustomers, spendLine } from "./customers";
import { buildSalesRows, channelLabel, filterSales, NO_FILTER, salesTotals } from "./sales";
import type { StockroomRecords } from "./stockroomData";

const records: StockroomRecords = {
  books: [
    { id: "a", title: "Salt Hours", maxPrint: 100, currency: "CAD" },
    { id: "b", title: "Night Songs", maxPrint: 50, currency: "CAD" },
  ],
  states: {
    a: {
      hist: [
        { num: "1001", chan: "Website", qty: 2, price: 20, date: "2026-10-01", shipEmail: "ada@example.com", shipName: "Ada" },
        { num: "1002", chan: "POS", qty: 1, price: 20, date: "2026-10-09", email: "ada@example.com" },
        { num: "1003", chan: "Website", qty: 3, price: 20, date: "2026-10-05", email: "ben@example.com", voided: true },
        { num: "1004", chan: "Gratuity", qty: 1, price: 0, date: "2026-10-06", gratuity: true },
        { num: "1005", chan: "Website", qty: 1, price: 25, date: "2026-10-07", cur: "USD" },
      ],
      ledger: [{ type: "Shipment", storeName: "Corner Books", qty: 10, date: "2026-10-02" }],
    },
    b: { hist: [{ num: "2001", chan: "Direct", qty: 1, price: 18, date: "2026-10-08" }] },
  },
  taxCenter: null,
};

describe("sales records", () => {
  const rows = buildSalesRows(records);

  it("lists every sale and consignment movement across the items, newest first", () => {
    expect(rows.map((r) => r.num || r.movement)).toEqual(["1002", "2001", "1005", "1004", "1003", "Sent to Corner Books", "1001"]);
    expect(rows.find((r) => r.kind === "consign")).toMatchObject({ movement: "Sent to Corner Books", qty: 10 });
  });

  it("words channels the way the stockroom does", () => {
    expect(channelLabel("POS")).toBe("In person");
    expect(channelLabel("Big Cartel")).toBe("Website");
    expect(channelLabel("")).toBe("Direct");
    expect(channelLabel("Gratuity")).toBe("Gift");
  });

  it("marks a voided sale and never counts it", () => {
    const voided = rows.find((r) => r.num === "1003");
    expect(voided?.voided).toBe(true);
    const totals = salesTotals(rows);
    // Sold: 2 + 1 (+ 1 USD row) in Salt Hours and 1 in Night Songs; the voided 3 and the gift are not copies sold.
    expect(totals).toMatchObject({ sales: 5, copies: 5, gifts: 1, voided: 1 });
    // The US-dollar sale is kept in US dollars, never added into the Canadian-dollar figure.
    expect(totals.revenue).toEqual({ CAD: 2 * 20 + 20 + 18, USD: 25 });
  });

  it("flags a sale recorded in another currency", () => {
    expect(rows.find((r) => r.num === "1005")).toMatchObject({ currency: "USD", foreignCurrency: true, bookCurrency: "CAD" });
  });

  it("searches with the stockroom's own rules and narrows by channel, item and dates", () => {
    expect(filterSales(rows, { ...NO_FILTER, search: "void" }).rows.map((r) => r.num)).toEqual(["1003"]);
    expect(filterSales(rows, { ...NO_FILTER, search: "1001" }).rows).toHaveLength(1);
    expect(filterSales(rows, { ...NO_FILTER, channel: "In person" }).rows.map((r) => r.num)).toEqual(["1002"]);
    expect(filterSales(rows, { ...NO_FILTER, bookId: "b" }).rows.map((r) => r.num)).toEqual(["2001"]);
    expect(filterSales(rows, { ...NO_FILTER, from: "2026-10-07", to: "2026-10-08" }).rows.map((r) => r.num)).toEqual(["2001", "1005"]);
    expect(filterSales(rows, { ...NO_FILTER, hideVoided: true }).rows.some((r) => r.voided)).toBe(false);
    const none = filterSales(rows, { ...NO_FILTER, search: "zzz" });
    expect(none.rows).toEqual([]);
    expect(none.described.detail).toMatch(/Nothing matches/);
  });

  it("gives the totals of what is shown", () => {
    const shown = filterSales(rows, { ...NO_FILTER, bookId: "b" }).rows;
    expect(salesTotals(shown)).toMatchObject({ sales: 1, copies: 1, revenue: { CAD: 18 } });
  });

  it("skips an item with no records", () => {
    expect(buildSalesRows({ ...records, states: {} })).toEqual([]);
  });
});

describe("customers", () => {
  const { customers, noEmail } = buildCustomers(records);

  it("groups buyers by email through the stockroom's rule, leaving out voided sales and gifts", () => {
    expect(customers.map((c) => c.email)).toEqual(["ada@example.com"]);
    expect(customers[0]).toMatchObject({ name: "Ada", orders: 2, units: 3, first: "2026-10-01", last: "2026-10-09" });
    expect(spendLine(customers[0].spend)).toBe("CA$60.00");
    // The USD sale, the Night Songs sale and the gift have no email (the voided one is not counted at all).
    expect(noEmail).toBe(2);
  });

  it("keeps each order for the detail view", () => {
    expect(customers[0].lines.map((l) => l.num)).toEqual(["1002", "1001"]);
  });

  it("filters and describes", () => {
    expect(filterCustomers(customers, { orders: "single" })).toEqual([]);
    expect(filterCustomers(customers, { search: "ADA" })).toHaveLength(1);
    expect(customerSummary(1, 0, 2)).toBe("1 customer with an email, 0 shown. 2 sales had no email");
  });
});
