import { describe, expect, it } from "vitest";
import { nameProblem, savePlan, tryIt, zoneProblems } from "./profilesWorkspace";

const canada = { id: "z1", name: "Canada", countries: ["CA"], rates: [{ type: "flat", base: 8, additional: 2, deliveryDays: "3-5" }] };
const north = { id: "z2", name: "Far north", regions: ["CA-YT"], rates: [{ type: "flat", base: 20, additional: 4 }] };

describe("tryIt", () => {
  it("uses the province zone over the country, and adds extra items", () => {
    const p = { zones: [canada, north] };
    expect(tryIt(p, "CA-ON", 2, 24)).toMatchObject({ ok: true, zone: "Canada", price: 10, line: "$8.00 first + $2.00 × 1 extra" });
    expect(tryIt(p, "CA-YT", 1, 24)).toMatchObject({ ok: true, zone: "Far north", price: 20 });
    expect(tryIt(p, "BR", 1, 24)).toEqual({ ok: false });
  });
  it("is free over the threshold", () => {
    expect(tryIt({ zones: [canada], freeShippingOver: "50" }, "CA-ON", 4, 24)).toMatchObject({ price: 0, free: true });
  });
});

describe("zoneProblems and names", () => {
  it("flags a zone with no places or no first price", () => {
    expect(zoneProblems({ rates: [{ type: "flat", base: "" }] })).toEqual(["places", "price"]);
    expect(zoneProblems({ restOfWorld: true, rates: [{ type: "flat", base: "0" }] })).toEqual([]);
  });
  it("wants a new, unused name", () => {
    expect(nameProblem(" ", [])).toBeTruthy();
    expect(nameProblem("heavy", ["Heavy"])).toBe("You already have “heavy”.");
    expect(nameProblem("Light", ["Heavy"])).toBeNull();
  });
});

describe("savePlan", () => {
  it("creates, deletes, updates and moves books", () => {
    const saved = [{ id: "general-profile", zones: [] }, { id: "a", name: "A", zones: [] }, { id: "b", name: "B", zones: [] }];
    const draft = [{ id: "general-profile", zones: [] }, { id: "a", name: "A2", zones: [] }, { id: "new-1", name: "N", zones: [] }];
    const plan = savePlan(saved, draft, { x: "a", y: "general-profile", z: "b" }, { x: "general-profile", y: "new-1", z: "general-profile" });
    expect(plan.create.map((p) => p.id)).toEqual(["new-1"]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.update.map((p) => p.id)).toEqual(["a"]);
    expect(plan.assign).toEqual([{ profileId: "a", add: [], removed: ["x"] }, { profileId: "new-1", add: ["y"], removed: [] }]);
  });
});
