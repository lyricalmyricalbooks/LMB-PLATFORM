import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./OrderDetail", () => ({ OrderDetail: (p: any) => <div data-order-detail={p.orderId} /> }));
vi.mock("./ordersStore", () => ({ refreshOrdersCache: () => new Promise(() => {}), patchOrdersCache: (o: any) => [o], loadOrderSearchCatalog: () => Promise.resolve(null), loadOrderBooks: () => Promise.resolve(null) }));

import { OrdersDesk } from "./OrdersDesk.tsx";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});

describe("OrdersDesk", () => {
  it("a link to one order opens that order as its own page (v4 mockup 1b), with no list beside it", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId="ABC" onSelect={() => {}} />);
    // The real order page (Stripe sync, refunds, labels), alone: its Back returns to the list.
    expect(html).toContain('data-order-detail="ABC"');
    expect(html).not.toContain("Ship station today");
    expect(html).not.toContain("Not in this queue");
  });

  it("never opens on the table view", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId={null} onSelect={() => {}} />);
    expect(html).not.toContain('class="od-title">Table</h2>');
  });

  it("opens on the mockup's order list with All picked, whatever was picked last time", () => {
    store.set("orders-desk-layout", "desk");
    store.set("orders-grid-tab", "all");
    const html = renderToStaticMarkup(<OrdersDesk selectedId={null} onSelect={() => {}} />);
    // The page title (Orders) comes from the admin shell; the list adds no second heading.
    expect(html).not.toContain("All orders</h2>");
    for (const label of ["Export CSV", "Create order", "Unfulfilled", "Unpaid", "Shipped", "Refunded"]) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true">All<');
    expect(html).not.toContain("data-order-detail");
  });
});
