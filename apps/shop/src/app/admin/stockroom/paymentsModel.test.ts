import { describe, expect, it } from "vitest";
import { paymentsModel } from "./paymentsModel";
import type { StockroomRecords } from "./stockroomData";

const sale = (id: string, total: number, fee: number, payoutId: string | null, payoutDate: string | null) =>
  ({ id, orderId: id.toUpperCase(), paymentStatus: "paid", total, fee, payoutId, payoutDate, currency: "CAD" });
const TOKEN = "a".repeat(32);
const inv = (id: string, status: string, total: number, link = true) =>
  ({ id, num: `INV-${id}`, status, total, storeName: "Cafe Quay", date: "2026-11-01", currencyCode: "CAD", ...(link ? { stripe: { url: "https://pay.example/x", token: TOKEN } } : {}) });
const records = {
  books: [
    { id: "tote", title: "Linen Tote", stripeLink: "https://buy.example/tote" },
    { id: "mug", title: "Enamel Mug" },
    { id: "test", title: "Test", isTest: true, stripeLink: "https://buy.example/test" },
  ],
  states: { tote: { invoices: [inv("1", "sent", 84), inv("2", "paid", 40), inv("3", "draft", 10), inv("4", "sent", 5, false)] } },
} as unknown as StockroomRecords;

describe("paymentsModel", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const orders = [
    sale("a", 20, 88, "po_1", "2026-11-04T15:00:00Z"),
    sale("b", 30, 117, "po_old", "2026-09-01T15:00:00Z"),
    sale("c", 10, 59, "po_2", null),
    sale("d", 25, 103, null, null),
  ];
  const m = paymentsModel({ orders, records, now });

  it("adds payouts of the last 30 days and the ones on their way", () => {
    expect(m).toMatchObject({ paidOut30Cents: 2000 - 88, paidOut30Count: 1, onWayCents: 1000 - 59, onWayCount: 1, waiting: 1 });
    expect(m.payouts).toHaveLength(3);
  });

  it("lists items with a card link and sent or paid invoice links, unpaid first", () => {
    expect(m.links.map((l) => [l.name, l.state])).toEqual([
      ["Invoice link · Cafe Quay", "unpaid"], ["Linen Tote", "active"], ["Invoice link · Cafe Quay", "paid"],
    ]);
    expect(m.unpaidLinks).toBe(1);
    expect(m.unpaidOwed).toEqual([{ code: "CAD", amount: 84 }]);
  });

  it("shows nothing for a shop with no sales or links", () => {
    const e = paymentsModel({ orders: [], records: { books: [], states: {} } as unknown as StockroomRecords, now });
    expect(e).toMatchObject({ paidOut30Cents: 0, onWayCents: 0, links: [], unpaidLinks: 0 });
  });
});
