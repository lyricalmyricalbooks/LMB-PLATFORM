import { describe, expect, it } from "vitest";
import { PALETTES, THEME_APPLIED_KEYS, THEME_LIBRARY } from "./themeLibrary";
import { STYLE_GROUPS } from "./styleSchema";

// Rule: every design in the theme library must be fully editable in Studio. Anything a preset
// changes on the storefront needs a Studio › Style control, or the merchant can see the effect
// but has no way to adjust it after applying the theme.
const controlled = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
const META = new Set(["id", "name", "mood", "global", "homeLayoutTemplate", "palettePreset"]);
const LEGACY_UNAPPLIED = new Set(["fontSize", "cornerStyle", "animationLevel"]);

describe("every theme-library design is editable in Studio", () => {
  it("has a Style control for every applied top-level key", () => {
    expect(THEME_APPLIED_KEYS.filter((k) => !controlled.has(k))).toEqual([]);
  });

  it.each(THEME_LIBRARY.map((t: any) => [t.id, t] as const))("%s", (_id, theme: any) => {
    const unknownTop = Object.keys(theme).filter(
      (k) => !META.has(k) && !LEGACY_UNAPPLIED.has(k) && !THEME_APPLIED_KEYS.includes(k),
    );
    expect(unknownTop, "new top-level preset key: add it to THEME_APPLIED_KEYS with a Style control").toEqual([]);
    const uneditable = Object.keys(theme.global || {}).filter((k) => !controlled.has(k));
    expect(uneditable, "preset sets a design key with no Studio › Style control").toEqual([]);
    if (theme.palettePreset) expect(PALETTES.some((p) => p.id === theme.palettePreset)).toBe(true);
  });

  it("palette colours land on editable keys", () => {
    for (const k of ["primaryColor", "backgroundColor", "textColor"]) expect(controlled.has(k)).toBe(true);
  });
});
