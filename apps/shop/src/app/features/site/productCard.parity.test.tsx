// @vitest-environment jsdom
// Studio 2.9 "Product information as blocks": parity guard for the product page buy card (.fm-pdp-card).
//
// `__fixtures__/productCardDom.json` holds the buy card's markup for a set of books and designs, recorded from the
// hand-written card before it became a list of blocks. With no `productInfoBlocks` set, the block renderer must give
// exactly the same markup. Refresh (UPDATE_PRODUCT_CARD=1) only for an intended change.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

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
// No network in tests: exchange rates fall back to the static table straight away.
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");

const FIXTURE = join(__dirname, "__fixtures__", "productCardDom.json");
const photo = [{ id: "p1", url: "https://example.com/1.jpg" }];
const base = { status: "published", stockLevel: 5, retailPrice: 30, categories: ["Books"], photos: photo, authorName: "A. Writer", description: "<p>About it.</p>", format: "Paperback", isbn: "9780000000002", language: "English", pageCount: 120, publisher: "Lyricalmyrical" };
const BOOKS: Record<string, any> = {
  plain: { ...base, id: "plain", slug: "plain", title: "Plain Book", subtitle: "A subtitle" },
  sale: { ...base, id: "sale", slug: "sale", title: "Sale Book", isOnSale: true, salePrice: 20, saleEndsAt: "2099-12-31" },
  editions: { ...base, id: "editions", slug: "editions", title: "Editions Book", variants: [{ id: "v1", name: "Paperback", price: 25, stockLevel: 3 }, { id: "v2", name: "Hardcover", price: 45, stockLevel: 2 }] },
  addons: { ...base, id: "addons", slug: "addons", title: "Add-on Book", addOns: [{ id: "a1", label: "Signed copy", price: 5, kind: "option" }, { id: "a2", label: "Inscription", price: 8, kind: "text", maxLength: 40 }] },
  gift: { ...base, id: "gift", slug: "gift", title: "Gift Card", productType: "giftCard", variants: [{ id: "g25", name: "CA$25", price: 25 }, { id: "g50", name: "CA$50", price: 50 }] },
  boxset: { ...base, id: "boxset", slug: "boxset", title: "Box Set", bundleItems: [{ bookId: "plain", quantity: 1 }, { bookId: "sale", quantity: 1 }] },
  preorder: { ...base, id: "preorder", slug: "preorder", title: "Pre-order Book", preorder: true, publishDate: "2099-01-01" },
  soldout: { ...base, id: "soldout", slug: "soldout", title: "Sold Out Book", stockLevel: 0 },
};
const DESIGNS: Record<string, any> = {
  default: {},
  everything: { showQtyStepper: true, showSocialShare: true, showBackInStock: true, productDetailsLayout: "sections", pdpTagStyle: "plain" },
  minimal: { pdpShowTag: false, pdpShowStock: false, productDetailsLayout: "accordions" },
};

async function cardFor(book: any, design: any): Promise<string> {
  site.data = { books: Object.values(BOOKS), settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [`/books/${book.slug}`] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  const html = el.querySelector(".fm-pdp-card")?.outerHTML || "(no card)";
  await act(async () => root.unmount());
  el.remove();
  return html;
}

async function renderAll() {
  const out: Record<string, string> = {};
  for (const [dn, design] of Object.entries(DESIGNS)) for (const [bn, book] of Object.entries(BOOKS)) out[`${dn}:${bn}`] = await cardFor(book, design);
  return out;
}

describe("product page buy card parity", () => {
  it("renders the same buy card as before it was made of blocks", async () => {
    const now = await renderAll();
    if (process.env.UPDATE_PRODUCT_CARD || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + "\n");
      if (!process.env.UPDATE_PRODUCT_CARD) throw new Error("fixture recorded for the first time — rerun");
    }
    const recorded = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(now).sort()).toEqual(Object.keys(recorded).sort());
    for (const key of Object.keys(recorded)) expect(now[key], key).toBe(recorded[key]);
  });
});
