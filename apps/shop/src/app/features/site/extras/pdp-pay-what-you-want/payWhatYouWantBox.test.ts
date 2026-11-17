import { describe, expect, it } from "vitest";
import { readAmount } from "./payWhatYouWantBox";

describe("readAmount", () => {
  it("reads what the buyer typed in the shop's currency", () => {
    expect(readAmount("", 5, 1)).toEqual({ amount: 5 });
    expect(readAmount("$12", 5, 1)).toEqual({ amount: 12 });
    expect(readAmount("12,5", 5, 1)).toEqual({ amount: 12.5 });
    expect(readAmount("1,000", 5, 1)).toEqual({ amount: 1000 });
    expect(readAmount("1 000,50", 5, 2)).toEqual({ amount: 500.25 });
  });
  it("converts from the shown currency and treats rounding as the lowest", () => {
    expect(readAmount("10", 5, 2)).toEqual({ amount: 5 });
    expect(readAmount("3.65", 5, 0.73)).toEqual({ amount: 5 });
  });
  it("names the problem with a wrong amount", () => {
    expect(readAmount("4", 5, 1)).toEqual({ problem: "low" });
    expect(readAmount("1000.01", 5, 1)).toEqual({ problem: "high" });
    expect(readAmount("1.2.3", 5, 1)).toEqual({ problem: "number" });
  });
});
