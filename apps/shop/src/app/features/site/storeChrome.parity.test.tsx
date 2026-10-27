// @vitest-environment jsdom
// Studio 2.0 · 2.1 "One header & footer": parity guard for StoreHeader / StoreFooter.
//
// `__fixtures__/storeChromeHooks.json` is the inventory of every Studio hook (data-studio-*,
// data-store-region, data-section, data-hdr-fixed), link, aria-label and aria-current that the
// header and footer rendered, per sample design, for: the shop header + whole MainSite page (home,
// catalog and collection), the standalone-page header and the footer. It was recorded from the
// implementations this milestone replaced (MainSite's own header/footer and StorefrontPageHeader) and
// matched them exactly, apart from one deliberate addition: the shop's desktop category bar now has the
// same aria-label ("Main navigation") as the page header's. If a hook disappears or changes, this test
// fails — fix the renderer; refresh the fixture (UPDATE_STORE_CHROME_HOOKS=1) only for an intended change.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", () => ({ useCart: () => ({ cartCount: 2, cartTotal: 31.5, setIsCartOpen: () => {}, addToCart: () => true, cart: [] }), catalogUnitPrice: () => 0 }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../components/sectionRender", () => ({ SectionList: () => h("i", null, "sections"), GlobalSections: () => null, GroupSections: () => null, TemplateSections: () => null }));
vi.mock("./RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));

const { default: MainSite } = await import("../../components/MainSite");
const { StoreHeader } = await import("./StoreHeader");
const { StoreFooter } = await import("./StoreFooter");
const { StoreChrome } = await import("./StoreChrome");
const { CurrencyProvider } = await import("../../CurrencyContext");

const FIXTURE = join(__dirname, "__fixtures__", "storeChromeHooks.json");
const cats = [{ id: "b", name: "Books" }, { id: "z", name: "Zines", parentId: "b" }, { id: "p", name: "Prints" }, { id: "h", name: "Hidden", showInNav: false }];
const pages = [
  { id: "a", slug: "about", title: "About", status: "published", showInNav: true },
  { id: "s", slug: "submissions", title: "Submissions", status: "published", showInNav: true },
  { id: "d", slug: "draft", title: "Draft", status: "draft", showInNav: true },
];
const books = [{ id: "bk1", title: "One", price: 10, status: "published", categories: ["Books"], stockLevel: 3 }];
const base = { categories: cats, announcementText: "Free shipping", copy: {} };
// Each design switches on a different set of header/footer options.
const DESIGNS: Record<string, any> = {
  empty: {},
  reference: { ...base, showAnnouncement: true },
  referenceNavEnd: { ...base, catalogCartPlacement: "nav-end", referenceCategoryLimit: 3, hideHeaderSearch: true, hideAdminLink: true },
  modern: { ...base, catalogLayoutStyle: "modern", showAnnouncement: true, menus: { header: [{ id: "m", label: "Events", type: "url", value: "https://x.test" }] } },
  modernCenter: { ...base, catalogLayoutStyle: "modern", logoPosition: "center", navStyle: "stickers", announcementScrolling: true, showAnnouncement: true, transparentHeader: true, stickyHeader: false, buttonStyle: "outline" },
  modernRight: { ...base, catalogLayoutStyle: "modern", logoPosition: "right", navFlatSubcategories: true, hideHeaderSearch: true, hideHeaderWishlist: true, hideHeaderAccount: true, hideCurrencySelector: true, hideThemeToggle: true, hideCartButton: true, hideAdminLink: true, showMobileNavigation: false, showSecondaryNavigation: false },
  modernPageOverrides: { ...base, catalogLayoutStyle: "modern", headerBg: "#112233", headerColor: "#eeeeee", storefront: { headerStyle: "full", showAnnouncement: true, announcementBg: "#ff0000", cartLabel: "Cart" }, customerAccounts: false, secondaryNavKeys: [], navOrder: ["page:about", "cat:p", "cat:b"] },
  footerColumns: { ...base, footerNavigationLayout: "columns", footerBadges: ["visa", "paypal"], social: { instagram: "" } },
  footer4: { ...base, footerNavigationLayout: "columns", footerLayout: "4col", footerColumns: false, showPaymentBadges: false, footerBg: "#000011", showPoweredBy: true },
  footerGroupedOff: { ...base, showFooterExplore: false, showFooterLocation: false, showFooterLegalHeading: false, menus: { footer: [{ id: "f", label: "Journal", type: "page", value: "journal", footerGroup: "connect" }] }, wordmarkStyle: "two-part" },
};
const policies = { shipping: "Ships", returns: "Returns" };
const settingsFor = (design: any) => ({ design, policies, info: { email: "shop@example.com", description: "About us" } });

// React 19's server renderer adds <link rel="preload"> hints for images; they are not Studio hooks.
const render = (el: any, path = "/") => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(CurrencyProvider, null, el)))
  .replace(/<link rel="preload"[^>]*>/g, "");
const HOOK = /\s(data-studio-[\w-]+|data-store-region|data-section|data-hdr-fixed|aria-label|aria-current|href)="([^"]*)"/g;
/** Every hook as "attribute=value ×count", sorted — order-free, but a lost duplicate still shows. */
function hooks(html: string): string[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(HOOK)) counts.set(`${m[1]}=${m[2]}`, (counts.get(`${m[1]}=${m[2]}`) || 0) + 1);
  return [...counts].map(([k, n]) => `${k} ×${n}`).sort();
}

function renderAll(): Record<string, string[]> {
  localStorage.setItem("fm_wishlist_v1", JSON.stringify(["bk1"]));
  const out: Record<string, string[]> = {};
  for (const [name, design] of Object.entries(DESIGNS)) {
    const settings = settingsFor(design);
    site.data = { settings, pages, books, loading: false, fresh: true };
    out[`page:${name}`] = hooks(render(h(StoreHeader, { design, pages, books } as any), "/page/about"));
    out[`footer:${name}`] = hooks(render(h(StoreFooter, { settings, pages })));
    for (const showCatalog of [false, true]) out[`main:${name}:${showCatalog}`] = hooks(render(h(MainSite, { showCatalog, setShowCatalog: () => {} })));
    out[`maincoll:${name}`] = hooks(render(h(Routes, null, h(Route, { path: "/collections/:slug", element: h(MainSite, { showCatalog: true, setShowCatalog: () => {} }) })), "/collections/books"));
  }
  return out;
}

describe("one header & footer: every Studio hook survives the merge", () => {
  it("renders the recorded hooks for every sample design and surface", () => {
    const actual = renderAll();
    if (process.env.UPDATE_STORE_CHROME_HOOKS) writeFileSync(FIXTURE, JSON.stringify(actual, null, 1) + "\n");
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) expect(actual[key], key).toEqual(expected[key]);
  });

  it("keeps the header parts Studio's structure scan and click-to-edit rely on", () => {
    const design = DESIGNS.modern;
    site.data = { settings: settingsFor(design), pages, books, loading: false, fresh: true };
    for (const html of [render(h(StoreHeader, { design, pages, books } as any)), render(h(MainSite, { showCatalog: true, setShowCatalog: () => {} }))]) {
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      for (const label of ["Header", "Logo", "Category bar", "Header icons &amp; cart", "Mobile navigation", "Publisher navigation"]) {
        expect(header, label).toContain(`data-studio-label="${label}"`);
      }
      expect(html).toContain('data-studio-label="Announcement bar"');
    }
  });
});

describe("header and footer colour schemes (Theme settings › Colour schemes)", () => {
  const noir = { id: "noir", name: "Noir", v: 2, background: "#000000", surface: "#111111", text: "#ffffff", muted: "#999999", accent: "#ff0000", onAccent: "#000000", border: "#333333", buttonBg: "#ffffff", buttonText: "#000000", link: "#ffffff" };
  const headerOf = (html: string) => html.slice(html.indexOf("<header"), html.indexOf(">", html.indexOf("<header")) + 1);
  it("paints the header and footer from the scheme instead of their own colours while one is picked", () => {
    for (const layout of ["reference", "modern"]) {
      const own = { ...base, catalogLayoutStyle: layout, headerBg: "#123456", headerColor: "#abcdef", footerBg: "#654321" };
      site.data = { settings: settingsFor(own), pages, books, loading: false, fresh: true };
      const plain = render(h(MainSite, { showCatalog: true, setShowCatalog: () => {} }));
      expect(headerOf(plain), layout).toContain("data-fm-header");
      expect(headerOf(plain), layout).toContain("#123456");
      const schemed = { ...own, colorSchemes: [noir], elementSchemes: { header: "noir", footer: "noir" } };
      site.data = { settings: settingsFor(schemed), pages, books, loading: false, fresh: true };
      const html = render(h(MainSite, { showCatalog: true, setShowCatalog: () => {} }));
      expect(headerOf(html), layout).toContain("var(--bg-color)");
      expect(headerOf(html), layout).not.toContain("#123456");
      const footer = render(h(StoreFooter, { settings: settingsFor(schemed), pages }));
      expect(footer).toContain("background-color:var(--bg-color)");
      expect(footer).not.toContain("#654321");
    }
    // Every part inside the header gives way too: logo text, rules and the phone menu's drop-down tab.
    for (const layout of ["reference", "modern"]) {
      const own = { ...base, catalogLayoutStyle: layout, logoColor: "#ff00aa", headerColor: "#aa00ff", borderColor: "#00ffaa", colorSchemes: [noir], elementSchemes: { header: "noir" } };
      site.data = { settings: settingsFor(own), pages, books, loading: false, fresh: true };
      const html = render(h(MainSite, { showCatalog: true, setShowCatalog: () => {} }));
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      for (const colour of ["#ff00aa", "#aa00ff", "#00ffaa"]) expect(header, `${layout} ${colour}`).not.toContain(colour);
      // Without the scheme the same design does paint those colours (so the check above means something).
      site.data = { settings: settingsFor({ ...own, elementSchemes: {} }), pages, books, loading: false, fresh: true };
      const plain = render(h(MainSite, { showCatalog: true, setShowCatalog: () => {} }));
      expect(plain.slice(plain.indexOf("<header"), plain.indexOf("</header>")), layout).toContain("#ff00aa");
    }
    const pageDesign = { ...base, headerBg: "#123456", logoColor: "#ff00aa", headerColor: "#aa00ff", colorSchemes: [noir], elementSchemes: { header: "noir" } };
    site.data = { settings: settingsFor(pageDesign), pages, books, loading: false, fresh: true };
    const page = render(h(StoreHeader, { design: pageDesign, pages, books } as any), "/page/about");
    expect(headerOf(page)).toContain("var(--bg-color)");
    expect(headerOf(page)).not.toContain("#123456");
    const pageHeader = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
    for (const colour of ["#ff00aa", "#aa00ff"]) expect(pageHeader, colour).not.toContain(colour);
  });
});

describe("wishlist, account, tracking and 404 pages get the shop header and footer", () => {
  const Page = () => h("main", null, "page body");
  const chrome = (design: any, surface: any) => {
    site.data = { settings: settingsFor(design), pages, books, loading: false, fresh: true };
    return render(h(StoreChrome, { surface }, h(Page)));
  };
  it.each(["wishlistPage", "accountPage", "trackingPage", "page404"])("%s: header, footer and the page inside", (surface) => {
    const html = chrome(DESIGNS.modern, surface);
    expect(html).toContain('data-studio-label="Header"');
    expect(html).toContain('data-studio-label="Category bar"');
    expect(html).toContain('data-studio-label="Footer"');
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("page body"));
    expect(html.indexOf("page body")).toBeLessThan(html.indexOf("<footer"));
  });
  it("Style › Header › “Show the shop header & footer…” off leaves only the page (also honours a page canvas value)", () => {
    expect(chrome({ ...DESIGNS.modern, showStoreChromeOnUtilityPages: false }, "wishlistPage")).not.toContain("<header");
    const onePage = { ...DESIGNS.modern, accountPage: { showStoreChromeOnUtilityPages: false } };
    expect(chrome(onePage, "accountPage")).not.toContain("<footer");
    expect(chrome(onePage, "wishlistPage")).toContain("<footer");
  });
  it("waits for the site data instead of flashing an empty header", () => {
    site.data = { settings: undefined, pages: [], books: [], loading: true, fresh: false };
    expect(render(h(StoreChrome, { surface: "wishlistPage" }, h(Page)))).not.toContain("<header");
  });
});

describe("one implementation", () => {
  const ROOT = join(__dirname, "..", "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "admin" ? [] : files(p)) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
  const sources = files(ROOT).map((file) => ({ file: file.slice(ROOT.length + 1), text: readFileSync(file, "utf8") }));
  it("renders the storefront header and footer only from StoreHeader / StoreFooter (checkout keeps its own)", () => {
    expect(sources.filter((s) => /<header\s+data-section="navigation"/.test(s.text)).map((s) => s.file)).toEqual(["features/site/StoreHeader.tsx"]);
    expect(sources.filter((s) => /regionProps\("footerPanel"\)/.test(s.text)).map((s) => s.file)).toEqual(["features/site/StoreFooter.tsx"]);
    expect(sources.filter((s) => /<StorefrontPageHeader\b|function SiteFooter\b/.test(s.text))).toEqual([]);
    expect(sources.find((s) => s.file === "Checkout.tsx")?.text).toContain('regionProps("checkoutHeader")');
  });
});
