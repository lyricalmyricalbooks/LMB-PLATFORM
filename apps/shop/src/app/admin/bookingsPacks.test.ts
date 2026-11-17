import { describe, expect, it } from "vitest";
import { packLeftText, packList, packState, paymentText } from "./bookingsView";
import type { Booking, PackRow } from "./bookingsApi";

const pack = (id: string, extra: Partial<PackRow> = {}): PackRow => ({
  id, last4: id.slice(-4).toUpperCase(), serviceId: "riso", serviceName: "Risograph session", name: `Person ${id}`, email: `${id}@example.com`,
  visits: 5, left: 3, status: "active", priceMinor: 18000, currency: "CAD", expiresOn: null, paidAt: "2026-11-01T10:00:00.000Z", refundMinor: 0, uses: [], ...extra,
});

describe("packs of visits in the admin", () => {
  it("says how a booking made with a pack was paid", () => {
    const b = { payment: "pack", paid: true, priceMinor: 0, currency: "CAD", status: "confirmed", pack: { id: "x", last4: "K7QD", visit: 2, visits: 5 } } as Booking;
    expect(paymentText(b)).toBe("With their pack ending K7QD, visit 2 of 5");
    expect(paymentText({ ...b, pack: { ...b.pack!, returned: true } })).toBe("With their pack ending K7QD, visit 2 of 5 (visit put back)");
    expect(paymentText({ ...b, pack: null })).toBe("With their pack");
  });

  it("names where a pack stands", () => {
    const today = "2026-11-16";
    expect(packState(pack("a"), today)).toEqual({ label: "Active", tone: "success" });
    expect(packState(pack("a", { expiresOn: "2026-11-20" }), today).label).toBe("Ends soon");
    expect(packState(pack("a", { expiresOn: "2026-11-15" }), today).label).toBe("Ended");
    expect(packState(pack("a", { left: 0 }), today).label).toBe("Used up");
    expect(packState(pack("a", { status: "closed" }), today).label).toBe("Closed");
    expect(packLeftText(pack("a"))).toBe("3 of 5 left");
  });

  it("lists open packs first, the ones running out at the top, and finds by name or code", () => {
    const rows = [pack("one", { left: 4 }), pack("two", { status: "closed", paidAt: "2026-10-01T00:00:00.000Z" }), pack("three", { left: 1 }), pack("four", { left: 0, paidAt: "2026-11-10T00:00:00.000Z" })];
    expect(packList(rows, { today: "2026-11-16" }).map((p) => p.id)).toEqual(["three", "one", "four", "two"]);
    expect(packList(rows, { today: "2026-11-16", query: "person thr" }).map((p) => p.id)).toEqual(["three"]);
    expect(packList(rows, { today: "2026-11-16", query: "four".slice(-4) }).map((p) => p.id)).toEqual(["four"]);
  });
});
