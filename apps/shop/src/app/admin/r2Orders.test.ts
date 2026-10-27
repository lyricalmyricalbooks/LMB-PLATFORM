// Round 2, PR 8: admin order screens. Each test names the fault it pins.
import { describe, it, expect } from "vitest";
import { buildAdminAlerts } from "./adminAlerts";
import { deskOrders, deskCounts, rowStatus } from "./ordersDesk";
import { tabCountsFor, tabOrders } from "./ordersTable";
import { deleteRefusal, splitDeletable } from "./orderListHelpers";
import { addressIssues } from "./fulfillment";
import { returnStepLabel } from "./orderLines";

const now = Date.parse("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();
const address = { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "CA" };
const addressKey = JSON.stringify(["1 Main", "Toronto", "ON", "M1M1M1", "CA"]);
const packed = (items: any[]) => JSON.stringify(items.map((i: any) => [i.id || i.bookId || i.title, i.variantId || i.variant || "", i.quantity]));
const order = (id: string, extra: any = {}) => {
  const items = extra.items || [{ id: "b", title: "Book", quantity: 1, format: "Paperback" }];
  return { id, orderId: id, paymentStatus: "paid", status: "open", paidAt: daysAgo(5), createdAt: daysAgo(5), customer: { name: "R", email: "r@x.com", address }, items,
    operations: { addressReviewed: addressKey, packed: packed(items) }, ...extra };
};

describe("fault 34: the ship-late alert ignores digital-only orders", () => {
  it("a paid e-book order waiting 5 days is not 'late to ship'; a printed one is", () => {
    const ebook = order("EBOOK", { items: [{ id: "e", title: "E", quantity: 1, format: "E-book (PDF)", isDigital: true }] });
    const gift = order("GIFT", { items: [{ id: "g", title: "Card", quantity: 1, giftCard: true }] });
    const print = order("PRINT");
    const late = buildAdminAlerts([ebook, gift, print], null, now).find((a) => a.id === "ship-late");
    expect(late?.orderIds).toEqual(["PRINT"]);
    expect(buildAdminAlerts([ebook, gift], null, now).some((a) => a.id === "ship-late")).toBe(false);
  });
});

describe("fault 94: Shipped and Done never include refunds or cancellations", () => {
  const shipped = order("SENT", { fulfillmentStatus: "shipped" });
  const refundPending = order("REFUNDING", { paymentStatus: "refund_pending" });
  const refunded = order("REFUNDED", { paymentStatus: "refunded" });
  const cancelled = { id: "CANCELLED", orderId: "CANCELLED", paymentStatus: "unpaid", status: "cancelled", createdAt: daysAgo(3), items: [{ id: "b", quantity: 1 }] };
  const delivered = order("DONE", { fulfillmentStatus: "delivered", status: "completed" });
  const all = [shipped, refundPending, refunded, cancelled, delivered];

  it("lists only parcels that went out", () => {
    expect(deskOrders(all, "shipped").map((o) => o.id).sort()).toEqual(["DONE", "SENT"]);
    expect(deskCounts(all).shipped).toBe(2);
  });
  it("labels a refund in progress and a cancelled order honestly", () => {
    expect(rowStatus(refundPending).text).toMatch(/Refund in progress/);
    expect(rowStatus(cancelled).text).toMatch(/Cancelled/);
    expect(rowStatus(refunded).text).toMatch(/Refunded/);
    expect(rowStatus(delivered).text).toMatch(/Done/);
  });
});

describe("fault 95: Orders table tab counts follow the date range and the search", () => {
  const orders = [order("OLD1", { paidAt: daysAgo(40), createdAt: daysAgo(40) }), order("OLD2", { paidAt: daysAgo(30), createdAt: daysAgo(30) }), order("NEW", { paidAt: daysAgo(1), createdAt: daysAgo(1) })];
  const filters = (extra: any = {}) => ({ orderType: "production" as const, range: "all", query: "", now, ...extra });

  it("counts every order with no filters", () => {
    expect(tabCountsFor(orders, filters())["Ready to ship"]).toBe(3);
  });
  it("counts only the last 7 days when that range is chosen, matching the rows", () => {
    const f = filters({ range: "7" });
    expect(tabCountsFor(orders, f)["Ready to ship"]).toBe(1);
    expect(tabOrders(orders, f, "Ready to ship")).toHaveLength(1);
  });
  it("counts only what the search finds", () => {
    const f = filters({ query: "OLD2" });
    expect(tabCountsFor(orders, f)["Ready to ship"]).toBe(1);
    expect(tabCountsFor(orders, f)["All orders"]).toBe(1);
  });
  it("keeps archived orders out of the work tabs but in All orders", () => {
    const withArchived = [...orders, order("ARCH", { archivedAt: daysAgo(1) })];
    const counts = tabCountsFor(withArchived, filters());
    expect(counts["Ready to ship"]).toBe(3);
    expect(counts["All orders"]).toBe(4);
    expect(deskOrders(withArchived, "needs").some((o) => o.id === "ARCH")).toBe(false);
    expect(deskOrders(withArchived, "all").some((o) => o.id === "ARCH")).toBe(true);
  });
});

describe("fault 91: paid and in-progress orders can't be deleted", () => {
  it("refuses paid, shipped, refunded and payment-started orders", () => {
    expect(deleteRefusal(order("P"))).toMatch(/paid/);
    expect(deleteRefusal({ id: "S", fulfillmentStatus: "shipped" })).toMatch(/shipped/);
    expect(deleteRefusal({ id: "F", paymentStatus: "refunded" })).toMatch(/paid/);
    // An unpaid order with a card payment still open: the customer may yet pay, and the payment would reach no order.
    expect(deleteRefusal({ id: "U", paymentStatus: "unpaid", status: "open", stripePaymentIntentId: "pi_1" })).toMatch(/in progress/);
    expect(deleteRefusal({ id: "PP", paymentStatus: "unpaid", paypalOrderId: "PP1" })).toMatch(/in progress/);
  });
  it("allows cancelled, never-started and test orders", () => {
    expect(deleteRefusal({ id: "C", paymentStatus: "unpaid", status: "cancelled", stripePaymentIntentId: "pi_1" })).toBe("");
    expect(deleteRefusal({ id: "N", paymentStatus: "unpaid", status: "open" })).toBe("");
    expect(deleteRefusal({ id: "T", isTest: true, paymentStatus: "paid" })).toBe("");
    const split = splitDeletable([order("P"), { id: "N", paymentStatus: "unpaid" }]);
    expect(split.allowed.map((o) => o.id)).toEqual(["N"]);
    expect(split.refused).toHaveLength(1);
  });
});

describe("fault 25: a closed return reads as closed", () => {
  it("shows a step label for the closed state", () => {
    expect(returnStepLabel("closed")).toMatch(/Closed/);
  });
});

describe("address rules follow the destination country (PR 5 carry-over)", () => {
  const base = { customer: { address: { street: "1 Corniche", city: "Doha", state: "", zip: "", country: "Qatar" } } };
  it("a country with no provinces or postal codes has no address issues", () => {
    expect(addressIssues(base)).toEqual([]);
  });
  it("Canada still needs its province and postal code; France its postal code only", () => {
    expect(addressIssues({ customer: { address: { street: "1", city: "T", state: "", zip: "M1M1M1", country: "Canada" } } }).join(" ")).toMatch(/Complete the street/);
    expect(addressIssues({ customer: { address: { street: "1", city: "Paris", state: "", zip: "", country: "France" } } }).join(" ")).toMatch(/postal code/);
    expect(addressIssues({ customer: { address: { street: "1", city: "Paris", state: "", zip: "75001", country: "France" } } })).toEqual([]);
  });
});
