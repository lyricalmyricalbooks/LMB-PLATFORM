import { describe, expect, it } from "vitest";
import { moneyText as bookingMoney } from "./bookingsView";
import { moneyText as eventMoney } from "./eventsView";

describe("Bookings and Events write money with the shop's own sign", () => {
  it("says CA$ for Canadian dollars and US$ for US dollars", () => {
    for (const money of [bookingMoney, eventMoney]) {
      expect(money(203500, "CAD")).toBe("CA$2,035.00");
      expect(money(203500, "USD")).toBe("US$2,035.00");
    }
  });
});
