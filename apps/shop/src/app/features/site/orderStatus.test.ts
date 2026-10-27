import { describe, expect, it } from "vitest";
import { orderStage, orderStep, statusCopyKey, stepDates, trackLink } from "./orderStatus";

const paid = { paymentStatus: "paid", status: "open", fulfillmentStatus: "paid" };
describe("customer order status", () => {
  it("tells unpaid, cancelled and refunded orders apart", () => {
    expect(orderStage({ paymentStatus: "unpaid", status: "pending_payment" })).toBe("awaiting_payment");
    expect(orderStage({ paymentStatus: "paid", status: "cancelled" })).toBe("cancelled");
    expect(orderStage({ paymentStatus: "refunded", status: "cancelled" })).toBe("refunded");
    expect(orderStage(paid)).toBe("active");
  });
  it("does not call a shipped parcel delivered just because dispatch completed the order", () => {
    const shipped = { ...paid, status: "completed", fulfillmentStatus: "shipped" };
    expect(statusCopyKey(shipped)).toBe("accountShipped");
    expect(orderStep(shipped)).toBe(2);
    expect(statusCopyKey({ ...shipped, fulfillmentStatus: "out_for_delivery" })).toBe("trackOutForDelivery");
    expect(statusCopyKey({ ...shipped, fulfillmentStatus: "delivered" })).toBe("accountDelivered");
  });
  it("labels local pickup states instead of 'Preparing'", () => {
    expect(statusCopyKey({ ...paid, fulfillmentStatus: "ready_for_pickup" })).toBe("trackPickupReady");
    expect(statusCopyKey({ ...paid, fulfillmentStatus: "collected" })).toBe("trackCollected");
  });
  it("dates the shipped and delivered steps", () => {
    expect(stepDates({ ...paid, paidAt: "a", shippedAt: "b", deliveredAt: "c" })).toEqual(["a", undefined, "b", "c"]);
  });
  it("links to the order by document id with its key", () => {
    expect(trackLink({ id: "AB-1", trackingKey: "k" })).toBe("/track?orderId=AB-1&key=k");
    expect(trackLink({ id: "AB-1" })).toBe("/track?orderId=AB-1");
  });
});
