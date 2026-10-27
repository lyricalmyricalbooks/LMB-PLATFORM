import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import live from "./__fixtures__/liveDesign.json";
import { layerDesign, STATIC_SURFACES, surfaceChain } from "./designModel";
import {
  contrastLevel, contrastRatio, DEFAULT_COLOR_SCHEMES, ELEMENT_SCHEME_TARGETS, mixColors, parseColor, resolveScheme, schemeContrast,
  schemeButtonColors, schemeCss, schemeList, schemeVars, upgradeScheme, usesAllRoles, SCHEME_ROLES,
} from "./colorSchemes";
import { storefrontOverridesCss } from "./StorefrontOverrides";
import { cartDrawerCss } from "./cartDrawerStyle";
import { productPageCss } from "./productPageStyle";
import { footerStyleCss } from "./footerStyle";

const { SectionList } = await import("../../components/sectionRender");

const design: any = (live as any).design;
/** The purple starter schemes every older design was offered before Colour schemes 2.0. */
const OLD_DEFAULTS = [
  { id: "scheme-default", name: "Default", background: "#ffffff", text: "#111111", accent: "#A855F7" },
  { id: "scheme-inverse", name: "Inverse", background: "#0a0a0a", text: "#ffffff", accent: "#A855F7" },
  { id: "scheme-accent", name: "Accent", background: "#A855F7", text: "#ffffff", accent: "#ffffff" },
];
const SAVED_LISTS: [string, any[]][] = [
  ["root", design.colorSchemes], ["heroPage", design.heroPage.colorSchemes], ["storefront", design.storefront.colorSchemes], ["old defaults", OLD_DEFAULTS],
];

const section = (settings: any = {}) => ({ id: "s1", type: "RichTextSection", visible: true, settings: { heading: "Zq", ...settings } });
const render = (props: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(SectionList, { enableAnimations: false, ...props })));
const wrapper = (html: string) => /<div[^>]*data-fm-section="s1"[^>]*>/.exec(html)?.[0] || "";
const styleOf = (tag: string) => /style="([^"]*)"/.exec(tag)?.[1] || "";
/** The wrapper style the storefront rendered before Colour schemes 2.0 for a scheme. */
const oldStyle = (scheme: any) => styleOf(renderToStaticMarkup(h("div", { style: { background: scheme?.background || undefined, color: scheme?.text || undefined } })));

describe("colour schemes saved before 2.0 render exactly as before", () => {
  it("the live design's schemes are all legacy (background + text only)", () => {
    for (const [where, list] of SAVED_LISTS) expect(list.every((s) => !usesAllRoles(s)), where).toBe(true);
  });

  it("paints each saved scheme's background and text on the section, and nothing else", () => {
    for (const [where, list] of SAVED_LISTS) {
      for (const scheme of list) {
        const tag = wrapper(render({ sections: [section({ colorSchemeId: scheme.id })], colorSchemes: list }));
        expect(styleOf(tag), `${where} ${scheme.id}`).toBe(oldStyle(scheme));
        expect(tag).toContain(`data-scheme="${scheme.id}"`);
      }
      // …and emits no scheme variables, so nothing inside the section changes either.
      expect(schemeCss({ colorSchemes: list }), where).toBe("");
    }
  });

  it("leaves a section without a scheme untouched", () => {
    const tag = wrapper(render({ sections: [section()], colorSchemes: design.colorSchemes }));
    expect(tag).not.toContain("data-scheme");
    expect(styleOf(tag)).toBe(oldStyle(null));
    // An unknown id (e.g. a deleted scheme) falls back to the page's own colours.
    const gone = wrapper(render({ sections: [section({ colorSchemeId: "scheme-gone" })], colorSchemes: design.colorSchemes }));
    expect(gone).not.toContain("data-scheme");
  });

  it("adds no CSS to any page of the published design", () => {
    for (const surface of STATIC_SURFACES) {
      const page = layerDesign(design, ...surfaceChain(surface).map((id) => design[id]));
      expect(schemeCss(page), surface).toBe("");
      expect(storefrontOverridesCss(page).includes("data-scheme"), surface).toBe(false);
    }
  });
});

describe("colour schemes 2.0", () => {
  const noir = DEFAULT_COLOR_SCHEMES.find((s) => s.id === "scheme-inverse")!;

  it("starts from Riso Noir colours, not the old purple, keeping each id's light/dark polarity", () => {
    const all = JSON.stringify(DEFAULT_COLOR_SCHEMES).toLowerCase();
    expect(all).not.toContain("#a855f7");
    expect(all).toContain("#e8402a");
    for (const s of DEFAULT_COLOR_SCHEMES) {
      expect(usesAllRoles(s)).toBe(true);
      for (const role of SCHEME_ROLES) expect(parseColor(s[role]), `${s.id}.${role}`).not.toBeNull();
      const old = OLD_DEFAULTS.find((o) => o.id === s.id)!;
      const dark = (c: string) => (contrastRatio("#ffffff", c) ?? 0) > (contrastRatio("#000000", c) ?? 0);
      expect(dark(s.background), s.id).toBe(dark(old.background));
    }
    expect(schemeList({})).toBe(DEFAULT_COLOR_SCHEMES);
  });

  it("passes WCAG AA for text, buttons and accent in every starter scheme", () => {
    for (const s of DEFAULT_COLOR_SCHEMES) {
      for (const c of schemeContrast(s)) expect(c.ratio! >= 4.5, `${s.id} ${c.label} ${c.ratio}`).toBe(true);
    }
  });

  it("emits [data-scheme] variables with the storefront's token names and comma triplets", () => {
    const css = schemeCss({ colorSchemes: [noir] });
    expect(css).toContain('[data-scheme="scheme-inverse"]{');
    expect(css).toContain("--bg-color:#000000;");
    expect(css).toContain("--fg-rgb:255, 255, 255;");
    expect(css).toContain("--accent:#e8402a;");
    expect(css).toContain("--accent-rgb:232, 64, 42;");
    expect(css).toContain("--on-accent:#100f0d;");
    expect(css).toContain("--btn-bg:#e8402a;");
    expect(css).toContain("--btn-text:#100f0d;");
    expect(css).toContain("--link-color:#ff6b55;");
    expect(css).toMatch(/--border-rgb:\d+, \d+, \d+;/);
    expect(css).not.toMatch(/-rgb:\d+ \d+/);
  });

  it("keeps owner values to one CSS value", () => {
    const vars = schemeVars({ ...noir, background: "red;}body{display:none" });
    expect(vars).not.toContain("}");
    expect(vars).not.toMatch(/;\s*body/);
  });

  it("styles book cards, the buy card and the bag only when a scheme is picked for them", () => {
    expect(schemeCss({ colorSchemes: [noir] })).not.toContain(".fm-card");
    const css = schemeCss({ colorSchemes: [noir], elementSchemes: { cards: noir.id, buyCard: noir.id, cartDrawer: noir.id, header: noir.id, footer: noir.id } });
    for (const t of Object.values(ELEMENT_SCHEME_TARGETS)) expect(css).toContain(`${t.selector}{--bg-color:#000000;`);
    expect(css).toContain(":where(.fm-card){background-color:var(--bg-color);color:var(--text-color);}");
    // A legacy scheme picked for an element uses every role (elements never had schemes before).
    const legacy = schemeCss({ colorSchemes: OLD_DEFAULTS, elementSchemes: { cartDrawer: "scheme-inverse" } });
    expect(legacy).toContain(".fm-bag[data-fm-store]{--bg-color:#0a0a0a;");
    expect(legacy).toContain(".fm-bag[data-fm-store]{background-color:var(--bg-color) !important;}");
    expect(legacy).not.toContain("[data-scheme");
    expect(schemeCss({ colorSchemes: [noir], elementSchemes: { cards: "scheme-gone" } })).not.toContain(".fm-card");
  });

  it("puts the header and footer on a scheme only when one is picked for them", () => {
    expect(schemeCss({ colorSchemes: [noir] })).not.toContain("data-fm-header");
    const css = schemeCss({ colorSchemes: [noir], elementSchemes: { header: noir.id, footer: noir.id } });
    expect(css).toContain("header[data-fm-header]{--bg-color:#000000;");
    expect(css).toContain("footer[data-fm-footer]{--bg-color:#000000;");
    expect(css).toContain(":where(header[data-fm-header]){color:var(--text-color);}");
    expect(schemeCss({ colorSchemes: [noir], elementSchemes: { header: "scheme-gone" } })).not.toContain("data-fm-header");
  });

  it("replaces the footer's own colour keys while it follows a scheme", () => {
    const own = { footerTextColor: "#123456", footerHeadingColor: "#654321", footerDividerColor: "#abcdef" };
    expect(footerStyleCss(own)).toContain("#123456");
    const schemed = footerStyleCss({ ...own, colorSchemes: [noir], elementSchemes: { footer: noir.id } });
    for (const c of ["#123456", "#654321", "#abcdef"]) expect(schemed).not.toContain(c);
    // A missing scheme leaves the footer's own colours alone.
    expect(footerStyleCss({ ...own, colorSchemes: [noir], elementSchemes: { footer: "scheme-gone" } })).toContain("#123456");
  });

  it("replaces the bag's, buy card's and card text's own colours while they follow a scheme", () => {
    const own = { cartDrawerBg: "#123456", cartDrawerBorder: "#abcdef", buttonColor: "#b7b4b4", pdpCardBg: "#654321", pdpTitleColor: "#fedcba" };
    expect(cartDrawerCss(own)).toContain(".fm-bag{background:#123456;");
    expect(productPageCss(own)).toContain("background:#654321;");
    const schemed = { ...own, colorSchemes: [noir], elementSchemes: { cartDrawer: noir.id, buyCard: noir.id } };
    const bag = cartDrawerCss(schemed), pdp = productPageCss(schemed);
    for (const hex of ["#123456", "#abcdef", "#b7b4b4"]) expect(bag, hex).not.toContain(hex);
    expect(bag).toContain(".fm-bag{background:var(--bg-color, Canvas);color:rgb(var(--fg-rgb));");
    expect(bag).toContain("background:var(--btn-bg, var(--accent));color:var(--btn-text, var(--on-accent));");
    for (const hex of ["#654321", "#fedcba"]) expect(pdp, hex).not.toContain(hex);
    // Only the bag/buy card: the other part keeps its own colours.
    expect(productPageCss({ ...own, colorSchemes: [noir], elementSchemes: { cartDrawer: noir.id } })).toContain("#654321");
    // Card title/price colour (Product cards & grid) gives way to the card scheme's text inside a card.
    const cards = schemeCss({ colorSchemes: [noir], elementSchemes: { cards: noir.id } });
    expect(cards).toContain("[data-fm-store] .fm-card .fm-card-title,[data-fm-store] .fm-card .fm-card-price-wrap{color:var(--text-color) !important;}");
  });

  it("gives buttons painted inline the scheme's button roles", () => {
    const own = { bg: "#b7b4b4", text: "#100f0d" };
    expect(schemeButtonColors({ colorSchemes: [noir] }, "buyCard", own)).toBe(own);
    const paper = DEFAULT_COLOR_SCHEMES[0];
    const d = { colorSchemes: [paper, { ...noir, buttonBg: "#123456", buttonText: "#fedcba" }], elementSchemes: { buyCard: noir.id, cards: paper.id } };
    expect(schemeButtonColors(d, "buyCard", own)).toEqual({ bg: "#123456", text: "#fedcba" });
    expect(schemeButtonColors(d, "cards", own)).toEqual({ bg: paper.buttonBg, text: paper.buttonText });
    // The buttons that set --btn-* / colours inline read them: Add to bag and the shop card's hover button.
    const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");
    expect(read("features/site/BookDetail.tsx")).toMatch(/"--btn-bg": buttonStyle === "solid" \? buyButton\.bg/);
    expect(read("features/site/BookDetail.tsx")).toContain('schemeButtonColors(tokenSource, "buyCard"');
    expect(read("components/MainSite.tsx")).toContain('schemeButtonColors(storefrontDesign, "cards"');
    expect(read("components/MainSite.tsx")).toMatch(/backgroundColor: storefrontButtonStyle === "solid" \? cardButton\.bg/);
  });

  it("reaches every storefront surface through StorefrontOverrides", () => {
    expect(storefrontOverridesCss({ colorSchemes: [noir] })).toContain('[data-scheme="scheme-inverse"]');
  });

  it("fills missing roles from background, text and accent", () => {
    const full = resolveScheme(OLD_DEFAULTS[1]);
    for (const role of SCHEME_ROLES) expect(parseColor(full[role]), role).not.toBeNull();
    expect(full.surface).toBe("#0a0a0a");
    expect(full.buttonBg).toBe("#A855F7");
    expect(upgradeScheme(OLD_DEFAULTS[1]).v).toBe(2);
    expect(mixColors("#ffffff", "#000000", 0.5)).toBe("#808080");
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("rgba(255,255,255,0.64)", "#000000")).toBeGreaterThan(7);
    expect(contrastRatio("nope", "#000")).toBeNull();
    expect([7, 4.5, 3, 2.9].map(contrastLevel)).toEqual(["AAA", "AA", "AA large", "Low"]);
  });
});

describe("parts of the shop that can follow a scheme carry its class", () => {
  const APP = join(__dirname, "..", "..");
  const read = (f: string) => readFileSync(join(APP, f), "utf8");
  it("puts fm-card on every book card that shows an fm-card-title", () => {
    // The search overlay lists results as rows, not cards.
    const files = ["components/MainSite.tsx", "components/SectionComponents.tsx", "features/site/Wishlist.tsx", "features/site/RecentlyViewedRow.tsx", "features/site/BookDetail.tsx"];
    for (const f of files) {
      const text = read(f);
      const cards = (text.match(/fm-card-title/g) || []).length;
      const roots = (text.match(/["`]fm-card\s/g) || []).length;
      expect(roots, f).toBeGreaterThanOrEqual(Math.min(cards, 1));
      expect(roots, f).toBe(f.endsWith("SectionComponents.tsx") ? 4 : 1); // Showcase grid, Product grid, Featured collection, Book spotlight
    }
  });
  it("keeps the buy card and bag classes the scheme rules target", () => {
    expect(read("features/site/BookDetail.tsx")).toContain('className="fm-pdp-card"');
    expect(read("components/CartDrawer.tsx")).toMatch(/className=\{`fm-bag /);
  });
});
