// Past visits spreadsheet (plan 4, 3.8).
import { describe, expect, test } from "vitest";
import { zonedTime } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";
import { pastRange, pastVisitCounts, pastVisitRows, pastVisits, visitOutcome } from "./pastVisits";

const ZONE = "America/Toronto";
const NOW = Date.parse("2026-11-23T17:00:00Z");
const visit = (id: string, start: string, extra: Partial<Booking> = {}): Booking => ({
  id, serviceId: "cut", serviceName: "Haircut", minutes: 45, start, end: new Date(Date.parse(start) + 45 * 60_000).toISOString(),
  customer: { name: `Client ${id}`, email: `${id}@example.com`, phone: "416 555 0100" }, status: "confirmed",
  payment: "atShop", priceMinor: 5000, currency: "CAD", paid: true, ...extra,
});

describe("past visits", () => {
  const rows = [
    visit("a", "2026-11-20T15:00:00Z", { checkedInAt: "2026-11-20T14:58:00Z", staffName: "Ada", tip: { amountMinor: 900, at: "" } }),
    visit("b", "2026-11-19T15:00:00Z", { noShow: true, paid: false, note: "Called,\nno answer" }),
    visit("c", "2026-11-18T15:00:00Z", { status: "cancelled", cancelledBy: "customer", paid: false }),
    visit("d", "2026-11-18T16:00:00Z", { status: "cancelled", cancelledBy: "hold ran out", paid: false }),
    visit("e", "2026-11-25T15:00:00Z"),
    visit("f", "2026-11-17T15:00:00Z", { status: "cancelled", declined: true, cancelledBy: "owner@example.com" }),
    visit("g", "2026-11-21T15:00:00Z"),
  ];

  test("what happened to each booking; never-visits and the future are left out", () => {
    expect(rows.map((b) => visitOutcome(b, NOW))).toEqual(["Checked in", "No-show", "Cancelled by client", null, null, "Request declined", "Visited"]);
    expect(visitOutcome(visit("h", "2026-11-01T15:00:00Z", { status: "cancelled", cancelledBy: "owner@example.com" }), NOW)).toBe("Cancelled by you");
  });

  test("oldest first, cancelled only when asked, or just the no-shows", () => {
    expect(pastVisits(rows, { zone: ZONE, nowMs: NOW, cancelled: false }).map((v) => v.booking.id)).toEqual(["b", "a", "g"]);
    const all = pastVisits(rows, { zone: ZONE, nowMs: NOW, cancelled: true });
    expect(all.map((v) => v.booking.id)).toEqual(["f", "c", "b", "a", "g"]);
    expect(pastVisitCounts(all)).toEqual({ visits: 2, noShows: 1, cancelled: 2 });
    expect(pastVisits(rows, { zone: ZONE, nowMs: NOW, cancelled: true, onlyNoShows: true }).map((v) => v.booking.id)).toEqual(["b"]);
  });

  test("one row a visit, in the shop's clock, with plain amounts", () => {
    const sheet = pastVisitRows(pastVisits(rows, { zone: ZONE, nowMs: NOW, cancelled: false }), ZONE);
    expect(sheet[0]).toContain("What happened");
    const ada = sheet.find((r) => r[5] === "Client a")!;
    expect(ada.slice(0, 5)).toEqual(["2026-11-20", "10:00", "Haircut", "45", "Ada"]);
    expect(ada[8]).toBe("Checked in");
    expect(ada[12]).toBe("9.00");
    expect(sheet.find((r) => r[5] === "Client b")!.at(-1)).toBe("Called, no answer");
  });

  test("a range of shop days reads from the first midnight to the one after the last day", () => {
    const r = pastRange("2026-11-01", "2026-11-30", (d) => zonedTime(d, "00:00", ZONE));
    expect(r).toEqual({ fromIso: "2026-11-01T04:00:00.000Z", toIso: "2026-12-01T05:00:00.000Z" });
  });
});
