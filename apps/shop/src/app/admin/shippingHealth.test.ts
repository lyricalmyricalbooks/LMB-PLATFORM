import { describe, expect, it } from "vitest";
import { summarizeShipping } from "./shippingHealth";

describe("summarizeShipping", () => {
  it("counts profiles, zones, rates, unique countries, and assignments", () => {
    const summary = summarizeShipping([
      { id: "general", name: "General", zones: [{ id: "ca", name: "Canada", countries: ["CA"], rates: [{ id: "standard", name: "Standard", deliveryDays: "3-7" }] }] },
      { id: "art", name: "Art books", zones: [{ id: "intl", name: "International", countries: ["CA", "US"], rates: [{ id: "express", name: "Express", deliveryDays: "2-4" }, { id: "tracked", name: "Tracked", deliveryDays: "5-10" }] }] },
    ], [
      { id: "one", shippingProfileId: "general" },
      { id: "two", shippingProfileId: "art" },
      { id: "three" },
    ]);

    expect(summary).toMatchObject({ profileCount: 2, zoneCount: 2, rateCount: 3, coveredCountryCount: 2, assignedProductCount: 2 });
    expect(summary.issues).toEqual([]);
  });

  it("surfaces profiles without zones, zones without rates, and missing profile assignments", () => {
    const summary = summarizeShipping([
      { id: "general", name: "General", zones: [] },
      { id: "special", name: "Special", zones: [{ id: "us", name: "United States", countries: ["US"], rates: [] }] },
    ], [{ id: "orphan", shippingProfileId: "deleted-profile" }]);

    expect(summary.issues.map((issue) => issue.id)).toEqual([
      "profile:general:zones",
      "profile:special:zone:us:rates",
      "orphaned-products",
    ]);
  });
});

describe("shipping safety diagnostics", () => {
  it("flags missing profiles", () => expect(summarizeShipping([], []).issues.map(i => i.id)).toContain("no-profiles"));
  it("flags empty destinations, overlapping zones, malformed rates, and duplicate names", () => {
    const summary = summarizeShipping([{ id: "p", name: "General", zones: [
      { id: "a", name: "A", countries: ["CA"], rates: [{ id: "1", name: "Standard", base: -1, additional: 0, deliveryDays: "" }] },
      { id: "b", name: "B", countries: ["CA"], rates: [{ id: "2", name: "Standard", base: 1, additional: 0, deliveryDays: "3-5" }, { id: "3", name: "Standard", base: 2, additional: 0, deliveryDays: "3-5" }] },
      { id: "c", name: "C", countries: [], rates: [{ id: "4", name: "", base: 0, additional: 0, deliveryDays: "2" }] },
    ] }], []);
    const ids = summary.issues.map(i => i.id);
    expect(ids.some(id => id.endsWith(":countries"))).toBe(true);
    expect(ids.some(id => id.endsWith(":duplicates"))).toBe(true);
    expect(ids.some(id => id.endsWith(":negative"))).toBe(true);
    // A missing transit time is a neutral hint, never a checkout-readiness issue.
    expect(ids.some(id => id.endsWith(":delivery"))).toBe(false);
    expect(summary.hints.some(h => h.id.endsWith(":delivery"))).toBe(true);
    expect(ids.some(id => id.endsWith(":duplicate"))).toBe(true);
    expect(ids.some(id => id.endsWith(":name"))).toBe(true);
  });
});

import { describeRatePrice, describeRateConditions, rateIssues, starterZones } from "./shippingHealth";
describe("rate descriptions", () => {
  it("describes each pricing type", () => {
    expect(describeRatePrice({ base: 15, additional: 5 })).toBe("$15.00 + $5.00 per extra");
    expect(describeRatePrice({ type: "order", base: 9, freeOver: 60 })).toBe("$9.00 per order · free over $60.00");
    expect(describeRatePrice({ type: "weight", base: 5, perKg: 7 })).toBe("$5.00 + $7.00/kg");
    expect(describeRatePrice({ type: "pickup" })).toBe("Free pickup");
  });
  it("describes conditions and flags impossible ranges", () => {
    expect(describeRateConditions({ minPrice: 50, maxWeight: 2000 })).toBe("order ≥ $50.00 · weight ≤ 2000g");
    expect(describeRateConditions({})).toBe("");
    expect(rateIssues({ minPrice: 100, maxPrice: 10 })).toHaveLength(1);
  });
  it("starter zones cover the world with a rate each", () => {
    let n = 0; const zones = starterZones(() => `id${n++}`);
    expect(zones.every((z: any) => z.rates.length > 0)).toBe(true);
    expect(zones.some((z: any) => z.restOfWorld)).toBe(true);
  });

  it("starter zones (with a rest-of-world zone) are ready — no false 'no destinations'", () => {
    let n = 0; const zones = starterZones(() => `z${n++}`);
    const summary = summarizeShipping([{ id: "general-profile", name: "General", zones }], []);
    expect(summary.issues.filter((i) => i.severity === "blocking")).toEqual([]);
  });
  it("blocks a zone whose rates are all switched off or pickup-only", () => {
    const zones = [{ id: "z", name: "Canada", countries: ["CA"], rates: [
      { id: "a", name: "Off", enabled: false, base: 5, deliveryDays: "2" },
      { id: "b", name: "Pickup", type: "pickup" },
    ] }];
    const ids = summarizeShipping([{ id: "p", name: "P", zones }], []).issues.map((i) => i.id);
    expect(ids).toContain("profile:p:zone:z:offerable");
  });
  it("flags places checkout can't recognise and overlaps between a name and its code", () => {
    const zones = [
      { id: "a", name: "A", countries: ["Canada"], rates: [{ id: "r", name: "S", base: 1, deliveryDays: "2" }] },
      { id: "b", name: "B", countries: ["CA", "Atlantis"], rates: [{ id: "r", name: "S", base: 1, deliveryDays: "2" }] },
    ];
    const ids = summarizeShipping([{ id: "p", name: "P", zones }], []).issues.map((i) => i.id);
    expect(ids).toContain("profile:p:zone:b:unknown");
    expect(ids).toContain("profile:p:zone:b:duplicates");
  });
});

import { shippingIssueTab, issuesForTab, carrierIssues, SHIPPING_ISSUE_TAB_LABELS } from "./shippingHealth";
describe("shipping problems by sub tab", () => {
  it("sends profile, zone, rate and missing-profile problems to Profiles", () => {
    const summary = summarizeShipping([{ id: "general", name: "General", zones: [] }], [{ id: "orphan", shippingProfileId: "gone" }]);
    expect(summary.issues.map(shippingIssueTab)).toEqual(["profiles", "profiles"]);
    expect(shippingIssueTab({ id: "no-profiles" })).toBe("profiles");
  });

  it("sends carrier problems to Carrier & labels and filters per tab in order", () => {
    const carrier = carrierIssues({ configured: true, mode: "test", dynamicRatesEnabled: true, dynamicRateCountries: [] });
    expect(carrier.map((issue) => issue.id)).toEqual(["carrier:test-key", "carrier:live-rates-no-countries"]);
    expect(carrier.every((issue) => shippingIssueTab(issue) === "carrier" && issue.severity === "warning")).toBe(true);
    const all = [{ id: "no-profiles", label: "", detail: "" }, ...carrier];
    expect(issuesForTab(all, "carrier")).toEqual(carrier);
    expect(issuesForTab(all, "profiles").map((issue) => issue.id)).toEqual(["no-profiles"]);
    expect(SHIPPING_ISSUE_TAB_LABELS.carrier).toBe("Carrier & labels");
  });

  it("reports no carrier problems when Shippo isn't connected or is fully set up", () => {
    expect(carrierIssues(null)).toEqual([]);
    expect(carrierIssues({ configured: false, mode: "test", dynamicRatesEnabled: true })).toEqual([]);
    expect(carrierIssues({ configured: true, mode: "live", dynamicRatesEnabled: true, dynamicRateCountries: ["CA"] })).toEqual([]);
    expect(carrierIssues({ configured: true, mode: "live", dynamicRatesEnabled: false })).toEqual([]);
  });
});

