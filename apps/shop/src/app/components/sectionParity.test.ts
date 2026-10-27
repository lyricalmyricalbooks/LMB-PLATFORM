import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Registry ↔ renderer parity, enforced as a test (docs/THEME_EDITOR.md
// "Verifying changes"): every SECTION_REGISTRY `type` must have an
// identically-named exported renderer in SectionComponents.tsx, or the
// storefront silently renders nothing for that section.

const here = dirname(fileURLToPath(import.meta.url));
const registrySource = readFileSync(join(here, "../admin/ThemeEditorExtensions.tsx"), "utf8");
const rendererSource = readFileSync(join(here, "./SectionComponents.tsx"), "utf8");

const registryTypes = [...registrySource.matchAll(/type: "(\w+Section)"/g)].map((m) => m[1]);
const rendererNames = new Set([...rendererSource.matchAll(/export function (\w+Section)\b/g)].map((m) => m[1]));

describe("SECTION_REGISTRY ↔ SectionComponents parity", () => {
  it("finds a plausible number of registry types", () => {
    expect(registryTypes.length).toBeGreaterThanOrEqual(25);
  });

  it("has an identically named renderer for every registry type", () => {
    const missing = registryTypes.filter((t) => !rendererNames.has(t));
    expect(missing).toEqual([]);
  });

  it("includes the Lyricalmyrical Punk sections in both registry and renderers", () => {
    for (const t of [
      "ProductCoverCarouselSection",
      "ProductShowcaseGridSection",
      "StaffNotesTableSection",
      "EphemeraRowSection",
    ]) {
      expect(registryTypes).toContain(t);
      expect(rendererNames.has(t)).toBe(true);
    }
  });

  it("includes the responsive image banner in both registry and renderers", () => {
    expect(registryTypes).toContain("ImageBannerSection");
    expect(rendererNames.has("ImageBannerSection")).toBe(true);
  });
});
