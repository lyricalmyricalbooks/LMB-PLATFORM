// @vitest-environment jsdom
// “Already in your bag” line (Studio › Style › Book page · photos & layout › showPdpInBag) on the product page:
// off by default, and when on it counts the chosen edition's copies in the shopper's bag.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any, cart: [] as any[], opened: 0 }));
vi.mock("../../useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => { site.opened++; }, cartCount: site.cart.length, cart: site.cart }) }));
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

const line = (el: HTMLElement) => el.querySelector('[data-studio-region="productInBag"], .fm-pdp-in-bag');
const inBag = (n: number) => [{ id: "pb", title: "Printed Book", price: 30, quantity: n, photoUrl: "" }];

it("is off by default, even with the book in the bag", async () => {
  site.cart = inBag(2);
  const { el, done } = await page({});
  expect(line(el)).toBeNull();
  await done();
});

it("says nothing while the book isn't in the bag", async () => {
  site.cart = [];
  const { el, done } = await page({ showPdpInBag: true });
  expect(line(el)).toBeNull();
  await done();
});

it("counts the copies and opens the bag when switched on", async () => {
  site.cart = inBag(1);
  const one = await page({ showPdpInBag: true });
  expect(line(one.el)?.textContent).toMatch(/1 copy already in your bag/);
  await one.done();
  site.cart = inBag(3);
  site.opened = 0;
  const many = await page({ showPdpInBag: true });
  expect(line(many.el)?.textContent).toMatch(/3 copies already in your bag/);
  await act(async () => { (line(many.el)!.querySelector("button") as HTMLButtonElement).click(); });
  expect(site.opened).toBe(1);
  await many.done();
});
