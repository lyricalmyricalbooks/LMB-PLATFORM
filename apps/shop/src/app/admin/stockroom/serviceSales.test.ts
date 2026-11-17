import { describe, expect, it } from "vitest";
import { serviceLedgerRows, serviceSales, serviceYear } from "./serviceSales";
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
    expect(serviceYear(sales, "2026", "CAD")).toEqual({ count: 4, kept: 200, tips: 9 });
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
});
