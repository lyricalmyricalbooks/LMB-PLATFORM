// @vitest-environment jsdom
// "Added to your bag" notice (Studio › Style › Cart drawer › After a shopper adds a book): off by default, so
// adding opens the bag as before; chosen, adding shows the small notice instead and the bag stays closed.
import { act, createElement as h, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "../../CartContext";
import { AddedToBagNotice } from "./AddedToBagNotice";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const BOOK = { id: "b1", title: "Night Prints", retailPrice: 30, stockLevel: 5, trackInventory: true, status: "published", photos: [] };

let api: ReturnType<typeof useCart>;
function Harness({ mode, design }: { mode: "drawer" | "notice"; design: any }) {
  api = useCart();
  useEffect(() => { api.setAddBehaviour?.(mode); }, [mode]);
  return h(AddedToBagNotice, {
    design, added: api.lastAdded, count: api.cartCount,
    onDismiss: () => api.dismissAdded?.(), onViewBag: () => api.setIsCartOpen(true), formatPrice: (n: number) => `$${n.toFixed(2)}`,
  });
}

let el: HTMLDivElement; let root: Root;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.useRealTimers(); });
const mount = (mode: "drawer" | "notice", design: any = {}) =>
  act(async () => { root.render(h(MemoryRouter, { initialEntries: ["/books/night-prints"] }, h(CartProvider, null, h(Harness, { mode, design })))); });

it("opens the bag by default and shows no notice", async () => {
  await mount("drawer");
  await act(async () => { api.addToCart(BOOK); });
  expect(api.isCartOpen).toBe(true);
  expect(el.textContent).toBe("");
});

it("shows the notice instead of the bag, then closes by itself", async () => {
  await mount("notice");
  await act(async () => { api.addToCart(BOOK, undefined, 2); });
  expect(api.isCartOpen).toBe(false);
  expect(el.textContent).toContain("Added to your bag");
  expect(el.textContent).toContain("Night Prints");
  expect(el.textContent).toContain("Qty 2");
  expect(el.textContent).toContain("$60.00");
  expect(el.textContent).toContain("View bag (2)");
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(el.textContent).toBe("");
});

it("View bag opens the bag; 0 seconds keeps the notice", async () => {
  await mount("notice", { cartAddNoticeSeconds: 0 });
  await act(async () => { api.addToCart(BOOK); });
  await act(async () => { vi.advanceTimersByTime(60_000); });
  const view = [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith("View bag"))!;
  await act(async () => { view.click(); });
  expect(api.isCartOpen).toBe(true);
  expect(el.textContent).toBe("");
});
