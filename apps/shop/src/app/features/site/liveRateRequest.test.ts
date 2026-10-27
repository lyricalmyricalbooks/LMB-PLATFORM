import { describe, expect, it } from "vitest";
import { liveRatesAddressReady, shouldRefetchRates } from "./liveRateRequest";

const base = { street: "10 Downing St", city: "London", zip: "SW1A 2AA" };

describe("liveRatesAddressReady", () => {
  it("asks for live rates without a county outside Canada and the US", () => {
    expect(liveRatesAddressReady({ ...base, country: "United Kingdom", state: "" })).toBe(true);
    expect(liveRatesAddressReady({ ...base, country: "Germany", state: "" })).toBe(true);
  });

  it("still needs a province or state in Canada and the US", () => {
    expect(liveRatesAddressReady({ street: "1 Main St", city: "Toronto", zip: "M6G 3H1", country: "Canada", state: "" })).toBe(false);
    expect(liveRatesAddressReady({ street: "1 Main St", city: "Toronto", zip: "M6G 3H1", country: "Canada", state: "ON" })).toBe(true);
    expect(liveRatesAddressReady({ street: "1 Main St", city: "Austin", zip: "78701", country: "United States", state: "" })).toBe(false);
  });

  it("treats a blank country as Canada, like the rate request does", () => {
    expect(liveRatesAddressReady({ street: "1 Main St", city: "Toronto", zip: "M6G 3H1", state: "" })).toBe(false);
    expect(liveRatesAddressReady({ street: "1 Main St", city: "Toronto", zip: "M6G 3H1", state: "ON" })).toBe(true);
  });

  it("waits for street, city and postal code", () => {
    expect(liveRatesAddressReady({ ...base, country: "United Kingdom", street: "" })).toBe(false);
    expect(liveRatesAddressReady({ ...base, country: "United Kingdom", city: " " })).toBe(false);
    expect(liveRatesAddressReady({ ...base, country: "United Kingdom", zip: "" })).toBe(false);
    expect(liveRatesAddressReady(null)).toBe(false);
  });
});

describe("shouldRefetchRates", () => {
  it("only for the server's changed-rates refusal", () => {
    expect(shouldRefetchRates({ code: "shipping_rates_changed", error: "…" })).toBe(true);
    expect(shouldRefetchRates({ code: "hold_limit" })).toBe(false);
    expect(shouldRefetchRates(null)).toBe(false);
  });
});
