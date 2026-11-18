import { describe, expect, test } from "vitest";
import { tipBaseMinor, tipFor, tipsOffered } from "./tipAtCheckout";

describe("the tip line at checkout", () => {
  test("offered only while the website says tips are on", () => {
    expect(tipsOffered(null)).toEqual([]);
    expect(tipsOffered({ givingTips: [] })).toEqual([]);
    expect(tipsOffered({ givingTips: [15, 10, 99] })).toEqual([10, 15]);
  });
  test("worked out on the items after discount, without gift cards in the bag", () => {
    expect(tipBaseMinor(60, 20, 4)).toBe(3600);
    expect(tipBaseMinor(10, 0, 20)).toBe(0);
  });
  test("a percent, no tip, or the shopper's own amount", () => {
    expect(tipFor("none", "", 3600, [10, 15])).toEqual({ minor: 0 });
    expect(tipFor(15, "", 3600, [10, 15])).toEqual({ minor: 540 });
    expect(tipFor(20, "", 3600, [10, 15])).toEqual({ minor: 0 });
    expect(tipFor("other", "", 3600, [10])).toEqual({ minor: 0 });
    expect(tipFor("other", "7,50", 3600, [10])).toEqual({ minor: 750 });
    // typed in US dollars at 0.73: back to the shop's currency
    expect(tipFor("other", "7.30", 3600, [10], 0.73)).toEqual({ minor: 1000 });
  });
  test("a typed tip outside the bounds is refused; a small percent rounds up to the lowest tip", () => {
    expect(tipFor("other", "0.50", 3600, [10])).toEqual({ problem: "tipTooSmall" });
    expect(tipFor("other", "5000", 3600, [10])).toEqual({ problem: "tipTooBig" });
    expect(tipFor(10, "", 500, [10])).toEqual({ minor: 100 });
    expect(tipFor(10, "", 0, [10])).toEqual({ minor: 0 });
  });
});
