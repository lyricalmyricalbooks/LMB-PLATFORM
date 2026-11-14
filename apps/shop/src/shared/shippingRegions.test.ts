import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { matchShippingZone, regionCode, describeZoneGeography } from "./shippingZones";
import { quoteShipping } from "./shippingEngine";

const require = createRequire(import.meta.url);
const server = require("../../functions/shared/shippingEngine.js");

const rate = (name: string, base: number, additional = 0) => ({ id: name.toLowerCase().replace(/\W+/g, "-"), name, base, additional });
const profile = {
  id: "general-profile",
  zones: [
    { id: "us", region: "United States", countries: ["US"], rates: [rate("Standard", 10, 2)] },
    { id: "akhi", region: "Alaska & Hawaii", regions: ["US-AK", "US-HI"], rates: [rate("Standard", 25, 5)] },
    { id: "east", region: "Atlantic Canada", regions: ["CA-NS", "CA-NB", "CA-PE", "CA-NL"], rates: [rate("Standard", 18)] },
    { id: "on", region: "Ontario", regions: ["CA-ON"], rates: [rate("Standard", 8), rate("Express", 20)] },
    { id: "row", region: "Rest of world", restOfWorld: true, rates: [rate("International", 30)] },
  ],
};
const book = [{ price: 20, quantity: 2, shippingProfileId: "general-profile" }];

describe("state and province zones", () => {
  it("reads codes, names and postal codes", () => {
    expect(regionCode("United States", "AK")).toBe("US-AK");
    expect(regionCode("US", "alaska")).toBe("US-AK");
    expect(regionCode("Canada", "CA-ON")).toBe("CA-ON");
    expect(regionCode("Canada", "", "M6G 3H1")).toBe("CA-ON");
    expect(regionCode("United States", "Please select", "99501")).toBe("US-AK");
    expect(regionCode("France", "IDF")).toBe("");
  });

  it("puts a state ahead of its country", () => {
    const zones = profile.zones as any;
    expect(matchShippingZone("United States", zones, "AK")?.id).toBe("akhi");
    expect(matchShippingZone("United States", zones, "NY")?.id).toBe("us");
    expect(matchShippingZone("United States", zones)?.id).toBe("us");
    expect(matchShippingZone("Canada", zones, "Ontario")?.id).toBe("on");
    expect(matchShippingZone("Canada", zones, "", "B3H 1A1")?.id).toBe("east");
    // A province no zone names falls through to the rest-of-world zone, never another province's price.
    expect(matchShippingZone("Canada", zones, "BC")?.id).toBe("row");
  });

  it("quotes by state in the shop and on the server alike", () => {
    for (const quote of [quoteShipping, server.quoteShipping]) {
      expect(quote(book, { country: "United States", state: "HI" }, [profile]).map((q: any) => q.price)).toEqual([30]);
      expect(quote(book, { country: "United States", state: "TX" }, [profile]).map((q: any) => q.price)).toEqual([12]);
      expect(quote(book, { country: "Canada", state: "ON" }, [profile]).map((q: any) => [q.name, q.price])).toEqual([["Standard", 8], ["Express", 20]]);
      expect(quote(book, { country: "Canada", zip: "E1C 4M3" }, [profile]).map((q: any) => q.price)).toEqual([18]);
      expect(quote(book, { country: "Canada", postalCode: "V6B 1A1" }, [profile]).map((q: any) => q.name)).toEqual(["International"]);
    }
  });

  it("with no rest-of-world zone, an unlisted province can't check out", () => {
    const only = { ...profile, zones: profile.zones.filter((z) => z.id === "on") };
    expect(quoteShipping(book, { country: "Canada", state: "QC" }, [only])).toEqual([]);
    expect(quoteShipping(book, { country: "Canada", state: "ON" }, [only])).toHaveLength(2);
  });

  it("names the states in the zone summary", () => {
    expect(describeZoneGeography(profile.zones[1] as any)).toBe("Alaska, Hawaii");
  });
});
