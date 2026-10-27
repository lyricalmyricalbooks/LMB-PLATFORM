import { describe, expect, it } from "vitest";
import { OVERDUE_TRANSIT_DAYS } from "../src/app/admin/fulfillment";
const { buildOrderDigest, TRANSIT_DAYS } = require("./orderDigest");

const now = Date.parse("2026-10-20T12:00:00Z");
const base = { paymentStatus: "paid", status: "open", items: [{ id: "b", quantity: 1 }] };
describe("daily order digest", () => {
  it("lists paid parcels unshipped for 3+ days and parcels in transit 14+ days", () => {
    const digest = buildOrderDigest([
      { ...base, id: "old", paidAt: "2026-10-15T12:00:00Z" },
      { ...base, id: "new", paidAt: "2026-10-19T12:00:00Z" },
      { ...base, id: "lost", fulfillmentStatus: "shipped", shippedAt: "2026-10-01T12:00:00Z" },
      { ...base, id: "fine", fulfillmentStatus: "shipped", shippedAt: "2026-10-15T12:00:00Z" },
    ], new Map(), now);
    expect(digest.unshipped.map((o: any) => o.id)).toEqual(["old"]);
    expect(digest.stuck.map((o: any) => o.id)).toEqual(["lost"]);
  });
  it("ignores test, digital-only, cancelled, local and unpaid orders, but flags stuck label purchases", () => {
    const old = "2026-10-01T12:00:00Z";
    const digest = buildOrderDigest([
      { ...base, id: "t", isTest: true, paidAt: old },
      { ...base, id: "d", items: [{ id: "e", format: "EPUB" }], paidAt: old },
      { ...base, id: "c", status: "cancelled", paidAt: old },
      { ...base, id: "p", fulfillmentSelection: { method: "pickup" }, paidAt: old },
      { ...base, id: "u", paymentStatus: "unpaid", paidAt: old },
      { ...base, id: "l", paidAt: "2026-10-20T00:00:00Z" },
    ], new Map([["l", { labelPurchasePending: true }]]), now);
    expect(digest.unshipped).toEqual([]);
    expect(digest.labelChecks.map((o: any) => o.id)).toEqual(["l"]);
  });
  it("uses the same overdue threshold as the admin badge", () => {
    expect(TRANSIT_DAYS).toBe(OVERDUE_TRANSIT_DAYS);
  });
});
