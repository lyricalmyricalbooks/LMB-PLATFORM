import { layerDesign } from "./designModel";
import { describe, it, expect } from "vitest";
import { RISO_NOIR_TOKENS, withRisoNoirDefault, RISO_SURFACE_IDS } from "./risoNoir";
import { buildStorefrontTokenVars } from "./themeTokens";

describe("Riso Noir tokens", () => {
  it("is black with white text and a flare accent", () => {
    expect(RISO_NOIR_TOKENS.backgroundColor).toBe("#000000");
    expect(RISO_NOIR_TOKENS.textColor).toBe("#ffffff");
    expect(RISO_NOIR_TOKENS.primaryColor).toBe("#e8402a");
    // Ink (never white) text on flare fills — the Riso Press rule.
    expect(RISO_NOIR_TOKENS.buttonTextColor).toBe("#100f0d");
    expect(RISO_NOIR_TOKENS.themeStyle).toBe("riso");
  });

  it("feeds every Riso print variable from editable design keys", () => {
    const vars = buildStorefrontTokenVars(RISO_NOIR_TOKENS);
    expect(vars).toContain("--rp-outline: #ffffff;");
    expect(vars).toContain("--rp-shadow-color: rgba(232,64,42,0.9);");
    expect(vars).toContain("--rp-focus: #e8402a;");
  });
});

describe("withRisoNoirDefault", () => {
  it("restyles designs that never chose a style, keeping content untouched", () => {
    const sections = [{ id: "a", type: "HeroSection" }];
    const out = withRisoNoirDefault({ primaryColor: "#A855F7", backgroundColor: "#030213", sections, menus: { header: [1] } });
    expect(out.backgroundColor).toBe("#000000");
    expect(out.primaryColor).toBe("#e8402a");
    expect(out.themeStyle).toBe("riso");
    expect(out.sections).toBe(sections);
    expect(out.menus).toEqual({ header: [1] });
  });

  it("also restyles page surfaces that already exist (their overrides are cleared) without adding new ones", () => {
    const out = withRisoNoirDefault({ storefront: { backgroundColor: "#050505", sections: [1] } });
    expect(layerDesign(out, out.storefront).backgroundColor).toBe("#000000");
    expect(out.storefront.sections).toEqual([1]);
    for (const id of RISO_SURFACE_IDS.filter((s) => s !== "storefront")) expect(out[id]).toBeUndefined();
  });

  it("leaves deliberate choices alone", () => {
    const explicit = { themeStyle: "default", backgroundColor: "#ffffff" };
    expect(withRisoNoirDefault(explicit)).toBe(explicit);
    const preset = { themeLibraryPreset: "lyricalmyrical-punk", backgroundColor: "#0a0910" };
    expect(withRisoNoirDefault(preset)).toBe(preset);
    expect(withRisoNoirDefault(undefined)).toBeUndefined();
  });
});
