import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";
import { starterForShop } from "./starterDesign";
import { starterSampleBooks } from "./presetContent";
import { sampleShipping, starterBookingSamples, starterSamplePages, starterShelves } from "./starterWalkthrough";

const starters = THEME_LIBRARY.filter((t: any) => t.content?.sampleBrand);

describe("starterWalkthrough (Online store › Preview and the demo shops walk the same pages)", () => {
  it("gives every starter its own About and Contact pages, published, and Shipping when it sells things", () => {
    expect(starters.length).toBe(9);
    for (const theme of starters) {
      const pages = starterSamplePages(starterForShop(theme, "products"));
      const slugs = pages.map((p) => p.slug);
      expect(slugs, theme.id).toEqual(expect.arrayContaining(["about", "contact"]));
      if (starterSampleBooks(theme).length) expect(slugs.some((s: string) => s.startsWith("shipping")), theme.id).toBe(true);
      expect(pages.every((p) => p.status === "published"), theme.id).toBe(true);
    }
  });

  it("lists the sample products' shelves in the menu, and a shipping rule only when there is something to ship", () => {
    for (const theme of starters) {
      const books = starterSampleBooks(theme);
      if (!books.length) { expect(sampleShipping(books)).toEqual([]); continue; }
      expect(starterShelves(books).length, theme.id).toBeGreaterThan(0);
      expect(starterShelves(books).map((c) => c.name)).not.toContain("Featured");
      expect(sampleShipping(books)[0].freeShippingOver, theme.id).toBeGreaterThan(0);
    }
  });

  it("brings sample services for the starters made for appointments", () => {
    for (const id of ["starter-salon", "starter-workshop"]) {
      const theme = starters.find((t: any) => t.id === id);
      expect(starterBookingSamples(theme).starterServices.length, id).toBeGreaterThan(0);
    }
  });
});
