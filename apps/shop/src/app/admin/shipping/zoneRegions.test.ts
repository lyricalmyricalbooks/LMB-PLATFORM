import { describe, expect, it } from "vitest";
import { cleanRegions, groupState, regionsSummary, regionsTakenElsewhere, toggleGroup } from "./zoneRegions";
import { summarizeShipping } from "../shippingHealth";

describe("zone region picks", () => {
  it("cleans and de-duplicates", () => {
    expect(cleanRegions(["US-AK", "us-ak", "CA-ON", "XX-YY", "FR-75"])).toEqual(["US-AK", "CA-ON"]);
  });
  it("adds a group around places another zone holds, and takes a full group off", () => {
    const taken = regionsTakenElsewhere([{ id: "a", regions: ["CA-NS"] }, { id: "b", regions: ["CA-ON"] }], "b");
    const on = toggleGroup([], "CA", ["NB", "NL", "NS", "PE"], taken);
    expect(on).toEqual(["CA-NB", "CA-NL", "CA-PE"]);
    expect(groupState(on, "CA", ["NB", "NL", "NS", "PE"], taken)).toBe("all");
    expect(toggleGroup(on, "CA", ["NB", "NL", "NS", "PE"], taken)).toEqual([]);
  });
  it("summarises for the zone list", () => {
    expect(regionsSummary(["US-AK", "US-HI"])).toBe("Alaska, Hawaii");
    expect(regionsSummary(["CA-AB", "CA-SK", "CA-MB", "CA-BC"])).toBe("4 provinces in Canada");
  });
  it("warns when only some states are covered, and flags a state in two zones", () => {
    const rates = [{ id: "r", name: "Standard", base: 5, deliveryDays: "3-5" }];
    const s = summarizeShipping([{ id: "p", name: "P", zones: [
      { id: "z1", name: "AK", regions: ["US-AK"], rates },
      { id: "z2", name: "AK again", regions: ["US-AK"], rates },
    ] }]);
    expect(s.issues.map((i) => i.id)).toEqual(expect.arrayContaining(["profile:p:zone:z2:region-duplicates", "profile:p:regions:US"]));
    const covered = summarizeShipping([{ id: "p", name: "P", zones: [
      { id: "z1", name: "US", countries: ["US"], rates },
      { id: "z2", name: "AK", regions: ["US-AK"], rates },
    ] }]);
    expect(covered.issues).toEqual([]);
  });
});
