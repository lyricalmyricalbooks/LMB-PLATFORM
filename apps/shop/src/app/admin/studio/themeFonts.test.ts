import { describe, expect, it } from "vitest";
import { FONT_CHOICES } from "../../features/site/fonts";
import { THEME_LIBRARY } from "./themeLibrary";

// A look's font that the pickers don't list showed as "Default (not set)" in Essentials and Theme settings after Use
// this look (Marquee's Big Shoulders Display, 13 November 2026), and was loaded in two weights only, so its heavy
// titles were drawn fake-bold. Every look's heading and body fonts must be picker fonts, in a weight Google serves.
const fonts = new Map(FONT_CHOICES.map(f => [f.name, f.weights]));

describe("every ready-made look's fonts", () => {
  for (const theme of THEME_LIBRARY as any[]) {
    const g = theme.global || {};
    // `font` (Theme font) is a typed-in control, so it may name any family; the two pickers may not.
    const used: [string, string | undefined, number | undefined][] = [
      ["headingFont", g.headingFont, g.headingWeight], ["bodyFont", g.bodyFont, g.bodyWeight],
    ];
    for (const [key, name, weight] of used) {
      if (!name) continue;
      it(`${theme.name}: ${key} "${name}" is in the font pickers`, () => {
        expect(fonts.has(name)).toBe(true);
      });
      if (weight) it(`${theme.name}: ${key} "${name}" comes in weight ${weight}`, () => {
        expect(fonts.get(name) || []).toContain(weight);
      });
    }
  }
});
