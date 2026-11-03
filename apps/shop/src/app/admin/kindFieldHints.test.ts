import { describe, it, expect } from "vitest";
import { kindHint } from "./kindFieldHints";
import { PRODUCT_KINDS } from "../../shared/productOptions";

describe("kind field hints", () => {
  it("every kind has a label and examples, and unknown kinds fall back", () => {
    for (const k of PRODUCT_KINDS) { const h = kindHint(k); expect(h.materialLabel).toBeTruthy(); expect(h.materialExample).toBeTruthy(); }
    expect(kindHint("nope").materialLabel).toBe("Material");
    expect(kindHint(undefined).careStarters).toEqual([]);
  });
  it("clothing, shoes and jewellery offer care starters; none are blank", () => {
    for (const k of ["clothing", "shoes", "jewelry"]) { expect(kindHint(k).careStarters.length).toBeGreaterThan(0); kindHint(k).careStarters.forEach(s => expect(s.trim()).not.toBe("")); }
  });
  it("jewellery asks for metal and stones, music for the pressing", () => {
    expect(kindHint("jewelry").materialLabel).toMatch(/metal/i);
    expect(kindHint("music").materialLabel).toMatch(/pressing/i);
  });
});
