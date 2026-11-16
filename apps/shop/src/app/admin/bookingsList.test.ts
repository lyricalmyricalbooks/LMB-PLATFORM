// The Calendar's list view: which bookings it shows, in what order, and what the search finds.
import { describe, expect, it } from "vitest";
import { bookingList, listRange, listTag } from "./bookingsView";
import type { Booking } from "./bookingsApi";

const NOW = Date.parse("2026-11-16T15:00:00.000Z"); // 10:00 in Toronto
const ZONE = "America/Toronto";
const b = (id: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId: "riso", serviceName: "Riso workshop", start, end: new Date(Date.parse(start) + 3600_000).toISOString(), minutes: 60,
  status: "confirmed", payment: "free", paid: false, priceMinor: 0, currency: "CAD",
  customer: { name: id, email: `${id.toLowerCase()}@example.com` }, ...extra,
} as Booking);

const rows = [
  b("Ada", "2026-11-17T15:00:00.000Z"),
  b("Zoë", "2026-11-16T19:00:00.000Z", { serviceId: "bind", serviceName: "Bookbinding class" }),
  b("Cy", "2026-11-16T14:30:00.000Z"), // under way now
  b("Dee", "2026-11-15T16:00:00.000Z", { noShow: true }),
  b("Eve", "2026-11-15T18:00:00.000Z"),
  b("Fay", "2026-11-14T16:00:00.000Z"),
  b("Gus", "2026-11-18T15:00:00.000Z", { status: "cancelled" }),
  b("Hal", "2026-11-17T04:30:00.000Z"), // 23:30 on the 16th in Toronto
];
const list = (mode: "upcoming" | "past" | "cancelled", query = "", serviceId = "") => bookingList(rows, { mode, query, serviceId, nowMs: NOW, zone: ZONE });
const names = (days: ReturnType<typeof list>) => days.map((d) => `${d.day}: ${d.rows.map((r) => r.id).join(",")}`);

describe("the Calendar's list", () => {
  it("shows what is still to come earliest first, by the shop's own day, the booking under way included", () => {
    expect(names(list("upcoming"))).toEqual(["2026-11-16: Cy,Zoë,Hal", "2026-11-17: Ada"]);
  });
  it("shows the past newest day first, each day in the order it happened, cancelled left out", () => {
    expect(names(list("past"))).toEqual(["2026-11-15: Dee,Eve", "2026-11-14: Fay"]);
  });
  it("shows only cancelled bookings under Cancelled", () => {
    expect(names(list("cancelled"))).toEqual(["2026-11-18: Gus"]);
  });
  it("finds by name without accents, by email, by service, and by every word typed", () => {
    expect(names(list("upcoming", "zoe"))).toEqual(["2026-11-16: Zoë"]);
    expect(names(list("upcoming", "ADA@EXAMPLE"))).toEqual(["2026-11-17: Ada"]);
    expect(names(list("upcoming", "bookbinding"))).toEqual(["2026-11-16: Zoë"]);
    expect(names(list("upcoming", "riso ada"))).toEqual(["2026-11-17: Ada"]);
    expect(list("upcoming", "nobody")).toEqual([]);
  });
  it("keeps to one service when one is picked", () => {
    expect(names(list("upcoming", "", "bind"))).toEqual(["2026-11-16: Zoë"]);
  });
  it("reads three months ahead and two months back", () => {
    expect(listRange("upcoming", NOW)).toEqual({ from: "2026-11-15T15:00:00.000Z", to: "2027-02-14T15:00:00.000Z" });
    expect(listRange("past", NOW)).toEqual({ from: "2026-09-17T15:00:00.000Z", to: "2026-11-16T16:00:00.000Z" });
    expect(listRange("cancelled", NOW)).toEqual({ from: "2026-09-17T15:00:00.000Z", to: "2027-02-14T15:00:00.000Z" });
  });
  it("tags what needs a second look", () => {
    expect(listTag({ status: "cancelled" })).toBe("Cancelled");
    expect(listTag({ status: "held", clearing: true })).toBe("Payment clearing");
    expect(listTag({ status: "held" })).toBe("Paying now");
    expect(listTag({ status: "confirmed", noShow: true })).toBe("No-show");
    expect(listTag({ status: "confirmed" })).toBe("");
  });
});
