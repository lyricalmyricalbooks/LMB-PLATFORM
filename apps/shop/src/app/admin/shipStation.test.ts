import { describe, it, expect } from "vitest";
import { badgeText, gridCounts, gridOrders, gridTabOf, itemCount, outsideQueue, paymentChip, shipsTo, stationQueue, stationStats, stationStep } from "./shipStation";
import { packingKey } from "./fulfillment";

const address = { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "Canada" };
const paid = (id: string, paidAt: string, extra: any = {}) => {
  const o: any = { id, orderId: id, paymentStatus: "paid", paidAt, items: [{ id: "b", title: "Book", quantity: 1 }], customer: { name: "Reader", email: "r@x.com", address }, ...extra };
  o.operations = { addressReviewed: JSON.stringify(["1 Main", "Toronto", "ON", "M1M1M1", "Canada"]), ...(extra.operations || {}) };
  return o;
};
const packed = (o: any) => ({ ...o, operations: { ...o.operations, packed: packingKey(o) } });

describe("ship station", () => {
  const orders = [
    paid("NEW", "2026-10-06T10:00:00Z"),
    packed(paid("OLD", "2026-10-04T10:00:00Z")),
    packed(paid("LABELLED", "2026-10-05T10:00:00Z", { labelUrl: "https://x/label.pdf", operations: { labelBoughtAt: "2026-10-07T15:00:00Z" } })),
    paid("SHIPPED", "2026-10-03T10:00:00Z", { fulfillmentStatus: "shipped" }),
    paid("DONE", "2026-09-03T10:00:00Z", { fulfillmentStatus: "delivered" }),
    paid("REFUNDED", "2026-09-02T10:00:00Z", { paymentStatus: "refunded" }),
    paid("PRE", "2026-10-02T10:00:00Z", { items: [{ id: "b", title: "Book", quantity: 1, preorder: true, releaseDate: "2099-01-01" }] }),
    { id: "ETRANSFER", paymentStatus: "pending", createdAt: "2026-10-05T00:00:00Z", items: [{ id: "b", quantity: 2 }] },
    { id: "ABANDONED", paymentStatus: "unpaid", createdAt: "2026-10-05T00:00:00Z", items: [{ id: "b", quantity: 1 }] },
    paid("TEST", "2026-10-01T10:00:00Z", { isTest: true }),
  ];

  it("queues the work to do in order and names the next step", () => {
    // Problems, then packing, then labels; oldest first within each.
    expect(stationQueue(orders).map((o) => o.id)).toEqual(["NEW", "OLD", "LABELLED"]);
    expect(stationStep(orders[0]).text).toBe("Pack");
    expect(stationStep(orders[1]).text).toBe("Label");
    expect(stationStep(orders[2]).text).toBe("Hand over");
  });

  it("counts what is left, labels bought on the shop's day and the oldest wait", () => {
    const now = Date.parse("2026-10-07T20:00:00Z");
    expect(stationStats(orders, now)).toEqual({ toShip: 3, labelsToday: 1, oldestDays: 3 });
    expect(stationStats([], now)).toEqual({ toShip: 0, labelsToday: 0, oldestDays: 0 });
  });

  it("links the orders waiting outside the queue", () => {
    expect(outsideQueue(orders)).toEqual({ preorders: 1, waitingPayment: 1, inTransit: 1 });
  });

  it("splits the covers page into Open, Completed and All orders", () => {
    expect(gridOrders(orders, "open").map((o) => o.id)).toEqual(["NEW", "LABELLED", "ETRANSFER", "OLD", "SHIPPED", "PRE"]);
    expect(gridOrders(orders, "completed").map((o) => o.id)).toEqual(["DONE"]);
    expect(gridTabOf(orders.find((o) => o.id === "REFUNDED"))).toBe("");
    expect(gridTabOf(orders.find((o) => o.id === "ABANDONED"))).toBe("");
    expect(gridCounts(orders)).toEqual({ open: 6, completed: 1, all: 9 });
    expect(gridCounts(orders, true).all).toBe(10);
    expect(gridOrders(orders, "all", "", "oldest").map((o) => o.id)[0]).toBe("REFUNDED");
    expect(gridOrders(orders, "all", "labelled").map((o) => o.id)).toEqual(["LABELLED"]);
  });

  it("archived orders leave Open but stay in All orders", () => {
    const archived = { ...orders[0], archivedAt: "2026-10-07T00:00:00Z" };
    expect(gridTabOf(archived)).toBe("");
    expect(gridOrders([archived], "all")).toHaveLength(1);
  });

  it("card words", () => {
    expect(itemCount(orders[7])).toBe("2 items");
    expect(itemCount(orders[0])).toBe("1 item");
    expect(paymentChip(orders[0]).text).toBe("Paid");
    expect(paymentChip(orders[5]).text).toBe("Refunded");
    expect(paymentChip(orders[7]).text).toBe("Payment due");
    expect(shipsTo(orders[0])).toBe("Toronto");
    expect(badgeText("⚠ Fix the address")).toBe("Fix the address");
    expect(badgeText("Refunded")).toBe("Refunded");
    expect(shipsTo({ customer: { address: { city: "Portland", country: "US" } } })).toBe("Portland, US");
    expect(shipsTo({ fulfillmentSelection: { method: "pickup" } })).toBe("Pickup");
  });
});
