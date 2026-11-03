import { describe, expect, it } from "vitest";
import { withShopLanguage } from "./shopLanguageSwitch";
import { getCopy } from "../../features/site/storeCopy";
import { shopLanguageOf } from "../../features/site/shopLanguage";

describe("shop language switch", () => {
  it("fills French words without replacing the owner's own, and switching back removes only what it added", () => {
    const design = { copy: { cartLabel: "My basket" }, accent: "#000" };
    const fr = withShopLanguage(design, "fr");
    expect(shopLanguageOf(fr)).toBe("fr");
    expect(getCopy(fr, "cartLabel")).toBe("My basket");
    expect(getCopy(fr, "soldOutLabel")).toBe("Épuisé");
    expect(getCopy(fr, "coDigitalConsent")).toMatch(/14 jours/);
    expect(fr.accent).toBe("#000");

    const owned = { ...fr, copy: { ...fr.copy, soldOutLabel: "Plus en stock" } };
    const en = withShopLanguage(owned, "en");
    expect(shopLanguageOf(en)).toBe("en");
    expect("language" in en).toBe(false);
    expect(en.copy).toEqual({ cartLabel: "My basket", soldOutLabel: "Plus en stock" });
    expect(getCopy(en, "saleBadgeLabel")).toBe("Sale");
  });

  it("can be run twice", () => {
    const once = withShopLanguage({}, "fr");
    expect(withShopLanguage(once, "fr")).toEqual(once);
    expect(withShopLanguage(withShopLanguage(once, "en"), "en")).toEqual({ copy: {} });
  });
});
