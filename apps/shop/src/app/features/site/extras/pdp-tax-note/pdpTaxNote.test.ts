import { describe, expect, it } from "vitest";
import { taxNoteKey, taxNoteParts, taxNoteText } from "./pdpTaxNote";

describe("tax & shipping note", () => {
  it("picks the sentence for the book", () => {
    expect(taxNoteKey({ physical: true, taxed: true })).toBe("pdpTaxNote");
    expect(taxNoteKey({ physical: true, taxed: false })).toBe("pdpTaxNoteShippingOnly");
    expect(taxNoteKey({ physical: false, taxed: true })).toBe("pdpTaxNoteTaxOnly");
    expect(taxNoteKey({ physical: false, taxed: false })).toBeNull();
    expect(taxNoteText({}, { physical: false, taxed: false })).toBe("");
    expect(taxNoteText({}, { physical: true, taxed: true })).toBe("Taxes and [shipping] calculated at checkout.");
  });

  it("links the bracketed words only when there is a page", () => {
    expect(taxNoteParts("Taxes and [shipping] calculated.", true)).toEqual([
      { text: "Taxes and ", link: false }, { text: "shipping", link: true }, { text: " calculated.", link: false },
    ]);
    expect(taxNoteParts("Taxes and [shipping] calculated.", false).map((p) => p.text).join("")).toBe("Taxes and shipping calculated.");
    expect(taxNoteParts("[Shipping] at checkout [later].", true)).toEqual([
      { text: "Shipping", link: true }, { text: " at checkout later.", link: false },
    ]);
    expect(taxNoteParts("No link here.", true)).toEqual([{ text: "No link here.", link: false }]);
    expect(taxNoteParts("", true)).toEqual([]);
  });
});
