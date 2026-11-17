import { describe, expect, it } from "vitest";
import { linkNeedsRefresh, placeKey, placeToSave, startFrom } from "./listenPlace";

describe("listen place (Digital D3)", () => {
  it("keys one place per order, item, edition and file", () => {
    expect(placeKey("o1", "b1", "", 0)).toBe("lm:listen:o1:b1||0");
    expect(placeKey("o1", "b1", "audio", 2)).toBe("lm:listen:o1:b1|audio|2");
  });
  it("starts where the shopper stopped, never past the end", () => {
    expect(startFrom("125.7", 3600)).toBe(125);
    expect(startFrom(null, 3600)).toBe(0);
    expect(startFrom("abc", 3600)).toBe(0);
    expect(startFrom("-4", 3600)).toBe(0);
    expect(startFrom("3595", 3600)).toBe(0);
    expect(startFrom("3595")).toBe(3595);
  });
  it("forgets the start and the finish", () => {
    expect(placeToSave(2, 100)).toBeNull();
    expect(placeToSave(50.9, 100)).toBe("50");
    expect(placeToSave(90, 100)).toBeNull();
    expect(placeToSave(Number.NaN)).toBeNull();
  });
  it("refreshes a link within a minute of running out", () => {
    expect(linkNeedsRefresh(undefined, 0)).toBe(true);
    expect(linkNeedsRefresh(100_000, 0)).toBe(false);
    expect(linkNeedsRefresh(50_000, 0)).toBe(true);
  });
});
