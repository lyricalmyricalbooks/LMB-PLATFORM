import { expect, it } from "vitest";
import { normalizeOrderNumber } from "./orderNumber";

it("accepts order numbers copied with a # or spaces", () => {
  expect(normalizeOrderNumber(" #ABCD-047691-K2XP ")).toBe("ABCD-047691-K2XP");
  expect(normalizeOrderNumber("ABCD - 047691")).toBe("ABCD-047691");
});
it("rejects input that can't be a document id", () => {
  expect(normalizeOrderNumber("a/b")).toBe("");
  expect(normalizeOrderNumber("  #  ")).toBe("");
});
