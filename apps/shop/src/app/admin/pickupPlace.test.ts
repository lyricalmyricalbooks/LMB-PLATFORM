// The quick pickup switch starts from the shop's own city, not Toronto for everyone.
import { describe, expect, it } from "vitest";
import { newUsPickup, pickupPlace } from "./LocalFulfillmentSettings";
import { validateLocalFulfillment } from "../features/site/localFulfillment";

describe("where a shop's pickup starts", () => {
  it("reads the shop's city", () => {
    expect(pickupPlace({}, false)).toBe("toronto");
    expect(pickupPlace({ city: " Toronto " }, false)).toBe("toronto");
    expect(pickupPlace({ city: "Vancouver" }, false)).toBe("canada");
    expect(pickupPlace({ city: "Toronto" }, true)).toBe("us");
  });
  it("a Vancouver or Portland pickup is open to everyone and valid once switched on", () => {
    for (const [home, country] of [[{ city: "Vancouver", state: "BC" }, "Canada"], [{ city: "Portland", state: "OR" }, "United States"]] as const) {
      const pickup = { ...newUsPickup(home, country), enabled: true };
      expect(pickup.postalPrefixes).toEqual([]);
      expect(validateLocalFulfillment({ enabled: true, pickupLocations: [pickup], deliveryZones: [] })).toEqual([]);
    }
  });
});
