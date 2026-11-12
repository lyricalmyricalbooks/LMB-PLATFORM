// Year-end stock value and write-offs, checked against the old stockroom's inventory valuation figures.
import { describe, expect, it } from "vitest";

import { adjustmentPreview, buildAdjustment, priorWriteDown, stockValue, stockValueCsv, withAdjustment, withDisposal } from "./stockValue";

const books = [
  { id: "salt", title: "Salt Hours", currency: "CAD", listPrice: 25, productionCost: 500, maxPrint: 100 },
  { id: "ferry", title: "Night Ferry", currency: "EUR", listPrice: 20, productionCost: 1200, maxPrint: 300 },
];
const states = {
  salt: { stock: 40, hist: [{ qty: 10 }, { qty: 2, voided: true }], stores: [{ name: "Bookshop", qty: 10, sold: 4 }] },
  ferry: { stock: 100, hist: [] },
};

describe("stock value", () => {
  const { items, totals } = stockValue(books, states, { EUR_CAD: 1.5 });
  it("counts copies at home and with stores, and lifetime sales", () => {
    expect(items[0]).toMatchObject({ stockOnHand: 40, stockConsigned: 6, totalUnsold: 46, totalSold: 14, compsDamaged: 40 });
  });
  it("shares a whole print run's cost over the run, and converts to dollars", () => {
    expect(items[1].unitCost).toBe(4); // the cost typed is the whole run's
    expect(items[1].totalCostCAD).toBe(600);
    expect(items[1].totalRetailCAD).toBe(3000);
    expect(items[0].totalCostCAD).toBe(230);
    expect(totals.totalAssetValueCostCAD).toBe(830);
    expect(totals.weightedAvgMarginPct).toBeCloseTo((80 * 46 + 80 * 100) / 146, 6);
  });
  it("the spreadsheet carries the old columns and totals", () => {
    const csv = stockValueCsv(books, states, { EUR_CAD: 1.5 }, [], "Pine Press", "2026-11-11");
    expect(csv.split("\n")[0]).toBe("Pine Press Book Inventory Valuation Report");
    expect(csv).toContain('"salt","Salt Hours","—","Paperback",100,40,6,46,14,"CAD",5.00,25.00,20.00,80.0%,1.0000,200.00,30.00,230.00,1150.00,920.00');
    expect(csv).toContain("TOTALS,");
  });
});

describe("write-downs and disposals", () => {
  const item = stockValue(books, states, { EUR_CAD: 1.5 }).items[1];
  const form = { bookId: "ferry", qty: "10", nrv: "1", date: "2026-12-31", reason: "Obsolete", evidence: "Remainder quote", notes: "" };
  const earlier = [{ id: "a", date: "2025-12-31", inventoryAdjustment: { type: "section10", bookId: "ferry", closingWriteDownCAD: 20 } }];

  it("this year's valuation is measured against last year's write-down", () => {
    expect(priorWriteDown(earlier, "ferry", "2026-12-31")).toBe(20);
    expect(adjustmentPreview(item, "valuation", form, earlier)).toBe(25); // 10 × (4 − 1) × 1.5 = 45, less 20
    const built = buildAdjustment(item, "valuation", form, earlier, "iva_1");
    expect("record" in built && built.record).toMatchObject({ amount: 25, cat: "Inventory Valuation Adjustment", nonCash: true });
  });
  it("a valuation replaces the same year's, a disposal is checked against the press's own copies", () => {
    const sameYear = [{ id: "b", date: "2026-06-30", inventoryAdjustment: { type: "section10", bookId: "ferry" } }];
    const built = buildAdjustment(item, "valuation", form, [], "iva_2") as { record: Record<string, any> };
    expect(withAdjustment({ businessExpenses: sameYear }, built.record, "valuation").businessExpenses.map((e: { id: string }) => e.id)).toEqual(["iva_2"]);
    expect(buildAdjustment(item, "disposal", { ...form, qty: "500" }, [], "x")).toEqual({ error: `Quantity must be between 1 and ${item.publisherStockOnHand}.` });
    expect(buildAdjustment(item, "valuation", { ...form, evidence: "" }, [], "x")).toEqual({ error: "Evidence is required" });
  });
  it("a disposal writes the copies off the book once", () => {
    const built = buildAdjustment(item, "disposal", form, [], "iva_3") as { record: Record<string, any> };
    const next = withDisposal(states.ferry, books[1], built.record, form);
    expect(next.ledger[0]).toMatchObject({ id: "iva_3", type: "Inventory Disposal", qty: 10, status: "written off" });
    expect(withDisposal(next, books[1], built.record, form)).toBe(next);
  });
});

describe("a book with no records yet", () => {
  it("counts its whole print run on hand, as the old app does", async () => {
    const { stockValue } = await import("./stockValue");
    const { items } = stockValue([{ id: "new", title: "New", maxPrint: 200, listPrice: 20, productionCost: 1000, currency: "CAD" }], {}, {});
    expect(items[0]).toMatchObject({ stockOnHand: 200, totalUnsold: 200, unitCost: 5, totalCostCAD: 1000 });
  });
});

describe("the production cost is always the whole run's", () => {
  it("a small run's cost is shared over the run too, never read as a cost per copy", () => {
    const { items } = stockValue([{ id: "zine", title: "Zine", maxPrint: 100, listPrice: 20, productionCost: 30, currency: "CAD" }], {}, {});
    expect(items[0].unitCost).toBeCloseTo(0.3);
    expect(items[0].totalCostCAD).toBeCloseTo(30);
  });
});
