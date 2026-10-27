import { describe, expect, it } from "vitest";
import { addBusinessDays, arrivalDateLabel, freeShippingGap, maxDeliveryDays } from "./checkoutNudges";

describe("checkout nudges", () => {
  it("reads the latest day of an estimate", () => {
    expect(maxDeliveryDays("3-7")).toBe(7);
    expect(maxDeliveryDays("2–4 days")).toBe(4);
    expect(maxDeliveryDays(5)).toBe(5);
    expect(maxDeliveryDays("soon")).toBeNull();
  });
  it("skips weekends", () => {
    const fri = new Date(2026, 9, 2); // Fri Oct 2 2026
    expect(addBusinessDays(fri, 1).getDate()).toBe(5); // Mon Oct 5
    expect(addBusinessDays(fri, 5).getDate()).toBe(9);
  });
  it("labels an arrival date", () => {
    expect(arrivalDateLabel("3-7", new Date(2026, 9, 1), "en-US")).toBe("Mon, Oct 12");
    expect(arrivalDateLabel(undefined)).toBeNull();
  });
  it("measures the free-shipping gap", () => {
    expect(freeShippingGap(20, 50)).toBe(30);
    expect(freeShippingGap(60, 50)).toBe(0);
    expect(freeShippingGap(20, 0)).toBeNull();
  });
});
