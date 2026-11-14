import { describe, expect, it } from "vitest";
import { byDay, classCount, daySlots, waitingByDay, waitingText, nextUp, paymentText, weekDays, weekFigures, weekStartOf, weekText, whenFromNow } from "./bookingsView";
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
