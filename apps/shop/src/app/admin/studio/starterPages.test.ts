import { describe, expect, it } from "vitest";
import { productBlocks } from "../../features/site/productBlocks";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { applyPresetSections, hasPresetContent, presetContentSummary } from "./presetContent";
import { themeProblems } from "./themeCheck";

// Starter websites step 3: a starter can shape every page, including what sits under the header and above the footer on
// every page, and the book page's buy box.
const starter = {
  id: "t", name: "Test starter",
  content: {
    sections: {
      headerSections: [{ type: "MarqueeSection", settings: { text: "New books every week" } }],
      globalSections: [{ type: "NewsletterSection", settings: { align: "center" } }],
      productPage: [{ type: "TestimonialsSection" }],
      cartPage: [{ type: "RichTextSection" }],
    },
    productBlocks: [{ type: "heading" }, { type: "price" }, { type: "badge", settings: { label: "Staff pick" } }, { type: "buy" }, { type: "details", hidden: true }],
  },
};

describe("starters shape every page", () => {
  it("puts group sections in the every-page lists and page sections on their pages", () => {
    const d = applyPresetSections({ globalSections: [{ id: "old", type: "FAQSection", settings: {} }] }, starter, getSectionMeta, t => t.replace("books", "goods"));
    expect(d.headerSections.map((s: any) => s.type)).toEqual(["MarqueeSection"]);
    expect(d.headerSections[0].settings.text).toBe("New goods every week");
    expect(d.globalSections.map((s: any) => s.type)).toEqual(["NewsletterSection"]);
    expect(d.productPage.sections.map((s: any) => s.type)).toEqual(["TestimonialsSection"]);
    expect(d.cartPage.sections.map((s: any) => s.type)).toEqual(["RichTextSection"]);
    expect(d.headerSections.sections).toBeUndefined();
  });

  it("lays out the buy box, keeping the required blocks", () => {
    const d = applyPresetSections({ productPage: { sections: [] } }, starter, getSectionMeta);
    const shown = productBlocks(d.productPage).filter(b => !b.hidden).map(b => b.type);
    expect(shown.slice(0, 4)).toEqual(["heading", "price", "badge", "buy"]);
    expect(d.productPage.sections.map((s: any) => s.type)).toEqual(["TestimonialsSection"]);
  });

  it("passes the theme check, says what it replaces, and refuses unknown or hidden-required blocks", () => {
    expect(themeProblems(starter)).toEqual([]);
    expect(hasPresetContent({ content: { productBlocks: [{ type: "buy" }] } })).toBe(true);
    const lines = presetContentSummary({ globalSections: [{ id: "a" }, { id: "b" }] }, starter, []);
    expect(lines.join("\n")).toMatch(/Above the footer \(every page\): its 1 sections replace your 2 current sections/);
    expect(lines.join("\n")).toMatch(/buy box/);
    const bad = { name: "Bad", content: { productBlocks: [{ type: "zz" }, { type: "buy", hidden: true }] } };
    expect(themeProblems(bad)).toHaveLength(2);
  });
});
