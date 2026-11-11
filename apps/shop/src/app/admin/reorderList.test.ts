import { describe, expect, it } from "vitest";
import { buildReorder, lastMonth, plan, reorderCsv } from "./reorderList";

const NOW = new Date(2026, 10, 11, 12).getTime();
const day = (ago: number) => { const d = new Date(NOW - ago * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

describe("reorder list", () => {
  it("lists only what is low or running out soon, most urgent first", () => {
    const rows = buildReorder({
      now: NOW, shopThreshold: 5, shopBooks: [], paidOrders: [],
      stockroom: {
        taxCenter: null,
        books: [
          { id: "a", title: "Plenty", threshold: 5 },
          { id: "b", title: "Low", threshold: 10 },
          { id: "c", title: "Fast", threshold: 2 },
          { id: "d", title: "Gone", threshold: 3 },
        ],
        states: {
          a: { stock: 500, hist: [{ qty: 1, date: day(3) }] },
          b: { stock: 8, hist: [] },
          c: { stock: 20, hist: [{ qty: 30, date: day(5) }, { qty: 99, date: day(5), voided: true }] },
          d: { stock: 0, hist: [] },
        },
      },
    });
    expect(rows.map((r) => r.title)).toEqual(["Gone", "Fast", "Low"]);
    const fast = rows[1];
    expect(fast.sold30).toBe(30);
    expect(fast.weeksLeft).toBeCloseTo(20 / 7, 5);
    expect(fast.suggested).toBe(Math.ceil(84) + 2 - 20);
  });

  it("counts last month by the calendar and stockists' sales", () => {
    const m = lastMonth(NOW);
    expect(m.days).toBe(31);
    const rows = buildReorder({ now: NOW, shopThreshold: 5, shopBooks: [], paidOrders: [], stockroom: { taxCenter: null, books: [{ id: "x", title: "X", threshold: 5 }], states: { x: { stock: 3, hist: [{ qty: 4, date: "2026-10-02" }], ledger: [{ type: "Sale", qty: 2, date: "2026-10-20" }, { type: "Shipment", qty: 9, date: "2026-10-20" }] } } } });
    expect(rows[0].soldLastMonth).toBe(6);
  });

  it("uses website stock for products the stockroom doesn't keep", () => {
    const rows = buildReorder({
      now: NOW, shopThreshold: 5, stockroom: null,
      shopBooks: [{ id: "mug", title: "Mug", trackInventory: true, stockLevel: 2 }, { id: "hat", title: "Hat", trackInventory: true, stockLevel: 50 }],
      paidOrders: [{ createdAt: new Date(NOW - 2 * 86_400_000).toISOString(), items: [{ id: "mug", quantity: 3 }] }],
    });
    expect(rows.map((r) => [r.title, r.source, r.onHand, r.sold30])).toEqual([["Mug", "website", 2, 3]]);
  });

  it("suggests nothing below zero and a starter amount with no sales", () => {
    expect(plan(100, 5, 0, 0, 30)).toBeNull();
    expect(plan(3, 5, 0, 0, 30)).toEqual({ weeksLeft: null, suggested: 7 });
  });

  it("downloads safe cells", () => {
    const csv = reorderCsv([{ key: "k", title: "=SUM(1)", source: "website", onHand: 1, threshold: 5, sold30: 0, soldLastMonth: 0, weeksLeft: null, suggested: 9 }]);
    expect(csv.split("\n")[1].startsWith("'=SUM(1)")).toBe(true);
  });
});
