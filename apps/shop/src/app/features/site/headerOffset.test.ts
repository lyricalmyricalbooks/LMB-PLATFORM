import { describe, expect, it } from "vitest";
import { stuckHeaderBottom } from "./headerOffset";

describe("stuckHeaderBottom", () => {
  it("is the header's height when it sticks to the top", () => {
    expect(stuckHeaderBottom("sticky", "0px", 129.6)).toBe(130);
  });
  it("adds the announcement bar the header sticks under", () => {
    expect(stuckHeaderBottom("sticky", "40px", 120)).toBe(160);
  });
  it("is 0 when the header scrolls away with the page", () => {
    expect(stuckHeaderBottom("relative", "0px", 130)).toBe(0);
    expect(stuckHeaderBottom("static", "auto", 130)).toBe(0);
  });
  it("treats an auto top as 0", () => {
    expect(stuckHeaderBottom("sticky", "auto", 90)).toBe(90);
  });
});
