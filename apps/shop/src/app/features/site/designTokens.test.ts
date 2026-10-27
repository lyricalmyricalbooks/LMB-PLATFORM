import { describe, expect, it } from "vitest";
import { CARD_SHADOWS, designTokensCss, sectionStepCss, spaceStepCss, typeSteps } from "./designTokens";
import { storefrontOverridesCss } from "./StorefrontOverrides";

describe("design scales (Studio 3.0 phase 2)", () => {
  it("changes nothing visible for an untouched design", () => {
    const css = designTokensCss({});
    expect(css).toContain("--fm-space-unit:8px");
    expect(css).not.toMatch(/font-size|box-shadow|outline|--fm-step|--rp-card-radius/);
    expect(typeSteps({})).toEqual([]);
  });
  it("builds a fluid heading scale that shrinks on phones", () => {
    const steps = typeSteps({ typeScale: "major-third", typeScaleBase: 16 });
    expect(steps.map(s => Math.round(s.desktop))).toEqual([16, 20, 25, 31, 39, 49]);
    expect(steps[5].phone).toBeLessThan(steps[5].desktop);
    expect(steps[5].css).toMatch(/^clamp\(\d+(\.\d+)?px, calc\(.+vw\), 48\.83px\)$/);
    const css = designTokensCss({ typeScale: "major-third" });
    expect(css).toContain("[data-fm-store] [data-fm-section] h2{font-size:var(--fm-step-4);}");
  });
  it("keeps fixed sizes when fluid type is off", () => {
    const steps = typeSteps({ typeScale: "golden", typeScaleFluid: false });
    expect(steps.every(s => s.phone === s.desktop && s.css.endsWith("px"))).toBe(true);
  });
  it("spacing steps are multiples of the unit, scaled down on phones", () => {
    expect(spaceStepCss("m")).toBe("calc(var(--fm-space-unit, 8px) * 8 * var(--fm-space-scale, 1))");
    expect(spaceStepCss("nope")).toBe("");
    expect(designTokensCss({ spaceUnit: 10, phoneSpaceScale: 50 })).toContain("--fm-space-scale:0.5");
    const rule = sectionStepCss("abc", "l");
    expect(rule).toContain("#section-abc:not(:has([data-studio-spacing])),#section-abc [data-studio-spacing]{padding-top:");
    expect(rule).not.toContain("!important");
    expect(sectionStepCss("abc", undefined)).toBe("");
  });
  it("corner set, focus ring width and pressed buttons", () => {
    const css = designTokensCss({ radiusScale: "soft", focusRingWidth: 3, inputFocusColor: "#00ff00", buttonPress: "shrink" });
    expect(css).toContain("--rp-card-radius:8px");
    expect(css).toContain("outline:3px solid var(--rp-focus)");
    expect(css).toContain("border-color:#00ff00 !important");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
  });
  it("reaches every storefront surface through StorefrontOverrides", () => {
    expect(storefrontOverridesCss({ typeScale: "golden" })).toContain("--fm-step-5");
  });
});

describe("section gap and card shadow (start at Off)", () => {
  it("draws nothing until chosen", () => {
    const css = designTokensCss({});
    expect(css).not.toContain("[data-fm-section]+[data-fm-section]");
    expect(css).not.toContain(".fm-card{box-shadow");
    // The never-drawn old keys stay ignored, so a saved Raised shadow doesn't appear by itself.
    expect(designTokensCss({ shadowScale: "raised", sectionSpacing: 64 })).toBe(css);
  });
  it("spaces sections after the first and shadows book cards, one step deeper on hover", () => {
    const css = designTokensCss({ sectionGap: 48, cardShadowDepth: "medium" });
    expect(css).toContain("[data-fm-store] [data-fm-section]+[data-fm-section]{margin-top:calc(48px * var(--fm-space-scale, 1));}");
    expect(css).toContain(`[data-fm-store] .fm-card{box-shadow:${CARD_SHADOWS.medium} !important;`);
    expect(css).toContain(`[data-fm-store] .fm-card:hover{box-shadow:${CARD_SHADOWS.raised} !important;}`);
    expect(designTokensCss({ cardShadowDepth: "dramatic" })).toContain(`.fm-card:hover{box-shadow:${CARD_SHADOWS.dramatic}`);
  });
});
