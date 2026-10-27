import { describe, expect, it } from "vitest";
import { quickViewBlurb, quickViewNeedsChoice } from "./QuickView";

describe("quick view helpers", () => {
  it("turns an HTML description into a short plain blurb cut on a word", () => {
    expect(quickViewBlurb("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world");
    const long = quickViewBlurb(`<p>${"word ".repeat(200)}</p>`, 50);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(51);
    expect(quickViewBlurb(undefined)).toBe("");
  });
  it("sends books that need a choice to their own page", () => {
    expect(quickViewNeedsChoice({ variants: [{}, {}] })).toBe(true);
    expect(quickViewNeedsChoice({ addOns: [{}] })).toBe(true);
    expect(quickViewNeedsChoice({ productType: "giftCard" })).toBe(true);
    expect(quickViewNeedsChoice({ variants: [{}] })).toBe(false);
  });
});
