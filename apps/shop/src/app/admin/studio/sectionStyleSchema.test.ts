import { describe, expect, it } from "vitest";
import { sectionStyleFields, sectionStyleValue, SPACING_CARD_KEYS } from "./sectionStyleSchema";

// Every key the old hand-written "Layout & style" panel wrote (frozen when it was replaced in 1.5).
const OLD_PANEL_KEYS = "animation backdropBlur bgColor bgGradientDir bgGradientFrom bgGradientTo bgImagePosition bgImageSize bgImageUrl bodyColor bodyFontOverride boxColor boxShadow btnBg btnMagnetic btnRadius btnStyle btnText btnUppercase colorSchemeId containerWidth cornerRadius customClass customCss fullWidth headingColor headingFontOverride headingGradientFrom headingGradientTo headingSize headingWeight hideOnDesktop hideOnMobile hoverEffect letterSpacingOverride lineColor lineHeightOverride mobileColumns mobileFontScale mobileHeadingSize mobilePaddingBottom mobilePaddingTop paddingBottom paddingLeft paddingRight paddingTop raisedBoxColor shapeDividerBottom shapeDividerBottomColor shapeDividerTop shapeDividerTopColor showFrom showUntil textTransform".split(" ");

describe("section style schema", () => {
  const fields = sectionStyleFields([{ id: "s1", name: "Ink" }]);
  it("keeps every setting the old Layout & style panel offered", () => {
    const covered = new Set([...fields.map(f => f.key), ...SPACING_CARD_KEYS]);
    expect(OLD_PANEL_KEYS.filter(k => !covered.has(k))).toEqual([]);
  });
  it("lists each key once, in a tab", () => {
    const keys = fields.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(fields.every(f => ["style", "layout", "visibility"].includes(f.tab))).toBe(true);
  });
  it("offers a Design scales spacing step (3.0 phase 2)", () => {
    const f = fields.find(x => x.key === "spacingStep") as any;
    expect(f.tab).toBe("layout");
    expect(f.options.map((o: any) => o.value)).toEqual(["", "xs", "s", "m", "l", "xl"]);
  });
  it("adds hiding on tablets", () => {
    expect(fields.find(f => f.key === "hideOnTablet")?.tab).toBe("visibility");
  });
  it("adds hiding when a connected detail is empty (2.7)", () => {
    expect(fields.find(f => f.key === "hideWhenEmpty")?.tab).toBe("visibility");
  });
  it("offers the shop's colour schemes", () => {
    const f = fields.find(x => x.key === "colorSchemeId") as any;
    expect(f.options.map((o: any) => o.value)).toEqual(["", "s1"]);
  });
  it("clears a setting the way the old panel did", () => {
    const by = (k: string) => fields.find(f => f.key === k)!;
    expect(sectionStyleValue(by("bgColor"), "")).toBeUndefined();
    expect(sectionStyleValue(by("shapeDividerTop"), "none")).toBeUndefined();
    expect(sectionStyleValue(by("shapeDividerTop"), "wave")).toBe("wave");
    expect(sectionStyleValue(by("hideOnMobile"), false)).toBeUndefined();
    expect(sectionStyleValue(by("hideOnMobile"), true)).toBe(true);
    expect(sectionStyleValue(by("headingSize"), 40)).toBe(40);
  });
});
