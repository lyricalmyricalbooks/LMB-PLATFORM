import { describe, expect, it } from "vitest";
import { phoneNavSplit } from "./PhoneNav";

describe("phone bottom menu (v3)", () => {
  it("shows every item when there are five or fewer", () => {
    expect(phoneNavSplit([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3, 4, 5], more: [] });
  });
  it("shows the first four and puts the rest under More when there are more than five", () => {
    expect(phoneNavSplit([1, 2, 3, 4, 5, 6, 7])).toEqual({ shown: [1, 2, 3, 4], more: [5, 6, 7] });
  });
});
