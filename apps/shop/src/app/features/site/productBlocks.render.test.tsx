// @vitest-environment jsdom
// Studio 2.9: the buy card follows Page layout › Buy box blocks — order, hiding, added blocks and per-template lists.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
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
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");

const book = { id: "b1", slug: "night", title: "Night Pages", status: "published", stockLevel: 5, retailPrice: 30, categories: ["Books"], photos: [{ id: "p", url: "https://x/1.jpg" }], authorName: "A. Writer", isOnSale: true, salePrice: 20, saleEndsAt: "2099-12-31", custom: { series: "The Night Series" }, templateId: "poetry" };

async function card(design: any): Promise<HTMLElement> {
  site.data = { books: [book], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ["/books/night"] }, h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  (el as any).__root = root;
  return el.querySelector(".fm-pdp-card") as HTMLElement;
}
const order = (c: HTMLElement) => [...c.querySelectorAll(".fm-pdp-tag:not(.fm-pdp-badge), .fm-pdp-title, .fm-pdp-price, [data-section=buttons], [data-pdp-block]")]
  .map(e => e.getAttribute("data-pdp-block") ? `custom:${e.getAttribute("data-pdp-block")}` : e.classList.contains("fm-pdp-tag") ? "tag" : e.classList.contains("fm-pdp-title") ? "title" : e.classList.contains("fm-pdp-price") ? "price" : "buy");

describe("buy box blocks on the product page", () => {
  it("follows the saved order, skips hidden blocks and shows added ones with the book's details", async () => {
    const c = await card({ productPage: { productInfoBlocks: [
      { id: "b", type: "buy" }, { id: "heading", type: "heading" },
      { id: "series", type: "text", settings: { text: "Book of {{book.custom.series}}" } },
      { id: "tag", type: "tag", hidden: true },
      { id: "d", type: "divider" },
      { id: "note", type: "collapsible", settings: { heading: "Shipping & returns", body: "Two days." } },
      { id: "badge", type: "badge", settings: { label: "Staff pick", tone: "success" } },
      { id: "price", type: "price" },
    ] } });
    expect(order(c)).toEqual(["buy", "title", "custom:series", "custom:note", "custom:badge", "price"]);
    expect(c.querySelector("[data-pdp-block=series]")?.textContent).toBe("Book of The Night Series");
    expect(c.querySelector("details summary")?.textContent).toBe("Shipping & returns");
    expect(c.querySelectorAll(".fm-pdp-card-section")).toHaveLength(5); // ruled rows: title and price get their own rows
    expect(c.querySelector(".fm-pdp-tag:not(.fm-pdp-badge)")).toBeNull();
  });
  it("leaves out an added block whose connected detail is missing when Hide when empty is on", async () => {
    const c = await card({ productPage: { productInfoBlocks: [
      { id: "heading", type: "heading" }, { id: "b", type: "buy" },
      { id: "miss", type: "text", settings: { text: { $dyn: "book.custom.translator" }, hideWhenEmpty: true } },
      { id: "field", type: "customField", settings: { fieldKey: "series", label: "Series" } },
    ] } });
    expect(c.querySelector("[data-pdp-block=miss]")).toBeNull();
    expect(c.querySelector("[data-pdp-block=field]")?.textContent).toBe("SeriesThe Night Series");
  });
  it("uses the book's alternate template's own list and its own visibility settings", async () => {
    const c = await card({
      alternateTemplates: { productPage: [{ id: "poetry", name: "Poetry" }] },
      "productPage~poetry": {
        productInfoBlocks: [{ id: "heading", type: "heading" }, { id: "price", type: "price" }, { id: "b", type: "buy" }],
        regions: { productSaleEndsVisible: false },
      },
    });
    expect(order(c)).toEqual(["title", "price", "buy"]);
    expect(c.querySelector("[data-store-region=productSaleEnds]")).toBeNull(); // the template's own visibility applies
  });
  it("shows the old price and the Save badge as click-to-edit parts that Studio can hide", async () => {
    const shown = await card({});
    expect(shown.querySelector("[data-store-region=productOldPrice]")?.textContent).toContain("30");
    expect(shown.querySelector("[data-store-region=productSaveBadge]")?.getAttribute("data-studio-target")).toBe("style:productContent|copy:Product page");
    const hidden = await card({ productPage: { regions: { productOldPriceVisible: false, productSaveBadgeVisible: false } } });
    expect(hidden.querySelector("[data-store-region=productOldPrice]")).toBeNull();
    expect(hidden.querySelector("[data-store-region=productSaveBadge]")).toBeNull();
    expect(hidden.querySelector(".fm-pdp-price")).not.toBeNull();
  });
});
