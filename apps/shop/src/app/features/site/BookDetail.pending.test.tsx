// @vitest-environment jsdom
// A book missing from the browser's cached catalog may just be newer than the cache: the product page
// must show Loading (and not mark itself noindex) until the fresh catalog read, like PageView does.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any, seo: [] as any[] }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../lib/seo", () => ({ useSEO: (meta: any) => { site.seo.push(meta); } }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("./RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("./ReviewsSection", () => ({ default: () => null }));
vi.mock("./StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("./StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");

const design = { copy: { bookLoading: "Loading-copy", bookNotFound: "Missing-copy" } };
let root: Root | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; });

async function open(state: { books: any[]; loading: boolean; fresh: boolean }) {
  site.seo = [];
  site.data = { settings: { design, policies: {}, info: {} }, pages: [], ...state };
  const el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(h(MemoryRouter, { initialEntries: ["/books/brand-new"] }, h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  return el;
}

describe("product page before the fresh catalog read", () => {
  it("shows Loading, not 'not found', and stays indexable while the cached catalog lacks the book", async () => {
    const el = await open({ books: [], loading: false, fresh: false });
    expect(el.textContent).toContain("Loading-copy");
    expect(el.textContent).not.toContain("Missing-copy");
    expect(site.seo.at(-1)?.noindex).toBe(false);
  });

  it("shows 'not found' with noindex once the fresh read confirms the book is missing", async () => {
    const el = await open({ books: [], loading: false, fresh: true });
    expect(el.textContent).toContain("Missing-copy");
    expect(site.seo.at(-1)?.noindex).toBe(true);
  });

  it("renders a cached book straight away without waiting for the fresh read", async () => {
    const el = await open({ books: [{ id: "b1", slug: "brand-new", title: "Brand New Book", status: "published", stockLevel: 2, retailPrice: 20 }], loading: false, fresh: false });
    expect(el.textContent).toContain("Brand New Book");
    expect(el.textContent).not.toContain("Loading-copy");
  });
});
