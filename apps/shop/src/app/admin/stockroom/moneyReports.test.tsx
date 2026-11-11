// @vitest-environment jsdom
// The money pages show the stockroom's own figures. These tests build sample records (a foreign-currency title, a voided
// sale, an author payout, a meals expense with its half limit, a trip, a standing cost) and check every number against
// the stockroom's rules called directly, plus hand-worked totals, plus that each page draws and fails the way the To-do does.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { computeCashFlowMetrics } from "@stockroom/cashflow.js";
import { expenseLedgerTotals } from "@stockroom/expense-totals.js";
import { buildTaxLedger } from "@stockroom/tax-ledger.js";

import { AskView } from "./AskPage";
import { ExpensesView } from "./ExpensesPage";
import { RecordsGate } from "./RecordsGate";
import { StockList } from "./StockPage";
import { TaxCenterView } from "./TaxCenterPage";
import { askModel, expensesModel, filterLedger, ledgerCsvFile, ledgerTotals, sourcesOf, taxCenterModel } from "./moneyReports";
import type { StockroomRecords } from "./stockroomData";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 10, 11);
const records: StockroomRecords = {
  books: [
    { id: "a", title: "Salt Hours", currency: "CA$", maxPrint: 200, threshold: 10 },
    { id: "b", title: "Night Songs", currency: "€", maxPrint: 100, threshold: 10 },
  ],
  states: {
    a: {
      hist: [
        { id: 1, date: "2026-03-04", num: "A1", qty: 2, price: 20, chan: "Direct", shippingPaid: 6 },
        { id: 2, date: "2025-11-02", num: "A0", qty: 1, price: 20, chan: "Website" },
        { id: 3, date: "2026-05-01", num: "V1", qty: 1, price: 20, chan: "Direct", voided: true, shippingPaid: 5 },
        { id: 4, date: "2026-06-12", num: "A2", qty: 4, price: 20, chan: "Book fair" },
      ],
      expenses: [
        { id: 11, date: "2026-02-10", desc: "Print run", cat: "Printing", amount: 300, currency: "CAD", baseAmount: 300, receipt: "cloud://r/p.pdf" },
        { id: 12, date: "2026-04-01", desc: "Freight", cat: "Shipping & Postage", amount: 64.5, currency: "CAD", baseAmount: 64.5 },
      ],
      artistPayouts: [{ id: 21, date: "2026-07-01", amount: 50 }],
    },
    b: {
      hist: [{ id: 5, date: "2026-03-09", num: "B1", qty: 3, price: 10, chan: "Direct" }],
      expenses: [{ id: 13, date: "2026-03-15", desc: "Cover design", cat: "Design", amount: 120, currency: "EUR" }],
    },
  },
  taxCenter: {
    settings: { baseCurrency: "CAD", rates: { EUR_CAD: 1.5 } },
    trips: [{ name: "Toronto Book Fair", startDate: "2026-06-11", endDate: "2026-06-13" }],
    businessExpenses: [
      { id: 31, date: "2026-06-11", desc: "Booth fee", cat: "Booths & Fairs", amount: 250, currency: "CAD", baseAmount: 250, trip: "Toronto Book Fair", receipt: "cloud://r/b.pdf" },
      { id: 32, date: "2026-06-12", desc: "Team lunch", cat: "Meals & Entertainment", amount: 80, currency: "CAD", baseAmount: 80, trip: "Toronto Book Fair" },
      { id: 33, date: "2026-08-02", desc: "Mailing supplies", cat: "Supplies", amount: 40, currency: "USD", baseAmount: 54 },
      { id: 34, date: "2025-09-09", desc: "Hosting", cat: "Software", amount: 20, currency: "CAD", baseAmount: 20 },
    ],
    recurring: [{ id: "r1", desc: "Hosting", amount: 20, currency: "CAD", frequency: "monthly", startDate: "2026-01-01", day: 1 }],
  },
};

describe("Tax centre figures are the stockroom's", () => {
  const sources = sourcesOf(records);
  const model = taxCenterModel(sources, "2026", NOW);

  it("totals 2026 the way the ledger does, hand-checked", () => {
    // In: 2x20 + 6 shipping = 46, 4x20 = 80, 3 EUR x10 at 1.5 = 45; the voided sale and its shipping count 0, 2025 is out.
    expect(model.summary.sales).toBe(171);
    // Out: 300 + 64.5 + 120 EUR x 1.5 = 180 on the items; 250 + 80 + 54 on the press. The author payout is not an expense.
    expect(model.summary.expenses).toBe(928.5);
    expect(model.summary.net).toBe(171 - 928.5);
    expect(model.summary.artistPayouts).toBe(50);
  });

  it("agrees with the stockroom's cash-flow maths called directly", () => {
    const direct = computeCashFlowMetrics(sources, "2026");
    expect(model.summary.sales).toBe(direct.grossSales);
    expect(model.summary.expenses).toBe(direct.operatingExpenses);
    expect(model.summary.txnCount).toBe(direct.txnCount);
    expect(model.summary.unitsSold).toBe(direct.unitsSold);
    expect(model.rows).toHaveLength(buildTaxLedger(sources, "2026").allLedger.length);
  });

  it("keeps a voided sale as a row worth nothing, and leaves other years out", () => {
    const voided = model.rows.find((r) => r.voided);
    expect(voided).toMatchObject({ isIncome: true, baseAmount: 0 });
    expect(model.rows.some((r) => r.date.startsWith("2025"))).toBe(false);
    expect(taxCenterModel(sources, "all", NOW).years).toEqual(["2026", "2025"]);
  });

  it("flags the euro sale as valued at a saved rate, not its own day's", () => {
    expect(model.notes.estimated).toBeGreaterThan(0);
    expect(model.notes.missing).toBe(0);
  });

  it("limits meals to half in the deductible column and shows the last year's change", () => {
    const meals = model.categories.list.find((c) => c.name === "Meals & Entertainment");
    expect(meals).toMatchObject({ spent: 80, total: 40, rate: 0.5 });
    expect(model.summary.prevYear).toBe("2025");
    expect(model.summary.deltas?.sales).toMatchObject({ kind: "pct", pct: 755, dir: "up" }); // 171 against the 20 sold in 2025
  });

  it("lists the trip with its dates and the standing cost with its next charge", () => {
    expect(model.trips[0]).toMatchObject({ name: "Toronto Book Fair", count: 2, total: 330, deductible: 290 });
    expect(model.recurring[0]).toMatchObject({ desc: "Hosting", status: "active", next: "2026-12-01" });
  });

  it("filters the ledger by type and words, and totals what is shown", () => {
    const sales = filterLedger(model.rows, { type: "sales", query: "" });
    expect(sales.every((r) => r.isIncome)).toBe(true);
    expect(ledgerTotals(sales).income).toBe(171);
    expect(filterLedger(model.rows, { type: "all", query: "booth" })).toHaveLength(1);
  });

  it("writes the spreadsheet with signed amounts and a name from the press's profile, never a press's own name", () => {
    const file = ledgerCsvFile(model.rows, "CAD", NOW);
    expect(file.name).toMatch(/^[A-Za-z0-9_]+_Tax_Ledger_2026-11-11\.csv$/);
    expect(file.name.toLowerCase()).not.toContain("lyrical");
    expect(file.text.charCodeAt(0)).toBe(0xfeff);
    expect(file.text).toContain("Booth fee");
    expect(file.text).toMatch(/"Booth fee".*"-250\.00"/);
  });
});

describe("Expenses", () => {
  it("lists every expense across the items and the press, with receipts and per-currency totals", () => {
    const m = expensesModel(records);
    expect(m.lines).toHaveLength(7);
    expect(m.lines.find((l) => l.desc === "Print run")?.receipt).toBe("attached");
    expect(m.lines.find((l) => l.desc === "Freight")?.receipt).toBe("missing");
    expect(m.missing).toBe(m.lines.filter((l) => l.receipt === "missing").length);
    const eur = m.totals.find((t) => t.code === "EUR");
    expect(eur?.total).toBe(120);
    // Currencies are never added together.
    expect(m.totals.find((t) => t.code === "CAD")?.total).toBe(300 + 64.5 + 250 + 80 + 20);
  });

  it("reports who is owed money back with the stockroom's own totals", () => {
    const direct = expenseLedgerTotals(records.states.b.expenses as any[], "EUR");
    expect(direct[0].outstanding).toBe(120);
    expect(expensesModel(records).owed.find((o) => o.itemId === "b")?.amount).toBe(120);
  });
});

describe("Ask about your sales", () => {
  const sources = sourcesOf(records);
  it("answers what sold, per currency and never added across them", () => {
    const data = askModel(sources, "sold", "2026", NOW);
    expect(data.totalsByCurrency.map((t: any) => [t.code, t.revenue])).toEqual(expect.arrayContaining([["CAD", 120], ["EUR", 30]]));
  });
  it("gives the ledger's totals in dollars", () => {
    const data = askModel(sources, "cash", "2026", NOW);
    expect(data.totals.incomeCAD).toBe(171);
    expect(data.yearTotals.operatingExpensesCAD).toBe(928.5);
    expect(data.totals.expensesCAD).toBe(928.5 + 50); // the ledger rows include the author payout
  });
  it("finds the fair and its costs", () => {
    const data = askModel(sources, "events", "2026", NOW);
    expect(data.rows[0]).toMatchObject({ name: "Toronto Book Fair", spendCAD: 330 });
  });
});

async function draw(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => {});
  return { container, root };
}

describe("the pages", () => {
  it("draw their figures", async () => {
    const tax = await draw(<TaxCenterView records={records} now={NOW} />);
    expect(tax.container.textContent).toContain("Money in");
    expect(tax.container.textContent).toContain("Booth fee");
    await act(async () => tax.root.unmount());
    const exp = await draw(<ExpensesView records={records} />);
    expect(exp.container.textContent).toContain("No receipt");
    await act(async () => exp.root.unmount());
    const ask = await draw(<AskView records={records} now={NOW} />);
    expect(ask.container.textContent).toContain("What did we sell?");
    await act(async () => ask.root.unmount());
  });

  it("show the whole Tax centre with zeros when there is nothing yet", async () => {
    const empty = await draw(<TaxCenterView records={{ books: [], states: {}, taxCenter: null }} />);
    const text = empty.container.textContent || "";
    for (const part of ["Money in", "Money out", "Net", "By year", "Where the money went", "Trips and events", "Standing costs", "Costs that may be missing", "Ledger"]) expect(text).toContain(part);
    expect(text).not.toContain("Nothing in the Tax centre yet");
    await act(async () => empty.root.unmount());
  });

  it("show the Expenses and Stock layout with zeros when there is nothing yet", async () => {
    const none: StockroomRecords = { books: [], states: {}, taxCenter: null };
    const exp = await draw(<ExpensesView records={none} />);
    expect(exp.container.textContent).toContain("0 expenses");
    expect(exp.container.textContent).toContain("No expenses logged yet");
    await act(async () => exp.root.unmount());
    const stock = await draw(<StockList records={none} onPick={() => {}} />);
    expect(stock.container.textContent).toContain("No books yet");
    await act(async () => stock.root.unmount());
  });

  it("treat a failed read as a failure, and a refusal as 'only the owner'", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await draw(<RecordsGate what="the Tax centre" load={async () => { throw new Error("network request failed"); }}>{() => null}</RecordsGate>);
    expect(failed.container.querySelector('[role="alert"]')?.textContent).toContain("didn't load");
    expect(failed.container.textContent).toContain("Try again");
    await act(async () => failed.root.unmount());
    const refused = await draw(<RecordsGate what="the Tax centre" load={async () => { throw Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" }); }}>{() => null}</RecordsGate>);
    expect(refused.container.textContent).toContain("Only the owner");
    expect(refused.container.textContent).not.toContain("Try again");
    await act(async () => refused.root.unmount());
    spy.mockRestore();
  });
});
