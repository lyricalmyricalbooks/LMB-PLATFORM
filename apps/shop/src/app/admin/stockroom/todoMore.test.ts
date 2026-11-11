import { describe, expect, it } from "vitest";

import { loadStockroom, type StockroomReads } from "./stockroomData";
import { buildTodo, fixTarget } from "./todo";

const book = (id: string, extra: object = {}) => ({ id, title: `Title ${id}`, maxPrint: 100, threshold: 10, ...extra });
const reads = (over: Partial<StockroomReads>): StockroomReads => ({
  setting: async () => null, oldSetting: async () => null, flags: async () => ({}), bookParts: async () => ({}), oldBook: async () => null, ...over,
});
const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

describe("author submissions waiting", () => {
  const catalog = async (key: string) => (key === "catalog" ? JSON.stringify({ a: book("a"), b: book("b") }) : null);

  it("reads them from the store each book lives in and lists them as a line", async () => {
    const asked: Array<[string, boolean]> = [];
    const records = await loadStockroom(reads({
      flags: async () => ({ fs_mode_a: true }),
      setting: catalog,
      submissions: async (id, inFirestore) => { asked.push([id, inFirestore]); return id === "a" ? { sales: { s1: true, s2: true }, expenses: { e1: true } } : null; },
    }));
    expect(asked.sort()).toEqual([["a", true], ["b", false]]);
    expect(records.submissions).toEqual({ a: { sales: { s1: true, s2: true }, expenses: { e1: true } } });
    const line = buildTodo(records).signals.find((s) => s.id === "setup-submissions:a");
    expect(line?.detail).toContain("3 entries from Title a");
    expect(line?.fix).toMatchObject({ kind: "book", bookId: "a", tab: "history" });
  });

  it("treats the older store's refusal as none waiting, and any other failure as a failed load", async () => {
    const refusal = Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" });
    const ok = await loadStockroom(reads({ setting: catalog, submissions: async () => { throw refusal; } }));
    expect(ok.submissions).toEqual({});
    await expect(loadStockroom(reads({ setting: catalog, submissions: async () => { throw new Error("network request failed"); } }))).rejects.toThrow("network");
  });

  it("fails loudly when the book's own store refuses (it is not an empty record)", async () => {
    const refusal = Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
    await expect(loadStockroom(reads({ flags: async () => ({ fs_mode_global: true }), setting: catalog, submissions: async () => { throw refusal; } }))).rejects.toThrow("permissions");
  });
});

describe("more of the stockroom's list from the records", () => {
  it("counts open-call contributors waiting, with the item's own title", () => {
    const records = { books: [book("a")], states: { a: { openCall: [{}, {}] } }, taxCenter: null };
    const line = buildTodo(records).signals.find((s) => s.id === "setup-opencall:a");
    expect(line?.detail).toContain("2 contributors on Title a");
  });

  it("lists the unsent orders under their line, and drops one that already has a postage label", () => {
    const order = (num: string) => ({ id: num, num, chan: "Website", date: days(10), qty: 1, price: 10, shipName: `Buyer ${num}`, shipAddr1: "1 Main St" });
    const states = { a: { hist: [order("W-1"), order("W-2")] } };
    const records = { books: [book("a")], states, taxCenter: { businessExpenses: [{ ref: "shippo:1", shippingMatchStatus: "matched", shippingOrderNumber: "W-1", amount: 5, baseAmount: 5 }] } };
    const line = buildTodo(records).signals.find((s) => s.id === "orders-unshipped");
    expect(line?.label).toContain("1 paid order");
    expect(line?.items?.map((i) => i.label)).toEqual([expect.stringContaining("W-2")]);
  });

  it("notices a fair with takings and no costs from the declared events", () => {
    const sale = { id: 1, num: "S-1", qty: 2, price: 20, chan: "Fair", date: "2026-05-01", amount: 40 };
    const tax = (trips: object[]) => ({ businessExpenses: [], recurring: [], settings: { baseCurrency: "CAD" }, trips });
    const missing = (trips: object[]) => buildTodo({ books: [book("a")], states: { a: { hist: [sale] } }, taxCenter: tax(trips) }).signals.find((s) => s.id === "money-missing-costs")?.detail || "";
    // The fair adds one more gap to the "costs may be missing" line.
    expect(missing([])).not.toContain("and 1 more");
    expect(missing([{ name: "Spring Fair", startDate: "2026-05-01", endDate: "2026-05-02" }])).toContain("and 1 more");
  });
});

describe("a fix button opens the exact book", () => {
  const isPage = (id: string) => ["dashboard", "history", "consignment"].includes(id);
  const at = (fix: object) => fixTarget({ id: "x", group: "stock", status: "info", label: "", detail: "", fix } as never, isPage);

  it("carries the book to the page", () => {
    expect(at({ kind: "book", bookId: "a", tab: "history" })).toEqual({ page: "history", bookId: "a" });
    expect(at({ kind: "edit-book", bookId: "b", tab: "isbn" })).toEqual({ page: "dashboard", bookId: "b" });
  });
  it("names no book for a page-only fix", () => {
    expect(at({ kind: "tab", tab: "consignment" })).toEqual({ page: "consignment" });
    expect(at({ kind: "taxcenter" })).toEqual({ page: "taxcenter" });
    expect(at({ kind: "retry-sync" })).toBeNull();
  });
});
