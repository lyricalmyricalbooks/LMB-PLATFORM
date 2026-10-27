// @vitest-environment jsdom
// Pickup availability (Studio › Style › Book page · photos & layout › showPdpPickup) on the product page:
// off by default, and when on it lists the owner's enabled pickup locations for printed books in stock.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
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

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
const address = { street: "", city: "Toronto", state: "ON", zip: "", country: "CA" };
const localFulfillment = { enabled: true, deliveryZones: [], pickupLocations: [{ id: "studio", enabled: true, name: "The Studio", price: 0, address, hours: "Sat 12–5", estimate: "Usually ready in 24 hours" }] };

async function page(design: any, shown: any = book, pickup: any = localFulfillment) {
  site.data = { books: [shown], settings: { design, policies: {}, info: {}, localFulfillment: pickup }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [`/books/${shown.slug}`] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

it("is off by default", async () => {
  const { el, done } = await page({});
  expect(el.querySelector("[data-store-region=productPickup]")).toBeNull();
  await done();
});

it("when on, names the pickup location with its estimate and details", async () => {
  const { el, done } = await page({ showPdpPickup: true });
  const box = el.querySelector(".fm-pdp-card [data-store-region=productPickup]")!;
  expect(box.textContent).toMatch(/Pickup available at The Studio/);
  expect(box.textContent).toMatch(/Usually ready in 24 hours/);
  expect(box.textContent).toMatch(/Toronto, ON/);
  expect(box.textContent).toMatch(/Free pickup/);
  expect(box.textContent).toMatch(/Hours: Sat 12–5/);
  await done();
});

it("stays hidden for sold-out books, e-books and with local pickup off", async () => {
  for (const [shown, pickup] of [
    [{ ...book, stockLevel: 0 }, localFulfillment],
    [{ ...book, format: "EPUB" }, localFulfillment],
    [book, { ...localFulfillment, enabled: false }],
  ]) {
    const { el, done } = await page({ showPdpPickup: true }, shown, pickup);
    expect(el.querySelector("[data-store-region=productPickup]")).toBeNull();
    await done();
  }
});
