// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { CartProvider, useCart } from "./CartContext";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// "Added ✓" on the product page is shown only when addToCart returns true, so it must
// return false when the line is already at its stock / 99-copy cap and nothing changed.
it("addToCart reports false when nothing could be added", async () => {
  localStorage.clear();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  let cart: ReturnType<typeof useCart> | null = null;
  function Probe() { cart = useCart(); return null; }
  const root = createRoot(container);
  await act(async () => { root.render(<CartProvider><Probe /></CartProvider>); });
  const book = { id: "zine", title: "Zine", retailPrice: 10, stockLevel: 2 };
  let first = false, second = false, third = true;
  await act(async () => { first = cart!.addToCart(book, undefined, 2); });
  await act(async () => { second = cart!.addToCart(book); });
  expect(first).toBe(true);
  expect(second).toBe(false);
  expect(cart!.cart[0].quantity).toBe(2);
  await act(async () => { third = cart!.addToCart({ ...book, id: "unpriced", retailPrice: undefined }); });
  expect(third).toBe(false);
  await act(async () => root.unmount());
});

// A book that allows backorders can be ordered past its stock (the server doesn't cap it either).
it("addToCart doesn't cap a backorderable book at its current stock", async () => {
  localStorage.clear();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  let cart: ReturnType<typeof useCart> | null = null;
  function Probe() { cart = useCart(); return null; }
  const root = createRoot(container);
  await act(async () => { root.render(<CartProvider><Probe /></CartProvider>); });
  const book = { id: "pod", title: "Pod", retailPrice: 10, stockLevel: 2, trackInventory: true, allowBackorder: true };
  let added = false;
  await act(async () => { cart!.addToCart(book, undefined, 2); });
  await act(async () => { added = cart!.addToCart(book); });
  expect(added).toBe(true);
  expect(cart!.cart[0].quantity).toBe(3);
  expect(cart!.cart[0].stockLimit).toBeUndefined();
  await act(async () => root.unmount());
});

// Coming soon (Books › Inventory): shown, never put in the bag (the server refuses it too).
it("addToCart refuses a Coming soon book", async () => {
  localStorage.clear();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  let cart: ReturnType<typeof useCart> | null = null;
  function Probe() { cart = useCart(); return null; }
  const root = createRoot(container);
  await act(async () => { root.render(<CartProvider><Probe /></CartProvider>); });
  let added = true;
  await act(async () => { added = cart!.addToCart({ id: "soon", title: "Soon", retailPrice: 10, stockLevel: 5, comingSoon: true }); });
  expect(added).toBe(false);
  expect(cart!.cart).toEqual([]);
  await act(async () => root.unmount());
});
