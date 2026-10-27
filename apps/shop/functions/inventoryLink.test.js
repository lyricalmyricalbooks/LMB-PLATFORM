import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const {
  websiteOrderNumber, countsForInventory, pushKind, orderFootprint, websiteOrder, splitCents,
  validateLinks, linkedEditions, stockPlanFor, stockPatch, projectInventoryCatalog,
} = createRequire(import.meta.url)("./inventoryLink");

const links = { b1: { _: "hound" }, b2: { pb: "altrove-pb", hc: "altrove-hc" } };
const paid = (extra = {}) => ({
  paymentStatus: "paid", paidAt: "2026-10-05T15:00:00.000Z", updatedAt: "2026-10-05T15:00:00.000Z",
  items: [{ id: "b1", quantity: 2, price: 40, title: "The Hound", format: "Paperback" }],
  subtotal: 80, shipping: 12, tax: 4.6, total: 96.6, ...extra,
});

describe("order numbers", () => {
  test("card/PayPal ids keep their hyphens; manual hex ids get a WEB- prefix", () => {
    expect(websiteOrderNumber("ABCD-123456-WXYZ")).toBe("#ABCD-123456-WXYZ");
    expect(websiteOrderNumber("a1b2c3d4e5f6a1b2c3d4e5f6")).toBe("#WEB-A1B2C3D4E5F6A1B2C3D4E5F6");
  });
});

describe("which orders count", () => {
  test("real paid, refund_pending and refunded orders on or after the start day", () => {
    expect(countsForInventory(paid(), "2026-10-01")).toBe(true);
    expect(countsForInventory(paid({ paymentStatus: "refunded" }), "2026-10-01")).toBe(true);
    expect(countsForInventory(paid({ paymentStatus: "refund_pending" }), "")).toBe(true);
    expect(countsForInventory(paid(), "2026-10-06")).toBe(false);
    expect(countsForInventory(paid({ paymentStatus: "unpaid" }), "")).toBe(false);
    expect(countsForInventory(paid({ isTest: true }), "")).toBe(false);
    expect(countsForInventory(paid({ paidAt: undefined }), "")).toBe(false);
  });
  test("start day is the Toronto day: 01:00 UTC on the 6th is still the 5th in Toronto", () => {
    expect(countsForInventory(paid({ paidAt: "2026-10-06T01:00:00.000Z" }), "2026-10-06")).toBe(false);
  });
  test("money that arrived after cancelling is never marked paid, so it never counts", () => {
    expect(countsForInventory(paid({ paymentStatus: "unpaid", paymentMismatch: { paidAfterCancel: true } }), "")).toBe(false);
  });
  test("pushKind: test orders only during rehearsal, already-pushed orders keep following", () => {
    expect(pushKind(paid(), { startDay: "" })).toBe("real");
    expect(pushKind(paid({ isTest: true, sandboxPayment: true }), { rehearsal: false })).toBe(null);
    expect(pushKind(paid({ isTest: true, sandboxPayment: true }), { rehearsal: true })).toBe("test");
    expect(pushKind(paid({ isTest: true }), { rehearsal: true })).toBe(null); // admin test order, not a sandbox payment
    expect(pushKind(paid({ paymentStatus: "refunded" }), { startDay: "2027-01-01", record: { test: false } })).toBe("real");
    expect(pushKind(paid(), { startDay: "2027-01-01" })).toBe(null);
  });
});

describe("orderFootprint", () => {
  test("sold copies of linked books; unlinked physical copies are listed", () => {
    const fp = orderFootprint(paid({ items: [
      { id: "b1", quantity: 2, price: 40, title: "The Hound" },
      { id: "b9", quantity: 1, price: 30, title: "Unlinked zine" },
    ] }), links);
    expect(fp.net).toEqual({ hound: 2 });
    expect(fp.unlinked).toEqual([{ title: "Unlinked zine", qty: 1 }]);
    expect(fp.books.hound.merchCents).toBe(8000);
  });
  test("digital lines and gift cards never count", () => {
    const fp = orderFootprint(paid({ items: [
      { id: "b1", quantity: 1, price: 15, format: "Ebook" },
      { id: "b1", quantity: 1, price: 15, digital: true },
      { id: "gc", quantity: 1, price: 50, giftCard: true },
    ] }), { ...links, gc: { _: "x" } });
    expect(fp.net).toEqual({});
    expect(fp.unlinked).toEqual([]);
  });
  test("editions link separately", () => {
    const fp = orderFootprint(paid({ items: [
      { id: "b2", variantId: "pb", quantity: 1, price: 30 },
      { id: "b2", variantId: "hc", quantity: 2, price: 60 },
    ] }), links);
    expect(fp.net).toEqual({ "altrove-pb": 1, "altrove-hc": 2 });
  });
  test("box sets count as the books inside them, price shared by the parts' catalog prices", () => {
    const order = paid({ items: [{ id: "set", quantity: 2, price: 90, bundle: true, title: "Set",
      components: [{ id: "b1", quantity: 1, title: "The Hound" }, { id: "b2", variantId: "pb", quantity: 2, title: "Altrove" }] }] });
    const fp = orderFootprint(order, links, {}, id => (id === "b1" ? 40 : 25));
    expect(fp.net).toEqual({ hound: 2, "altrove-pb": 4 });
    // 2 sets × CA$90 = 18000 cents shared 40×1 : 25×2 → 8000 : 10000
    expect(fp.books.hound.merchCents + fp.books["altrove-pb"].merchCents).toBe(18000);
    expect(fp.books.hound.merchCents).toBe(8000);
  });
  test("a box set's e-book part has no copies: neither counted nor reported as unmatched", () => {
    const order = paid({ items: [{ id: "set", quantity: 1, price: 50, components: [{ id: "b1", quantity: 1, title: "The Hound" }, { id: "eb", quantity: 1, title: "E" }] }] });
    const fp = orderFootprint(order, links, {}, () => 0, id => id === "eb");
    expect(fp.net).toEqual({ hound: 1 });
    expect(fp.unlinked).toEqual([]);
    expect(fp.books.hound.merchCents).toBe(5000);
  });
  test("pre-orders and promo gift copies count", () => {
    const fp = orderFootprint(paid({ items: [
      { id: "b1", quantity: 1, price: 40, preorder: true },
      { id: "b2", variantId: "pb", quantity: 1, price: 30, promoGift: true },
    ] }), links);
    expect(fp.net).toEqual({ hound: 1, "altrove-pb": 1 });
    expect(fp.books.hound.preorder).toBe(true);
  });
  test("full refund that restocked: restockedItems take copies back", () => {
    const fp = orderFootprint(paid({ paymentStatus: "refunded", inventoryRestockedAt: "x", restockedItems: [{ id: "b1", variantId: null, quantity: 2 }] }), links);
    expect(fp.net).toEqual({ hound: 0 });
    expect(fp.books.hound.restocked).toBe(2);
  });
  test("full refund after the parcel left: copies stay gone", () => {
    const fp = orderFootprint(paid({ paymentStatus: "refunded" }), links);
    expect(fp.net).toEqual({ hound: 2 });
  });
  test("refund_pending already counts its restock", () => {
    const fp = orderFootprint(paid({ paymentStatus: "refund_pending", inventoryRestockedAt: "x", restockedItems: [{ id: "b1", quantity: 2 }] }), links);
    expect(fp.net).toEqual({ hound: 0 });
  });
  test("a refund the bank rejected clears the restock markers: copies are gone again", () => {
    const fp = orderFootprint(paid({ inventoryRestockedAt: null, restockedItems: null }), links);
    expect(fp.net).toEqual({ hound: 2 });
  });
  test("manual refund restocks every line but never more than were sold, after earlier partial restocks", () => {
    const fp = orderFootprint(paid({ paymentStatus: "refunded", inventoryRestockedAt: "x",
      partialRestockedItems: [{ index: 0, id: "b1", variantId: null, quantity: 1 }] }), links);
    expect(fp.books.hound.restocked).toBe(2);
    expect(fp.net).toEqual({ hound: 0 });
  });
  test("partial restock of a box set uses the order line's parts", () => {
    const order = paid({ partiallyRefunded: true, refundedAmountMinor: 4500,
      items: [{ id: "set", quantity: 2, price: 90, components: [{ id: "b1", quantity: 1 }, { id: "b2", variantId: "pb", quantity: 2 }] }],
      partialRestockedItems: [{ index: 0, id: "set", variantId: null, quantity: 1 }] });
    const fp = orderFootprint(order, links);
    expect(fp.net).toEqual({ hound: 1, "altrove-pb": 2 });
  });
  test("links are frozen per order: a later relink never moves counted copies", () => {
    const first = orderFootprint(paid(), links);
    const relinked = { b1: { _: "other" } };
    expect(orderFootprint(paid(), relinked, first.lineLinks).net).toEqual({ hound: 2 });
  });
  test("a line unlinked at first picks up a link added later", () => {
    const first = orderFootprint(paid(), {});
    expect(first.net).toEqual({});
    expect(orderFootprint(paid(), links, first.lineLinks).net).toEqual({ hound: 2 });
  });
});

describe("websiteOrder (contract v1)", () => {
  test("shape, order money, customer and a stable hash", () => {
    const order = paid({ customer: { name: "Ana", email: "ANA@x.com", phone: "1", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M5V1A1", country: "CA" } },
      appliedDiscount: { code: "FALL" }, discount: 8, stripePaymentIntentId: "pi_1", expectedAmountMinor: 9660, expectedCurrency: "CAD" });
    const a = websiteOrder(order, { orderId: "ABCD-123456-WXYZ", links });
    const b = websiteOrder({ ...order, updatedAt: "2026-10-09T00:00:00Z" }, { orderId: "ABCD-123456-WXYZ", links });
    expect(a.web).toMatchObject({
      v: 1, number: "#ABCD-123456-WXYZ", test: false, paidDay: "2026-10-05", paymentStatus: "paid", refundState: "none",
      stripePaymentIntentId: "pi_1", charged: { currency: "CAD", amountMinor: 9660 },
      totals: { subtotal: 80, discount: 8, discountCode: "FALL", shipping: 12, tax: 4.6, total: 96.6, giftCard: 0 },
      customer: { email: "ana@x.com" }, firstBook: "hound",
      books: { hound: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80 } },
      fulfillment: { method: "shipping", trackingNumber: "", labelSource: null },
    });
    expect(a.hash).toBe(b.hash); // updatedAt alone does not change the content
    expect(a.web.sourceUpdatedAt).toBe("2026-10-05T15:00:00.000Z");
    const shipped = websiteOrder({ ...order, fulfillmentStatus: "shipped", trackingNumber: "123", trackingCarrier: "Canada Post", shippedAt: "2026-10-07T12:00:00Z" }, { orderId: "ABCD-123456-WXYZ", links });
    expect(shipped.hash).not.toBe(a.hash);
    expect(shipped.web.fulfillment).toMatchObject({ trackingNumber: "123", shippedDay: "2026-10-07", labelSource: "website" });
  });
  test("tracking the inventory app sent is labelled so the app doesn't treat it as the website's", () => {
    const w = websiteOrder(paid({ trackingNumber: "9", trackingSource: "inventory-app" }), { orderId: "A-1", links });
    expect(w.web.fulfillment.labelSource).toBe("inventory-app");
  });
  test("refund states", () => {
    expect(websiteOrder(paid({ paymentStatus: "refunded", refund: { amount: 96.6, currency: "CAD" } }), { orderId: "A-1", links }).web)
      .toMatchObject({ refundState: "full", refund: { amountMinor: 9660, currency: "CAD" } });
    expect(websiteOrder(paid({ partiallyRefunded: true, refundedAmountMinor: 1000, expectedCurrency: "USD" }), { orderId: "A-1", links }).web)
      .toMatchObject({ refundState: "partial", refund: { amountMinor: 1000, currency: "USD" } });
  });
  test("test pushes count nothing towards website totals", () => {
    const w = websiteOrder(paid({ isTest: true, sandboxPayment: true }), { orderId: "A-1", links, test: true });
    expect(w.web.test).toBe(true);
    expect(w.web.books.hound.net).toBe(2);
    expect(w.net).toEqual({});
  });
});

test("splitCents always adds up", () => {
  expect(splitCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
  expect(splitCents(1000, [0, 0])).toEqual([500, 500]);
  expect(splitCents(7, [1, 2]).reduce((a, b) => a + b)).toBe(7);
});

describe("validateLinks", () => {
  const books = [
    { id: "b1", title: "The Hound", format: "Paperback" },
    { id: "b2", title: "Altrove", variants: [{ id: "pb", name: "Paperback" }, { id: "eb", name: "Ebook", digital: true }] },
    { id: "set", title: "Set", bundleItems: [{ bookId: "b1", quantity: 1 }] },
    { id: "gc", title: "Gift card", productType: "giftCard" },
    { id: "e", title: "E", format: "Ebook" },
  ];
  test("keeps good links and explains every refusal", () => {
    const { links: out, errors } = validateLinks(books, {
      b1: { _: "hound" }, b2: { pb: "altrove", eb: "x1", _: "x2" }, set: { _: "x3" }, gc: { _: "x4" }, e: { _: "x5" }, gone: { _: "x6" },
    }, ["hound", "altrove", "x1", "x2", "x3", "x4", "x5", "x6"]);
    expect(out).toEqual({ b1: { _: "hound" }, b2: { pb: "altrove" } });
    expect(errors.map(e => e.reason)).toEqual(expect.arrayContaining([
      expect.stringMatching(/E-books/), expect.stringMatching(/sold in editions/), expect.stringMatching(/Box sets/),
      expect.stringMatching(/Gift cards/), expect.stringMatching(/no longer in the website/),
    ]));
  });
  test("one inventory book can't back two website listings; unknown inventory books are refused", () => {
    const { links: out, errors } = validateLinks(books, { b1: { _: "hound" }, b2: { pb: "hound" } }, ["hound"]);
    expect(out).toEqual({ b1: { _: "hound" } });
    expect(errors[0].reason).toMatch(/already linked/);
    expect(validateLinks(books, { b1: { _: "nope" } }, ["hound"]).errors[0].reason).toMatch(/not in the inventory app/);
  });
  test("editions of one book may share an inventory book (one pile of copies)", () => {
    const hound = { id: "h", title: "The Hound", variants: [{ id: "signed", name: "Signed Copy" }, { id: "unsigned", name: "Unsigned Copy" }] };
    const { links: out, errors } = validateLinks([...books, hound], { h: { signed: "hound", unsigned: "hound" } }, ["hound"]);
    expect(errors).toEqual([]);
    expect(out).toEqual({ h: { signed: "hound", unsigned: "hound" } });
    // …but never with another book.
    const mixed = validateLinks([...books, hound], { h: { signed: "hound" }, b2: { pb: "hound" } }, ["hound"]);
    expect(mixed.errors[0].reason).toMatch(/already linked/);
  });
  test("blank removes a link", () => {
    expect(validateLinks(books, { b1: { _: "" } }).links).toEqual({});
  });
  test("linkedEditions lists every link", () => {
    expect(linkedEditions(links)).toEqual([
      { bookId: "b1", variantId: null, inventoryBookId: "hound" },
      { bookId: "b2", variantId: "pb", inventoryBookId: "altrove-pb" },
      { bookId: "b2", variantId: "hc", inventoryBookId: "altrove-hc" },
    ]);
  });
});

describe("stockPlanFor", () => {
  const book = { trackInventory: true, stockLevel: 10 };
  test("app fully up to date: website shows the app's on-hand", () => {
    expect(stockPlanFor({ book, feed: { base: 42, onHand: 12, webCopies: 30 }, webTotal: 30 })).toMatchObject({ from: 10, to: 12, hold: null, appAhead: false });
  });
  test("a website sale the app hasn't imported yet is still taken off", () => {
    expect(stockPlanFor({ book, feed: { base: 42, onHand: 12 }, webTotal: 31 }).to).toBe(11);
  });
  test("app counts more website copies than the website: clamp to the app's on-hand and flag it", () => {
    expect(stockPlanFor({ book, feed: { base: 42, onHand: 12 }, webTotal: 28 })).toMatchObject({ to: 12, appAhead: true });
  });
  test("never negative", () => {
    expect(stockPlanFor({ book, feed: { base: 2, onHand: 0 }, webTotal: 5 }).to).toBe(0);
  });
  test("holds", () => {
    expect(stockPlanFor({ book, feed: null }).hold).toBe("no-feed");
    expect(stockPlanFor({ book, feed: { base: 1, onHand: 1, derived: false } }).hold).toBe("not-derived");
    expect(stockPlanFor({ book: { stockLevel: 3 }, feed: { base: 4, onHand: 4 } }).hold).toBe("untracked");
    expect(stockPlanFor({ book, feed: { base: 40, onHand: 40 } }).hold).toBe("big-change");
    expect(stockPlanFor({ book: { trackInventory: true, stockLevel: 12 }, feed: { base: 0, onHand: 0 } }).hold).toBe("big-change");
    expect(stockPlanFor({ book: { trackInventory: true, stockLevel: 3 }, feed: { base: 0, onHand: 0 } }).hold).toBe(null);
    expect(stockPlanFor({ book: { trackInventory: true, variants: [] }, variantId: "x", feed: { base: 1, onHand: 1 } }).hold).toBe("missing");
  });
  test("editions read their own count", () => {
    const ed = { trackInventory: true, variants: [{ id: "pb", stockLevel: 4 }, { id: "hc", stock: 2 }] };
    expect(stockPlanFor({ book: ed, variantId: "hc", feed: { base: 3, onHand: 3 } })).toMatchObject({ from: 2, to: 3 });
  });
});

test("stockPatch matches the admin's planStockChange shape", () => {
  const ed = { variants: [{ id: "pb", stockLevel: 4, stock: 4 }, { id: "hc", stock: 2 }] };
  expect(stockPatch(ed, "hc", 7)).toEqual({ variants: [{ id: "pb", stockLevel: 4, stock: 4 }, { id: "hc", stock: 7, stockLevel: 7 }] });
  expect(stockPatch({ stockLevel: 1 }, null, 3, { track: true })).toEqual({ stockLevel: 3, trackInventory: true });
});

test("projectInventoryCatalog passes only safe fields", () => {
  const doc = { data: JSON.stringify({
    hound: { id: "hound", title: "The Hound", author: "A", isbn: "—", maxPrint: 300, listPrice: 65, currency: "CA$", authorPassword: "secret", paymentLink: "https://x", productionCost: 15000 },
    _deletedDefaults: ["x"], _posExtra: { pos1: { id: "pos1" } },
  }) };
  // The list price is the book's public shop price ("Add to the shop" fills it in); costs and passwords never pass.
  expect(projectInventoryCatalog(doc)).toEqual([{ id: "hound", title: "The Hound", author: "A", isbn: "", currency: "CA$", maxPrint: 300, price: 65 }]);
  expect(projectInventoryCatalog({ data: "not json" })).toEqual([]);
});
