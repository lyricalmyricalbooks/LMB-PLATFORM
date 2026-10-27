// @vitest-environment jsdom
// Free-shipping line (Studio › Style › Book page · photos & layout › showPdpFreeShipping) on the product page:
// off by default, and when on it names Settings › Shipping's free-shipping amount for printed books in stock.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("../../useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [{ id: "p", freeShippingOver: 75, zones: [] }] }));
vi.mock("../../../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("../../RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("../../ReviewsSection", () => ({ default: () => null }));
vi.mock("../../StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("../../StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("../../BookDetail");
const { CurrencyProvider } = await import("../../../../CurrencyContext");

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
async function page(design: any, shown: any = book) {
  site.data = { books: [shown], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [`/books/${shown.slug}`] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

const line = (el: HTMLElement) => el.querySelector('[data-studio-region="productFreeShipping"], .fm-pdp-free-ship');

it("is off by default", async () => {
  const { el, done } = await page({});
  expect(line(el)).toBeNull();
  await done();
});

it("names the free-shipping amount when switched on", async () => {
  const { el, done } = await page({ showPdpFreeShipping: true });
  expect(line(el)?.textContent).toMatch(/Free shipping on orders over .*75/);
  await done();
});

it("stays hidden for sold-out books and e-books", async () => {
  const sold = await page({ showPdpFreeShipping: true }, { ...book, stockLevel: 0 });
  expect(line(sold.el)).toBeNull();
  await sold.done();
  const ebook = await page({ showPdpFreeShipping: true }, { ...book, format: "E-book" });
  expect(line(ebook.el)).toBeNull();
  await ebook.done();
});
