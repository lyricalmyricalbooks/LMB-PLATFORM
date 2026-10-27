import { describe, it, expect } from "vitest";
import { deskOrders, deskCounts, nextToOpen, rowStatus, stepOrder, mergeOrder, rowBooks, rowCover, refundState } from "./ordersDesk";

const reviewed = (o: any) => ({ ...o, customer: { name: "Reader", email: "r@x.com", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "Canada" } } });
const paid = (id: string, paidAt: string, extra: any = {}) => {
  const o: any = reviewed({ id, orderId: id, paymentStatus: "paid", paidAt, items: [{ id: "b", title: "Book", quantity: 1 }], ...extra });
  o.operations = { addressReviewed: JSON.stringify(["1 Main", "Toronto", "ON", "M1M1M1", "Canada"]), ...(extra.operations || {}) };
  return o;
};

describe("orders desk", () => {
  const orders = [
    paid("NEW", "2026-10-06T10:00:00Z"),
    paid("OLD", "2026-10-04T10:00:00Z"),
    paid("SHIPPED", "2026-10-03T10:00:00Z", { fulfillmentStatus: "shipped" }),
    { id: "UNPAID", paymentStatus: "pending", createdAt: "2026-10-05T00:00:00Z", items: [{ id: "b", quantity: 1 }] },
    paid("TEST", "2026-10-01T10:00:00Z", { isTest: true }),
  ];

  it("Needs me: work to do, oldest first; test orders hidden unless asked", () => {
    expect(deskOrders(orders, "needs").map((o) => o.id)).toEqual(["OLD", "NEW"]);
    expect(deskOrders(orders, "needs", "", true).map((o) => o.id)).toContain("TEST");
  });

  it("Shipped and All, newest first; search matches name, email, order and book", () => {
    expect(deskOrders(orders, "shipped").map((o) => o.id)).toEqual(["SHIPPED"]);
    expect(deskOrders(orders, "all").map((o) => o.id)[0]).toBe("NEW");
    expect(deskOrders(orders, "all", "old").map((o) => o.id)).toEqual(["OLD"]);
    expect(deskOrders(orders, "needs", "book").length).toBe(2);
  });

  it("counts, including manual payments still to arrive", () => {
    expect(deskCounts(orders)).toMatchObject({ needs: 2, shipped: 1, waitingPayment: 1 });
  });

  it("opens the current order while it is listed, else the first", () => {
    const list = deskOrders(orders, "needs");
    expect(nextToOpen(list, "NEW")).toBe("NEW");
    expect(nextToOpen(list, "SHIPPED")).toBe("OLD");
    expect(nextToOpen([], null)).toBeNull();
  });

  it("row status names the next job and puts payment problems first", () => {
    expect(rowStatus(paid("X", "2026-10-06T00:00:00Z")).text).toMatch(/Pack/);
    expect(rowStatus({ ...paid("X", "2026-10-06T00:00:00Z"), disputeStatus: "needs_response" }).tone).toBe("danger");
    expect(rowStatus({ paymentStatus: "unpaid", paymentMismatch: { ok: false } }).text).toMatch(/doesn't match/);
    expect(rowStatus(orders[3]).text).toMatch(/Waiting on payment/);
    const conflict = { id: "GC", paymentStatus: "unpaid", giftCardConflict: { reason: "balance" }, items: [{ id: "b", quantity: 1 }] };
    expect(rowStatus(conflict)).toMatchObject({ tone: "danger", text: expect.stringMatching(/Gift card/) });
    expect(deskOrders([conflict], "needs").map((o) => o.id)).toEqual(["GC"]);
  });

  it("Stripe-paid orders awaiting the webhook show why and sit in Needs me (display only)", () => {
    const o = { id: "R", paymentStatus: "unpaid", reconciliationPending: { provider: "stripe" }, createdAt: "2026-10-05T00:00:00Z", items: [{ id: "b", quantity: 1 }] };
    expect(rowStatus(o).text).toMatch(/Paid in Stripe — awaiting webhook/);
    expect(deskOrders([o], "needs").map((x) => x.id)).toEqual(["R"]);
    expect(o.paymentStatus).toBe("unpaid");
  });

  it("dispute and attention rows say why", () => {
    expect(rowStatus({ ...paid("D", "2026-10-06T00:00:00Z"), disputeStatus: "under_review" }).text).toMatch(/Dispute open/);
    expect(rowStatus(paid("H", "2026-10-06T00:00:00Z", { operations: { hold: "Waiting on stock" } })).text).toMatch(/On hold: Waiting on stock/);
    const unreviewed = { ...paid("A", "2026-10-06T00:00:00Z"), operations: {} };
    expect(rowStatus(unreviewed).text).toMatch(/Confirm the address/);
  });

  it("j/k steps through the list; merge updates one order without a reload", () => {
    expect(stepOrder(["a", "b", "c"], "b", 1)).toBe("c");
    expect(stepOrder(["a", "b", "c"], "c", 1)).toBe("c");
    expect(stepOrder(["a", "b", "c"], "a", -1)).toBe("a");
    expect(stepOrder(["a", "b"], null, 1)).toBe("a");
    expect(stepOrder(["a", "b"], null, -1)).toBe("b");
    expect(stepOrder(["a", "b", "c"], "gone", -1)).toBe("c");
    expect(stepOrder(["a", "b", "c"], "gone", 1)).toBe("a");
    const merged = mergeOrder([{ id: "a", total: 1, operations: { x: 1 } }, { id: "b" }], { id: "a", total: 2 });
    expect(merged![0]).toMatchObject({ total: 2, operations: { x: 1 } });
    expect(merged!.length).toBe(2);
  });
});

describe("list row: books, cover and refunds", () => {
  const items = [
    { id: "b1", title: "Visions of Toronto", quantity: 2, photoUrl: "https://x/order.jpg" },
    { id: "b2", title: "Second", quantity: 1 },
    { id: "g", title: "Free gift", quantity: 1, promoGift: true },
  ];
  it("names the first book and counts the rest in copies", () => {
    expect(rowBooks({ items: [items[0]] })).toBe("2 × Visions of Toronto");
    expect(rowBooks({ items })).toBe("2 × Visions of Toronto + 1 more");
    expect(rowBooks({ items: [{ id: "a", title: "One", quantity: 1 }] })).toBe("One");
    expect(rowBooks({ items: [] })).toBe("");
  });
  it("shows the catalog cover, else the photo saved on the order", () => {
    const books = new Map([["b1", { id: "b1", coverImage: "https://x/catalog.jpg" }]]);
    expect(rowCover({ items }, books)).toBe("https://x/catalog.jpg");
    expect(rowCover({ items }, null)).toBe("https://x/order.jpg");
    expect(rowCover({ items: [items[1]] }, null)).toBe("");
  });
  it("flags full, pending and partial refunds, and marks the badge red", () => {
    expect(refundState({ paymentStatus: "refunded" })).toBe("full");
    expect(refundState({ paymentStatus: "refund_pending" })).toBe("pending");
    expect(refundState({ paymentStatus: "paid", partiallyRefunded: true })).toBe("partial");
    expect(refundState({ paymentStatus: "paid" })).toBe("");
    expect(rowStatus({ paymentStatus: "refunded", status: "cancelled" })).toMatchObject({ tone: "danger", text: "Refunded" });
  });
});
