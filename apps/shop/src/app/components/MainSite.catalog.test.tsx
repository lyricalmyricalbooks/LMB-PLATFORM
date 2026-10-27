// @vitest-environment jsdom
// A design with no shop categories must still show every published book in the catalog
// (activeCategory used to start as `categories[0]` = undefined, which matched nothing).
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("../features/site/useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../CartContext", () => ({ useCart: () => ({ cartCount: 0, cartTotal: 0, setIsCartOpen: () => {}, addToCart: () => true, cart: [] }), catalogUnitPrice: () => 0 }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("./sectionRender", () => ({ SectionList: () => null, GlobalSections: () => null, GroupSections: () => null, TemplateSections: () => null }));
vi.mock("../features/site/RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("../lib/seo", () => ({ useSEO: () => {} }));

const { default: MainSite } = await import("./MainSite");
const { CurrencyProvider } = await import("../CurrencyContext");

const books = [
  { id: "bk1", title: "First Title", price: 10, status: "published", categories: ["Books"], stockLevel: 3 },
  { id: "bk2", title: "Second Title", price: 12, status: "published", categories: [], stockLevel: 3 },
];
const dataFor = (categories: any[]) => ({ settings: { design: { categories, copy: {} } }, pages: [], books, loading: false, fresh: true });
const tree = () => h(MemoryRouter, { initialEntries: ["/"] }, h(CurrencyProvider, null, h(MainSite, { showCatalog: true, setShowCatalog: () => {} })));

let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; });

describe("MainSite with no shop categories", () => {
  it("lists every published book on first render", () => {
    site.data = dataFor([]);
    const html = renderToStaticMarkup(tree());
    expect(html).toContain("First Title");
    expect(html).toContain("Second Title");
  });

  it("keeps every book after effects run, and opens the first category once one exists", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const el = document.createElement("div");
    root = createRoot(el);
    site.data = dataFor([]);
    await act(async () => root!.render(tree()));
    expect(el.textContent).toContain("First Title");
    expect(el.textContent).toContain("Second Title");

    // Categories arrive later (e.g. a Studio edit): behave as before and open the first one.
    site.data = dataFor([{ id: "b", name: "Books" }]);
    await act(async () => root!.render(tree()));
    expect(el.textContent).toContain("First Title");
    expect(el.textContent).not.toContain("Second Title");

    // All categories removed again: fall back to every book rather than an empty shop.
    site.data = dataFor([]);
    await act(async () => root!.render(tree()));
    expect(el.textContent).toContain("Second Title");
  });
});

describe("shop card controls revealed on hover", () => {
  it("stay visible on touch screens and when focused by keyboard", () => {
    site.data = dataFor([]);
    const el = document.createElement("div");
    el.innerHTML = renderToStaticMarkup(tree());
    const hidden = [...el.querySelectorAll("button, a, input, select")].filter((n) => /\bopacity-0\b/.test(n.getAttribute("class") || ""));
    expect(hidden.length).toBeGreaterThan(0); // the card wishlist hearts
    for (const node of hidden) {
      const cls = node.getAttribute("class") || "";
      expect(cls, node.outerHTML).toMatch(/\bpointer-coarse:opacity-100\b/);
      expect(cls, node.outerHTML).toMatch(/\bfocus-visible:opacity-100\b/);
    }
  });
});

describe("Show more books", () => {
  it("is off by default and pages the grid when a number is chosen", async () => {
    site.data = dataFor([]);
    expect(renderToStaticMarkup(tree())).not.toContain("Show more books");

    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const el = document.createElement("div");
    root = createRoot(el);
    site.data = { ...dataFor([]), settings: { design: { categories: [], copy: {}, catalogPageSize: 1 } } };
    await act(async () => root!.render(tree()));
    const titles = () => [...el.querySelectorAll("h3.fm-card-title")].map(n => n.textContent);
    expect(titles()).toHaveLength(1);
    const more = el.querySelector('[data-store-region="catalogShowMore"]')!;
    expect(more.textContent).toContain("Showing 1 of 2");
    await act(async () => more.querySelector("button")!.click());
    expect(titles()).toHaveLength(2);
    expect(el.querySelector('[data-store-region="catalogShowMore"]')).toBeNull();
  });
});
