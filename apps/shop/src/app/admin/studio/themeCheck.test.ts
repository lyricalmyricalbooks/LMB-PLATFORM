import { describe, expect, it } from "vitest";
import { themeProblems } from "./themeCheck";
import { THEME_LIBRARY } from "./themeLibrary";

// Plan 1.24: a theme only uses settings that have a Studio control. Every theme in the library is checked, so a new
// theme file fails here until each setting it carries can be changed in Studio afterwards.
describe("the theme check", () => {
  it.each((THEME_LIBRARY as any[]).map(t => [t.id, t] as const))("%s only uses settings Studio can change", (_id, theme) => {
    expect(themeProblems(theme)).toEqual([]);
  });

  const base = { id: "test", name: "Test" };

  it("finds a top-level key Apply doesn't copy, and a global key with no control", () => {
    expect(themeProblems({ ...base, sparkle: true })).toEqual([expect.stringMatching(/"sparkle" isn't something Apply copies/)]);
    expect(themeProblems({ ...base, global: { primaryColor: "#000000", glowStrength: 3 } })).toEqual(["Test: \"glowStrength\" has no Theme settings control"]);
    expect(themeProblems({ ...base, fontSize: "md", productCTA: "BUY" })).toEqual([]);
  });

  it("checks words against Text & labels and colour-scheme parts against their controls", () => {
    expect(themeProblems({ ...base, global: { copy: { cartLabel: "Bag", notAWord: "x" } } })).toEqual(["Test: the words \"notAWord\" aren't in Text & labels"]);
    expect(themeProblems({ ...base, global: { elementSchemes: { header: "scheme-1", basement: "scheme-1" } } })).toEqual(["Test: \"basement\" can't follow a colour scheme in Theme settings"]);
  });

  it("checks the palette, the home layout and the starter pages exist", () => {
    expect(themeProblems({ ...base, palettePreset: "mauve" })).toEqual(["Test: the palette \"mauve\" isn't one Studio lists"]);
    expect(themeProblems({ ...base, homeLayoutTemplate: "nowhere" })).toEqual(["Test: the home layout \"nowhere\" doesn't exist"]);
    expect(themeProblems({ ...base, content: { starterPages: ["about", "blank", "nope"] } })).toHaveLength(2);
  });

  it("checks every section setting is one of that section's own fields or its Style, Layout or Visibility fields", () => {
    const sections = (settings: Record<string, unknown>, type = "HeroSection") => ({ ...base, content: { sections: { heroPage: [{ type, settings }] } } });
    expect(themeProblems(sections({ title: "Hi", height: "medium", bgColor: "#ffffff" }))).toEqual([]);
    expect(themeProblems(sections({ wobble: 2 }))).toEqual(["Test: Home section 1 (HeroSection): \"wobble\" has no control in the section's settings"]);
    expect(themeProblems(sections({}, "MadeUpSection"))).toEqual(["Test: Home section 1 (MadeUpSection) isn't a section Studio can add"]);
    expect(themeProblems({ ...base, content: { sections: { basement: [{ type: "HeroSection" }] } } })).toEqual(["Test: sections for \"basement\", which isn't a Studio page"]);
  });

  it("refuses something that isn't a theme", () => {
    expect(themeProblems(null)).toEqual(["the theme is not an object"]);
    expect(themeProblems([])).toEqual(["the theme is not an object"]);
  });
});
