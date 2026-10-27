import { describe, expect, it } from "vitest";
import { fitWithin } from "./prepareImage";

describe("fitWithin", () => {
  it("keeps small images as-is", () => expect(fitWithin(800, 1200)).toEqual({ width: 800, height: 1200, scaled: false }));
  it("scales the long edge down, keeping shape", () => expect(fitWithin(4000, 3000)).toEqual({ width: 2400, height: 1800, scaled: true }));
});
