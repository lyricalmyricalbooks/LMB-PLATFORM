import { describe, expect, it } from "vitest";
import { matchShippingZone } from "../../features/site/shippingZones";
import {
  applyQuickPick, continentState, countriesOf, countryState, findPlaces, lacksEverywhereElse, pickedChips, picksOf,
  quickPicks, regionCount, regionState, setAllRegions, suggestName, uncoveredLine, uncoveredRegions, takenBy, toggleContinent, toggleCountry, toggleRegion,
  zoneFromPicks, zoneSummary, type Picks,
} from "./zonePlaces";

const none: Picks = { countries: [], regions: [], restOfWorld: false };

describe("picksOf", () => {
  it("reads older saves: names become codes, continents expand, states inside a whole country drop", () => {
    const p = picksOf({ countries: ["Canada", "US"], continents: ["Oceania"], regions: ["CA-ON", "US-AK", "XX-ZZ"] });
    expect(p.countries).toContain("CA");
    expect(p.countries).toContain("US");
    expect(p.countries).toContain("AU");
    expect(p.regions).toEqual([]);
    expect(p.restOfWorld).toBe(false);
  });
});

describe("countries and states", () => {
  it("picking a country drops its single states; taking one state off keeps the rest", () => {
    let p = toggleRegion(none, "CA-ON");
    expect(countryState(p, "CA")).toBe("some");
    p = toggleCountry(p, "CA");
    expect(p).toMatchObject({ countries: ["CA"], regions: [] });
    p = toggleRegion(p, "CA-NU");
    expect(p.countries).toEqual([]);
    expect(regionCount(p, "CA")).toEqual({ on: 12, of: 13 });
    expect(regionState(p, "CA-NU")).toBe(false);
  });

  it("ticking the last open state becomes the whole country again", () => {
    let p = toggleRegion(toggleCountry(none, "CA"), "CA-YT");
    p = toggleRegion(p, "CA-YT");
    expect(p).toMatchObject({ countries: ["CA"], regions: [] });
  });

  it("a country another zone holds picks its open states instead, so they win over it at checkout", () => {
    const taken = takenBy([{ name: "Canada", countries: ["CA"], regions: [] }, { name: "North", regions: ["CA-NU"] }]);
    const p = toggleCountry(none, "CA", taken);
    expect(p.countries).toEqual([]);
    expect(p.regions).toHaveLength(12);
    expect(p.regions).not.toContain("CA-NU");
    // Every open state ticked, but the country lives elsewhere: it stays states.
    expect(toggleRegion(toggleRegion(p, "CA-ON", taken), "CA-ON", taken).countries).toEqual([]);
    const zone = zoneFromPicks({ id: "z" }, p, "Most of Canada");
    expect(matchShippingZone("CA", [{ id: "a", name: "Canada", countries: ["CA"], base: 0, additional: 0 } as any, { ...zone, base: 0, additional: 0 } as any], "ON")?.id).toBe("z");
  });
});

describe("continents and quick picks", () => {
  it("a continent skips countries other zones hold", () => {
    const taken = takenBy([{ name: "UK", countries: ["GB"] }]);
    const p = toggleContinent(none, "Europe", taken);
    expect(p.countries).not.toContain("GB");
    expect(continentState(p, "Europe", taken)).toMatchObject({ state: "all", of: countriesOf("Europe").length - 1 });
    expect(toggleContinent(p, "Europe", taken).countries).toEqual([]);
  });

  it("offers home, the far-off part, the neighbour, Europe and everywhere else", () => {
    expect(quickPicks(none, "CA").map((q) => q.label)).toEqual(["Canada", "The territories", "United States", "Europe", "Everywhere else"]);
    expect(quickPicks(none, "US").map((q) => q.label)[1]).toBe("Alaska, Hawaii & Puerto Rico");
  });

  it("the far-off pick adds and removes only those states", () => {
    const p = applyQuickPick(none, "far", "US");
    expect(p.regions.sort()).toEqual(["US-AK", "US-HI", "US-PR"]);
    expect(suggestName(p)).toBe("Alaska, Hawaii & Puerto Rico");
    expect(applyQuickPick(p, "far", "US").regions).toEqual([]);
    // With the whole country picked, removing the far-off part keeps the lower 48.
    const lower = applyQuickPick(toggleCountry(none, "US"), "far", "US");
    expect(lower.countries).toEqual([]);
    expect(lower.regions).not.toContain("US-AK");
    expect(suggestName(lower)).toBe("Lower 48 + DC");
  });

  it("everywhere else clears other picks and is greyed out when another zone has it", () => {
    expect(applyQuickPick(toggleCountry(none, "CA"), "rest", "CA")).toEqual({ countries: [], regions: [], restOfWorld: true });
    expect(quickPicks(none, "CA", takenBy([{ name: "World", restOfWorld: true }])).at(-1)?.disabled).toBe("World");
  });
});

describe("words", () => {
  it("search finds countries first, then states and provinces", () => {
    const hits = findPlaces("new");
    expect(hits[0]).toMatchObject({ kind: "country" });
    expect(hits.some((h) => h.kind === "region" && h.code === "CA-NB")).toBe(true);
    expect(findPlaces("")).toEqual([]);
  });

  it("names and chips read like a person would say them", () => {
    expect(suggestName(none)).toBe("");
    expect(suggestName(toggleCountry(none, "CA"))).toBe("Canada");
    expect(suggestName(toggleCountry(toggleCountry(none, "CA"), "US"))).toBe("Canada & United States");
    const eu = toggleContinent(none, "Europe");
    expect(suggestName(eu)).toBe("Europe");
    expect(pickedChips(eu)).toHaveLength(1);
    expect(pickedChips(eu)[0].label).toBe("All of Europe");
    let many = none;
    for (const r of ["US-NY", "US-NJ", "US-CT", "US-MA", "US-PA"]) many = toggleRegion(many, r);
    expect(pickedChips(many)[0].label).toBe("5 states in United States");
    expect(pickedChips(many)[0].remove(many).regions).toEqual([]);
  });

  it("saves codes only and summarises zones for the profile list", () => {
    const z = zoneFromPicks({ id: "z", continents: ["Europe"], region: "" }, toggleCountry(none, "CA"), "Home");
    expect(z).toMatchObject({ countries: ["CA"], regions: [], continents: [], restOfWorld: false, name: "Home" });
    expect(zoneSummary(z)).toBe("Canada");
    expect(zoneSummary({ restOfWorld: true })).toBe("Everywhere else");
    expect(lacksEverywhereElse([z])).toBe(true);
    expect(lacksEverywhereElse([z, { restOfWorld: true }])).toBe(false);
    expect(lacksEverywhereElse([])).toBe(false);
  });
});

describe("select all, clear and places left out", () => {
  it("select all picks the whole country, or only the open states when another zone holds it; clear takes them off", () => {
    expect(setAllRegions(toggleRegion(none, "CA-ON"), "CA", true)).toMatchObject({ countries: ["CA"], regions: [] });
    const taken = takenBy([{ name: "Canada", countries: ["CA"] }, { name: "North", regions: ["CA-NU"] }]);
    const p = setAllRegions(none, "CA", true, taken);
    expect(p.countries).toEqual([]);
    expect(p.regions).toHaveLength(12);
    expect(setAllRegions(p, "CA", false, taken).regions).toEqual([]);
  });

  it("names states no zone covers, unless a country or Everywhere else covers them", () => {
    const lower = applyQuickPick(toggleCountry(none, "US"), "far", "US");
    const zones = [{ name: "Lower", regions: lower.regions.filter((r) => r !== "US-TX") }];
    expect(uncoveredRegions(zones)).toEqual([{ country: "United States", names: expect.arrayContaining(["Texas", "Alaska"]) }]);
    expect(uncoveredLine({ country: "Canada", names: ["Ontario"] })).toBe("Ontario in Canada");
    expect(uncoveredLine({ country: "Canada", names: ["A", "B", "C", "D"] })).toBe("A, B and 2 more in Canada");
    expect(uncoveredRegions([...zones, { restOfWorld: true }])).toEqual([]);
    expect(uncoveredRegions([{ countries: ["US"] }, { regions: ["US-AK"] }])).toEqual([]);
    expect(uncoveredRegions([{ countries: ["GB"] }])).toEqual([]);
  });
});
