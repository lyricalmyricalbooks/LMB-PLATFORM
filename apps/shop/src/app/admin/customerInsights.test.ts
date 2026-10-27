import { describe, expect, it } from "vitest";
import { buildCustomers, consentOf, copiesOf, customerCountries, customerStats, customersToCsv, parseTags, segmentOf } from "./customerInsights";

const NOW = new Date("2026-09-29").getTime();
const o = (email: string, total: number, date: string, extra: any = {}) => ({
  paymentStatus: "paid", total, createdAt: date, customer: { email, name: "N" }, ...extra,
});

describe("customerInsights", () => {
  it("groups by case-insensitive email and skips unpaid/test orders", () => {
    const rows = buildCustomers([
      o("A@x.com", 20, "2026-09-01"), o("a@x.com", 30, "2026-09-20"),
      o("b@x.com", 10, "2026-09-01", { paymentStatus: "unpaid" }),
      o("c@x.com", 10, "2026-09-01", { isTest: true }),
    ], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderCount: 2, totalSpent: 50, avgOrder: 25, segment: "returning" });
  });
  it("segments", () => {
    expect(segmentOf(1, 300, 1)).toBe("vip");
    expect(segmentOf(1, 20, 200)).toBe("at-risk");
    expect(segmentOf(1, 20, 5)).toBe("new");
  });
  it("lapsed VIPs are flagged, not hidden under VIP", () => {
    expect(segmentOf(1, 300, 400)).toBe("vip-lapsed");
    expect(segmentOf(6, 50, 10)).toBe("vip");
  });
  it("takes refunds off lifetime value and keeps fully refunded customers at 0", () => {
    const rows = buildCustomers([
      o("a@x.com", 100, "2026-09-01", { refundedAmountMinor: 2500, expectedAmountMinor: 10000 }),
      o("r@x.com", 40, "2026-09-01", { paymentStatus: "refunded" }),
    ], NOW);
    const a = rows.find((r) => r.key === "a@x.com")!;
    const r = rows.find((x) => x.key === "r@x.com")!;
    expect(a.totalSpent).toBe(75);
    expect(r).toMatchObject({ orderCount: 0, totalSpent: 0 });
    expect(r.orders).toHaveLength(1);
    expect(customerStats(rows)).toMatchObject({ total: 1 });
  });
  it("counts copies, consent and tags", () => {
    expect(copiesOf({ items: [{ quantity: 2 }, { quantity: 3 }] })).toBe(5);
    expect(consentOf("A@x.com", new Set(["a@x.com"]), new Set(), "h")).toBe("subscribed");
    expect(consentOf("a@x.com", new Set(["a@x.com"]), new Set(["h"]), "h")).toBe("opted-out");
    expect(parseTags(" wholesale, Wholesale ,, author ")).toEqual(["wholesale", "author"]);
    const rows = buildCustomers([o("a@x.com", 10, "2026-09-01")], NOW);
    const csv = customersToCsv(rows, () => "subscribed", () => ["=x"]);
    expect(csv).toContain("Consented to marketing");
    expect(csv).toContain(`"Yes"`);
    expect(csv).toContain(`"'=x"`);
  });
  it("stats and csv formula-escaping", () => {
    const rows = buildCustomers([o("a@x.com", 10, "2026-09-01"), o("a@x.com", 10, "2026-09-02"), o("b@x.com", 20, "2026-09-02", { customer: { email: "b@x.com", name: "=cmd" } })], NOW);
    expect(customerStats(rows)).toMatchObject({ total: 2, repeat: 1, repeatRate: 0.5, avgLtv: 20 });
    expect(customersToCsv(rows)).toContain(`"'=cmd"`);
  });
  it("spend is net of partial refunds and countries are listed", () => {
    const rows = buildCustomers([
      o("a@x.com", 100, "2026-09-01", { refundedAmountMinor: 2500, expectedAmountMinor: 10000, shippingAddress: { country: "Canada" } }),
      o("b@x.com", 10, "2026-09-01", { shippingAddress: { country: "Canada" } }),
    ], NOW);
    expect(rows.find((r) => r.key === "a@x.com")!.totalSpent).toBe(75);
    expect(customerCountries(rows)).toEqual([{ country: "Canada", count: 2 }]);
  });
});
