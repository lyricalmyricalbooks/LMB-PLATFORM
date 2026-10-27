import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";


// Empty sections may show "how to fill me" samples in the Studio preview, but never to shoppers.
const SAMPLES = ["Describe your value.", "An incredible independent shop.", "Sample question?", "Use this rich text section", "Add an article", "Add columns", "Your page text appears here"];
const TYPES = ["FeatureGridSection", "TestimonialsSection", "FAQSection", "RichTextSection", "BlogPostsSection", "RowSection", "PageContentSection"];

const render = async (search: string) => {
  vi.stubGlobal("window", { location: { search, href: "http://x/" + search, origin: "http://x" } });
  const S: any = await import("./SectionComponents");
  return TYPES.filter((t) => S[t]).map((t) => renderToStaticMarkup(createElement(S[t], { settings: {}, enableAnimations: false, books: [] }))).join("\n");
};

describe("sample section content", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is hidden on the live storefront", async () => {
    const html = await render("");
    for (const s of SAMPLES) expect(html).not.toContain(s);
  });
  it("still guides the owner in the Studio preview", async () => {
    expect(await render("?preview=true")).toContain("Sample question?");
  });
});
