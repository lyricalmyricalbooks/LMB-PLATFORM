// @vitest-environment jsdom
// Payment icons under the buy buttons (Studio › Style › Book page · photos & layout › showPdpPaymentIcons):
// off by default, and when on it draws the footer's chosen icons with a read-aloud label.
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
const { pdpPaymentBadges } = await import("./PdpPaymentIcons");

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
async function page(design: any, shown: any = book, footerBadges: string[] = ["visa", "paypal"]) {
  site.data = { books: [shown], settings: { design: { footerBadges, ...design }, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
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

const row = (el: HTMLElement) => el.querySelector('[data-studio-region="productPaymentIcons"], .fm-pdp-pay-icons');

it("is off by default", async () => {
  site.cart = [];
  const { el, done } = await page({});
  expect(row(el)).toBeNull();
  await done();
});

it("draws the footer's icons with a read-aloud label when switched on", async () => {
  site.cart = [];
  const { el, done } = await page({ showPdpPaymentIcons: true });
  expect(row(el)?.getAttribute("aria-label")).toBe("Ways to pay: Visa, PayPal");
  expect(row(el)?.querySelectorAll("svg").length).toBe(2);
  await done();
});

it("shows nothing without chosen icons or while the book is sold out", async () => {
  site.cart = [];
  const none = await page({ showPdpPaymentIcons: true }, book, []);
  expect(row(none.el)).toBeNull();
  await none.done();
  const sold = await page({ showPdpPaymentIcons: true }, { ...book, stockLevel: 0 });
  expect(row(sold.el)).toBeNull();
  await sold.done();
});

it("keeps only known icons, once each, in the chosen order", () => {
  expect(pdpPaymentBadges(["paypal", "nope", "visa", "paypal", 3])).toEqual(["paypal", "visa"]);
  expect(pdpPaymentBadges(undefined)).toEqual([]);
});
