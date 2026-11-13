// Bookkeeping › Reports: the balance sheet, the 90-day forecast and the tax pack, hand-checked on one small shop.
import { describe, expect, it } from "vitest";

import { balanceSheet, balanceSheetCsv, cashForecast, packReceipts, quartersOf, taxPackFiles, unfiledSalesTax } from "./moneyStatements";
import { bookkeeperReports, readBookkeeperReports } from "./bookkeeperReports";
import { bookkeeperPack } from "./BookkeeperReportsCard";
import { sourcesOf, taxCenterModel } from "./moneyReports";
import type { StockroomRecords } from "./stockroomData";

const CLOUD = "https://firebasestorage.googleapis.com/v0/b/x/o/r1.jpg?alt=media";
const records: StockroomRecords = {
  books: [{ id: "salt", title: "Salt Hours", productionCost: 500, maxPrint: 100, listPrice: 20, currency: "CA$" }],
  states: {
    salt: {
      stock: 50,
      hist: [{ id: 1, date: "2026-10-02", qty: 2, price: 20, chan: "Book Fair", num: 1 }],
      expenses: [{ id: 2, date: "2026-09-01", amount: 100, cat: "Printing & Production", desc: "Proofs" }],
      invoices: [{ id: "i1", num: "INV-1", status: "sent", date: "2026-10-20", dueDate: "2026-11-30", total: 60, currency: "CA$", storeName: "Corner Books" }],
    },
  },
  taxCenter: {
    settings: { baseCurrency: "CAD" },
    businessExpenses: [
      { id: 10, date: "2026-10-05", desc: "Ink", cat: "Supplies", amount: 30, currency: "CAD", receipt: CLOUD },
      { id: 11, date: "2026-10-06", desc: "Tape", cat: "Supplies", amount: 10, currency: "CAD", receipt: "local://Salt/tape.jpg" },
    ],
    recurring: [{ id: "r1", desc: "Hosting", amount: 20, currency: "CAD", frequency: "monthly", startDate: "2026-01-01", day: 1, lastInjected: "2026-11" }],
    pendingExpenses: [{ id: 1, desc: "Fair table", estAmount: 50, currency: "CAD", expectedDate: "2026-12-05" }],
  },
};
const order = { id: "w1", createdAt: "2026-10-05T15:00:00Z", paidAt: "2026-10-05T15:00:00Z", paymentStatus: "paid", subtotal: 100, discount: 0, shipping: 0, total: 113, tax: 13, taxLines: [{ name: "HST ON", cents: 1300 }] };
const input = () => ({ records, sources: sourcesOf(records), orders: [order], today: "2026-11-13" });

describe("balance sheet", () => {
  it("adds up what the shop owns and owes today", () => {
    const s = balanceSheet(input(), "2026-11-13");
    const line = (id: string) => [...s.assets, ...s.liabilities].find((l) => l.id === id)?.amount;
    // Money in 40, out 100 + 30 + 10: -100. Less the 60 still owed on the invoice, plus 13 of sales tax held.
    expect(line("cash")).toBe(-147);
    expect(line("owed")).toBe(60);
    // 50 unsold copies at 500 / 100 each.
    expect(line("stock")).toBe(250);
    expect(line("tax")).toBe(13);
    expect(line("shares")).toBeUndefined();
    expect(s.totalAssets).toBe(163);
    expect(s.equity).toBe(150);
    expect(s.notes).toEqual([]);
  });

  it("looks back to an earlier day, and says stock is today's count", () => {
    const s = balanceSheet(input(), "2026-09-30");
    expect(s.assets.find((l) => l.id === "cash")?.amount).toBe(-100);
    expect(s.assets.find((l) => l.id === "owed")?.amount).toBe(0);
    expect(s.liabilities.find((l) => l.id === "tax")?.amount).toBe(0);
    expect(s.notes[0]).toMatch(/today's figures/);
  });

  it("stops counting sales tax once the quarter is marked filed", () => {
    const filed = { ...records, taxCenter: { ...records.taxCenter, filings: { "2026-Q4": { filedAt: "2026-11-01", taxCents: 1300 } } } };
    const s = balanceSheet({ ...input(), records: filed, sources: sourcesOf(filed) }, "2026-11-13");
    expect(s.liabilities.find((l) => l.id === "tax")?.amount).toBe(0);
    // A filing marked after the day still counts as owed on that day.
    expect(balanceSheet({ ...input(), records: filed, sources: sourcesOf(filed) }, "2026-10-31").liabilities[0].amount).toBe(13);
  });

  it("leaves website tax out and says so when the orders didn't load", () => {
    const s = balanceSheet({ ...input(), orders: null }, "2026-11-13");
    expect(s.liabilities[0].amount).toBe(0);
    expect(s.notes.join(" ")).toMatch(/Website orders didn't load/);
  });

  it("writes a spreadsheet with both sides and the share of the business", () => {
    const text = balanceSheetCsv(balanceSheet(input(), "2026-11-13"), "Moth Press");
    expect(text).toContain("Moth Press balance sheet");
    expect(text).toContain("Total owned");
    expect(text).toContain("\"150.00\"");
  });
});

describe("unfiled sales tax", () => {
  it("lists every quarter of the year, Q1 first", () => {
    expect(quartersOf(2026).map((q) => q.id)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    const sources = sourcesOf(records);
    const owing = unfiledSalesTax({ orders: [order], ledgerRows: taxCenterModel(sources, "all").rows, states: sources.states, taxCenter: records.taxCenter, currency: "CAD", asOf: "2026-11-13", firstYear: 2025 });
    expect(owing.map((t) => [t.period.id, t.taxCents, t.due])).toEqual([["2026-Q4", 1300, "2027-01-31"]]);
  });
});

describe("cash flow forecast", () => {
  const f = cashForecast(input());
  it("covers 90 days in 13 weeks from today's cash", () => {
    expect(f.start).toBe("2026-11-13");
    expect(f.end).toBe("2027-02-10");
    expect(f.weeks).toHaveLength(13);
    expect(f.startCash).toBe(-147);
  });
  it("puts the invoice, the recurring cost, the expected cost and the sales tax on their days", () => {
    const dated = f.items.filter((it) => it.source !== "sales").map((it) => [it.date, it.kind, it.amount, it.source]);
    expect(dated).toEqual([
      ["2026-11-30", "in", 60, "invoice"],
      ["2026-12-01", "out", 20, "recurring"],
      ["2026-12-05", "out", 50, "pending"],
      ["2027-01-01", "out", 20, "recurring"],
      ["2027-01-31", "out", 13, "tax"],
      ["2027-02-01", "out", 20, "recurring"],
    ]);
  });
  it("adds the usual week of sales from the last 90 days and ends where the weeks add up", () => {
    expect(f.weeklySales).toBeCloseTo((40 / 90) * 7, 2);
    // -147 + 60 in - 123 out + about 40 of usual sales.
    expect(f.endCash).toBeCloseTo(-170, 0);
    expect(f.lowest.balance).toBeLessThan(-147);
  });
  it("moves a late invoice to today", () => {
    const late = cashForecast({ ...input(), today: "2026-12-10" });
    expect(late.items.find((it) => it.source === "invoice")).toMatchObject({ date: "2026-12-10", late: true });
  });
});

describe("supplier bills and repeating invoices", () => {
  const withBills: StockroomRecords = {
    ...records,
    states: { salt: { ...records.states.salt, recurringInvoices: [{ id: "rp1", storeName: "Corner Books", every: "month", nextDate: "2026-12-01", total: 40, currency: "CA$", dueDays: 14, status: "active" }] } },
    taxCenter: {
      ...records.taxCenter,
      bills: [
        { id: "b1", supplier: "Ink Co", amount: 80, currency: "CAD", billDate: "2026-11-01", dueDate: "2026-11-20", ref: "B-7", status: "open" },
        { id: "b2", supplier: "Paper Mill", amount: 25, currency: "CAD", billDate: "2026-10-01", dueDate: "2026-10-15", status: "paid", paidDate: "2026-10-15" },
      ],
    },
  };
  const billInput = () => ({ ...input(), records: withBills, sources: sourcesOf(withBills) });

  it("owes the unpaid bills on the balance sheet, and a paid one only before it was paid", () => {
    const line = (asOf: string) => balanceSheet(billInput(), asOf).liabilities.find((l) => l.id === "bills");
    expect(line("2026-11-13")).toMatchObject({ amount: 80, note: "1 unpaid bill" });
    expect(line("2026-10-10")).toMatchObject({ amount: 25 });
    // No bills on file: no line at all.
    expect(balanceSheet(input(), "2026-11-13").liabilities.find((l) => l.id === "bills")).toBeUndefined();
  });

  it("puts the bill and each repeating invoice on their days in the forecast", () => {
    const f = cashForecast(billInput());
    const dated = f.items.filter((it) => it.source === "bill" || it.source === "repeat").map((it) => [it.date, it.kind, it.amount, it.source]);
    expect(dated).toEqual([
      ["2026-11-20", "out", 80, "bill"],
      ["2026-12-15", "in", 40, "repeat"],
      ["2027-01-15", "in", 40, "repeat"],
    ]);
    // February's invoice is made on the 1st but due on the 15th, after the 90 days end (2027-02-10).
    expect(f.items.find((it) => it.source === "bill")?.label).toBe("Bill B-7 to Ink Co");
    // The accountant's copy keeps no customer names, repeating invoices included.
    expect(JSON.stringify(bookkeeperReports(billInput(), "Moth Press").forecast.items)).not.toContain("Corner Books");
  });
});

describe("tax pack", () => {
  it("names every file so an accountant can follow it, with the receipts listed", () => {
    const { files, receipts } = taxPackFiles({ ...input(), pressName: "Moth Press", year: "2026", yearReport: { text: "YR" }, taxSeason: { text: "TS" }, ledger: { text: "LG" } });
    expect(files.map((f) => f.path)).toEqual([
      "00 Read me.txt", "01 Profit and loss 2026.csv", "02 Balance sheet 2026-11-13.csv", "03 General ledger 2026.csv", "04 Sales tax 2026.csv",
      "05 Expenses by category 2026.csv", "06 Year report 2026.csv", "07 Tax season file 2026.csv", "08 Receipts list 2026.csv",
    ]);
    expect(receipts).toEqual([{ url: CLOUD, path: "receipts/2026-10-05 Ink 30.00.jpg", date: "2026-10-05", desc: "Ink", amount: 30 }]);
    const list = files.find((f) => f.path.startsWith("08"))!.text;
    expect(list).toContain("receipts/2026-10-05 Ink 30.00.jpg");
    expect(list).toContain("In your own folder: Salt/tape.jpg");
    expect(files.find((f) => f.path.startsWith("04"))!.text).toContain("Q4 2026");
    expect(files.find((f) => f.path.startsWith("01"))!.text).toContain("Net profit");
  });
  it("uses the year end for a past year and keeps two receipts with one name apart", () => {
    const rows = [
      { date: "2025-03-01", desc: "Ink", baseAmount: 5, isIncome: false, receiptFiles: [CLOUD, CLOUD.replace("r1", "r2")] },
      { date: "2025-03-01", desc: "Ink", baseAmount: 5, isIncome: false, receipt: CLOUD.replace("r1", "r3") },
    ];
    expect(packReceipts(rows, "2025").files.map((f) => f.path)).toEqual([
      "receipts/2025-03-01 Ink 5.00 (1).jpg", "receipts/2025-03-01 Ink 5.00 (2).jpg", "receipts/2025-03-01 Ink 5.00.jpg",
    ]);
    const { files } = taxPackFiles({ ...input(), pressName: "P", year: "2025", yearReport: { text: "" }, taxSeason: { text: "" }, ledger: { text: "" } });
    expect(files[2].path).toBe("02 Balance sheet 2025-12-31.csv");
  });
});

describe("the bookkeeper's copy", () => {
  it("holds the reports without who was billed, and reads back", () => {
    const copy = bookkeeperReports(input(), "Moth Press");
    expect(copy.day).toBe("2026-11-13");
    expect(copy.pl.map((p) => p.year)).toEqual(["2026", "2025"]);
    expect(copy.yearEnd?.asOf).toBe("2025-12-31");
    expect(JSON.stringify(copy)).not.toContain("Corner Books");
    expect(readBookkeeperReports(JSON.stringify(copy))?.balance.equity).toBe(150);
    expect(readBookkeeperReports({ day: "x" })).toBeNull();
    expect(bookkeeperPack(copy).map(([p]) => p)).toEqual([
      "00 Read me.txt", "01 Profit and loss 2026.csv", "02 Profit and loss 2025.csv", "03 Balance sheet 2026-11-13.csv",
      "04 Balance sheet 2025-12-31.csv", "05 Cash flow forecast 2026-11-13.csv",
    ]);
  });
});
