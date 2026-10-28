// Plan 7.17: the bookkeeper's page. Periods, totals and downloads; no email address leaves in a download.
import { describe, expect, it } from "vitest";
import { bookkeeperOrdersCsv, bookkeeperSalesCsv, paidInRange, periodRange, periodTotals, withoutEmails } from "./bookkeeping";
import { isBookkeeperPass, signInRoleOf, TEAM_ROLES } from "./adminAccess";

// 2026-03-10 noon in Toronto.
const NOW = Date.parse("2026-03-10T16:00:00Z");
const order = (over: Record<string, any>) => ({
  id: "o", orderId: "LM-1", paymentStatus: "paid", total: 33.9, tax: 3.9, shipping: 5, subtotal: 25, createdAt: "2026-02-14T15:00:00Z",
  customer: { name: "Rae Reader", email: "rae@reader.example" }, items: [{ id: "b1", title: "Moths", quantity: 1, price: 25 }],
  ...over,
});

describe("bookkeeper periods", () => {
  it("names whole months and years in Toronto days", () => {
    expect(periodRange("thisMonth", NOW)).toEqual({ startKey: "2026-03-01", endKey: "2026-03-10" });
    expect(periodRange("lastMonth", NOW)).toEqual({ startKey: "2026-02-01", endKey: "2026-02-28" });
    expect(periodRange("thisYear", NOW)).toEqual({ startKey: "2026-01-01", endKey: "2026-03-10" });
    expect(periodRange("lastYear", NOW)).toEqual({ startKey: "2025-01-01", endKey: "2025-12-31" });
    expect(periodRange("lastMonth", Date.parse("2026-01-05T16:00:00Z"))).toEqual({ startKey: "2025-12-01", endKey: "2025-12-31" });
  });

  it("counts paid, non-test orders in the period, with tax and shipping collected", () => {
    const orders = [order({ id: "a" }), order({ id: "b", isTest: true }), order({ id: "c", paymentStatus: "unpaid" }), order({ id: "d", createdAt: "2026-03-02T15:00:00Z" })];
    const range = periodRange("lastMonth", NOW);
    expect(paidInRange(orders, range).map((o) => o.id)).toEqual(["a"]);
    expect(periodTotals(orders, range)).toMatchObject({ orders: 1, revenue: 33.9, tax: 3.9, shipping: 5 });
  });
});

describe("bookkeeper downloads", () => {
  const range = { startKey: "2026-02-01", endKey: "2026-02-28" };
  const sold = order({ giftCardsIssued: [{ id: "g1", last4: "AB12", minor: 2500, recipientEmail: "friend@reader.example" }] });

  it("keep the name on each order but no email address", () => {
    expect(withoutEmails(sold).customer).toEqual({ name: "Rae Reader", email: "" });
    const csv = bookkeeperOrdersCsv([sold], range);
    expect(csv).toContain("LM-1");
    expect(csv).toContain("Rae Reader");
    expect(csv).not.toMatch(/@/);
  });

  it("orders outside the period stay out, and the sales report covers the period day by day", () => {
    expect(bookkeeperOrdersCsv([order({ createdAt: "2026-03-02T15:00:00Z" })], range).split("\n")).toHaveLength(1);
    const report = bookkeeperSalesCsv([sold], range);
    expect(report).toContain("2026-02-01 to 2026-02-28");
    expect(report).toContain('"2026-02-14","1","1","33.90"');
  });
});

describe("who signs in as the bookkeeper", () => {
  it("only a verified pass with the bookkeeper role, which is never an admin role", () => {
    expect(TEAM_ROLES).toContain("bookkeeper");
    expect(isBookkeeperPass(true, { role: "bookkeeper" })).toBe(true);
    expect(isBookkeeperPass(false, { role: "bookkeeper" })).toBe(false);
    expect(isBookkeeperPass(true, { role: "staff" })).toBe(false);
    expect(signInRoleOf("kit@press.test", true, { role: "bookkeeper" })).toBe("bookkeeper");
    expect(signInRoleOf("sam@press.test", true, { role: "staff" })).toBe("staff");
    expect(signInRoleOf("ana@press.test", true, { role: "author" })).toBeNull();
  });
});
