import { describe, expect, it } from "vitest";
import { COUNTRIES, CONTINENTS } from "../features/site/shippingZones";
import { assignedCountryNames, groupedCountries, remainingCountryNames, toCountryCodes } from "./shippingCountries";

describe("shipping country selection", () => {
  it("organizes the complete country catalog by continent without omissions", () => {
    const groups = groupedCountries();
    expect(groups.map((group) => group.continent)).toEqual(CONTINENTS);
    expect(groups.flatMap((group) => group.countries)).toHaveLength(COUNTRIES.length);
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(groups.flatMap((group) => group.countries.map((country) => country.code))).size).toBe(COUNTRIES.length);
  });

  it("finds every country not assigned to another zone and understands legacy ISO codes", () => {
    const zones = [
      { id: "active", countries: ["Canada"] },
      { id: "other", countries: ["US", "France"] },
    ];

    expect(assignedCountryNames(zones, "active")).toEqual(new Set(["United States", "France"]));
    expect(remainingCountryNames(zones, "active")).toContain("Canada");
    expect(remainingCountryNames(zones, "active")).not.toContain("United States");
    expect(remainingCountryNames(zones, "active")).not.toContain("France");
  });

  it("searches country names and ISO codes while retaining continent groups", () => {
    expect(groupedCountries("NZ")).toEqual([
      { continent: "Africa", countries: [expect.objectContaining({ code: "TZ", name: "Tanzania" })] },
      { continent: "Oceania", countries: [expect.objectContaining({ code: "NZ", name: "New Zealand" })] },
    ]);
  });

  it("a two-letter query that is also a code still finds names containing it", () => {
    const names = groupedCountries("us").flatMap((g) => g.countries.map((c) => c.name));
    expect(names).toContain("United States");
    expect(names).toContain("Australia");
  });

  it("stores zones as ISO codes, from names or codes", () => {
    expect(toCountryCodes(["Canada", "us", "Nowhere", "CA"])).toEqual(["CA", "US"]);
  });
});
