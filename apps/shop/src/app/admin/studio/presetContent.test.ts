import { describe, expect, it } from "vitest";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { PAGE_STARTERS } from "./pageStarters";
import {
  PRESET_SECTION_TEMPLATES, applyPresetSections, hasPresetContent, presetContentSummary, presetPagesToAdd, presetSections, presetStarterPages, wordedSettings,
} from "./presetContent";
import { getSections } from "./studioModel";
import { THEME_LIBRARY } from "./themeLibrary";
import { goodsWords } from "../../../shared/shopSells";

const meta = (type: string) => ({ defaults: { fromMeta: type } });
const home = { kind: "template", id: "heroPage" } as const;

describe("theme presets hold section lists and starter pages (plan 1.23)", () => {
  it("every library preset's content points at real layouts, templates and starters", () => {
    for (const preset of THEME_LIBRARY as any[]) {
      if (preset.homeLayoutTemplate) expect(HOME_LAYOUT_TEMPLATES.some(t => t.id === preset.homeLayoutTemplate), preset.id).toBe(true);
      for (const id of Object.keys(preset.content?.sections || {})) expect(id in PRESET_SECTION_TEMPLATES, `${preset.id}: ${id}`).toBe(true);
      for (const id of preset.content?.starterPages || []) expect(PAGE_STARTERS.some(s => s.id === id && id !== "blank"), `${preset.id}: ${id}`).toBe(true);
    }
    expect((THEME_LIBRARY as any[]).filter(hasPresetContent).length).toBeGreaterThan(0);
  });

  it("a preset's own section lists join its home layout; unknown templates and empty lists are ignored", () => {
    const preset = {
      homeLayoutTemplate: "press-riso",
      content: { sections: { productPage: [{ type: "RichTextSection" }], nowhere: [{ type: "X" }], cartPage: [] } },
    };
    const sections = presetSections(preset);
    expect(Object.keys(sections).sort()).toEqual(["heroPage", "productPage"]);
    expect(sections.heroPage).toBe(HOME_LAYOUT_TEMPLATES.find(t => t.id === "press-riso")!.sections);
    // A preset that gives Home its own list uses it instead of the home layout.
    expect(presetSections({ homeLayoutTemplate: "press-riso", content: { sections: { heroPage: [{ type: "A" }] } } }).heroPage).toEqual([{ type: "A" }]);
    expect(hasPresetContent({})).toBe(false);
    expect(presetStarterPages({ content: { starterPages: ["blank", "nope", "about"] } }).map(s => s.id)).toEqual(["about"]);
  });

  it("applying the sections replaces only the named templates, with fresh sections built from the section defaults", () => {
    const design = { heroPage: { sections: [{ id: "old", type: "Old", visible: true, settings: {} }] }, productPage: { sections: [{ id: "keep", type: "Keep", visible: true, settings: {} }] }, primaryColor: "#123456" };
    const preset = { content: { sections: { heroPage: [{ type: "Hero", settings: { title: "Hi" } }, { type: "Grid" }] } } };
    const next = applyPresetSections(design, preset, meta);
    const list = getSections(next, home);
    expect(list.map(s => s.type)).toEqual(["Hero", "Grid"]);
    expect(list[0].settings).toEqual({ fromMeta: "Hero", title: "Hi" });
    expect(new Set(list.map(s => s.id)).size).toBe(2);
    expect(getSections(next, { kind: "template", id: "productPage" }).map(s => s.id)).toEqual(["keep"]);
    expect(next.primaryColor).toBe("#123456");
    expect(getSections(design, home).map(s => s.id)).toEqual(["old"], "the draft passed in is not changed");
  });

  it("starter pages are added as drafts, never over a page the press already has", () => {
    const preset = { content: { starterPages: ["about", "shipping", "contact"] } };
    const pages = [{ slug: "about", title: "Our story" }, { slug: "contact-2" }];
    const added = presetPagesToAdd(preset, pages);
    expect(added.map(p => p.slug)).toEqual(["shipping-returns", "contact"]);
    expect(added.every(p => p.status === "draft")).toBe(true);
    // Running it again once they exist adds nothing.
    expect(presetPagesToAdd(preset, [...pages, ...added])).toEqual([]);
  });

  it("the confirm step says what is replaced, added and kept", () => {
    const preset = { homeLayoutTemplate: "press-riso", content: { starterPages: ["about", "faq"] } };
    const design = { heroPage: { sections: [{ id: "a", type: "A", visible: true, settings: {} }] } };
    const lines = presetContentSummary(design, preset, [{ slug: "about", title: "About us" }]);
    expect(lines[0]).toBe(`Home: its ${HOME_LAYOUT_TEMPLATES.find(t => t.id === "press-riso")!.sections.length} sections replace your 1 current section`);
    expect(lines[1]).toMatch(/^Pages added as drafts .*: Frequently asked questions$/);
    expect(lines[2]).toBe("Kept as they are: your own About page");
    expect(presetContentSummary({}, { homeLayoutTemplate: "press-riso" }, [])[0]).toMatch(/replace the default ones$/);
  });
});

describe("layouts in the shop's words (code plan 12.18)", () => {
  it("a shop that doesn't sell books gets the layout's words in its own words, with links and pictures kept", () => {
    const settings = { title: "New books", eyebrow: "From the press", ctaLink: "/collections/books", imageUrl: "https://x.test/books.jpg", collectionId: "books", items: [{ label: "Our books", href: "/books" }], count: 4 };
    expect(wordedSettings(settings, goodsWords)).toEqual({
      title: "New products", eyebrow: "From the press", ctaLink: "/collections/books", imageUrl: "https://x.test/books.jpg", collectionId: "books", items: [{ label: "Our products", href: "/books" }], count: 4,
    });
  });

  it("every shipped home layout reads without book words for a clothing shop, and a books shop's is unchanged", () => {
    for (const tpl of HOME_LAYOUT_TEMPLATES) {
      const books = applyPresetSections({}, { homeLayoutTemplate: tpl.id }, meta);
      const goods = applyPresetSections({}, { homeLayoutTemplate: tpl.id }, meta, goodsWords);
      expect(getSections(books, home).map(s => s.settings)).toEqual(tpl.sections.map(s => ({ fromMeta: s.type, ...(s.settings || {}) })));
      const words = JSON.stringify(getSections(goods, home).map(s => Object.fromEntries(Object.entries(s.settings).filter(([k]) => !/url|href|link|image|src|slug|handle|collection|icon|video|Id$/i.test(k)))));
      expect(words, tpl.id).not.toMatch(/\bnew books\b/i);
    }
  });
});
