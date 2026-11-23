// The team desk (Bookings plan 4, 4.1): who signs in to it, which roles the Team offers, and the day's list.
import { describe, expect, test } from "vitest";
import { deskRoleOf } from "./adminAccess";
import { deskCounts, deskRows } from "./TeamDesk";
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
});
