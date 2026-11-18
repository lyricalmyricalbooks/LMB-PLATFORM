import { describe, expect, it } from "vitest";
import { giftSales, membershipSales, packSales, serviceLedgerRows, serviceSales, serviceYear, withPackSales } from "./serviceSales";
import { taxCenterModel, type MoneySources } from "./moneyReports";
import { taxPeriodModel } from "./taxPeriods";
import { yearFigures } from "./yearReport";

const ZONE = "America/Toronto";
const base = { serviceName: "Cut and style", currency: "CAD", priceMinor: 6000 };
const bookings = [
  // Paid by card when booked, visit on 10 March.
  { id: "a1", ...base, start: "2026-03-10T15:00:00Z", status: "confirmed", payment: "card", paid: true },
  // Deposit of 20 kept after a late cancel.
  { id: "b2", ...base, start: "2026-03-12T15:00:00Z", status: "cancelled", payment: "deposit", depositMinor: 2000, depositPaid: true },
  // Fully refunded: kept nothing.
  { id: "c3", ...base, start: "2026-03-13T15:00:00Z", status: "cancelled", payment: "card", paid: true, refund: { amountMinor: 6000 } },
  // Paid at the shop, with a tip, on 2 April.
  { id: "d4", ...base, start: "2026-04-02T15:00:00Z", status: "confirmed", payment: "atShop", paid: true, tip: { amountMinor: 900 } },
  // Held (never paid) and a visit still to come are left out.
  { id: "e5", ...base, start: "2026-03-14T15:00:00Z", status: "held", payment: "card" },
  { id: "f6", ...base, start: "2026-12-01T15:00:00Z", status: "confirmed", payment: "card", paid: true },
  // Late evening in Toronto is still that day there (01:30 UTC next day).
  { id: "g7", ...base, start: "2026-05-01T01:30:00Z", status: "confirmed", payment: "card", paid: true },
];

describe("service sales", () => {
  const sales = serviceSales(bookings, ZONE, "2026-06-30", "CAD");

  it("counts each visit on its day with what the shop kept, tips apart", () => {
    expect(sales.map((s) => [s.id, s.date, s.keptMinor, s.tipMinor])).toEqual([
      ["a1", "2026-03-10", 6000, 0],
      ["b2", "2026-03-12", 2000, 0],
      ["d4", "2026-04-02", 6000, 900],
      ["g7", "2026-04-30", 6000, 0],
    ]);
  });

  it("makes ledger rows like the stockroom's sales, and a tip row that isn't a sale", () => {
    const rows = serviceLedgerRows(sales, "2026", "CAD");
    expect(rows.filter((r) => r.type === "Sale").map((r) => r.baseAmount)).toEqual([60, 20, 60, 60]);
    expect(rows.find((r) => r.type === "Tip")).toMatchObject({ baseAmount: 9, isIncome: true, sourceType: "bookingTip" });
    expect(serviceLedgerRows(sales, "2025", "CAD")).toEqual([]);
    expect(serviceLedgerRows(sales, "2026", "USD")).toEqual([]);
    expect(serviceYear(sales, "2026", "CAD")).toEqual({ count: 4, kept: 200, tax: 0, tips: 9, gifts: 0, memberships: 0 });
  });

  const sources: MoneySources = { books: {}, states: {}, taxCenter: {}, fxRateCache: {}, serviceSales: sales };

  it("adds them to the Tax centre's ledger and totals", () => {
    const model = taxCenterModel(sources, "2026", new Date("2026-06-30T12:00:00"));
    expect(model.summary.sales).toBe(209);
    expect(model.summary.txnCount).toBe(4);
    expect(model.rows.filter((r) => r.sourceId === "bookings")).toHaveLength(5);
    expect(taxCenterModel({ ...sources, serviceSales: undefined }, "2026").summary.sales).toBe(0);
  });

  it("shows bookings as their own line in the sales tax period, with no tax", () => {
    const rows = taxCenterModel(sources, "all").rows;
    const period = { id: "2026-Q1", label: "Q1 2026", start: "2026-01-01", end: "2026-03-31", open: false, quarter: true };
    const model = taxPeriodModel({ orders: [], ledgerRows: rows, states: {}, period, currency: "CAD" });
    expect(model.channels.find((c) => c.id === "bookings")).toMatchObject({ salesCents: 8000, taxCents: 0, sales: 2 });
    expect(model.rates.find((r) => r.id === "chan:bookings")).toMatchObject({ netCents: 8000, taxCents: 0, orders: 2 });
    expect(model.salesCents).toBe(8000);
    expect(model.taxCents).toBe(0);
  });

  it("counts visits in the year figures (not tips)", () => {
    const f = yearFigures({ books: [], states: {}, taxCenter: null, fxRateCache: {}, serviceSales: sales }, "2026");
    expect(f.revenue).toBe(200);
    expect(f.services).toBe(200);
    expect(f.bookStats).toEqual([{ title: "Bookings", units: 4, revenue: 200, unitCost: 0, cogs: 0, shares: 0, net: 200 }]);
  });

  describe("a service that charges sales tax", () => {
    // $100 plus 13% HST: the booking's price is $113 with $13 tax in it.
    const taxed = { ...base, priceMinor: 11300, taxMinor: 1300, taxLines: [{ name: "HST ON", cents: 1300 }] };
    const rows = [
      { id: "t1", ...taxed, start: "2026-02-10T15:00:00Z", status: "confirmed", payment: "card", paid: true },
      // A deposit of $56.50 kept after a late cancel: half the tax is in it.
      { id: "t2", ...taxed, start: "2026-02-11T15:00:00Z", status: "cancelled", payment: "deposit", depositMinor: 5650, depositPaid: true },
      { id: "u1", ...base, start: "2026-02-12T15:00:00Z", status: "confirmed", payment: "card", paid: true },
    ];
    const taxedSales = serviceSales(rows, ZONE, "2026-06-30", "CAD");

    it("keeps the tax in what was kept, by name", () => {
      expect(taxedSales.map((s) => [s.id, s.keptMinor, s.taxMinor, s.taxLines])).toEqual([
        ["t1", 11300, 1300, [{ name: "HST ON", cents: 1300 }]],
        ["t2", 5650, 650, [{ name: "HST ON", cents: 650 }]],
        ["u1", 6000, 0, []],
      ]);
    });

    it("books the sale net of tax, with the tax beside it", () => {
      const ledger = serviceLedgerRows(taxedSales, "2026", "CAD");
      expect(ledger.map((r) => [r.baseAmount, r.taxAmount, r.taxes])).toEqual([[100, 13, { "HST ON": 1300 }], [50, 6.5, { "HST ON": 650 }], [60, 0, {}]]);
      expect(serviceYear(taxedSales, "2026", "CAD")).toEqual({ count: 3, kept: 210, tax: 19.5, tips: 0, gifts: 0, memberships: 0 });
      expect(yearFigures({ books: [], states: {}, taxCenter: null, fxRateCache: {}, serviceSales: taxedSales }, "2026").revenue).toBe(210);
    });

    it("puts the tax on its own rate line in the sales tax period, untaxed visits apart", () => {
      const ledgerRows = taxCenterModel({ ...sources, serviceSales: taxedSales }, "all").rows;
      const period = { id: "2026-Q1", label: "Q1 2026", start: "2026-01-01", end: "2026-03-31", open: false, quarter: true };
      const model = taxPeriodModel({ orders: [], ledgerRows, states: {}, period, currency: "CAD" });
      expect(model.rates.find((r) => r.name === "HST ON")).toMatchObject({ note: "Bookings", netCents: 15000, taxCents: 1950, orders: 2 });
      expect(model.rates.find((r) => r.id === "chan:bookings")).toMatchObject({ note: "No tax charged", netCents: 6000, orders: 1 });
      expect(model.channels.find((c) => c.id === "bookings")).toMatchObject({ salesCents: 21000, taxCents: 1950, sales: 3 });
      expect(model.taxCents).toBe(1950);
      expect(model.salesCents).toBe(21000);
    });
  });

  describe("packs of visits", () => {
    // Five visits for $226 with $26 HST in it, paid on 3 March; $113 given back on closing it.
    const packs = [
      { id: "p1", serviceName: "Cut and style", visits: 5, status: "closed", priceMinor: 22600, currency: "CAD", paidAt: "2026-03-03T16:00:00Z", refundMinor: 11300, taxMinor: 2600, taxLines: [{ name: "HST ON", cents: 2600 }] },
      // An untaxed pack paid late evening in Toronto (next day in UTC).
      { id: "p2", serviceName: "Cut and style", visits: 3, status: "active", priceMinor: 15000, currency: "CAD", paidAt: "2026-03-05T02:00:00Z", refundMinor: 0 },
      // Fully refunded, never paid, and paid after today are left out.
      { id: "p3", serviceName: "Cut and style", visits: 3, status: "closed", priceMinor: 15000, currency: "CAD", paidAt: "2026-03-06T16:00:00Z", refundMinor: 15000 },
      { id: "p4", serviceName: "Cut and style", visits: 3, status: "active", priceMinor: 15000, currency: "CAD", paidAt: null, refundMinor: 0 },
      { id: "p5", serviceName: "Cut and style", visits: 3, status: "active", priceMinor: 15000, currency: "CAD", paidAt: "2026-07-01T16:00:00Z", refundMinor: 0 },
    ];
    const sold = packSales(packs, ZONE, "2026-06-30", "CAD");

    it("counts a pack on the day it was paid, less what was given back, with its share of tax", () => {
      expect(sold.map((s) => [s.id, s.date, s.serviceName, s.keptMinor, s.taxMinor, s.taxLines, s.kind])).toEqual([
        ["pack-p1", "2026-03-03", "Cut and style, pack of 5", 11300, 1300, [{ name: "HST ON", cents: 1300 }], "pack"],
        ["pack-p2", "2026-03-04", "Cut and style, pack of 3", 15000, 0, [], "pack"],
      ]);
    });

    it("sits among the visits by date and books net of tax", () => {
      const all = withPackSales(serviceSales(bookings, ZONE, "2026-06-30", "CAD"), sold);
      expect(all.map((s) => s.id).slice(0, 4)).toEqual(["pack-p1", "pack-p2", "a1", "b2"]);
      const ledger = serviceLedgerRows(sold, "2026", "CAD");
      expect(ledger.map((r) => [r.desc, r.baseAmount, r.taxAmount])).toEqual([["Cut and style, pack of 5", 100, 13], ["Cut and style, pack of 3", 150, 0]]);
    });
  });

  describe("gifts from the Support page", () => {
    const gifts = [
      // $25 with the $1.03 card fee covered, paid late evening in Toronto (next day in UTC).
      { id: "g1", status: "paid", amountMinor: 2500, chargedMinor: 2603, currency: "CAD", paidAt: "2026-03-05T02:00:00Z", test: false },
      { id: "g2", status: "paid", amountMinor: 1000, chargedMinor: 1000, currency: "CAD", paidAt: "2026-04-01T15:00:00Z", test: false },
      // Refunded, a test gift and one paid after today are left out.
      { id: "g3", status: "refunded", amountMinor: 5000, chargedMinor: 5000, currency: "CAD", paidAt: "2026-04-02T15:00:00Z", test: false },
      { id: "g4", status: "paid", amountMinor: 5000, chargedMinor: 5000, currency: "CAD", paidAt: "2026-04-03T15:00:00Z", test: true },
      { id: "g5", status: "paid", amountMinor: 5000, chargedMinor: 5000, currency: "CAD", paidAt: "2026-07-01T15:00:00Z", test: false },
    ];
    const given = giftSales(gifts, ZONE, "2026-06-30", "CAD");
    const withGifts = withPackSales(serviceSales(bookings, ZONE, "2026-06-30", "CAD"), given);

    it("counts a gift on the shop day it was paid with what the giver paid, never taxed", () => {
      expect(given.map((s) => [s.id, s.date, s.keptMinor, s.taxMinor, s.kind])).toEqual([
        ["gift-g1", "2026-03-04", 2603, 0, "gift"],
        ["gift-g2", "2026-04-01", 1000, 0, "gift"],
      ]);
    });

    it("is a Gift row in the books, never a sale, with no giver's name", () => {
      const rows = serviceLedgerRows(given, "2026", "CAD");
      expect(rows.map((r) => [r.type, r.desc, r.baseAmount, r.sourceType, r.isIncome])).toEqual([
        ["Gift", "Gift (Support page)", 26.03, "gift", true],
        ["Gift", "Gift (Support page)", 10, "gift", true],
      ]);
      expect(serviceYear(withGifts, "2026", "CAD")).toEqual({ count: 4, kept: 200, tax: 0, tips: 9, gifts: 36.03, memberships: 0 });
    });

    it("stays out of sales in the Tax centre, the tax period and the year figures", () => {
      const model = taxCenterModel({ books: {}, states: {}, taxCenter: {}, fxRateCache: {}, serviceSales: withGifts }, "2026", new Date("2026-06-30T12:00:00"));
      expect(model.summary.sales).toBe(209);
      expect(model.summary.txnCount).toBe(4);
      expect(model.rows.filter((r) => r.sourceType === "gift")).toHaveLength(2);
      const period = { id: "2026-Q1", label: "Q1 2026", start: "2026-01-01", end: "2026-03-31", open: false, quarter: true };
      expect(taxPeriodModel({ orders: [], ledgerRows: model.rows, states: {}, period, currency: "CAD" }).salesCents).toBe(8000);
      expect(yearFigures({ books: [], states: {}, taxCenter: null, fxRateCache: {}, serviceSales: withGifts }, "2026").revenue).toBe(200);
    });
  });

  describe("membership payments", () => {
    const payments = [
      // Paid late evening in Toronto (next day in UTC).
      { id: "in_1", plan: "Friends", amountMinor: 1500, currency: "cad", paidAt: "2026-03-05T02:00:00Z", test: false },
      { id: "in_2", plan: "", amountMinor: 1500, currency: "CAD", paidAt: "2026-04-05T15:00:00Z", test: false },
      // A repeat, a test payment, a free one and one after today are left out.
      { id: "in_1", plan: "Friends", amountMinor: 1500, currency: "CAD", paidAt: "2026-03-05T02:00:00Z", test: false },
      { id: "in_3", plan: "Friends", amountMinor: 1500, currency: "CAD", paidAt: "2026-04-06T15:00:00Z", test: true },
      { id: "in_4", plan: "Friends", amountMinor: 0, currency: "CAD", paidAt: "2026-04-07T15:00:00Z", test: false },
      { id: "in_5", plan: "Friends", amountMinor: 1500, currency: "CAD", paidAt: "2026-07-05T15:00:00Z", test: false },
    ];
    const paid = membershipSales(payments, ZONE, "2026-06-30", "CAD");
    const withMembers = withPackSales(serviceSales(bookings, ZONE, "2026-06-30", "CAD"), paid);

    it("counts each payment on the shop day it was paid, never taxed", () => {
      expect(paid.map((s) => [s.id, s.date, s.keptMinor, s.currency, s.serviceName, s.kind])).toEqual([
        ["member-in_1", "2026-03-04", 1500, "CAD", "Friends", "membership"],
        ["member-in_2", "2026-04-05", 1500, "CAD", "Membership", "membership"],
      ]);
    });

    it("is its own Membership row in the books, counted in sales but apart from the shop's", () => {
      const rows = serviceLedgerRows(paid, "2026", "CAD");
      expect(rows.map((r) => [r.type, r.desc, r.baseAmount, r.sourceType, r.isIncome])).toEqual([
        ["Membership", "Friends (membership)", 15, "membership", true],
        ["Membership", "Membership (membership)", 15, "membership", true],
      ]);
      expect(serviceYear(withMembers, "2026", "CAD")).toEqual({ count: 4, kept: 200, tax: 0, tips: 9, gifts: 0, memberships: 30 });
      const model = taxCenterModel({ books: {}, states: {}, taxCenter: {}, fxRateCache: {}, serviceSales: withMembers }, "2026", new Date("2026-06-30T12:00:00"));
      expect(model.summary.sales).toBe(239);
      expect(model.rows.filter((r) => r.sourceType === "membership")).toHaveLength(2);
      const period = { id: "2026-Q2", label: "Q2 2026", start: "2026-04-01", end: "2026-06-30", open: false, quarter: true };
      const q2 = taxPeriodModel({ orders: [], ledgerRows: model.rows, states: {}, period, currency: "CAD" });
      expect(q2.channels.find((c) => c.id === "memberships")).toMatchObject({ salesCents: 1500, taxCents: 0, sales: 1 });
      expect(q2.checks.find((c) => c.id === "memberships")?.done).toBe(false);
      const year = yearFigures({ books: [], states: {}, taxCenter: null, fxRateCache: {}, serviceSales: withMembers }, "2026");
      expect(year.revenue).toBe(230);
      expect(year.bookStats.find((b) => b.title === "Memberships")).toMatchObject({ units: 2, revenue: 30 });
    });
  });
});
