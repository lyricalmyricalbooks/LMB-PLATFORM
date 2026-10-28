// @vitest-environment jsdom
// Plan 1.25: every section and book page block draws under every theme, and its words stay readable. Each theme in
// the library (and the shop's starting look) is applied the way Studio's Apply does it; then every section Studio can
// add, the theme's own layout and a book page with every buy-box block are rendered with sample books, and their
// colours are checked (themeReadability.ts). A new theme, section or block is covered with no change here.
import { act, createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, StaticRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("../../features/site/useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../features/site/RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("../../features/site/ReviewsSection", () => ({ default: () => null }));
vi.mock("../../features/site/StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("../../features/site/StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { SectionList } = await import("../../components/sectionRender");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { CartProvider } = await import("../../CartContext");
const { SECTION_REGISTRY } = await import("../ThemeEditorExtensions");
const { THEME_LIBRARY } = await import("./themeLibrary");
const { presetSections } = await import("./presetContent");
const { defaultSettings } = await import("../defaultSettings");
const { BUILT_IN_BLOCKS, CUSTOM_BLOCKS } = await import("../../features/site/productBlocks");
const { default: BookDetail } = await import("../../features/site/BookDetail");
const { markupProblems, pairProblems, themeColourPairs } = await import("./themeReadability");
const { themedDesign } = await import("./themeLook");

const photo = (n: number) => [{ id: `p${n}`, url: `https://example.com/${n}.jpg` }];
const BOOKS = [
  { id: "b1", slug: "salt-hours", title: "Salt Hours", authorName: "Zoe Moss", retailPrice: 30, salePrice: 20, isOnSale: true, stockLevel: 5, status: "published", isFeatured: true, featured: true, categories: ["Publications"], photos: photo(1), description: "<p>Poems about tides.</p>", format: "Paperback", pageCount: 120 },
  { id: "b2", slug: "night-songs", title: "Night Songs", authorName: "A. Poet", retailPrice: 25, stockLevel: 3, status: "published", isFeatured: true, featured: true, categories: ["Zines"], photos: photo(2), variants: [{ id: "v1", name: "Paperback", price: 25, stockLevel: 3 }, { id: "v2", name: "Hardcover", price: 45, stockLevel: 2 }], addOns: [{ id: "a1", label: "Signed copy", price: 5, kind: "option" }] },
];

const BASE = defaultSettings().design;
const THEMES: any[] = [{ id: "starting-look", name: "The starting look" }, ...(THEME_LIBRARY as any[])];
const designFor = (theme: any) => (theme.id === "starting-look" ? BASE : themedDesign(theme, BASE));

function renderSections(sections: any[], design: any): HTMLElement {
  const html = renderToStaticMarkup(
    h(StaticRouter, { location: "/" },
      h(CurrencyProvider, null,
        h(CartProvider, null,
          h(SectionList, { sections, books: BOOKS, design, enableAnimations: false, colorSchemes: design.colorSchemes })))),
  );
  const box = document.createElement("div");
  box.innerHTML = html;
  return box;
}

const section = (type: string, settings: any = {}, i = 0) => ({ id: `s${i}-${type}`, type, settings: { ...(SECTION_REGISTRY.find((m: any) => m.type === type)?.defaults || {}), ...settings } });

describe("every theme keeps every section and book page block readable (plan 1.25)", () => {
  describe.each(THEMES.map((t) => [t.name, t] as const))("%s", (name, theme) => {
    const design = designFor(theme);

    it("paints words in colours that read on what is behind them", () => {
      expect(pairProblems(themeColourPairs(design), name)).toEqual([]);
    });

    it("draws every section Studio can add, with readable words", () => {
      const empty: string[] = [];
      const problems: string[] = [];
      (SECTION_REGISTRY as any[]).forEach((meta, i) => {
        const box = renderSections([section(meta.type, { productSource: "all" }, i)], design);
        if (!box.textContent?.trim() && !box.querySelector("img,video,iframe,form,input,canvas")) empty.push(meta.type);
        problems.push(...markupProblems(box, design, `${name} › ${meta.label}`));
      });
      expect(empty).toEqual([]);
      expect(problems).toEqual([]);
    });

    it("draws its own layout with readable words", () => {
      const problems: string[] = [];
      for (const [template, specs] of Object.entries(presetSections(theme))) {
        const box = renderSections(specs.map((s: any, i: number) => section(s.type, s.settings, i)), design);
        problems.push(...markupProblems(box, design, `${name} › ${template}`));
      }
      expect(problems).toEqual([]);
    });

    it("draws a book page with every buy-box block, with readable words", async () => {
      const blocks = [
        ...BUILT_IN_BLOCKS.map((b) => ({ id: b.type, type: b.type })),
        ...CUSTOM_BLOCKS.map((b) => ({ id: b.type, type: b.type, settings: b.defaults })),
        { id: "divider", type: "divider" },
      ];
      const pageDesign = { ...design, productPage: { ...(design.productPage || {}), productInfoBlocks: blocks } };
      site.data = { books: BOOKS, settings: { design: pageDesign, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
      const el = document.createElement("div");
      document.body.appendChild(el);
      const root: Root = createRoot(el);
      await act(async () => {
        root.render(h(MemoryRouter, { initialEntries: ["/books/night-songs"] },
          h(CurrencyProvider, null, h(CartProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) }))))));
      });
      const card = el.querySelector(".fm-pdp-card");
      expect(card, "the buy box drew").toBeTruthy();
      expect(card!.textContent).toContain("Night Songs");
      expect(card!.textContent).toContain("Signed copy");
      const problems = markupProblems(el, pageDesign, `${name} › book page`);
      await act(async () => root.unmount());
      el.remove();
      expect(problems).toEqual([]);
    });
  });
});
