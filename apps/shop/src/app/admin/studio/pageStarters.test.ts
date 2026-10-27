import { describe, expect, it } from "vitest";
import { PAGE_STARTERS, pageFromStarter, uniqueSlug } from "./pageStarters";

describe("page starters", () => {
  it("each has its own slug, no pasted pictures and prompts in brackets", () => {
    const slugs = PAGE_STARTERS.filter(s => s.id !== "blank").map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of PAGE_STARTERS) {
      expect(s.body).not.toContain("data:");
      expect(s.body).not.toMatch(/<(script|iframe|img)/i);
      if (s.id !== "blank") expect(s.body).toMatch(/\[[^\]]+\]/);
      for (const heading of s.outline) expect(s.body).toContain(heading);
    }
  });
  it("opens every starter but Blank as a draft, so prompts never reach shoppers", () => {
    for (const s of PAGE_STARTERS) expect(pageFromStarter(s, []).status).toBe(s.id === "blank" ? "published" : "draft");
    expect(pageFromStarter(PAGE_STARTERS[0], [])).toMatchObject({ title: "", slug: "", body: "", showInNav: true });
  });
  it("opens Stockists as a footer-only page", () => {
    const stockists = PAGE_STARTERS.find(s => s.id === "stockists")!;
    expect(pageFromStarter(stockists, [])).toMatchObject({ slug: "stockists", showInNav: false, showInFooter: true, status: "draft" });
    expect(pageFromStarter(PAGE_STARTERS[0], []).showInFooter).toBe(false);
  });
  it("never reuses a slug another page has", () => {
    expect(uniqueSlug("about", [{ slug: "about" }, { slug: "about-2" }])).toBe("about-3");
    expect(uniqueSlug("faq", [{ slug: "about" }])).toBe("faq");
    expect(uniqueSlug("", [{ slug: "" }])).toBe("");
    const faq = PAGE_STARTERS.find(s => s.id === "faq")!;
    expect(pageFromStarter(faq, [{ slug: "faq" }, { slug: "x" }])).toMatchObject({ slug: "faq-2", order: 2 });
  });
});
