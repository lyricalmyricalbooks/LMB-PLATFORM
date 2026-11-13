// Pickup and local delivery for an American shop: ZIP codes and states work the same way postal codes and provinces do.
import { describe, expect, it } from "vitest";
import { quoteLocalFulfillment, resolveLocalSelection, validateLocalFulfillment, normalizePostalCode } from "./localFulfillment";

const config = {
  enabled: true,
  pickupLocations: [{ id: "p1", enabled: true, name: "Shop pickup", price: 0, postalPrefixes: ["100"], address: { street: "", city: "New York", state: "NY", zip: "10001", country: "United States" } }],
  deliveryZones: [{ id: "d1", enabled: true, name: "Manhattan delivery", price: 5, minimumSubtotal: 0, postalPrefixes: ["100"], postalCodes: ["11201"] }],
};
const items = [{ quantity: 1 }];

describe("local pickup and delivery in the United States", () => {
  it("accepts ZIP areas, ZIP codes and a US state", () => {
    expect(validateLocalFulfillment(config)).toEqual([]);
    expect(normalizePostalCode("10001-1234")).toBe("10001");
  });
  it("offers pickup and delivery to a ZIP code in the area, and not outside it", () => {
    expect(quoteLocalFulfillment(config as any, { country: "US", zip: "10003" }, 20, items).map((q) => q.id)).toEqual(["pickup:p1", "local_delivery:d1"]);
    expect(quoteLocalFulfillment(config as any, { country: "United States", zip: "11201-4410" }, 20, items).map((q) => q.id)).toEqual(["local_delivery:d1"]);
    expect(quoteLocalFulfillment(config as any, { country: "US", zip: "90210" }, 20, items)).toEqual([]);
  });
  it("never matches a ZIP code against the wrong country", () => {
    expect(quoteLocalFulfillment(config as any, { country: "CA", zip: "10003" }, 20, items)).toEqual([]);
  });
  it("records a US delivery address as US", () => {
    const out = resolveLocalSelection(config, { method: "local_delivery", optionId: "local_delivery:d1" }, { street: "1 Main St", city: "New York", state: "NY", zip: "10003", country: "US" }, 20, items);
    expect(out.fulfillment.destination).toMatchObject({ zip: "10003", country: "US" });
  });
  it("refuses a pickup spot whose state and country disagree", () => {
    const wrong = { ...config, pickupLocations: [{ ...config.pickupLocations[0], address: { ...config.pickupLocations[0].address, state: "ON" } }] };
    expect(validateLocalFulfillment(wrong).join(" ")).toMatch(/province or state/);
  });
  it("leaves a Canadian shop as it was", () => {
    const ca = { enabled: true, pickupLocations: [{ id: "p", enabled: true, name: "Pickup", price: 0, postalPrefixes: ["M"], address: { street: "", city: "Toronto", state: "ON", zip: "", country: "Canada" } }], deliveryZones: [] };
    expect(validateLocalFulfillment(ca)).toEqual([]);
    expect(quoteLocalFulfillment(ca as any, { country: "CA", zip: "M6G 3H1" }, 20, items).map((q) => q.id)).toEqual(["pickup:p"]);
    expect(quoteLocalFulfillment(ca as any, { country: "CA", zip: "V5K 0A1" }, 20, items)).toEqual([]);
  });
});
