import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as client from "./promotions";
const srv = createRequire(import.meta.url)("../../../../functions/shared/promotions.js");

// 2026-10-08 noon in Toronto.
const now = new Date("2026-10-08T16:00:00Z");

/** Same outcome on both sides: an equal value, or the same thrown message. */
const outcome = (fn: () => unknown) => { try { return { ok: fn() }; } catch (e: any) { return { threw: e.message }; } };

describe("scheduled sales (client ↔ server parity)", () => {
  const books = [
    { isOnSale: true, salePrice: 10 },
    { isOnSale: true, salePrice: 10, saleStartsAt: "2026-10-08" },
    { isOnSale: true, salePrice: 10, saleStartsAt: "2026-10-09" },
    { isOnSale: true, salePrice: 10, saleEndsAt: "2026-10-08" },
    { isOnSale: true, salePrice: 10, saleEndsAt: "2026-10-07" },
    { isOnSale: true, salePrice: 10, saleStartsAt: "2026-10-01", saleEndsAt: "2026-10-31" },
    { isOnSale: true, salePrice: 10, saleStartsAt: "not a date", saleEndsAt: "" },
    { isOnSale: true, salePrice: "0" },
    { isOnSale: false, salePrice: 10 },
    { isOnSale: true, salePrice: 10, saleEndsAt: "2026-10-08T23:00:00Z" },
    null,
  ];
  it("agrees on every window", () => {
    for (const b of books) {
      expect(client.saleWindowOpen(b, now)).toBe(srv.saleWindowOpen(b, now));
      expect(client.saleActive(b, now)).toBe(srv.saleActive(b, now));
    }
    expect(books.map((b) => client.saleActive(b, now))).toEqual([true, true, false, true, false, true, true, false, false, true, false]);
  });
  it("uses the Toronto calendar day", () => {
    const lateEvening = new Date("2026-10-09T02:00:00Z"); // still 8 Oct in Toronto
    const b = { isOnSale: true, salePrice: 5, saleEndsAt: "2026-10-08" };
    expect(client.saleActive(b, lateEvening)).toBe(true);
    expect(srv.saleActive(b, lateEvening)).toBe(true);
  });
  it("names the last day only for a dated sale that is on", () => {
    expect(client.saleEndDate({ isOnSale: true, salePrice: 5, saleEndsAt: "2026-10-20" }, now)).toBe("2026-10-20");
    expect(client.saleEndDate({ isOnSale: true, salePrice: 5 }, now)).toBe("");
    expect(client.saleEndDate({ isOnSale: true, salePrice: 5, saleEndsAt: "2026-10-01" }, now)).toBe("");
  });
});

describe("add-ons (client ↔ server parity)", () => {
  const book = {
    title: "Night Book",
    addOns: [
      { id: "signed", label: " Signed by the author ", price: 5, kind: "option" },
      { id: "note", label: "Inscription", price: "2.499", kind: "text", maxLength: 10 },
      { id: "signed", label: "Duplicate id", price: 1 },
      { id: "off", label: "Hidden", price: 1, enabled: false },
      { id: "neg", label: "Negative", price: -1 },
      { id: "", label: "No id", price: 1 },
      { id: "wrap", label: "Gift wrap", price: 0 },
      { id: "long", label: "Long", price: 1, kind: "text", maxLength: 9999 },
      null,
    ],
  };
  it("offers the same cleaned list", () => {
    expect(client.bookAddOns(book)).toEqual(srv.bookAddOns(book));
    expect(client.bookAddOns(book).map((a) => a.id)).toEqual(["signed", "note", "wrap", "long"]);
    expect(client.bookAddOns(book)[3].maxLength).toBe(300);
    expect(client.bookAddOns({ ...book, productType: "giftCard" })).toEqual([]);
    expect(client.bookAddOns({ ...book, bundleItems: [{ bookId: "a" }] })).toEqual([]);
    const many = { addOns: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, label: `A${i}`, price: 1 })) };
    expect(client.bookAddOns(many)).toEqual(srv.bookAddOns(many));
    expect(client.bookAddOns(many)).toHaveLength(6);
  });
  const requests = [
    undefined,
    [],
    [{ id: "signed" }],
    [{ id: "signed" }, { id: "signed" }, { id: "wrap" }],
    [{ id: "note", text: "  For   Ana, with love  " }],
    [{ id: "note", text: "   " }],
    [{ id: "note" }],
    [{ id: "gone" }],
    [{ id: 4 }, { id: "signed" }],
    [{ id: "signed" }, { id: "note", text: "Hi" }],
  ];
  it("prices and validates every selection the same way", () => {
    for (const r of requests) {
      const c = outcome(() => client.addOnSelection(book, r));
      expect(c).toEqual(outcome(() => srv.addOnSelection(book, r)));
    }
    expect(client.addOnSelection(book, [{ id: "signed" }, { id: "note", text: "Hi" }])).toEqual({ addOns: [{ id: "signed", label: "Signed by the author", price: 5 }, { id: "note", label: "Inscription", price: 2.5, text: "Hi" }], price: 7.5 });
    expect(client.addOnSelection(book, [{ id: "note", text: "  For   Ana, with love  " }]).addOns[0].text).toBe("For Ana, w");
  });
  it("throws coded problems the checkout can word", () => {
    expect(() => client.addOnSelection(book, [{ id: "gone" }])).toThrow(client.PromotionProblem);
    try { client.addOnSelection(book, [{ id: "note" }]); } catch (e: any) { expect(e.code).toBe("addon_text_missing"); expect(e.values.label).toBe("Inscription"); }
  });
});

describe("box sets (client ↔ server parity)", () => {
  const catalog: Record<string, any> = {
    a: { trackInventory: true, stockLevel: 7 },
    b: { trackInventory: true, variants: [{ id: "hc", stock: 5 }, { id: "pb", stockLevel: "9" }] },
    c: { trackInventory: false, stockLevel: 0 },
    d: { trackInventory: true, allowBackorder: true, stockLevel: 0 },
    e: { trackInventory: true, stockLevel: -3 },
  };
  const getBook = (id: string) => catalog[id];
  const sets = [
    { bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b", variantId: "hc", quantity: 1 }] },
    { bundleItems: [{ bookId: "b", variantId: "pb", quantity: "2" }] },
    { bundleItems: [{ bookId: "c" }, { bookId: "d", quantity: 3 }] },
    { bundleItems: [{ bookId: "a" }, { bookId: "missing" }] },
    { bundleItems: [{ bookId: "b", variantId: "gone" }] },
    { bundleItems: [{ bookId: "e" }] },
    { bundleItems: [{ bookId: "a", quantity: 99 }, { bookId: "" }, null, { bookId: "a", quantity: 0, variantId: "" }] },
    { bundleItems: "nope" },
    {},
  ];
  it("agrees on parts and availability", () => {
    for (const s of sets) {
      expect(client.bundleComponents(s)).toEqual(srv.bundleComponents(s));
      expect(client.isBundle(s)).toBe(srv.isBundle(s));
      expect(client.bundleAvailable(s, getBook)).toBe(srv.bundleAvailable(s, getBook));
    }
    expect(sets.map((s) => client.bundleAvailable(s, getBook))).toEqual([3, 4, Infinity, 0, 0, 0, 0, Infinity, Infinity]);
    const many = { bundleItems: Array.from({ length: 30 }, (_, i) => ({ bookId: `x${i}` })) };
    expect(client.bundleComponents(many)).toHaveLength(20);
  });
});

describe("gift-card products (client ↔ server parity)", () => {
  it("recognises gift cards", () => {
    for (const b of [{ productType: "giftCard" }, { productType: "book" }, {}, null]) expect(client.isGiftCardProduct(b)).toBe(srv.isGiftCardProduct(b));
  });
  it("cleans the recipient form the same way", () => {
    const forms = [
      undefined,
      "x",
      { recipientName: "  Ana ", recipientEmail: " ANA@Example.COM ", senderName: "Bo", message: "x".repeat(400) },
      { recipientEmail: "not-an-email" },
      { recipientEmail: "a@b.c" },
      { recipientName: "n".repeat(150) },
    ];
    for (const f of forms) expect(outcome(() => client.giftCardDetails(f))).toEqual(outcome(() => srv.giftCardDetails(f)));
    expect(client.giftCardDetails({ recipientEmail: " ANA@Example.COM " }).recipientEmail).toBe("ana@example.com");
  });
});
