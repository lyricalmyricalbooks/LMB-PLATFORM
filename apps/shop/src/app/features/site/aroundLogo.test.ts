import { describe, expect, it } from "vitest";
import { aroundLogo } from "./StoreHeader";

describe("links on both sides of a centred logo", () => {
  const on = { navAroundLogo: true };
  it("splits the links in half, the extra one on the left", () => {
    expect(aroundLogo(on, "center", false, false, [1, 2, 3])).toEqual({ left: [1, 2], right: [3] });
  });
  it("stays off unless switched on, centred, inline and with two links", () => {
    expect(aroundLogo({}, "center", false, false, [1, 2])).toBeNull();
    expect(aroundLogo(on, "left", false, false, [1, 2])).toBeNull();
    expect(aroundLogo(on, "center", true, false, [1, 2])).toBeNull();
    expect(aroundLogo(on, "center", false, true, [1, 2])).toBeNull();
    expect(aroundLogo(on, "center", false, false, [1])).toBeNull();
  });
});
