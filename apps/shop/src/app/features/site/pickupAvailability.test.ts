import { describe, expect, it } from "vitest";
import { isPickupItem, pickupSpots } from "./pickupAvailability";

const address = { street: "", city: "Toronto", state: "ON", zip: "", country: "CA" };
const config = (over: any = {}) => ({
  enabled: true,
  deliveryZones: [],
  pickupLocations: [
    { id: "studio", enabled: true, name: "Studio", price: 0, address, hours: "Sat 12–5", estimate: "Usually ready in 24 hours" },
    { id: "off", enabled: false, name: "Closed", price: 0, address },
  ],
  ...over,
});
const book = { id: "b1", format: "Paperback" };

describe("pickupSpots", () => {
  it("lists enabled locations for a printed book", () => {
    expect(pickupSpots(config() as any, book)).toEqual([
      { id: "studio", name: "Studio", place: "Toronto, ON", hours: "Sat 12–5", estimate: "Usually ready in 24 hours", price: 0, localOnly: false },
    ]);
  });
  it("is empty when pickup is off or missing", () => {
    expect(pickupSpots(config({ enabled: false }) as any, book)).toEqual([]);
    expect(pickupSpots(undefined, book)).toEqual([]);
  });
  it("is empty for a setup checkout would refuse", () => {
    expect(pickupSpots(config({ pickupLocations: [{ id: "x", enabled: true, name: "", price: 0, address }] }) as any, book)).toEqual([]);
  });
  it("marks locations limited to nearby postal areas", () => {
    const c = config({ pickupLocations: [{ id: "m", enabled: true, name: "Toronto", price: 2.5, address, postalPrefixes: ["M"] }] });
    expect(pickupSpots(c as any, book)[0]).toMatchObject({ localOnly: true, price: 2.5 });
  });
});

describe("isPickupItem", () => {
  it("follows checkout's physical rule", () => {
    expect(isPickupItem(book)).toBe(true);
    expect(isPickupItem({ id: "e", format: "EPUB" })).toBe(false);
    expect(isPickupItem({ id: "g", productType: "giftCard" })).toBe(false);
    const both = { id: "v", format: "Paperback", variants: [{ id: "pb", name: "Paperback" }, { id: "eb", name: "E-book" }] };
    expect(isPickupItem(both, both.variants[0])).toBe(true);
    expect(isPickupItem(both, both.variants[1])).toBe(false);
    expect(isPickupItem(null)).toBe(false);
  });
});
