import { describe, expect, it } from "vitest";
import { amountMinor, deskState, dueToday } from "./deskPayment";
import type { Booking } from "./bookingsApi";

const ZONE = "America/Toronto";
const b = (id: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId: "cut", serviceName: "Cut", minutes: 60, start, end: start, customer: { name: "Ada Example", email: "" },
  status: "confirmed", payment: "atShop", priceMinor: 6000, currency: "CAD", paid: false, ...extra,
});

describe("Take a payment", () => {
  it("lists today's bookings with something left to pay, earliest first", () => {
    const rows = [
      b("late", "2026-11-16T20:00:00Z"),
      b("early", "2026-11-16T15:00:00Z"),
      b("tomorrow", "2026-11-17T15:00:00Z"),
      b("paid", "2026-11-16T16:00:00Z", { paid: true }),
      b("card", "2026-11-16T16:00:00Z", { payment: "card", paid: true }),
      b("cancelled", "2026-11-16T16:00:00Z", { status: "cancelled" }),
      b("rest", "2026-11-16T16:00:00Z", { rest: { amountMinor: 6000, at: "x" } }),
      b("deposit", "2026-11-16T17:00:00Z", { payment: "deposit", depositMinor: 1500, depositPaid: true }),
    ];
    expect(dueToday(rows, "2026-11-16", ZONE).map((r) => r.id)).toEqual(["early", "deposit", "late"]);
  });

  it("reads the amount the owner typed", () => {
    expect(amountMinor("45")).toBe(4500);
    expect(amountMinor(" $45.5 ")).toBe(4550);
    expect(amountMinor("1,200.00")).toBe(120000);
    expect(amountMinor("")).toBeNull();
    expect(amountMinor("45.555")).toBeNaN();
    expect(amountMinor("forty")).toBeNaN();
  });

  it("says Paid once the card payment lands, with the tip, or when marked paid another way", () => {
    expect(deskState(b("w", "2026-11-16T15:00:00Z"))).toEqual({ state: "waiting", dueMinor: 6000 });
    expect(deskState(b("w", "2026-11-16T15:00:00Z", { rest: { amountMinor: 6000, at: "x" }, tip: { amountMinor: 900, at: "x" } }))).toEqual({ state: "paid", byCard: 6000, tipMinor: 900, otherWay: false });
    expect(deskState(b("w", "2026-11-16T15:00:00Z", { paid: true }))).toMatchObject({ state: "paid", otherWay: true });
  });
});
