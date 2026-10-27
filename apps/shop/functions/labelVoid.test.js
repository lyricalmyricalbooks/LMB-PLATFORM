import { test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { labelHandedOver, refundStateOf, transactionRefundState, findLabelTransaction, refundEntry, applyRefundChecks, openRefunds } = require("./labelVoid.js");

test("only a parcel that left the shop counts as handed over (cancelled/refunded alone does not)", () => {
  expect(labelHandedOver({ status: "cancelled", fulfillmentStatus: "cancelled" })).toBe(false);
  expect(labelHandedOver({ status: "refunded", paymentStatus: "refunded", fulfillmentStatus: "paid" })).toBe(false);
  expect(labelHandedOver({ fulfillmentStatus: "shipped" })).toBe(true);
  expect(labelHandedOver({ status: "refunded", shippedAt: "2026-10-01" })).toBe(true);
  expect(labelHandedOver({ status: "completed" })).toBe(true);
});

test("Shippo statuses map to pending / refunded / rejected", () => {
  expect(["QUEUED", "PENDING", "REFUNDPENDING"].map(refundStateOf)).toEqual(["pending", "pending", "pending"]);
  expect(refundStateOf("SUCCESS")).toBe("refunded");
  expect(refundStateOf("REFUNDED")).toBe("refunded");
  expect(refundStateOf("ERROR")).toBe("rejected");
  expect(transactionRefundState({ status: "SUCCESS" })).toBe(null);
  expect(transactionRefundState({ status: "REFUNDREJECTED" })).toBe("rejected");
});

test("finds a bought label by tracking number, never a failed purchase", () => {
  const list = [{ object_id: "bad", tracking_number: "", status: "ERROR" }, { object_id: "a", tracking_number: "1028 9724", status: "SUCCESS" }];
  expect(findLabelTransaction(list, "10289724")?.object_id).toBe("a");
  expect(findLabelTransaction(list, "")).toBe(null);
});

test("refund rows settle once and stay open only while pending", () => {
  const row = refundEntry({ transactionId: "t1", refundId: "r1", trackingNumber: "T", status: "QUEUED", at: "2026-10-12T00:00:00Z" });
  expect(openRefunds([row])).toHaveLength(1);
  const still = applyRefundChecks([row], { r1: "PENDING" }, "2026-10-13T00:00:00Z");
  expect(still).toMatchObject({ changed: true, open: true });
  const done = applyRefundChecks(still.entries, { r1: "SUCCESS" }, "2026-10-20T00:00:00Z");
  expect(done.open).toBe(false);
  expect(done.entries[0]).toMatchObject({ state: "refunded", settledAt: "2026-10-20T00:00:00Z" });
  expect(applyRefundChecks(done.entries, { r1: "ERROR" }, "2026-10-21T00:00:00Z").changed).toBe(false);
});
