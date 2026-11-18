import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as shop from "./shippingLimits";
import { NO_LIMITS } from "./shippingLimits";

// The server's generated copy must agree (src/shared/CLAUDE.md).
const server = createRequire(import.meta.url)("../../functions/shared/shippingLimits.js") as typeof shop;

const rates = ["Canada Post Regular Parcel", "Canada Post Expedited Parcel", "Canada Post Xpresspost", "Canada Post Priority", "UPS Ground", "UPS Next Day Air", "UPS 3 Day Select", "FedEx Home Delivery", "FedEx 2Day", "USPS Ground Advantage", "USPS Priority Mail", "DHL Express Worldwide"].map((name) => ({ name }));

describe.each([["shop", shop], ["server", server]])("shipping limits by product type (%s copy)", (_side, rules) => {
  it("reads the limits from each product's type", () => {
    expect(rules.shipLimits([{ typeId: "perfume", kind: "other" }, { typeId: "tops", kind: "clothing" }])).toEqual({ groundOnly: true, perishable: false });
    expect(rules.shipLimits([{ typeId: "baked", kind: "other" }])).toEqual({ groundOnly: false, perishable: true });
    expect(rules.shipLimits([{ typeId: "tops", kind: "clothing" }, {}])).toEqual(NO_LIMITS);
  });
  it("leaves out air services for a ground-only bag and keeps the ground ones", () => {
    const kept = rules.carrierRatesFor(rates, { groundOnly: true, perishable: false }).map((r) => r.name);
    expect(kept).toEqual(["Canada Post Regular Parcel", "Canada Post Expedited Parcel", "UPS Ground", "UPS 3 Day Select", "FedEx Home Delivery", "USPS Ground Advantage"]);
    expect(rules.carrierRatesFor(rates, NO_LIMITS)).toHaveLength(rates.length);
  });
  it("offers no post at all for a perishable bag, only pickup or local delivery", () => {
    expect(rules.carrierRatesFor(rates, { groundOnly: false, perishable: true })).toEqual([]);
    expect(rules.profileRatesFor([{ name: "Standard" }], { groundOnly: false, perishable: true })).toEqual([]);
    expect(rules.profileRatesFor([{ name: "Express" }], { groundOnly: true, perishable: false })).toHaveLength(1);
  });
});
