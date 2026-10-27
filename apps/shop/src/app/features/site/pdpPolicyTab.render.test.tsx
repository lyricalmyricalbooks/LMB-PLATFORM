// @vitest-environment jsdom
// Shipping & returns tab (Studio › Style › Book page · photos & layout › showPdpPolicyTab) on the product page:
// off by default, and when on it shows the shop's own Shipping/Returns policies.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("./shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [] }));
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

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, description: "A book.", photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
const policies = { shipping: "Parcels leave within 3 days.", returns: "Returns within 30 days.\n\n<b>Unread</b> copies only." };
async function page(design: any, shown: any = book, pol: any = policies) {
  site.data = { books: [shown], settings: { design, policies: pol, info: {} }, pages: [], loading: false, fresh: true };
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

const tab = (el: HTMLElement) => el.querySelector<HTMLButtonElement>("#pdp-tab-policies");
const panel = (el: HTMLElement) => el.querySelector(".fm-pdp-policies");

it("is off by default", async () => {
  const { el, done } = await page({});
  expect(tab(el)).toBeNull();
  expect(panel(el)).toBeNull();
  await done();
});

it("shows the shop's own policies, escaped, with links to the full pages when switched on", async () => {
  const { el, done } = await page({ showPdpPolicyTab: true });
  expect(tab(el)?.textContent).toBe("Shipping & returns");
  // Not kept hidden in the page: the same policy on every book page isn't book content for search engines.
  expect(panel(el)).toBeNull();
  await act(async () => { tab(el)!.click(); });
  const p = panel(el)!;
  expect(p.textContent).toContain("Parcels leave within 3 days.");
  expect(p.textContent).toContain("<b>Unread</b> copies only.");
  expect(p.querySelector("b")).toBeNull();
  expect([...p.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/page/policy-shipping", "/page/policy-returns"]);
  await done();
});

it("hides when no policy is written and drops shipping for e-books", async () => {
  const none = await page({ showPdpPolicyTab: true }, book, {});
  expect(tab(none.el)).toBeNull();
  await none.done();
  const ebook = await page({ showPdpPolicyTab: true }, { ...book, format: "E-book" });
  await act(async () => { tab(ebook.el)!.click(); });
  expect(panel(ebook.el)?.textContent).not.toContain("Parcels leave");
  expect(panel(ebook.el)?.textContent).toContain("Returns within 30 days.");
  await ebook.done();
});
