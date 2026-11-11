import { describe, expect, it } from "vitest";
import { channelOf, dueOf, filingsOf, pastQuarters, taxPeriodModel, taxPeriods, taxReportRows } from "./taxPeriods";

const NOW = Date.parse("2026-11-11T15:00:00Z");

const order = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, createdAt: at, paidAt: at, paymentStatus: "paid", subtotal: 100, discount: 0, shipping: 10, total: 123,
  tax: 13, taxLines: [{ name: "HST ON", cents: 1300 }], fee: 330, payoutId: "po_1", ...extra,
});

describe("tax periods", () => {
  it("offers this quarter (open), the two before it and the year so far", () => {
    const p = taxPeriods(NOW);
    expect(p.map((x) => x.label)).toEqual(["Q4 2026", "Q3 2026", "Q2 2026", "Year to date"]);
    expect(p[0]).toMatchObject({ start: "2026-10-01", end: "2026-12-31", open: true });
    expect(p[1].open).toBe(false);
    expect(p[3]).toMatchObject({ start: "2026-01-01", end: "2026-11-11", quarter: false });
    expect(taxPeriods(Date.parse("2026-02-10T15:00:00Z")).map((x) => x.id)).toEqual(["2026-Q1", "2025-Q4", "2025-Q3", "2026-ytd"]);
    expect(pastQuarters(3, NOW).map((x) => x.id)).toEqual(["2026-Q3", "2026-Q2", "2026-Q1"]);
  });

  it("puts the due date at the end of the month after the quarter", () => {
    const [q4, q3] = taxPeriods(NOW);
    expect(dueOf(q4, NOW)).toEqual({ due: "2027-01-31", daysLeft: 81, through: 46 });
    expect(dueOf(q3, NOW)).toMatchObject({ due: "2026-10-31", daysLeft: -11, through: 100 });
  });

  it("reads each sale's channel, leaving website sales to the orders", () => {
    expect(channelOf({ chan: "Website" })).toBeNull();
    expect(channelOf({ chan: "Book Fair" })).toBe("fairs");
    expect(channelOf({ chan: "POS" })).toBe("fairs");
    expect(channelOf({ chan: "Consignment" })).toBe("stockists");
    expect(channelOf({ chan: "Direct", consignmentLink: "x" })).toBe("stockists");
    expect(channelOf({ chan: "Direct" })).toBe("other");
  });

  it("adds up the quarter's tax, sales, fees and checks from real orders and the stockroom", () => {
    const [q4] = taxPeriods(NOW);
    const orders = [
      order("a", "2026-10-05T15:00:00Z"),
      order("b", "2026-10-06T15:00:00Z", { taxLines: [{ name: "GST", cents: 500 }, { name: "PST BC", cents: 700 }], tax: 12, payoutId: null }),
      order("c", "2026-10-07T15:00:00Z", { tax: 0, taxLines: [] }),
      order("old", "2026-09-30T15:00:00Z"),
      order("test", "2026-10-08T15:00:00Z", { isTest: true }),
      order("r", "2026-10-09T15:00:00Z", { paymentStatus: "refunded", refund: { amount: 123, createdAt: "2026-10-10T15:00:00Z" } }),
    ];
    const states = { bk: { hist: [{ id: "s1", chan: "Book Fair" }, { id: "s2", chan: "Consignment" }, { id: "s3", chan: "Website" }] } };
    const ledgerRows = [
      { sourceType: "sale", sourceId: "bk", itemId: "s1", date: "2026-10-12", baseAmount: 20 },
      { sourceType: "sale", sourceId: "bk", itemId: "s2", date: "2026-10-13", baseAmount: 30 },
      { sourceType: "sale", sourceId: "bk", itemId: "s3", date: "2026-10-13", baseAmount: 100 },
      { sourceType: "sale", sourceId: "bk", itemId: "s1", date: "2026-10-14", baseAmount: 5, voided: true },
      { sourceType: "businessExpense", date: "2026-10-14", baseAmount: 40 },
    ];
    const m = taxPeriodModel({ orders, ledgerRows, states, period: q4, currency: "CAD" });
    expect(m.taxCents).toBe(1300 + 1200 + 0 + 1300);
    expect(m.salesCents).toBe(4 * 10000 + 2000 + 3000);
    expect(m.salesCount).toBe(6);
    expect(m.refunds).toBe(1);
    expect(m.refundsCents).toBe(12300);
    expect(m.feesCents).toBe(4 * 330);
    expect(m.unpaidOut).toBe(1);
    const byId = Object.fromEntries(m.rates.map((r) => [r.id, r]));
    expect(byId["tax:HST ON"]).toMatchObject({ taxCents: 2600, orders: 2, netCents: 20000 });
    expect(byId["tax:GST"]).toMatchObject({ taxCents: 500, netCents: 10000 });
    expect(byId["tax:PST BC"]).toMatchObject({ taxCents: 700, netCents: 0 });
    expect(byId.none).toMatchObject({ orders: 1, netCents: 10000, taxCents: 0 });
    expect(byId["chan:fairs"]).toMatchObject({ netCents: 2000, orders: 1, note: "No tax recorded" });
    expect(m.channels.map((c) => [c.id, c.taxCents])).toEqual([["website", 3800], ["fairs", null], ["stockists", null]]);
    expect(m.checks.map((c) => [c.id, c.done])).toEqual([["no-tax", false], ["refunds", false], ["payouts", false], ["in-person", false]]);
    expect(taxReportRows(m, q4, "CAD")[0]).toEqual(["Tax report", "Q4 2026", "2026-10-01 to 2026-12-31", "CAD"]);
  });

  it("says everything is done when it is, and never invents fees", () => {
    const [q4] = taxPeriods(NOW);
    const m = taxPeriodModel({ orders: [order("a", "2026-10-05T15:00:00Z", { fee: undefined })], ledgerRows: [], states: {}, period: q4, currency: "CAD" });
    expect(m.checks.every((c) => c.done)).toBe(true);
    expect(m.feesKnown).toBe(false);
    const none = taxPeriodModel({ orders: [], ledgerRows: [], states: {}, period: q4, currency: "CAD" });
    expect(none).toMatchObject({ taxCents: 0, salesCents: 0, salesCount: 0, rates: [] });
  });

  it("reads saved filings only when they are a map", () => {
    expect(filingsOf({ filings: { "2026-Q3": { filedAt: "x", taxCents: 5 } } })).toHaveProperty("2026-Q3");
    expect(filingsOf({ filings: [1] })).toEqual({});
    expect(filingsOf(null)).toEqual({});
  });
});
