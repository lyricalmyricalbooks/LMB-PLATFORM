import { describe, expect, it } from "vitest";
import { bookingFigures, lastMonths, monthText, moneyShort, byDay, classCount, daySlots, waitingByDay, waitingText, nextUp, paymentText, weekDays, weekFigures, weekStartOf, weekText, whenFromNow } from "./bookingsView";
import type { Booking } from "./bookingsApi";

const ZONE = "America/Toronto";
const b = (over: Partial<Booking>): Booking => ({
  id: "x", serviceId: "s", serviceName: "Visit", minutes: 60, start: "2026-11-17T15:00:00.000Z", end: "2026-11-17T16:00:00.000Z",
  customer: { name: "Ada", email: "ada@example.com" }, status: "confirmed", payment: "free", priceMinor: 0, currency: "CAD", paid: false, ...over,
});

describe("the week", () => {
  it("starts on Monday, even from a Sunday", () => {
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(weekDays("2026-11-16")).toHaveLength(7);
    expect(weekDays("2026-11-16")[6]).toBe("2026-11-22");
  });
  it("names the week, across months too", () => {
    expect(weekText("2026-11-16")).toMatch(/16.22 November 2026/);
    expect(weekText("2026-11-30")).toMatch(/30 November . 6 December 2026/);
  });
});

describe("the list", () => {
  it("groups bookings by the shop's day and leaves out cancelled ones", () => {
    const late = b({ id: "late", start: "2026-11-18T03:30:00.000Z", end: "2026-11-18T04:00:00.000Z" });
    const groups = byDay([late, b({ id: "a" }), b({ id: "gone", status: "cancelled" })], ZONE);
    expect([...groups.keys()]).toEqual(["2026-11-17"]);
    expect(groups.get("2026-11-17")!.map((x) => x.id)).toEqual(["a", "late"]);
  });
  it("finds the next booking and says when it is", () => {
    const now = Date.parse("2026-11-17T14:35:00Z");
    const rows = [b({ id: "past", start: "2026-11-17T12:00:00.000Z", end: "2026-11-17T13:00:00.000Z" }), b({ id: "a" }), b({ id: "held", status: "held", start: "2026-11-17T14:40:00.000Z" })];
    expect(nextUp(rows, now)?.id).toBe("a");
    expect(whenFromNow(rows[1], now, ZONE)).toBe("in 25 minutes");
    expect(whenFromNow(b({ start: "2026-11-18T15:00:00.000Z" }), now, ZONE)).toBe("tomorrow");
  });
  it("says how each booking is paid in plain words", () => {
    expect(paymentText(b({}))).toBe("Free");
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 4000 }))).toMatch(/^Paid .*40\.00 by card$/);
    expect(paymentText(b({ payment: "card", status: "held", priceMinor: 4000 }))).toBe("Paying now");
    expect(paymentText(b({ payment: "atShop", priceMinor: 2500 }))).toMatch(/25\.00 to pay at the shop$/);
    expect(paymentText(b({ payment: "card", paid: true, priceMinor: 4000, refund: { amountMinor: 4000, at: "x" } }))).toMatch(/^Refunded/);
  });
  it("adds up the week", () => {
    expect(weekFigures([b({}), b({ minutes: 30, payment: "card", paid: true, priceMinor: 4000 }), b({ status: "cancelled" })])).toEqual({ count: 2, hours: 1.5, takenMinor: 4000 });
  });
});

describe("a group class in the week", () => {
  it("puts everyone at one start of a class on one card, and leaves other bookings alone", () => {
    const list = [b({ id: "1" }), b({ id: "2", serviceId: "ws", serviceName: "Workshop" }), b({ id: "3", serviceId: "ws", serviceName: "Workshop" }),
      b({ id: "4", serviceId: "ws", serviceName: "Workshop", start: "2026-11-17T19:00:00.000Z" })];
    const slots = daySlots(list, (id) => (id === "ws" ? 8 : 1));
    expect(slots.map((s) => (s.kind === "class" ? s.people.map((p) => p.id) : s.booking.id))).toEqual(["1", ["2", "3"], ["4"]]);
    expect(slots[1]).toMatchObject({ kind: "class", places: 8, serviceName: "Workshop" });
  });
  it("says how full it is", () => {
    expect(classCount(5, 8)).toBe("5 of 8 booked");
    expect(classCount(8, 8)).toBe("Full · 8 booked");
  });
});

describe("the waiting list", () => {
  const w = (id: string, day: string, createdAt: string) => ({ id, serviceId: "s", serviceName: "Workshop", day, start: null, name: id, email: `${id}@example.com`, createdAt });
  it("groups people by day in the order they asked", () => {
    const days = waitingByDay([w("late", "2026-11-21", "2026-11-18T10:00:00Z"), w("other", "2026-11-22", "2026-11-17T10:00:00Z"), w("early", "2026-11-21", "2026-11-17T09:00:00Z")]);
    expect(days.get("2026-11-21")!.map((x) => x.id)).toEqual(["early", "late"]);
    expect(days.get("2026-11-22")).toHaveLength(1);
    expect(waitingText(3)).toBe("3 waiting");
  });
});

describe("the figures", () => {
  it("lists the last months oldest first, across a new year", () => {
    expect(lastMonths("2027-02-03", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthText("2026-11")).toMatch(/Nov/);
    expect(moneyShort(28049, "CAD")).toMatch(/280$/);
  });
  it("counts bookings, kept money, no-shows and cancellations by month, weekday and service", () => {
    const card = { payment: "card" as const, paid: true, priceMinor: 4000 };
    const f = bookingFigures([
      b({ id: "1", ...card }),                                                               // Tue 17 Nov, 40.00
      b({ id: "2", start: "2026-11-21T19:00:00.000Z", serviceName: "Workshop", noShow: true }), // Sat 21 Nov, no-show
      b({ id: "3", ...card, status: "cancelled", refund: { amountMinor: 3000, at: "" } }),     // cancelled, 10.00 kept
      b({ id: "4", ...card, status: "held", paid: false }),                                     // still paying: ignored
      b({ id: "5", start: "2026-10-06T15:00:00.000Z", payment: "atShop", paid: true, priceMinor: 2500 }), // Tue 6 Oct
      b({ id: "6", start: "2026-12-01T15:00:00.000Z" }),                                      // next month: not in view
      b({ id: "7", start: "2026-11-01T03:30:00.000Z" }),                                      // 31 Oct in Toronto
    ], ZONE, ["2026-10", "2026-11"], Date.parse("2026-11-20T12:00:00Z"));
    expect(f.months).toEqual([
      { month: "2026-10", count: 2, takenMinor: 2500, noShows: 0, cancelled: 0 },
      { month: "2026-11", count: 2, takenMinor: 5000, noShows: 1, cancelled: 1 },
    ]);
    expect(f).toMatchObject({ count: 4, takenMinor: 7500, noShows: 1, cancelled: 1, noShowPercent: 33 });
    expect(f.weekdays.map((w) => [w.day, w.count])).toEqual([["Monday", 0], ["Tuesday", 2], ["Wednesday", 0], ["Thursday", 0], ["Friday", 0], ["Saturday", 2], ["Sunday", 0]]);
    expect(f.services).toEqual([{ name: "Visit", count: 3 }, { name: "Workshop", count: 1 }]);
    expect(bookingFigures([], ZONE, ["2026-11"], 0).noShowPercent).toBeNull();
  });
});

describe("deposits", () => {
  const dep = (over: Partial<Booking> = {}) => b({ payment: "deposit", priceMinor: 14000, depositMinor: 3500, depositPaid: true, ...over });
  it("says what the deposit covered and what is left for the visit", () => {
    expect(paymentText(dep())).toMatch(/35\.00 deposit paid by card, .*105\.00 to pay at the shop$/);
    expect(paymentText(dep({ paid: true }))).toMatch(/^Paid .*140\.00 \(.*35\.00 deposit by card, the rest at the shop\)$/);
    expect(paymentText(dep({ depositPaid: false, status: "held" }))).toBe("Paying the deposit now");
    expect(paymentText(dep({ status: "cancelled", refund: { amountMinor: 1000, at: "" } }))).toMatch(/^Refunded .*10\.00 of .*35\.00$/);
  });
  it("counts only money really taken: the deposit, then the whole price once the rest is paid", () => {
    expect(weekFigures([dep(), dep({ paid: true }), b({ payment: "atShop", priceMinor: 6000 })]).takenMinor).toBe(3500 + 14000);
    const figures = bookingFigures([dep({ status: "cancelled", refund: { amountMinor: 1000, at: "" } }), dep()], ZONE, ["2026-11"]);
    expect(figures.months.reduce((n, m) => n + m.takenMinor, 0)).toBe(2500 + 3500);
  });
});
