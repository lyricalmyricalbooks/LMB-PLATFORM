import { describe, expect, it, vi } from "vitest";

const visits = vi.fn();
vi.mock("../bookingsApi", () => ({ readBookingsBetween: (...a: unknown[]) => visits(...a), bookingsAdmin: vi.fn() }));
vi.mock("../givingApi", () => ({ givingAdmin: vi.fn() }));
vi.mock("../membersApi", () => ({ membersAdmin: vi.fn() }));
vi.mock("./stockroomData", () => ({ stockroomApi: { load: vi.fn() } }));
vi.mock("../../../shared/shopTimeZone", () => ({ shopTimeZone: () => "America/Toronto" }));

const { readServiceSales } = await import("./moneyRecords");
const NOW = Date.parse("2026-06-30T16:00:00Z");
const visit = { id: "v1", serviceName: "Cut", currency: "CAD", priceMinor: 6000, start: "2026-03-10T15:00:00Z", status: "confirmed", payment: "card", paid: true };
const pack = { id: "p1", serviceName: "Cut", visits: 5, status: "active", priceMinor: 25000, currency: "CAD", paidAt: "2026-03-01T15:00:00Z", refundMinor: 0 } as never;

describe("the money pages' service sales", () => {
  it("adds packs of visits sold to the visits, by date", async () => {
    visits.mockResolvedValueOnce([visit]);
    const sales = await readServiceSales(NOW, async () => [pack]);
    expect(sales.map((s) => [s.id, s.keptMinor])).toEqual([["pack-p1", 25000], ["v1", 6000]]);
  });

  it("keeps the visits when the packs can't be read, and the packs when the visits can't", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    visits.mockResolvedValueOnce([visit]);
    expect((await readServiceSales(NOW, async () => { throw new Error("no"); })).map((s) => s.id)).toEqual(["v1"]);
    visits.mockRejectedValueOnce(new Error("no"));
    expect((await readServiceSales(NOW, async () => [pack])).map((s) => s.id)).toEqual(["pack-p1"]);
  });

  it("adds gifts from the Support page, and leaves them out when Donations is off", async () => {
    const gift = { id: "g1", status: "paid", chargedMinor: 2603, currency: "CAD", paidAt: "2026-03-02T15:00:00Z" } as never;
    visits.mockResolvedValueOnce([visit]);
    expect((await readServiceSales(NOW, async () => [], async () => [gift])).map((s) => [s.id, s.kind])).toEqual([["gift-g1", "gift"], ["v1", undefined]]);
    visits.mockResolvedValueOnce([visit]);
    expect((await readServiceSales(NOW, async () => [], async () => { throw new Error("off"); })).map((s) => s.id)).toEqual(["v1"]);
  });

  it("adds membership payments, and leaves them out when Memberships is off", async () => {
    const paid = { id: "in_1", membershipId: "m1", plan: "Friends", amountMinor: 1500, currency: "CAD", paidAt: "2026-03-03T15:00:00Z", test: false };
    visits.mockResolvedValueOnce([visit]);
    expect((await readServiceSales(NOW, async () => [], async () => [], async () => [paid])).map((s) => [s.id, s.kind])).toEqual([["member-in_1", "membership"], ["v1", undefined]]);
    visits.mockResolvedValueOnce([visit]);
    expect((await readServiceSales(NOW, async () => [], async () => [], async () => { throw new Error("off"); })).map((s) => s.id)).toEqual(["v1"]);
  });
});
