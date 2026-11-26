// Every starter must look different from every other on every page, not just in colour (frame designs plan,
// 26 November 2026). A starter's look is eight parts: header, product page, product cards, shop page, footer, bag,
// type and background. Any two starters may share at most two of them, and no two share a heading typeface.
// Adding a starter: give it a mix no other starter has (docs/agent-notes/studio.md › Frame designs).
import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";
import { STARTER_SITES } from "../lookGallery";

const starters = STARTER_SITES.map(id => (THEME_LIBRARY as any[]).find(t => t.id === id));
const parts = (t: any) => {
  const g = t.global || {};
  return {
    header: g.headerLayout || "",
    productPage: g.pdpLayout || "",
    cards: g.cardDesign || "",
    shopPage: g.shopPageLayout || "",
    footer: g.footerDesign || "",
    bag: g.cartDrawerSide || "right",
    type: `${g.headingFont}/${g.bodyFont}`,
    background: String(g.backgroundColor || "").toLowerCase(),
  };
};

describe("starters look different from each other", () => {
  it("finds every starter", () => {
    starters.forEach((t, i) => expect(t, STARTER_SITES[i]).toBeTruthy());
  });
  it("any two starters share at most two of the eight parts", () => {
    const clashes: string[] = [];
    starters.forEach((a, i) => starters.slice(i + 1).forEach(b => {
      const pa = parts(a), pb = parts(b);
      const same = (Object.keys(pa) as (keyof typeof pa)[]).filter(k => pa[k] === pb[k]);
      if (same.length > 2) clashes.push(`${a.id} and ${b.id} share ${same.join(", ")}`);
    }));
    expect(clashes).toEqual([]);
  });
  it("no two starters share a heading typeface", () => {
    const fonts = starters.map(t => t.global.headingFont);
    expect(new Set(fonts).size).toBe(fonts.length);
  });
  it("every starter picks its own frame, not the default one", () => {
    starters.forEach(t => {
      const p = parts(t);
      const chosen = [p.productPage, p.cards, p.shopPage, p.footer].filter(Boolean).length + (p.bag !== "right" ? 1 : 0);
      expect(chosen, t.id).toBeGreaterThanOrEqual(2);
    });
  });
});
