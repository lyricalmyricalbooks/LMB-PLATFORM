import { describe, expect, it } from "vitest";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { applyStarter, starterContents, starterPagesToAdd } from "./starterDesign";
import { themeProblems } from "./themeCheck";
import { THEME_LIBRARY } from "./themeLibrary";
import { presetSections } from "./presetContent";
import { getSections } from "./studioModel";

// Plan "Editable starter websites", step 1: a starter is a whole website made only of Studio parts. Every library
// entry must pass the theme check and apply cleanly as a whole site.
const LIBRARY = (THEME_LIBRARY as any[]).map((t) => [t.id, t] as const);

describe("starter designs", () => {
  it.each(LIBRARY)("%s is made only of parts Studio edits", (_id, theme) => {
    expect(themeProblems(theme)).toEqual([]);
  });

  it.each(LIBRARY)("%s applies as a whole site, and applying twice is the same as once", (_id, theme) => {
    const once = applyStarter({}, theme, getSectionMeta);
    expect(once.themeBase?.id).toBe(theme.id);
    for (const [id, specs] of Object.entries(presetSections(theme))) {
      const sections = getSections(once, { kind: "template", id });
      expect(sections.map((s: any) => s.type)).toEqual(specs.map((s) => s.type));
      for (const s of sections) expect(getSectionMeta(s.type)).toBeTruthy();
    }
    const twice = applyStarter(once, theme, getSectionMeta);
    const strip = (d: any) => JSON.parse(JSON.stringify(d, (k, v) => (k === "id" ? undefined : v)));
    expect(strip(twice)).toEqual(strip(once));
  });

  it("keeps sections on pages the starter doesn't shape", () => {
    const theme = LIBRARY[0][1];
    const own = { productPage: { sections: [{ id: "mine", type: "RichText", settings: { text: "Mine" } }] } };
    const shaped = Object.keys(presetSections(theme));
    if (shaped.includes("productPage")) return;
    expect(applyStarter(own, theme, getSectionMeta).productPage.sections[0].id).toBe("mine");
  });

  it("puts the shop's own words in the starter", () => {
    const theme = LIBRARY.find(([, t]) => Object.keys(presetSections(t)).length)?.[1];
    if (!theme) return;
    const loud = applyStarter({}, theme, getSectionMeta, (t) => t.toUpperCase());
    const text = JSON.stringify(Object.keys(presetSections(theme)).map((id) => getSections(loud, { kind: "template", id })));
    expect(text).not.toMatch(/"(title|heading)":"[^"]*[a-z][^"]*"/);
  });

  it("lists what a starter sets up, and adds only the starter pages a shop lacks", () => {
    const theme = LIBRARY.find(([, t]) => t.content?.starterPages?.length)![1];
    const contents = starterContents(theme);
    expect(contents.starterPages.length).toBe(theme.content.starterPages.length);
    const all = starterPagesToAdd(theme, []);
    expect(all.every((p) => p.status === "draft")).toBe(true);
    expect(starterPagesToAdd(theme, all)).toEqual([]);
  });
});
