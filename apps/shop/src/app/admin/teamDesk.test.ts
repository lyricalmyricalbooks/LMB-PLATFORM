// The team desk (Bookings plan 4, 4.1): who signs in to it, which roles the Team offers, and the day's list.
import { describe, expect, test } from "vitest";
import { deskRoleOf } from "./adminAccess";
import { deskCounts, deskRows, nextUp, payAtVisit, startsIn } from "./TeamDesk";
import type { Booking } from "./bookingsApi";

const b = (id: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId: "s", serviceName: "Cut", minutes: 30, start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
  customer: { name: id, email: `${id}@example.com` }, status: "confirmed", payment: "atShop", priceMinor: 0, currency: "CAD", paid: false, ...extra,
});

describe("team desk", () => {
  test("a verified front desk or provider pass opens the desk; nothing else does", () => {
    expect(deskRoleOf(true, "sam@example.com", { role: "frontDesk" })).toBe("frontDesk");
    expect(deskRoleOf(true, "sam@example.com", { role: "provider" })).toBe("provider");
    expect(deskRoleOf(false, "sam@example.com", { role: "provider" })).toBeNull();
    expect(deskRoleOf(true, "sam@example.com", { role: "staff" })).toBeNull();
    expect(deskRoleOf(true, null, { role: "provider" })).toBeNull();
  });

  test("the day's list leaves out cancelled bookings, earliest first, and counts who is here and to come", () => {
    const rows = deskRows([
      b("late", "2026-11-18T18:00:00Z"),
      b("gone", "2026-11-18T14:00:00Z", { status: "cancelled" }),
      b("here", "2026-11-18T15:00:00Z", { checkedInAt: "2026-11-18T14:58:00Z" }),
      b("missed", "2026-11-18T13:00:00Z", { noShow: true }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["missed", "here", "late"]);
    expect(deskCounts(rows, Date.parse("2026-11-18T16:00:00Z"))).toEqual({ booked: 3, here: 1, toCome: 1 });
  });

  test("my day: the next client is the first one not yet in, not a no-show and not over", () => {
    const rows = deskRows([
      b("done", "2026-11-18T13:00:00Z"),
      b("in", "2026-11-18T14:00:00Z", { checkedInAt: "2026-11-18T13:58:00Z" }),
      b("missed", "2026-11-18T14:30:00Z", { noShow: true }),
      b("asked", "2026-11-18T15:00:00Z", { status: "requested" }),
      b("next", "2026-11-18T15:30:00Z"),
      b("after", "2026-11-18T16:00:00Z"),
    ]);
    expect(nextUp(rows, Date.parse("2026-11-18T15:00:00Z"))?.id).toBe("next");
    expect(nextUp(rows, Date.parse("2026-11-18T13:10:00Z"))?.id).toBe("done");
    expect(nextUp(rows, Date.parse("2026-11-18T17:00:00Z"))).toBeNull();
    const at = Date.parse("2026-11-18T15:00:00Z");
    expect([startsIn("2026-11-18T15:25:00Z", at), startsIn("2026-11-18T16:10:00Z", at), startsIn("2026-11-18T17:00:00Z", at), startsIn("2026-11-18T14:50:00Z", at)])
      .toEqual(["in 25 min", "in 1 hr 10 min", "in 2 hr", "now"]);
  });

  test("my day: what is left to take at the visit, and how", () => {
    expect(payAtVisit(b("shop", "2026-11-18T15:00:00Z", { priceMinor: 5000 }))).toEqual({ dueMinor: 5000, byCard: true, atShop: true });
    expect(payAtVisit(b("paid", "2026-11-18T15:00:00Z", { priceMinor: 5000, paid: true }))).toBeNull();
    expect(payAtVisit(b("free", "2026-11-18T15:00:00Z", { payment: "free", priceMinor: 0 }))).toBeNull();
    expect(payAtVisit(b("gone", "2026-11-18T15:00:00Z", { priceMinor: 5000, status: "cancelled" }))).toBeNull();
    expect(payAtVisit(b("dep", "2026-11-18T15:00:00Z", { payment: "deposit", priceMinor: 8000, depositMinor: 2000, depositPaid: true }))).toEqual({ dueMinor: 6000, byCard: true, atShop: true });
    expect(payAtVisit(b("tiny", "2026-11-18T15:00:00Z", { priceMinor: 30 }))).toEqual({ dueMinor: 30, byCard: false, atShop: true });
  });
});
