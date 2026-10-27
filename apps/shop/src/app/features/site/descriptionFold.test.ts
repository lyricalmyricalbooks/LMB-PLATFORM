import { describe, expect, it } from "vitest";
import { descriptionFoldOn, foldLines, mightOverflow, overflows } from "./descriptionFold";

describe("description fold", () => {
  it("is off unless switched on", () => {
    expect(descriptionFoldOn(undefined)).toBe(false);
    expect(descriptionFoldOn({ pdpDescriptionFold: "true" })).toBe(false);
    expect(descriptionFoldOn({ pdpDescriptionFold: true })).toBe(true);
  });
  it("clamps the line count", () => {
    expect(foldLines({})).toBe(8);
    expect(foldLines({ pdpDescriptionFoldLines: 1 })).toBe(3);
    expect(foldLines({ pdpDescriptionFoldLines: 99 })).toBe(40);
    expect(foldLines({ pdpDescriptionFoldLines: "12" })).toBe(12);
    expect(foldLines({ pdpDescriptionFoldLines: "x" })).toBe(8);
  });
  it("guesses long texts at phone width", () => {
    expect(mightOverflow("", 8)).toBe(false);
    expect(mightOverflow({ $dyn: "x" }, 8)).toBe(false);
    expect(mightOverflow("A short blurb.", 8)).toBe(false);
    expect(mightOverflow("x".repeat(40 * 9), 8)).toBe(true);
    expect(mightOverflow("a\nb\nc\nd\ne\nf\ng\nh", 8)).toBe(false);
    expect(mightOverflow("a\nb\nc\nd\ne\nf\ng\nh\ni", 8)).toBe(true);
  });
  it("measures only a drawn box", () => {
    expect(overflows(0, 0)).toBe(null);
    expect(overflows(300, 200)).toBe(true);
    expect(overflows(201, 200)).toBe(false);
  });
});
