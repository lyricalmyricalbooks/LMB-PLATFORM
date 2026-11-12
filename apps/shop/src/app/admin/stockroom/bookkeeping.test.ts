// Tax centre + Bookkeeping (mockup, 12 November 2026): the year switcher's years, a year's period pills, the Receipts
// figures and the Artist payouts rows.
import { describe, expect, it } from "vitest";
import { moneyYears } from "./YearSwitch";
import { yearPeriods } from "./taxPeriods";
import { receiptsModel } from "./ReceiptsGrid";
import { artistRows } from "./ArtistPayouts";
import type { ExpenseLine } from "./moneyReports";
import { stockroomPage } from "../combined";

const NOW = Date.parse("2026-11-12T15:00:00Z");

describe("the money year", () => {
  it("offers the earliest year with a record (at least last year) to this one", () => {
    expect(moneyYears([], new Date(NOW))).toEqual(["2025", "2026"]);
    expect(moneyYears(["2023-04-01", "2026-01-02", "", null, "junk"], new Date(NOW))).toEqual(["2023", "2024", "2025", "2026"]);
  });

  it("gives this year the open quarter and year to date, a past year its quarters and the whole year", () => {
    expect(yearPeriods("2026", NOW).map((p) => p.id)).toEqual(["2026-Q4", "2026-Q3", "2026-Q2", "2026-ytd"]);
    const past = yearPeriods("2025", NOW);
    expect(past.map((p) => p.id)).toEqual(["2025-Q4", "2025-Q3", "2025-Q2", "2025-Q1", "2025-year"]);
    expect(past.every((p) => !p.open)).toBe(true);
    expect(past[4]).toMatchObject({ start: "2025-01-01", end: "2025-12-31", quarter: false });
  });
});

const line = (over: Partial<ExpenseLine>): ExpenseLine => ({
  key: String(Math.random()), scope: "business", itemId: "", itemTitle: "", id: 1, date: "2026-03-01", desc: "x", cat: "Supplies", ref: "",
  amount: 10, currency: "CAD", baseAmount: 10, receipt: "missing", receiptCount: 0, status: "", ...over,
});

describe("Bookkeeping › Receipts", () => {
  it("counts the year's receipts and filters the cards", () => {
    const m = receiptsModel([
      line({ key: "a", receipt: "attached", receiptCount: 1, baseAmount: 300 }),
      line({ key: "b", baseAmount: 64.5 }),
      line({ key: "c", receipt: "exempt", baseAmount: 900 }),
      line({ key: "d", date: "2025-12-31", baseAmount: 99 }),
      line({ key: "e", baseAmount: null, amount: 20 }),
    ], "2026");
    expect(m).toMatchObject({ filedCount: 1, countedCount: 3, needsCount: 2, needsWorth: 84.5 });
    expect(m.pick("needs").map((l) => l.key)).toEqual(["b", "e"]);
    expect(m.pick("filed").map((l) => l.key)).toEqual(["a"]);
    expect(m.pick("over").map((l) => l.key)).toEqual(["a", "b", "c"]);
    expect(m.pick("all")).toHaveLength(4);
  });
});

describe("Bookkeeping › Artist payouts", () => {
  it("lists each book with an artist share, what is owed and the split", () => {
    const rows = artistRows({
      books: [
        { id: "b1", title: "Moths", author: "Ada", currency: "CAD", productionCost: 0, profitTiers: [{ revenueUpTo: null, artistPct: 50 }] },
        { id: "b2", title: "No share" },
      ],
      states: { b1: { hist: [{ num: 1, date: "2026-10-01", qty: 2, price: 20 }, { num: 2, date: "2026-10-02", qty: 1, price: 20, artistPending: true }], revenue: 40, artistPayouts: [] } },
      taxCenter: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ artist: "Ada", title: "Moths", sold: 1, split: "50 / 50", direction: "to-artist", owed: 10, lastSettled: "" });
  });
});

describe("pages that moved", () => {
  it("opens the new page for an old Tax centre address", () => {
    expect(stockroomPage("taxsales")?.id).toBe("taxcenter");
    expect(stockroomPage("taxledger")?.id).toBe("reconcile");
    expect(stockroomPage("taxcosts")?.id).toBe("expenses");
    expect(stockroomPage("taxyear")?.id).toBe("books");
    expect(stockroomPage("payouts")?.id).toBe("payouts");
  });
});
