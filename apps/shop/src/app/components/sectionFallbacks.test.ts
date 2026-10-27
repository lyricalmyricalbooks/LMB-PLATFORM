import { describe, expect, it } from "vitest";
import { SECTION_FALLBACKS } from "./sectionFallbacks";

// The Studio field list is a large module tree (about 2 s to load cold; the check itself takes milliseconds). Loaded
// once with the file, so that cost is not counted against the 5 s limit of the check (same fix as designerCoverage).
const { getSectionFields } = await import("../admin/ThemeEditorExtensions");

// Renderer fallback words must be editable: every settings-level fallback key needs a Content field
// on that section type (block-level ones are edited through the block editor).
describe("section fallback wording is editable in Studio", () => {
  it("has a Content field for every settings-level fallback", () => {
    const missing: string[] = [];
    for (const key of Object.keys(SECTION_FALLBACKS)) {
      const [type, rest] = key.replace(/@\d+$/, "").split(".");
      if (key.includes(".block.") || key.includes(".item.") || key.includes(".btn.") || key.includes(".article.") || key.includes(".page")) continue;
      if (!getSectionFields(type).some((f: any) => f.key === rest)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });
});
