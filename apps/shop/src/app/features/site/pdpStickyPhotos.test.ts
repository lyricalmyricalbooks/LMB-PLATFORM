import { describe, expect, it } from "vitest";
import { photosShouldStick } from "./pdpStickyPhotos";

describe("product photos stay in view beside a taller buy column", () => {
  it("sticks when the photos fit on screen and the buy column is clearly taller", () => {
    expect(photosShouldStick(640, 1400, 900, 90)).toBe(true);
  });
  it("never sticks photos taller than the screen, or beside a buy column that is not taller", () => {
    expect(photosShouldStick(1000, 1800, 900, 90)).toBe(false);
    expect(photosShouldStick(640, 660, 900, 90)).toBe(false);
    expect(photosShouldStick(0, 1400, 900, 90)).toBe(false);
  });
});
