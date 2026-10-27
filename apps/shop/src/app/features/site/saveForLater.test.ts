import { describe, expect, it } from "vitest";
import { canSaveForLater, saveForLaterOn } from "./saveForLater";

describe("save for later", () => {
  it("is off unless the owner turned it on", () => {
    expect(saveForLaterOn({})).toBe(false);
    expect(saveForLaterOn(undefined)).toBe(false);
    expect(saveForLaterOn({ cartDrawerShowSaveForLater: "yes" })).toBe(false);
    expect(saveForLaterOn({ cartDrawerShowSaveForLater: true })).toBe(true);
  });

  it("offers books but never gift cards", () => {
    expect(canSaveForLater({ id: "b1" })).toBe(true);
    expect(canSaveForLater({ id: "b1", giftCard: true })).toBe(false);
    expect(canSaveForLater({ id: "" })).toBe(false);
    expect(canSaveForLater(null)).toBe(false);
  });
});
