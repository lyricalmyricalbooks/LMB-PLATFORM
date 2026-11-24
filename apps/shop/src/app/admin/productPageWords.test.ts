import { describe, expect, it } from "vitest";
import { TYPE_GROUPS, PRODUCT_TYPES } from "../../shared/productTypes";
import { descriptionHint, otherPricesLine, photosHint, saveBarWords } from "./productPageWords";

describe("product page words follow the type", () => {
  it("never mentions books for a product that isn't one", () => {
    for (const group of TYPE_GROUPS.filter((g) => g.id !== "books")) {
      expect(descriptionHint({ group: group.id }, false)).not.toMatch(/book|reader|edition/i);
    }
    expect(descriptionHint(null, false)).not.toMatch(/book/i);
    expect(photosHint(false)).not.toMatch(/cover|interior/i);
  });

  it("keeps the book wording for books", () => {
    expect(descriptionHint(null, true)).toMatch(/this book matters/);
    expect(photosHint(true)).toMatch(/cover/);
  });

  it("has a hint for every type", () => {
    for (const type of PRODUCT_TYPES) expect(descriptionHint(type, false).length).toBeGreaterThan(10);
    expect(descriptionHint({ group: "jewelry" }, false)).toMatch(/wear/);
  });
});

describe("Other prices summary", () => {
  it("says what can go in it when empty", () => {
    expect(otherPricesLine({})).toBe("Cost to you, wholesale, USD and EUR prices");
  });
  it("lists what is filled in", () => {
    expect(otherPricesLine({ costPrice: 12, wholesalePrice: "40" })).toBe("Cost $12.00 · wholesale $40.00");
    expect(otherPricesLine({ manualCurrencyOverrides: true })).toBe("Your own USD and EUR prices");
  });
});

describe("Save bar words", () => {
  const base = { named: true, missing: [] as string[], live: false, dirty: true, isNew: true };
  it("asks for a name before anything else", () => {
    expect(saveBarWords({ ...base, named: false, missing: ["Title", "Photo"] }).text).toBe("Give it a name to save a draft");
  });
  it("lists what publishing still needs, in the checklist's words", () => {
    expect(saveBarWords({ ...base, missing: ["Photo", "Price above $0", "Description"] }).text).toBe("To publish, add a photo, price and description");
    expect(saveBarWords({ ...base, missing: ["Metal"] }).text).toBe("To publish, add metal");
  });
  it("says ready when nothing is missing, and saved for a live product", () => {
    expect(saveBarWords(base)).toEqual({ tone: "good", text: "Ready to publish" });
    expect(saveBarWords({ ...base, live: true, dirty: false }).text).toBe("All saved");
    expect(saveBarWords({ ...base, live: true }).text).toBe("Unsaved changes");
  });
});
