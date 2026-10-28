// My themes › Import warns about anything in a theme file a press couldn't change in Studio (importedThemeProblems).
import { describe, expect, it } from "vitest";
import { defaultSettings } from "../defaultSettings";
import { importedThemeProblems } from "./themeCheck";
import { parseThemeFile, serializeThemeFile } from "./savedThemes";
import { THEME_LIBRARY } from "./themeLibrary";
import { themedDesign } from "./themeLook";
import { createStudioFixture } from "./fixture/fakeStudioApi";

const BASE = defaultSettings().design;
const KNOWN = Object.keys(BASE);
const roundTrip = (design: any) => {
  const parsed = parseThemeFile(serializeThemeFile({ name: "Mine", design }));
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.design;
};

describe("theme import warnings", () => {
  it("finds nothing to warn about in Studio's own exports: the starting look and every ready-made look", () => {
    expect(importedThemeProblems(roundTrip(BASE), KNOWN)).toEqual([]);
    for (const theme of THEME_LIBRARY as any[]) {
      expect(importedThemeProblems(roundTrip(themedDesign(theme, BASE)), KNOWN), theme.name).toEqual([]);
    }
    // The Studio fixture's draft: a design edited in Studio, with pages, sections and words.
    const fixture = createStudioFixture();
    expect(importedThemeProblems(roundTrip(fixture.settings.draftDesign || fixture.settings.design), KNOWN)).toEqual([]);
  });

  it("names, in plain words, settings, text and sections Studio has no control for", () => {
    const problems = importedThemeProblems({
      ...BASE,
      sparkleCursor: true,
      copy: { ...(BASE.copy || {}), footerCopyright: "© {year}", secretSlogan: "Hello" },
      heroPage: { sections: [{ id: "s1", type: "NewsletterSection", settings: {} }, { id: "s2", type: "HologramSection", settings: {} }] },
      palettePreset: "neon-dream",
    }, KNOWN);
    expect(problems).toEqual([
      "2 settings have no control in Studio, so you couldn't change them afterwards: “sparkleCursor”, “palette neon-dream”.",
      "1 piece of text isn't in Text & labels, so it would never show: “secretSlogan”.",
      "1 kind of section isn't one Studio has, so it wouldn't show or be editable: “HologramSection”.",
    ]);
  });

  it("keeps a long list short", () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`odd${i}`, 1]));
    expect(importedThemeProblems(many)[0]).toMatch(/^9 settings .*“odd5” and 3 more\.$/);
  });
});
