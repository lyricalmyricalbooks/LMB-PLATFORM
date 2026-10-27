// @vitest-environment jsdom
// Tax & shipping note (Studio › Style › Book page · photos & layout › showPdpTaxNote) under the product page price:
// off by default; when on, the sentence follows the book (printed vs download) and the tax switch.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("../../useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [] }));
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

const printed = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
const ebook = { ...printed, id: "eb", slug: "eb", title: "E Book", format: "E-book", digital: true, trackInventory: false };
async function page(design: any, shown: any = printed, extra: any = {}) {
  site.data = { books: [shown], settings: { design, policies: {}, info: {}, ...extra }, pages: [], loading: false, fresh: true };
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
const note = (el: HTMLElement) => el.querySelector('[data-studio-region="productTaxNote"], .fm-pdp-tax-note');

it("is off by default", async () => {
  const { el, done } = await page({});
  expect(note(el)).toBeNull();
  await done();
});

it("mentions tax and shipping for printed books, linking the shipping policy when written", async () => {
  const plain = await page({ showPdpTaxNote: true });
  expect(note(plain.el)?.textContent).toBe("Taxes and shipping calculated at checkout.");
  expect(note(plain.el)?.querySelector("a")).toBeNull();
  await plain.done();
  const linked = await page({ showPdpTaxNote: true }, printed, { policies: { shipping: "We ship weekly." } });
  expect(note(linked.el)?.querySelector("a")?.getAttribute("href")).toBe("/page/policy-shipping");
  await linked.done();
});

it("drops the tax part when tax collection is off, and shipping for downloads", async () => {
  const noTax = await page({ showPdpTaxNote: true }, printed, { taxes: { collect: false } });
  expect(note(noTax.el)?.textContent).toBe("Shipping calculated at checkout.");
  await noTax.done();
  const dl = await page({ showPdpTaxNote: true }, ebook);
  expect(note(dl.el)?.textContent).toBe("Taxes calculated at checkout.");
  await dl.done();
});
