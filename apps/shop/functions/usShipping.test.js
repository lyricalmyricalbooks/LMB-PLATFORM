// An American shop's labels and live rates start from USPS, as a Canadian shop's start from Canada Post.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { canadaPostRates, liveCheckoutRates } from "../src/app/features/site/canadaPostRates";
import { profileStarters, starterPrices } from "../src/app/admin/shippingProfileStarters";

const require = createRequire(import.meta.url);
const { labelRatesFor, isPurchasableRate, homeCarrierName } = require("./labelRates.js");

const RATES = [
  { object_id: "a", provider: "USPS", servicelevel: { name: "Priority Mail" }, amount: "9.10" },
  { object_id: "b", provider: "USPS", servicelevel: { name: "Ground Advantage" }, amount: "5.40" },
  { object_id: "c", provider: "Canada Post", servicelevel: { name: "Expedited Parcel" }, amount: "12.40" },
  { object_id: "d", provider: "UPS", servicelevel: { name: "Ground" }, amount: "11.00" },
];

describe("labels and live rates in an American shop", () => {
  it("offers the sold service first, then USPS, and lets only those be bought", () => {
    const order = { shippingMethod: "UPS Ground" };
    expect(labelRatesFor(RATES, order, 5, "US").map((r) => r.object_id)).toEqual(["d", "b", "a"]);
    expect(labelRatesFor(RATES, order).map((r) => r.object_id)).toEqual(["d", "c"]);
    expect(isPurchasableRate(RATES[0], {}, "US")).toBe(true);
    expect(isPurchasableRate(RATES[2], {}, "US")).toBe(false);
    expect(isPurchasableRate(RATES[2], {})).toBe(true);
    expect([homeCarrierName("US"), homeCarrierName("CA"), homeCarrierName(undefined)]).toEqual(["USPS", "Canada Post", "Canada Post"]);
  });

  it("shows the shopper USPS first, and Canada Post first in a Canadian shop", () => {
    const quotes = [{ name: "USPS Priority Mail", price: 9.1 }, { name: "Canada Post Expedited Parcel", price: 12.4 }, { name: "UPS Ground", price: 4 }];
    expect(liveCheckoutRates(quotes, "US").map((r) => r.name)).toEqual(["USPS Priority Mail"]);
    expect(liveCheckoutRates(quotes, "CA").map((r) => r.name)).toEqual(["Canada Post Expedited Parcel"]);
    expect(canadaPostRates(quotes).map((r) => r.name)).toEqual(["Canada Post Expedited Parcel"]);
  });

  it("starts shipping from the United States", () => {
    expect(profileStarters("US").slice(0, 3).map((s) => s.label)).toEqual(["United States, Canada & everywhere else", "United States & Canada", "United States only"]);
    expect(profileStarters().slice(0, 3).map((s) => s.label)).toEqual(["Canada, US & everywhere else", "Canada & United States", "Canada only"]);
    const us = starterPrices("world", null, "US");
    const ca = starterPrices("world", null, "CA");
    expect(us.map((z) => z.zone)).toEqual(["United States", "Canada", "Rest of world"]);
    expect(ca.map((z) => z.zone)).toEqual(["Canada", "United States", "Rest of world"]);
    // Sending within the shop's own country costs what "within Canada" does for a Canadian shop.
    expect(us[0].first).toBe(ca[0].first);
    expect(us[1].first).toBe(ca[1].first);
    expect(starterPrices("canada", null, "US").map((z) => z.countries)).toEqual([["US"]]);
  });
});
