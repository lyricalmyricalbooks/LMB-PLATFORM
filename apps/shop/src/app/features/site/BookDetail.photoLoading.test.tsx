// @vitest-environment jsdom
// Book page photos (Firebase Storage downloads): a photo's frame shape comes from the width/height saved with it, so
// the page no longer downloads every gallery photo just to measure it. The rest of the gallery loads ahead only once
// the shopper reaches for the photos, and the main photo asks for a copy sized to its frame, not 900px.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

// Every `new Image()` BookDetail makes to load a photo ahead.
const loadedAhead: { src: string; sizes: string }[] = [];
const RealImage = globalThis.Image;
beforeEach(() => {
  loadedAhead.length = 0;
  (globalThis as any).Image = class {
    sizes = ""; srcset = ""; decoding = ""; onload: any = null;
    set src(value: string) { loadedAhead.push({ src: value, sizes: this.sizes }); }
  };
});
afterEach(() => { (globalThis as any).Image = RealImage; });

const photo = (n: number, sized = true) => ({
  id: `p${n}`,
  url: `https://cdn.test/${n}-2400w.webp`,
  srcset: [{ url: `https://cdn.test/${n}-480w.webp`, w: 480 }, { url: `https://cdn.test/${n}-960w.webp`, w: 960 }, { url: `https://cdn.test/${n}-2400w.webp`, w: 2400 }],
  ...(sized ? { width: 2400, height: 3200 } : {}),
});

async function page(design: any, photos: any[]) {
  const book = { id: "b", slug: "b", title: "Book", status: "published", stockLevel: 5, trackInventory: true, retailPrice: 30, photos };
  site.data = { books: [book], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ["/books/b"] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  const reach = async () => {
    const column = el.querySelector('[data-section="products"]')!;
    await act(async () => { column.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
  };
  return { el, reach, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

it("adaptive frames read each photo's saved shape and load the gallery only when the shopper reaches for it", async () => {
  const { el, reach, done } = await page({ productImageFrameMode: "orientation" }, [photo(1), photo(2), photo(3), photo(4)]);
  expect(loadedAhead).toEqual([]);
  await reach();
  expect(loadedAhead.map((x) => x.src)).toEqual([1, 2, 3, 4].map((n) => `https://cdn.test/${n}-2400w.webp`));
  // Same sizes as the strip's photos, so the browser picks the same copy.
  expect(new Set(loadedAhead.map((x) => x.sizes))).toEqual(new Set(["(max-width: 560px) 100vw, 616px"]));
  const main = el.querySelector<HTMLImageElement>(".fm-pdp-frame img[srcset]")!;
  expect(main.getAttribute("sizes")).toBe("(max-width: 560px) 100vw, 616px");
  await done();
});

it("a photo saved without its size is still loaded straight away, to measure it", async () => {
  const { reach, done } = await page({ productImageFrameMode: "exact" }, [photo(1), photo(2, false), photo(3)]);
  expect(loadedAhead.map((x) => x.src)).toEqual(["https://cdn.test/2-2400w.webp"]);
  await reach();
  expect(loadedAhead.slice(1).map((x) => x.src)).toEqual([1, 2, 3].map((n) => `https://cdn.test/${n}-2400w.webp`));
  await done();
});

it("fixed frames load nothing ahead beyond the strip's neighbours, as before", async () => {
  const { reach, done } = await page({}, [photo(1), photo(2, false), photo(3)]);
  await reach();
  expect(loadedAhead).toEqual([]);
  await done();
});
