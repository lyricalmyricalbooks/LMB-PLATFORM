import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";
import { STARTER_PAGES, starterPageSections } from "./starterPages";
import { presetPagesToAdd, presetSections } from "./presetContent";
import { STARTER_SITES } from "../lookGallery";
import { existsSync } from "node:fs";

// Plan "Starters on par", step 2 (owner's yes, 26 November 2026): every starter's About, Contact and Shipping pages are
// written for its made-up brand, never bracketed prompts, and real shops get them as drafts marked Sample.
describe("each starter's own pages", () => {
  it("covers every starter", () => expect(Object.keys(STARTER_PAGES).sort()).toEqual([...STARTER_SITES].sort()));

  describe.each(STARTER_SITES.map((id) => [id]))("%s", (id) => {
    const look: any = THEME_LIBRARY.find((t: any) => t.id === id);
    const set = STARTER_PAGES[id];
    it("writes every starter page it brings in its own words: no prompts, no email address, no reviews", () => {
      for (const pageId of look.content.starterPages) {
        const words = set.words[pageId as "about"];
        expect(words, `${id} ${pageId}`).toMatch(/<h2>/);
        expect(words).not.toMatch(/\[|\]|@|review|★|Example/i);
      }
    });
    it("adds its pages as drafts with its own words, marked Sample", () => {
      for (const page of presetPagesToAdd(look, [])) {
        expect(page.status).toBe("draft");
        expect((page as any).sample, page.slug).toBe(true);
        expect(page.body).not.toMatch(/\[/);
      }
    });
    it("gives About a photo beside the story and Contact a form", () => {
      const sections = presetSections(look);
      expect(sections["page:about"].map((s) => s.type)).toEqual(["PageContentSection", "ImageWithTextSection"]);
      expect(sections["page:contact"].map((s) => s.type)).toContain("ContactFormSection");
      expect(existsSync(`public${set.about.photo}`), set.about.photo).toBe(true);
      expect(starterPageSections(id)["page:about"][1].settings?.ctaText).toMatch(/\S/);
    });
  });

  it("a look without its own pages keeps the prompts, so the owner sees what to write", () => {
    const plain: any = { content: { starterPages: ["about"] } };
    const [about] = presetPagesToAdd(plain, []);
    expect(about.body).toMatch(/\[/);
    expect((about as any).sample).toBeUndefined();
  });
});

// The ImageWithText renderer falls back to a "Read more" button pointing at "#": a starter must never ship that.
describe("starter story blocks", () => {
  it.each(STARTER_SITES.map((id) => [id]))("%s gives every picture-and-words block a real button", (id) => {
    const look: any = THEME_LIBRARY.find((t: any) => t.id === id);
    for (const [where, list] of Object.entries(look.content.sections as Record<string, any[]>)) {
      for (const s of list.filter((s) => s.type === "ImageWithTextSection")) {
        expect(s.settings.ctaText, `${id} ${where} ${s.settings.title}`).toBeTruthy();
        expect(s.settings.ctaUrl, `${id} ${where} ${s.settings.title}`).toMatch(/^\//);
      }
    }
  });
});
