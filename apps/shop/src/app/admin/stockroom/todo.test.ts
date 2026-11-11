import { describe, expect, it } from "vitest";

import { catalogBooks, loadStockroom, stockroomPlace, type StockroomReads } from "./stockroomData";
import { buildTodo, fixPage, readDismissed, TODO_DISMISSED_KEY } from "./todo";

const book = (id: string, extra: object = {}) => ({ id, title: id, maxPrint: 100, threshold: 10, ...extra });
const reads = (over: Partial<StockroomReads>): StockroomReads => ({
  setting: async () => null, oldSetting: async () => null, flags: async () => ({}), bookParts: async () => ({}), oldBook: async () => null, ...over,
});

describe("the stockroom's records, read by the admin", () => {
  it("uses the stockroom's own database when the profile names one, else the project's", () => {
    expect(stockroomPlace({ stockroom: { firestoreDatabase: "stockroom" } }, "demo-shop")).toEqual({ firestoreDatabase: "stockroom", databaseURL: "https://demo-shop-default-rtdb.firebaseio.com" });
    expect(stockroomPlace(undefined, "demo-shop").firestoreDatabase).toBeUndefined();
  });

  it("lists the catalogue without its bookkeeping keys or test items", () => {
    const list = catalogBooks({ a: { title: "A" }, test: { title: "Test" }, _deletedDefaults: ["x"], _posExtra: {} });
    expect(list).toEqual([{ id: "a", title: "A" }]);
  });

  it("reads each item from the store its flag names, and falls back to the other when that one is empty", async () => {
    const records = await loadStockroom(reads({
      flags: async () => ({ fs_mode_global: true, fs_mode_a: true }),
      setting: async (key) => (key === "catalog" ? JSON.stringify({ a: book("a"), b: book("b") }) : null),
      bookParts: async (id) => (id === "a" ? { metadata: JSON.stringify({ stock: 7 }), hist: JSON.stringify([{ id: 1 }]) } : {}),
      oldBook: async (id) => (id === "b" ? JSON.stringify({ stock: 3 }) : null),
    }));
    expect(records.books.map((b) => b.id)).toEqual(["a", "b"]);
    expect(records.states.a).toMatchObject({ stock: 7, hist: [{ id: 1 }] });
    expect(records.states.b).toMatchObject({ stock: 3 });
  });

  it("reads the older store first for a shop that never moved, and survives it being closed", async () => {
    const records = await loadStockroom(reads({
      oldSetting: async () => { throw new Error("permission denied"); },
      setting: async (key) => (key === "catalog" ? JSON.stringify({ a: book("a") }) : null),
      oldBook: async () => { throw new Error("permission denied"); },
    }));
    expect(records.books).toHaveLength(1);
    expect(records.states).toEqual({});
  });
});

describe("the to-do list", () => {
  const records = { books: [book("low"), book("fine")], states: { low: { stock: 4 }, fine: { stock: 80 } }, taxCenter: null };

  it("flags an item at or below its reorder level, and not one with plenty", () => {
    const ids = buildTodo(records).signals.map((s) => s.id);
    expect(ids).toContain("stock-low:low");
    expect(ids).not.toContain("stock-low:fine");
  });

  it("never asks a shop here to connect a spreadsheet script or retry a sync", () => {
    expect(buildTodo(records).signals.filter((s) => /^setup-(sheets|sync)/.test(s.id))).toEqual([]);
  });

  it("starts an item with no records as fully in stock", () => {
    expect(buildTodo({ books: [book("new")], states: {}, taxCenter: null }).signals.map((s) => s.id)).not.toContain("stock-low:new");
  });

  it("leaves out what the owner dismissed and counts it", () => {
    const all = buildTodo(records);
    const less = buildTodo(records, { dismissed: { "stock-low:low": true } });
    expect(less.total).toBe(all.total - 1);
    expect(less.hidden).toBe(1);
    expect(less.byGroup.stock.map((s) => s.id)).not.toContain("stock-low:low");
  });

  it("opens the page where an item gets fixed", () => {
    const isPage = (id: string) => ["dashboard", "taxcenter", "consignment"].includes(id);
    const at = (fix: any) => fixPage({ id: "x", group: "stock", status: "info", label: "", detail: "", fix }, isPage);
    expect(at({ kind: "book", bookId: "a", tab: "" })).toBe("dashboard");
    expect(at({ kind: "book", bookId: "a", tab: "consignment" })).toBe("consignment");
    expect(at({ kind: "taxcenter", tab: "" })).toBe("taxcenter");
    expect(at({ kind: "tab", tab: "nowhere" })).toBeNull();
    expect(at({ kind: "retry-sync" })).toBeNull();
  });

  it("reads dismissals from the stockroom's own key, and nothing from a broken one", () => {
    expect(readDismissed({ getItem: (key) => (key === TODO_DISMISSED_KEY ? '{"a":true}' : null) })).toEqual({ a: true });
    expect(readDismissed({ getItem: () => "{" })).toEqual({});
  });
});
