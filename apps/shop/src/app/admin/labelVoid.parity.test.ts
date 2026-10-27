import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { labelHandedOver, labelVoidable, labelRefundProblems, refundWords } from "./labelRefunds";
const require = createRequire(import.meta.url);
const server = require("../../../functions/labelVoid.js");

const ORDERS = [
  {}, { status: "cancelled" }, { status: "refunded", fulfillmentStatus: "refunded" }, { fulfillmentStatus: "shipped" },
  { fulfillmentStatus: "out_for_delivery" }, { fulfillmentStatus: "delivered" }, { fulfillmentStatus: "collected" },
  { status: "completed" }, { shippedAt: "2026-10-01" }, { fulfillmentStatus: "processing" },
];

test("the admin and the server agree on when a label is in use", () => {
  for (const o of ORDERS) expect(labelHandedOver(o)).toBe(server.labelHandedOver(o));
});

test("a cancelled order's unused label is voidable; a pending purchase or a sent parcel is not", () => {
  expect(labelVoidable({ labelUrl: "x", status: "cancelled" })).toBe(true);
  expect(labelVoidable({ labelUrl: "x", operations: { labelPurchasePending: true } })).toBe(false);
  expect(labelVoidable({ labelUrl: "x", fulfillmentStatus: "shipped" })).toBe(false);
  expect(labelVoidable({})).toBe(false);
});

test("rejected and long-pending refunds need the owner", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  const orders = [
    { id: "a", operations: { labelRefunds: [{ state: "rejected", settledAt: "2026-11-25T00:00:00Z" }] } },
    { id: "b", operations: { labelRefunds: [{ state: "pending", requestedAt: "2026-10-01T00:00:00Z" }] } },
    { id: "c", operations: { labelRefunds: [{ state: "pending", requestedAt: "2026-11-28T00:00:00Z" }, { state: "refunded" }] } },
  ];
  const { rejected, stale } = labelRefundProblems(orders, now);
  expect(rejected.map(o => o.id)).toEqual(["a"]);
  expect(stale.map(o => o.id)).toEqual(["b"]);
  expect(refundWords({ state: "pending", trackingNumber: "T", requestedAt: "2026-10-01T00:00:00Z" }, now)).toMatch(/still pending after 61 days/);
});
