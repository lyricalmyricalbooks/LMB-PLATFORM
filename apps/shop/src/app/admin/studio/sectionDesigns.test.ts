import { describe, expect, it } from "vitest";
import { SECTION_REGISTRY } from "../ThemeEditorExtensions";
import { designGroups, designParts, kindOf, SECTION_KINDS, sectionDesigns } from "./sectionDesigns";
import { settingsWithoutControl } from "./themeCheck";

const designs = sectionDesigns(SECTION_REGISTRY);

describe("section designs (starter websites, step 2)", () => {
  it("every section type sits in a named kind and keeps its plain design", () => {
    const kinds = new Set<string>(SECTION_KINDS.map(k => k.id));
    for (const meta of SECTION_REGISTRY) {
      expect(kinds.has(kindOf(meta.type)), meta.type).toBe(true);
      expect(designs.find(d => d.id === meta.type)?.settings).toEqual({});
    }
    // A type missing from the kind map would quietly land in Build your own: list it on purpose instead.
    const built = SECTION_REGISTRY.filter(m => kindOf(m.type) === "build").map(m => m.type).sort();
    expect(built).toEqual(["CompositionSection", "CustomHTMLSection", "RowSection"]);
  });

  it("every design is made only of settings Studio edits afterwards", () => {
    for (const d of designs) expect(settingsWithoutControl(d.type, d.settings), d.id).toEqual([]);
  });

  it("design ids are unique and turn back into their type and settings", () => {
    expect(new Set(designs.map(d => d.id)).size).toBe(designs.length);
    for (const d of designs) expect(designParts(d.id)).toEqual({ type: d.type, settings: d.settings });
    expect(designParts("HeroSection")).toEqual({ type: "HeroSection", settings: {} });
  });

  it("gives the main kinds more than one design to choose from", () => {
    for (const kind of ["opening", "products", "words", "trust", "signups"]) {
      expect(designs.filter(d => d.kind === kind).length, kind).toBeGreaterThan(2);
    }
    expect(designs.filter(d => d.type === "HeroSection").length).toBeGreaterThan(2);
  });

  it("groups by kind in reading order, searches words and kinds, and can show one kind", () => {
    const all = designGroups(designs, "");
    expect(all.map(g => g.kind)).toEqual(SECTION_KINDS.map(k => k.id).filter(k => designs.some(d => d.kind === k)));
    expect(designGroups(designs, "new arrivals").flatMap(g => g.items.map(i => i.id))).toEqual(["ProductShowcaseGridSection~newest"]);
    expect(designGroups(designs, "", "opening").map(g => g.kind)).toEqual(["opening"]);
    expect(designGroups(designs, "opening banners").flatMap(g => g.items).every(d => d.kind === "opening")).toBe(true);
    expect(designGroups(designs, "zzzz")).toEqual([]);
  });
});
