import { describe, expect, it } from "vitest";
import { buildNewProfile, copyName, duplicateProfile, newProfileProblems, profileSummary, starterPrices } from "./shippingProfileStarters";
import { summarizeShipping } from "./shippingHealth";

const ids = () => { let n = 0; return () => `id${n++}`; };

describe("new shipping profile starters", () => {
  it("each template builds a profile checkout can use straight away", () => {
    for (const starter of ["world", "north-america", "canada"] as const) {
      const profile = buildNewProfile({ name: "Heavy", starter, prices: starterPrices(starter) }, ids());
      expect(profile.zones.length).toBeGreaterThan(0);
      const blocking = summarizeShipping([{ id: "p", ...profile }], []).issues.filter((i) => i.severity === "blocking");
      expect(blocking).toEqual([]);
    }
  });

  it("uses the typed prices and never invents a transit time", () => {
    const prices = starterPrices("canada").map((p) => ({ ...p, first: "14.5", extra: "" }));
    const [zone] = buildNewProfile({ name: "Prints", starter: "canada", prices, freeShippingOver: "100" }, ids()).zones;
    expect(zone.countries).toEqual(["CA"]);
    expect(zone.rates[0]).toMatchObject({ type: "flat", base: 14.5, additional: 0, deliveryDays: "" });
    expect(buildNewProfile({ name: "P", starter: "canada", prices, freeShippingOver: "100" }, ids()).freeShippingOver).toBe(100);
  });

  it("the worldwide template ends with a rest-of-world zone", () => {
    const zones = buildNewProfile({ name: "W", starter: "world", prices: starterPrices("world") }, ids()).zones;
    expect(zones.at(-1)).toMatchObject({ restOfWorld: true, countries: [] });
  });

  it("starting empty or from a copy has no price rows", () => {
    expect(starterPrices("blank")).toEqual([]);
    expect(starterPrices("copy")).toEqual([]);
    expect(buildNewProfile({ name: "E", starter: "blank" }, ids()).zones).toEqual([]);
  });

  it("explains what stops Create profile", () => {
    expect(newProfileProblems({ name: " ", starter: "blank" })).toEqual(["Give the profile a name."]);
    expect(newProfileProblems({ name: "general", starter: "blank" }, ["General"])[0]).toMatch(/already have/);
    expect(newProfileProblems({ name: "X", starter: "copy" })).toEqual(["Choose the profile to copy."]);
    const bad = starterPrices("canada").map((p) => ({ ...p, first: "", extra: "abc" }));
    expect(newProfileProblems({ name: "X", starter: "canada", prices: bad })).toHaveLength(2);
    expect(newProfileProblems({ name: "X", starter: "canada", prices: starterPrices("canada"), freeShippingOver: "lots" })).toHaveLength(1);
    expect(newProfileProblems({ name: "X", starter: "canada", prices: starterPrices("canada") })).toEqual([]);
  });
});

describe("copying a profile", () => {
  const source = {
    id: "src", name: "Heavy", freeShippingOver: 90, handlingFee: 2, defaultItemWeightG: 800, createdAt: "x",
    zones: [{ id: "z1", name: "Canada", countries: ["CA"], rates: [{ id: "r1", name: "Standard", base: 10, additional: 4 }] }],
  };

  it("keeps zones, prices and rules with fresh ids, never the source's id", () => {
    const copy = duplicateProfile(source, ids(), ["Heavy"]);
    expect(copy).not.toHaveProperty("id");
    expect(copy.name).toBe("Heavy (copy)");
    expect(copy).toMatchObject({ freeShippingOver: 90, handlingFee: 2, defaultItemWeightG: 800 });
    expect(copy.zones[0].id).not.toBe("z1");
    expect(copy.zones[0].rates[0]).toMatchObject({ name: "Standard", base: 10, additional: 4 });
    expect(copy.zones[0].rates[0].id).not.toBe("r1");
    copy.zones[0].rates[0].base = 99;
    expect(source.zones[0].rates[0].base).toBe(10);
  });

  it("Copy another profile in the dialog keeps the source's free-shipping amount unless one is typed", () => {
    expect(buildNewProfile({ name: "B", starter: "copy", copyFrom: source }, ids()).freeShippingOver).toBe(90);
    expect(buildNewProfile({ name: "B", starter: "copy", copyFrom: source, freeShippingOver: "50" }, ids()).freeShippingOver).toBe(50);
  });

  it("names copies without clashing", () => {
    expect(copyName("Heavy", ["Heavy", "Heavy (copy)"])).toBe("Heavy (copy 2)");
  });
});

describe("profile summary line", () => {
  it("says where it ships and the cheapest price", () => {
    const profile = buildNewProfile({ name: "W", starter: "world", prices: starterPrices("world") }, ids());
    expect(profileSummary(profile)).toBe("Canada · United States · everywhere else · from $8.00");
    expect(profileSummary({ zones: [] })).toBe("Ships nowhere yet");
    expect(profileSummary({ zones: [{ name: "CA", rates: [] }] })).toBe("CA · no prices yet");
  });
});
