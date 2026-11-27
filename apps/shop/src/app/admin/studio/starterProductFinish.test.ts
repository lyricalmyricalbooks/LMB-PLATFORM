import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";
import { starterSampleBooks } from "./presetContent";
import { STARTER_SITES } from "../lookGallery";
import { starterWords } from "../sells";

// Plan "Starters on par", step 6: every starter's product page finishes like a Shopify or Squarespace one.
describe("starter product pages", () => {
  it.each(STARTER_SITES.map((id) => [id]))("%s has a sticky Add to bag bar and fold-open details on phones", (id) => {
    const look: any = THEME_LIBRARY.find((t: any) => t.id === id);
    expect(look.global.pdpStickyBar).toBe(true);
    expect(look.global.productDetailsLayoutPhone).toBe("accordions");
  });
  it("Northline Supply's sized products carry its size guide, and nothing else does", () => {
    const books = starterSampleBooks(THEME_LIBRARY.find((t: any) => t.id === "starter-warehouse"));
    for (const b of books) expect(Boolean(b.sizeChart), b.title).toBe((b.options || []).some((o: any) => o.name === "Size"));
    expect(books.some((b) => b.sizeChart)).toBe(true);
    for (const id of STARTER_SITES.filter((s) => s !== "starter-warehouse")) {
      expect(starterSampleBooks(THEME_LIBRARY.find((t: any) => t.id === id)).some((b) => b.sizeChart), id).toBe(false);
    }
  });
  it("a shop that doesn't sell books reads “You may also like” over related products", () => {
    expect(starterWords("clothing").relatedHeading).toBe("You may also like");
    expect(starterWords("books").relatedHeading).toBeUndefined();
  });
});
