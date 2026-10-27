import { describe, it, expect } from "vitest";
import { ago, dayBefore, holdWords, isStockLinked, linkableEditions, linkedTo, linksFromChoices, linkStep, suggestLinks } from "./inventoryLink";

const books = [
  { id: "b1", title: "The Hound", isbn: "978-1-23456-789-7", format: "Paperback", trackInventory: true, stockLevel: 4 },
  { id: "b2", title: "Altrove", variants: [{ id: "pb", name: "Paperback", stockLevel: 2 }, { id: "hc", name: "Hardcover", stock: 1 }, { id: "eb", name: "Ebook", digital: true }] },
  { id: "b3", title: "Archaeology of Presence", variants: [{ id: "pb", name: "Paperback" }, { id: "eb", name: "Ebook", format: "Ebook" }] },
  { id: "e", title: "E only", format: "Ebook" },
  { id: "set", title: "Set", bundleItems: [{ bookId: "b1", quantity: 1 }] },
  { id: "gc", title: "Gift card", productType: "giftCard" },
];
const app = (id: string, title: string, isbn = "") => ({ id, title, isbn, author: "", currency: "", maxPrint: 10, onHand: 3, feedAt: null });

describe("inventory link helpers", () => {
  it("dayBefore steps back one calendar day, across months and years", () => {
    expect(dayBefore("2026-10-11")).toBe("2026-10-10");
    expect(dayBefore("2025-01-01")).toBe("2024-12-31");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });
  it("lists only printed books and editions", () => {
    const rows = linkableEditions(books);
    expect(rows.map((r) => [r.bookId, r.variantId, r.stock])).toEqual([
      ["b2", "hc", 1], ["b2", "pb", 2], ["b3", "pb", 0], ["b1", null, 4],
    ]);
  });
  it("suggests only single, unused matches: ISBN first, then exact titles", () => {
    const rows = linkableEditions(books);
    const s = suggestLinks(rows, [
      app("hound", "Hound (old title)", "9781234567897"), app("alt-pb", "Altrove Paperback"), app("alt-hc", "altrove — hardcover"),
      app("arch", "Archaeology of Presence"), app("dup1", "Twin"), app("dup2", "Twin"),
    ], {});
    expect(s).toEqual({ "b1|": "hound", "b2|pb": "alt-pb", "b2|hc": "alt-hc", "b3|pb": "arch" });
    // Already linked books and books already used elsewhere are not suggested again.
    expect(suggestLinks(rows, [app("hound", "The Hound")], { x: { _: "hound" } })).toEqual({});
  });
  it("builds the links map from choices and reads it back", () => {
    const rows = linkableEditions(books);
    const links = linksFromChoices(rows, { "b1|": "hound", "b2|pb": "alt-pb", "b2|hc": "" });
    expect(links).toEqual({ b1: { _: "hound" }, b2: { pb: "alt-pb" } });
    expect(linkedTo(links, "b2", "pb")).toBe("alt-pb");
    expect(isStockLinked(links, "b2", "hc")).toBe(false);
    expect(isStockLinked(links, "b2")).toBe(true);
    expect(isStockLinked(links, "b1", null)).toBe(true);
  });
  it("walks the owner through the steps", () => {
    expect(linkStep({})).toBe("connect");
    expect(linkStep({ connection: { ok: true } })).toBe("link");
    expect(linkStep({ connection: { ok: true }, links: { b1: { _: "x" } } })).toBe("sales");
    expect(linkStep({ connection: { ok: true }, links: { b1: { _: "x" } }, startDay: "2026-10-01", backfill: { done: true } })).toBe("stock");
    expect(linkStep({ connection: { ok: true }, links: { b1: { _: "x" } }, startDay: "2026-10-01", backfill: { done: true }, firstApplyAt: "x" })).toBe("running");
  });
  it("explains holds and times in plain words", () => {
    expect(holdWords({ hold: "big-change", from: 40, to: 3 })).toMatch(/40 → 3/);
    expect(holdWords({ hold: null, from: 1, to: 1 })).toBe("");
    const now = Date.parse("2026-10-11T15:00:00Z");
    expect(ago("2026-10-11T14:55:00Z", now)).toBe("5 minutes ago");
    expect(ago(null, now)).toBe("never");
  });
});
