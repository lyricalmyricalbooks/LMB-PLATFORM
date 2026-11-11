import { describe, expect, it } from "vitest";
import { ordersCurrency, payoutChip, reconcileModel } from "./reconcileModel";

// Totals in dollars, fee and net in cents, as the payment service records them.
const sale = (id: string, total: number, fee: number, payoutId: string | null, payoutDate: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, orderId: id.toUpperCase(), paymentStatus: "paid", total, fee, payoutId, payoutDate, currency: "CAD", ...extra });

describe("reconcileModel", () => {
  const orders = [
    sale("a", 20, 88, "po_1", "2026-11-04T15:00:00Z"),
    sale("b", 40, 146, "po_1", "2026-11-04T15:00:00Z"),
    // Sold 30.00, fee 1.17, but only 18.83 reached the bank: 10.00 was refunded out of this payout.
    sale("c", 30, 117, "po_2", "2026-10-28T15:00:00Z", { net: 1883 }),
    sale("d", 25, 103, null, null),
    sale("t", 99, 0, "po_1", "2026-11-04T15:00:00Z", { isTest: true }),
    sale("u", 50, 0, "po_1", "2026-11-04T15:00:00Z", { paymentStatus: "unpaid" }),
  ];
  const m = reconcileModel(orders);

  it("adds each payout's sales and fees, newest first", () => {
    expect(m.payouts.map((p) => p.payoutId)).toEqual(["po_1", "po_2"]);
    expect(m.payouts[0]).toMatchObject({ date: "2026-11-04", salesCents: 6000, feesCents: 234, netCents: 5766, differences: 0 });
    expect(m.payouts[0].orders).toHaveLength(2);
  });

  it("flags a payout whose money doesn't add up and says by how much", () => {
    expect(m.payouts[1]).toMatchObject({ salesCents: 3000, feesCents: 117, netCents: 1883, differenceCents: 1000, differences: 1 });
    expect(payoutChip(m.payouts[1])).toEqual({ label: "1 difference", tone: "warning" });
    expect(payoutChip(m.payouts[0])).toEqual({ label: "Matched", tone: "success" });
    expect(m).toMatchObject({ matched: 1, needsLook: 1, needsLookCents: 1000, waiting: 1 });
  });

  it("leaves test and unpaid orders out", () => {
    expect(m.payouts[0].orders.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("puts a payout with no date yet on top", () => {
    const n = reconcileModel([...orders, sale("e", 10, 59, "po_3", null)]);
    expect(n.payouts[0]).toMatchObject({ payoutId: "po_3", date: "" });
  });

  it("is empty with no orders", () => {
    expect(reconcileModel([])).toMatchObject({ currency: "CAD", payouts: [], matched: 0, needsLook: 0, waiting: 0 });
  });

  it("takes the currency most orders were paid in", () => {
    expect(ordersCurrency([{ currency: "gbp" }, { currency: "GBP" }, { currency: "CAD" }])).toBe("GBP");
  });
});
