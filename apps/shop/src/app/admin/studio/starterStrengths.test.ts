import { describe, expect, it } from "vitest";
import { STARTER_SITES } from "../lookGallery";
import { STARTER_STRENGTHS, goodFor, strengthsOf } from "./starterStrengths";

describe("what each starter is good at", () => {
  it("covers every starter, and only starters", () => {
    expect(Object.keys(STARTER_STRENGTHS).sort()).toEqual([...STARTER_SITES].sort());
  });
  it("says how big a shop it suits and three short plain things it does well", () => {
    for (const id of STARTER_SITES) {
      expect(goodFor(id), id).toMatch(/^Good for /);
      const lines = strengthsOf(id);
      expect(lines, id).toHaveLength(3);
      for (const line of lines) {
        expect(line.length, line).toBeLessThanOrEqual(48);
        expect(line, line).toMatch(/^[A-Z][^.]*$/);
      }
    }
  });
  it("lists services starters as for appointments and classes", () => {
    expect(goodFor("starter-salon")).toBe("Good for appointments and classes");
    expect(goodFor("starter-warehouse")).toBe("Good for a big range");
    expect(goodFor("press-atlas")).toBe("");
  });
});
