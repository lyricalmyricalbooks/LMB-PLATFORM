// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CartProvider, useCart, cartLineKey, repriceCart, sanitizeCart, catalogUnitPrice } from "./CartContext";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const signed = { id: "signed", label: "Signed by the author", price: 5, kind: "option" };
const note = { id: "note", label: "Inscription", price: 2, kind: "text", maxLength: 40 };
const book = { id: "night", title: "Night", retailPrice: 20, addOns: [signed, note] };
const giftCard = { id: "gc", title: "Gift card", productType: "giftCard", trackInventory: false, variants: [{ id: "g25", name: "CA$25", price: 25, digital: true }] };

async function mount() {
  localStorage.clear();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  let cart: ReturnType<typeof useCart> | null = null;
  function Probe() { cart = useCart(); return null; }
  const root = createRoot(container);
  await act(async () => { root.render(<CartProvider><Probe /></CartProvider>); });
  return { get: () => cart!, root };
}

describe("cart line options", () => {
  it("prices add-ons per copy and keeps different inscriptions on separate lines", async () => {
    const { get, root } = await mount();
    let ok = false;
    await act(async () => { ok = get().addToCart(book, undefined, 1, { addOns: [{ id: "signed" }, { id: "note", text: "For Ana" }] }); });
    expect(ok).toBe(true);
    await act(async () => { get().addToCart(book, undefined, 1, { addOns: [{ id: "note", text: "For Bo" }] }); });
    await act(async () => { get().addToCart(book, undefined, 2); });
    await act(async () => { get().addToCart(book, undefined, 1, { addOns: [{ id: "note", text: "For Bo" }] }); });
    const lines = get().cart;
    expect(lines.map(l => [l.price, l.quantity])).toEqual([[27, 1], [22, 2], [20, 2]]);
    expect(lines[0].addOns).toEqual([{ id: "signed", label: "Signed by the author", price: 5 }, { id: "note", label: "Inscription", price: 2, text: "For Ana" }]);
    expect(new Set(lines.map(l => l.lineKey)).size).toBe(3);
    expect(lines[2].lineKey).toBe("night::");
    expect(get().cartTotal).toBe(27 + 44 + 40);
    await act(async () => { get().updateQuantity(lines[1].lineKey!, -1); });
    await act(async () => { get().removeFromCart(lines[0].lineKey!); });
    expect(get().cart.map(l => [l.price, l.quantity])).toEqual([[22, 1], [20, 2]]);
    // Legacy (id, variantId) calls still work and act on every line of that edition.
    await act(async () => { get().updateQuantity("night", undefined, 1); });
    expect(get().cart.map(l => l.quantity)).toEqual([2, 3]);
    await act(async () => { get().removeFromCart("night", undefined); });
    expect(get().cart).toEqual([]);
    await act(async () => root.unmount());
  });

  it("refuses withdrawn extras, a missing inscription and add-ons on gift cards", async () => {
    const { get, root } = await mount();
    const results: boolean[] = [];
    await act(async () => { results.push(get().addToCart(book, undefined, 1, { addOns: [{ id: "gone" }] })); });
    await act(async () => { results.push(get().addToCart(book, undefined, 1, { addOns: [{ id: "note", text: "  " }] })); });
    await act(async () => { results.push(get().addToCart(giftCard, giftCard.variants[0], 1, { addOns: [{ id: "signed" }] })); });
    await act(async () => { results.push(get().addToCart(giftCard, giftCard.variants[0], 1, { giftCardDetails: { recipientEmail: "nope" } })); });
    expect(results).toEqual([false, false, false, false]);
    expect(get().cart).toEqual([]);
    await act(async () => root.unmount());
  });

  it("keeps gift-card recipients apart and never caps gift cards by stock", async () => {
    const { get, root } = await mount();
    await act(async () => { get().addToCart(giftCard, giftCard.variants[0], 3, { giftCardDetails: { recipientName: "Ana", recipientEmail: "ANA@example.com", message: "Happy birthday" } }); });
    await act(async () => { get().addToCart(giftCard, giftCard.variants[0], 1); });
    const lines = get().cart;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ price: 25, quantity: 3, giftCard: true, stockLimit: undefined, giftCardDetails: { recipientName: "Ana", recipientEmail: "ana@example.com", senderName: "", message: "Happy birthday" } });
    expect(lines[1].giftCardDetails).toEqual({ recipientName: "", recipientEmail: "", senderName: "", message: "" });
    await act(async () => root.unmount());
  });

  it("shares one edition's stock between its lines", async () => {
    const { get, root } = await mount();
    const scarce = { ...book, id: "scarce", trackInventory: true, stockLevel: 3 };
    await act(async () => { get().addToCart(scarce, undefined, 2, { addOns: [{ id: "signed" }] }); });
    let ok = true;
    await act(async () => { get().addToCart(scarce, undefined, 5); });
    await act(async () => { ok = get().addToCart(scarce); });
    expect(ok).toBe(false);
    expect(get().cart.map(l => l.quantity)).toEqual([2, 1]);
    await act(async () => { get().updateQuantity(get().cart[0].lineKey!, 1); });
    expect(get().cart[0].quantity).toBe(2);
    await act(async () => root.unmount());
  });

  it("marks box sets with how many books one set holds", async () => {
    const { get, root } = await mount();
    const set = { id: "set", title: "Set", retailPrice: 60, trackInventory: true, stockLevel: 2, bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b" }], addOns: [signed] };
    let ok = true;
    await act(async () => { ok = get().addToCart(set, undefined, 1, { addOns: [{ id: "signed" }] }); });
    expect(ok).toBe(false); // box sets never take extras
    await act(async () => { get().addToCart(set, undefined, 5); });
    expect(get().cart[0]).toMatchObject({ bundle: true, bundleCount: 3, quantity: 2, price: 60 });
    await act(async () => root.unmount());
  });
});

describe("repriceCart with options", () => {
  it("re-prices add-ons and drops lines whose extras were withdrawn", () => {
    const lines = sanitizeCart([
      { id: "night", title: "Night", price: 25, quantity: 1, photoUrl: "", addOns: [{ id: "signed", label: "Old", price: 4 }] },
      { id: "night", title: "Night", price: 22, quantity: 1, photoUrl: "", addOns: [{ id: "wrap", label: "Wrap", price: 2 }] },
      { id: "night", title: "Night", price: 22, quantity: 1, photoUrl: "", addOns: [{ id: "note", label: "Inscription", price: 2 }] },
    ]);
    const r = repriceCart(lines, [book]);
    expect(r.cart).toHaveLength(1);
    expect(r.cart[0].price).toBe(25);
    expect(r.cart[0].addOns).toEqual([{ id: "signed", label: "Signed by the author", price: 5 }]);
    expect(r.removed).toEqual(["Night", "Night"]);
  });
  it("is stable for an up-to-date line with options", () => {
    const first = repriceCart(sanitizeCart([{ id: "night", title: "Night", price: 25, quantity: 1, photoUrl: "", addOns: [{ id: "signed" , label: "Signed by the author", price: 5 }] }]), [book]);
    const again = repriceCart(first.cart, [book]);
    expect(again.changed).toBe(false);
  });
  it("keeps gift cards unlimited and drops an unpriced gift card", () => {
    const line = { id: "gc", variantId: "g25", title: "Gift card", price: 25, quantity: 4, photoUrl: "", giftCardDetails: { recipientEmail: "a@b.co" } };
    const r = repriceCart(sanitizeCart([line]), [giftCard]);
    expect(r.cart[0]).toMatchObject({ stockLimit: 999, giftCard: true, quantity: 4 });
    expect(repriceCart(sanitizeCart([line]), [{ ...giftCard, variants: [{ id: "g25", price: 0 }] }]).cart).toEqual([]);
  });
});

describe("sanitizeCart with options", () => {
  it("keeps well-formed options, drops a line with a broken recipient", () => {
    const out = sanitizeCart([
      { id: "a", price: 5, quantity: 1, addOns: [{ id: "x", label: "X", price: 1, text: "Hi" }, { id: "", price: 1 }, { id: "y", price: "nope" }] },
      { id: "b", price: 5, quantity: 1, giftCardDetails: { recipientEmail: "broken" } },
    ]);
    expect(out.map(i => i.id)).toEqual(["a"]);
    expect(out[0].addOns).toEqual([{ id: "x", label: "X", price: 1, text: "Hi" }]);
    expect(out[0].lineKey).toBe(cartLineKey(out[0]));
  });
});

describe("scheduled sales", () => {
  it("charges the sale price only inside its dates", () => {
    const now = new Date("2026-10-08T16:00:00Z");
    expect(catalogUnitPrice({ isOnSale: true, salePrice: 10, retailPrice: 20, saleEndsAt: "2026-10-07" }, undefined, now)).toBe(20);
    expect(catalogUnitPrice({ isOnSale: true, salePrice: 10, retailPrice: 20, saleStartsAt: "2026-10-08" }, undefined, now)).toBe(10);
  });
});
