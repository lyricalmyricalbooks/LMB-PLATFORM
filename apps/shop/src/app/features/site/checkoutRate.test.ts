import { describe, expect, it } from "vitest";
// @ts-ignore CommonJS server module
import * as server from "../../../../functions/checkoutRate.js";
import { canadaPostRates } from "./canadaPostRates";
const { checkoutRate } = (server as any).default ?? server;

describe("carrier delivery data at checkout", () => {
  const quote = (name: string, amount: string, estimated_days: unknown, duration_terms = "") =>
    checkoutRate({ provider: "Canada Post", servicelevel: { name }, amount, estimated_days, duration_terms });
  it("retains each service's actual transit estimate through customer rate selection", () => {
    const rates = canadaPostRates([
      quote("Regular Parcel", "11.74", 7),
      quote("Expedited Parcel", "11.74", 3),
      quote("Xpresspost", "12.07", 2),
      quote("Priority", "17.13", 1),
      quote("Priority", "30", 4),
    ]);
    expect(rates.map((rate: any) => rate.deliveryDays)).toEqual(["7", "3", "2", "1"]);
    expect(rates.every((rate: any) => rate.carrierEstimate)).toBe(true);
  });
  it.each([null, undefined, "", " ", -1, "bad", Infinity, false])("does not invent a transit estimate for %s", days => {
    expect(quote("Priority", "17.13", days).deliveryDays).toBeNull();
  });
  it("keeps carrier terms verbatim, without parsing unrelated numbers as delivery days", () => {
    const rate = quote("Priority", "17.13", null, "Delivery before 10:30; restrictions apply");
    expect(rate.deliveryDays).toBeNull();
    expect(rate.durationTerms).toBe("Delivery before 10:30; restrictions apply");
  });
  it("accepts numeric carrier strings and same-day estimates", () => {
    expect(quote("Xpresspost", "12.07", "2").deliveryDays).toBe("2");
    expect(quote("Priority", "17.13", 0).deliveryDays).toBe("0");
  });
});
