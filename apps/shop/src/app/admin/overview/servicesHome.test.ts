import { describe, expect, it } from "vitest";
import type { Booking } from "../bookingsApi";
import { servicesDay, startsIn, todayLine } from "./servicesHome";

const ZONE = "America/Toronto";
// Saturday 14 November 2026, 13:00 in Toronto.
const NOW = Date.parse("2026-11-14T18:00:00.000Z");
const at = (days: number, hour: number) => new Date(Date.parse("2026-11-14T05:00:00.000Z") + days * 86_400_000 + hour * 3_600_000).toISOString();
const booking = (id: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId: "cut", serviceName: "Cut", minutes: 60, start, end: new Date(Date.parse(start) + 3_600_000).toISOString(),
  customer: { name: `Client ${id}`, email: `${id}@example.com` }, status: "confirmed", payment: "card", priceMinor: 6000, currency: "CAD", paid: true, ...extra,
});

describe("a services shop's Home", () => {
  const rows = [
    booking("late", at(0, 16)),
    booking("early", at(0, 10)),
    booking("gone", at(0, 14), { status: "cancelled" }),
    booking("tomorrow", at(1, 11), { paid: false, payment: "atShop" }),
    booking("far", at(9, 11)),
    booking("owed", at(-2, 11), { paid: false, payment: "atShop" }),
    booking("noshow", at(-3, 11), { paid: false, payment: "atShop", noShow: true }),
    booking("free", at(-1, 11), { paid: false, payment: "atShop", priceMinor: 0 }),
  ];
  const day = servicesDay(rows, NOW, ZONE);

  it("lists today's appointments in order, and the one still to come", () => {
    expect(day.today.map((b) => b.id)).toEqual(["early", "late"]);
    expect(day.next?.id).toBe("late");
    expect(servicesDay(rows, Date.parse(at(0, 18)), ZONE).next).toBeNull();
  });

  it("counts the next seven days, today first, without cancelled bookings", () => {
    expect(day.bars).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(day.week).toEqual({ count: 3, hours: 3, takenMinor: 12000 });
    expect(day.upcoming.map((b) => b.id)).toEqual(["tomorrow", "far"]);
  });

  it("asks only for finished appointments that were to be paid at the desk", () => {
    expect(day.unpaid.map((b) => b.id)).toEqual(["owed"]);
  });

  it("says the day in plain words", () => {
    expect(todayLine(0)).toBe("Nothing booked today");
    expect(todayLine(1)).toBe("1 appointment today");
    expect(todayLine(3)).toBe("3 appointments today");
  });

  it("adds up what today brought in, tips on top, and finds the fees still to charge (phase 6)", () => {
    const card = { customer: "cus_1", paymentMethod: "pm_1", brand: "visa", last4: "4242" };
    const more = [
      ...rows,
      booking("tipped", at(0, 9), { tip: { amountMinor: 900, at: "x" } }),
      booking("refunded", at(0, 8), { status: "cancelled", refund: { amountMinor: 6000, at: "x" } }),
      booking("missed", at(-1, 15), { noShow: true, paid: false, payment: "atShop", card, lateFeeMinor: 2500 }),
      booking("charged", at(-2, 15), { noShow: true, paid: false, payment: "atShop", card, lateFeeMinor: 2500, fee: { amountMinor: 2500, at: "x" } }),
      booking("nocard", at(-1, 16), { noShow: true, paid: false, payment: "atShop", lateFeeMinor: 2500 }),
    ];
    const d = servicesDay(more, NOW, ZONE);
    // early, late and tipped kept 60.00 each, and "gone" was cancelled with nothing refunded, so the shop kept it too;
    // "refunded" gave it all back. The 9.00 tip is counted apart.
    expect(d.taken).toEqual({ keptMinor: 24000, tipsMinor: 900, currency: "CAD" });
    expect(d.fees.map((b) => b.id)).toEqual(["missed"]);
  });

  it("says when the next client starts", () => {
    expect(startsIn(at(0, 13.5), NOW)).toBe("in 30 min");
    expect(startsIn(at(0, 14.25), NOW)).toBe("in 1 hr 15 min");
    expect(startsIn(at(0, 15), NOW)).toBe("in 2 hr");
    expect(startsIn(at(0, 12.5), NOW)).toBe("now");
  });
});
