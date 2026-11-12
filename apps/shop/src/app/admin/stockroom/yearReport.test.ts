// Year figures and the tax report file, against the old calculateFinancials / downloadTaxReport.
import { describe, expect, it } from "vitest";

import { yearFigures, yearReportCsv } from "./yearReport";

const input = {
  books: [{ id: "salt", title: "Salt Hours", productionCost: 500, maxPrint: 100 }],
  states: { salt: { hist: [{ date: "2026-02-01", qty: 3, price: 20, chan: "Fair", num: 7 }, { date: "2026-02-02", qty: 1, price: 20, voided: true }, { date: "2025-12-31", qty: 9, price: 20 }],
    expenses: [{ date: "2026-03-01", amount: 12, cat: "Printing & Production", desc: "Proofs" }] } },
  taxCenter: { businessExpenses: [{ date: "2026-04-01", amount: 30, receipt: "x" }, { date: "2026-04-02", amount: 10, currency: "USD", fxMissing: true }] },
  fxRateCache: {},
};

describe("profit for the year", () => {
  it("counts sales, cost of copies sold, expenses (waiting ones as 0) and profit", () => {
    const f = yearFigures(input, "2026");
    expect(f).toMatchObject({ revenue: 60, cogs: 15, opex: 42, shares: 0, profit: 3, fxWaitingCount: 1 });
    expect(f.missingReceiptsCount).toBe(2);
  });
  it("writes the old file's rows and the COGS summary", () => {
    const { text, waiting } = yearReportCsv(input, "2026");
    expect(text.split("\n")[0]).toBe("Date,Type,Book/Source,Category,Description,Receipt URL,Revenue,COGS,Expense,Artist Payout,Net");
    expect(text).toContain('"2026-02-01","Order","Salt Hours","Sale","Fair Order #7","","60.00","0","0","0","60.00"');
    expect(text).toContain("COGS Summary");
    expect(text).toContain("still waiting for an exchange rate");
    expect(waiting).toBe(1);
  });
});

describe("a title with no print run, and a title in another currency", () => {
  it("spreads the cost over copies sold plus copies left, so ten sales never carry it ten times", () => {
    const f = yearFigures({
      books: [{ id: "zine", title: "Zine", productionCost: 500, listPrice: 20, currency: "CA$" }],
      states: { zine: { stock: 40, hist: [{ date: "2026-02-01", qty: 10, price: 20 }] } }, taxCenter: null, fxRateCache: {},
    }, "2026");
    expect(f.bookStats[0]).toMatchObject({ units: 10, revenue: 200, unitCost: 10, cogs: 100, net: 100 });
  });
  it("converts another currency's sales and costs at the saved rate", () => {
    const f = yearFigures({
      books: [{ id: "us", title: "US", productionCost: 100, maxPrint: 100, currency: "US$" }],
      states: { us: { hist: [{ date: "2026-02-01", qty: 10, price: 10 }] } }, taxCenter: null, fxRateCache: { USD_CAD: 1.4 },
    }, "2026");
    expect(f.revenue).toBeCloseTo(140);
    expect(f.cogs).toBeCloseTo(14);
  });
});
