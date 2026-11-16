// @vitest-environment jsdom
// A product with editions is matched to the stockroom edition by edition on its Stock and sales tab
// (StockroomBookPanel): e-books left out, a likely stockroom book chosen, one Match button per edition.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {} }));
const calls: unknown[][] = [];
vi.mock("./inventoryLinkApi", () => ({
  inventoryLinkApi: {
    catalog: async () => ({ books: [
      { id: "salt-pb", title: "Salt Almanac Paperback", author: "", isbn: "978-0-00-000000-1", currency: "CAD", maxPrint: null, onHand: 7, feedAt: null },
      { id: "salt-hc", title: "Salt Almanac", author: "", isbn: "", currency: "CAD", maxPrint: null, onHand: 3, feedAt: null },
      { id: "moth", title: "Moth Songs", author: "", isbn: "", currency: "CAD", maxPrint: null, onHand: 1, feedAt: null },
    ] }),
    linkNewBook: async (...args: unknown[]) => { calls.push(args); return { links: { salt: { pb: "salt-pb" } }, already: false }; },
  },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { StockroomBookPanel, guessEdition, printedEditions, takenElsewhere } = await import("./StockroomBookPanel");

const BOOK = { id: "salt", title: "Salt Almanac", variants: [
  { id: "pb", name: "Paperback", isbn: "9780000000001" },
  { id: "hc", name: "Hardcover" },
  { id: "eb", name: "E-book", format: "E-book (EPUB)" },
] };

describe("matching editions with the stockroom", () => {
  let root: Root | null = null;
  afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; calls.length = 0; });

  it("leaves e-books out and guesses by ISBN, then by title and edition, then by the only same title", () => {
    expect(printedEditions(BOOK).map((e) => e.id)).toEqual(["pb", "hc"]);
    const catalog = [
      { id: "a", title: "Salt Almanac", isbn: "9780000000001" }, { id: "b", title: "Salt Almanac Hardcover", isbn: "" },
    ] as any;
    expect(guessEdition(BOOK.variants[0], "Salt Almanac", catalog, new Set())).toBe("a");
    expect(guessEdition(BOOK.variants[1], "Salt Almanac", catalog, new Set())).toBe("b");
    expect(guessEdition({ name: "Signed" }, "Salt Almanac", catalog, new Set())).toBe("a");
    expect(guessEdition({ name: "Signed" }, "Salt Almanac", catalog, new Set(["a"]))).toBe("");
    expect([...takenElsewhere({ salt: { pb: "a" }, moth: { _: "m" } }, "salt")]).toEqual(["m"]);
  });

  it("shows one row per printed edition and matches the chosen one", async () => {
    const onLinks = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(h(StockroomBookPanel, { book: BOOK, links: { moth: { _: "moth" } }, linksFailed: false, onLinks, words: (t: string) => t, onOpen: () => {} }));
    });
    await act(async () => {});
    const selects = [...host.querySelectorAll("select")];
    expect(selects).toHaveLength(2);
    expect(host.textContent).not.toContain("E-book");
    expect(selects[0].value).toBe("salt-pb");
    expect(selects[1].value).toBe("salt-hc");
    expect([...selects[0].options].map((o) => o.value)).not.toContain("moth");
    const match = [...host.querySelectorAll("button")].find((b) => b.textContent === "Match")!;
    await act(async () => { match.click(); });
    expect(calls).toEqual([["salt", "salt-pb", "pb"]]);
    expect(onLinks).toHaveBeenCalledWith({ salt: { pb: "salt-pb" } });
  });
});
