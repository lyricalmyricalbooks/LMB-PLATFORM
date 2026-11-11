import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./OrderDetail", () => ({ OrderDetail: (p: any) => <div data-order-detail={p.orderId} /> }));
vi.mock("./Orders", () => ({ Orders: () => <div>table</div>, refreshOrdersCache: () => new Promise(() => {}), patchOrdersCache: (o: any) => [o], loadOrderSearchCatalog: () => Promise.resolve(null), loadOrderBooks: () => Promise.resolve(null) }));

import { OrdersDesk } from "./OrdersDesk.tsx";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});

describe("OrdersDesk", () => {
  it("a link to one order opens the Ship station: header, numbered queue and the full order page", () => {
    const html = renderToStaticMarkup(<OrdersDesk selectedId="ABC" onSelect={() => {}} />);
    // Inventory's figures strip, and no second heading repeating the page title.
    expect(html).toContain('class="rp-kpi-grid od-figures" aria-label="Ship station today"');
    expect(html).not.toContain('class="od-title">Ship station</h2>');
    expect(html).toContain("Labels today");
    expect(html).toContain("Print pick list");
    expect(html).toContain(">All orders<");
    expect(html).toContain("Not in this queue");
    // The right side is the real order page (Stripe sync, refunds, labels).
    expect(html).toContain('data-order-detail="ABC"');
    expect(html).toContain("Shortcuts:");
    // Empty side lists read as plain text, not links that open an empty page.
    expect(html).toContain('<span class="rp-hint">0 on the way</span>');
    expect(html).not.toContain('class="od-link">0 on the way');
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
