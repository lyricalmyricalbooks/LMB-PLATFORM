// Other admin pages ask the stockroom (stockroomBridge.ts): answered from the stockroom's records with its own rules
// (stockroom/stockroomAnswers.ts), never from a hidden copy of the old stockroom app.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {} }));
const { stockroomBridge } = await import("./stockroomBridge");
const { channelWords, linkedStockroomBooks, money } = await import("./StockroomBookPanel");
import type { StockroomRecords } from "./stockroom/stockroomData";

const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const records = (): StockroomRecords => ({
  books: [{ id: "salt", title: "Salt Almanac", isbn: "9780000000001", currency: "CAD", maxPrint: 10 }, { id: "moth", title: "Moth Songs", currency: "CAD", maxPrint: 5 }],
  states: {
    salt: { stock: 7, hist: [
      { date: TODAY, qty: 2, price: 20, chan: "Book Fair", num: "F-1", notes: "Harbour Fair", at: Date.now() },
      { date: "2026-10-01", qty: 1, price: 20, chan: "Website", webOrderId: "W-9" },
    ] },
  },
  taxCenter: null,
});

describe("asking the stockroom", () => {
  afterEach(() => stockroomBridge.forget());

  it("answers one book's figures, a book with no records yet, and a book it doesn't have", async () => {
    const load = async () => records();
    const salt = await stockroomBridge.ask<any>({ what: "book", book: "salt" }, { load });
    expect(salt).toMatchObject({ id: "salt", title: "Salt Almanac" });
    expect(await stockroomBridge.ask<any>({ what: "book", book: "moth" }, { load })).toMatchObject({ id: "moth" });
    expect(await stockroomBridge.ask({ what: "book", book: "nope" }, { load })).toEqual({ missing: true });
  });

  it("finds the stockroom book that matches a website book", async () => {
    const load = async () => records();
    expect(await stockroomBridge.ask<any>({ what: "find", isbn: "978-0-00-000000-1" }, { load })).toEqual({ match: expect.objectContaining({ id: "salt" }) });
  });

  it("lists the stockroom's own sales and leaves the website's out", async () => {
    const answer = await stockroomBridge.ask<any>({ what: "sales" }, { load: async () => records() });
    expect(answer.rows.map((r: any) => r.chan)).toEqual(["Book Fair"]);
  });

  it("gives today at the fair from the till's sales", async () => {
    const fair = await stockroomBridge.ask<any>({ what: "fair" }, { load: async () => records() });
    expect(fair).toMatchObject({ day: TODAY, units: 2 });
    expect(fair.upload).toEqual({ tone: "ok", text: "" });
  });

  it("reads the records once for questions asked together, and never keeps a failed read", async () => {
    const load = vi.fn(async () => records());
    await stockroomBridge.ask({ what: "sales" }, { load });
    await stockroomBridge.ask({ what: "fair" }, { load });
    expect(load).toHaveBeenCalledTimes(1);
    stockroomBridge.forget();
    const failing = vi.fn(async () => { throw new Error("offline"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await stockroomBridge.ask({ what: "sales" }, { load: failing })).toBeNull();
    expect(await stockroomBridge.ask({ what: "sales" }, { load: failing })).toBeNull();
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("reads the records again right after a change is saved in the admin", async () => {
    const { noteStockroomSaved } = await import("./stockroom/stockroomWrite");
    stockroomBridge.forget();
    const load = vi.fn(async () => records());
    await stockroomBridge.ask({ what: "sales" }, { load });
    noteStockroomSaved();
    await stockroomBridge.ask({ what: "sales" }, { load });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("says refused for a sign-in the records are kept from", async () => {
    const refused = async () => { throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); };
    expect(await stockroomBridge.ask({ what: "todo" }, { load: refused })).toEqual({ refused: true });
  });

  it("opens a stockroom page in the admin for a book", () => {
    const pages: Array<[string, unknown]> = [];
    const stop = stockroomBridge.onOpen((page, extra) => pages.push([page, extra]));
    stockroomBridge.openBook("dashboard", "salt");
    expect(pages).toEqual([["dashboard", { book: "salt" }]]);
    stop();
  });
});

describe("the book page's stock and sales", () => {
  it("lists the stockroom books a website book and its editions are matched to", () => {
    const links = { w1: { _: "s1", v2: "s2", v3: "" }, w2: { _: "s9" } };
    expect(linkedStockroomBooks(links, "w1", [{ id: "v2", name: "Hardback" }])).toEqual([{ edition: null, id: "s1" }, { edition: "Hardback", id: "s2" }]);
    expect(linkedStockroomBooks(links, "nope")).toEqual([]);
  });
  it("names the stockroom's channels in the admin's words, and shows money in its currency", () => {
    expect(channelWords("Book Fair")).toBe("Fairs and markets");
    expect(channelWords("Consignment")).toBe("Stockists");
    expect(channelWords("Something new")).toBe("Something new");
    expect(money(12.5, "CAD")).toMatch(/12\.50/);
    expect(money(3, "not-a-currency")).toBe("3.00 not-a-currency");
  });
});
