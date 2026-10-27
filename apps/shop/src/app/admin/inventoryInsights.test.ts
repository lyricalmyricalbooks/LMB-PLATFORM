import { describe, expect, it } from "vitest";
import {
  buildInventory, inventorySummary, inventoryToCsv, lowStockThreshold, parseCost, parseReceive, parseStock,
  planStockChange, statusOf, waitingReaders, wakesRestockEmails,
} from "./inventoryInsights";

const NOW = new Date("2026-09-29").getTime();
describe("inventoryInsights", () => {
  it("classifies status", () => {
    expect(statusOf(0, null, 5, "stock")).toBe("out");
    expect(statusOf(3, null, 5, "stock")).toBe("low");
    expect(statusOf(20, 10, 5, "stock")).toBe("reprint");
    expect(statusOf(20, null, 5, "stock")).toBe("ok");
    expect(statusOf(0, null, 5, true)).toBe("digital");
    expect(statusOf(0, null, 5, "untracked")).toBe("untracked");
  });
  it("builds rows with velocity and summary; drafts/archived flagged", () => {
    const books = [
      { id: "a", title: "A", stockLevel: 10, price: 10, status: "published", trackInventory: true },
      { id: "d", title: "D", status: "draft", trackInventory: true },
      { id: "e", title: "E", format: "E-book (PDF)", stockLevel: 99, price: 5 },
    ];
    const orders = [{ createdAt: "2026-09-20", items: [{ id: "a", quantity: 10 }] }];
    const rows = buildInventory(books, orders, 5, NOW);
    expect(rows.map((r) => r.id)).toEqual(["a", "d", "e"]);
    expect(rows[1].draft).toBe(true);
    expect(rows[0]).toMatchObject({ sold30: 10, status: "reprint", value: 100, editable: true });
    expect(rows[2]).toMatchObject({ status: "digital", editable: false });
    expect(inventorySummary(rows, { a: 4 })).toMatchObject({ units: 10, value: 100, costValue: 40, reprint: 1 });
    expect(inventoryToCsv(rows).split("\n")).toHaveLength(4);
  });
  it("one row per edition, with edition sales and stock", () => {
    const b = { id: "b", title: "B", trackInventory: true, stockLevel: 0, variants: [
      { id: "pb", name: "Paperback", stock: 4, price: 20 }, { id: "eb", name: "EPUB", format: "E-book (EPUB)" },
    ] };
    const rows = buildInventory([b], [{ createdAt: "2026-09-25", items: [{ id: "b", variantId: "pb", quantity: 2 }] }], 5, NOW);
    expect(rows.map((r) => [r.id, r.kind, r.stock, r.sold30])).toEqual([["b::pb", "stock", 4, 2], ["b::eb", "digital", 0, 0]]);
  });
  it("untracked, gift cards and box sets are not editable", () => {
    const part = { id: "p", trackInventory: true, stockLevel: 7 };
    const rows = buildInventory([
      part, { id: "u", stockLevel: 3 }, { id: "g", productType: "giftCard", variants: [{ id: "25" }] },
      { id: "s", trackInventory: true, bundleItems: [{ bookId: "p", quantity: 2 }] },
    ], [], 5, NOW);
    expect(rows.map((r) => [r.id, r.status, r.editable])).toEqual([
      ["p", "ok", true], ["u", "untracked", false], ["g", "giftCard", false], ["s", "bundle", false],
    ]);
    expect(rows[3].bundleSets).toBe(3);
  });
  it("parses manual stock, receiving and cost", () => {
    expect(parseStock("12")).toBe(12);
    expect(parseStock("-4")).toBe(0);
    expect(parseStock("")).toBeNull();
    expect(parseReceive("+12")).toEqual({ kind: "delta", delta: 12 });
    expect(parseReceive("-3")).toEqual({ kind: "delta", delta: -3 });
    expect(parseReceive("=40")).toMatchObject({ kind: "set", to: 40 });
    expect(parseReceive("0")).toBeNull();
    expect(parseCost("")).toBeNull();
    expect(parseCost("4.567")).toBe(4.57);
    expect(parseCost("-1")).toBeUndefined();
  });
  it("low-stock threshold from settings", () => {
    expect(lowStockThreshold({})).toBe(5);
    expect(lowStockThreshold({ inventory: { lowStockThreshold: 2 } })).toBe(2);
    expect(lowStockThreshold({ inventory: { lowStockThreshold: -1 } })).toBe(5);
  });
});

describe("planStockChange (a sale made meanwhile is never undone)", () => {
  const live = { trackInventory: true, stockLevel: 4, title: "T", variants: [{ id: "v", stock: 2, name: "HB" }, { id: "w", stockLevel: 9 }] };
  it("delta applies to the live count", () => {
    // Page loaded at 5, a sale took it to 4: + adds to 4, not to 5.
    expect(planStockChange(live, null, { kind: "delta", delta: 1 })).toEqual({ ok: true, from: 4, to: 5, patch: { stockLevel: 5 } });
    expect(planStockChange(live, null, { kind: "delta", delta: -10 })).toMatchObject({ ok: true, to: 0 });
  });
  it("a typed count conflicts when live stock moved, unless forced", () => {
    expect(planStockChange(live, null, { kind: "set", to: 10, expected: 5 })).toEqual({ ok: false, reason: "conflict", live: 4 });
    expect(planStockChange(live, null, { kind: "set", to: 10, expected: 5 }, { force: true })).toMatchObject({ ok: true, from: 4, to: 10 });
    expect(planStockChange(live, null, { kind: "set", to: 10, expected: 4 })).toMatchObject({ ok: true, to: 10 });
  });
  it("edition changes touch only that edition and never the title", () => {
    const p: any = planStockChange(live, "v", { kind: "delta", delta: 3 });
    expect(p.patch.variants[0]).toMatchObject({ stock: 5, stockLevel: 5, name: "HB" });
    expect(p.patch.variants[1]).toBe(live.variants[1]);
    expect(Object.keys(p.patch)).toEqual(["variants"]);
    expect(planStockChange(live, "gone", { kind: "delta", delta: 1 })).toMatchObject({ ok: false, reason: "missing" });
    expect(planStockChange({ stockLevel: 1 }, null, { kind: "delta", delta: 1 })).toMatchObject({ ok: false, reason: "not-counted" });
  });
  it("back-in-stock readers", () => {
    expect(wakesRestockEmails({ status: "published" }, 0, 3)).toBe(true);
    expect(wakesRestockEmails({ status: "draft" }, 0, 3)).toBe(false);
    expect(wakesRestockEmails({}, 1, 3)).toBe(false);
    const alerts = [{ email: "a@x.com", status: "waiting", variantId: "" }, { email: "A@x.com", status: "waiting" },
      { email: "b@x.com", status: "notified" }, { email: "c@x.com", status: "waiting", variantId: "v" }];
    expect(waitingReaders(alerts, null)).toBe(1);
    expect(waitingReaders(alerts, "v")).toBe(1);
  });
});
