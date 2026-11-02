import { describe, expect, test } from "vitest";
import { dutiesNote } from "./importDuties";

describe("dutiesNote", () => {
  test("off, or no country yet, shows nothing", () => {
    expect(dutiesNote(undefined, "United States", 50)).toBeNull();
    expect(dutiesNote({ on: false }, "United States", 50)).toBeNull();
    expect(dutiesNote({ on: true }, "", 50)).toBeNull();
  });
  test("a parcel that stays in the home country shows nothing, whatever the spelling", () => {
    expect(dutiesNote({ on: true }, "Canada", 50)).toBeNull();
    expect(dutiesNote({ on: true }, "CA", 50)).toBeNull();
    expect(dutiesNote({ on: true, home: "United States" }, "USA", 50)).toBeNull();
  });
  test("abroad shows the note, with an estimate only when a rate is set", () => {
    expect(dutiesNote({ on: true }, "United States", 80)).toEqual({ country: "United States", rate: null, amount: null });
    expect(dutiesNote({ on: true, estimateRate: "12.5" }, "Germany", 80)).toEqual({ country: "Germany", rate: 12.5, amount: 10 });
    expect(dutiesNote({ on: true, estimateRate: 250 }, "Germany", 80)?.rate).toBeNull();
  });
});
