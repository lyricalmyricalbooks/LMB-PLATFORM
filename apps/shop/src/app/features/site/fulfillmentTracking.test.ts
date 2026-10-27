import { expect, it } from "vitest";
import { trackingStepIndex } from "./fulfillmentTracking";

it("tracks pickup through ready_for_pickup and collected without shipping milestones", () => {
  expect(trackingStepIndex("pickup", "processing")).toBe(1);
  expect(trackingStepIndex("pickup", "ready_for_pickup")).toBe(2);
  expect(trackingStepIndex("pickup", "collected")).toBe(3);
  expect(trackingStepIndex("pickup", "shipped")).toBe(0);
});

it("tracks local delivery preparation and delivery while preserving carrier tracking", () => {
  expect(trackingStepIndex("local_delivery", "ready_for_delivery")).toBe(1);
  expect(trackingStepIndex("local_delivery", "out_for_delivery")).toBe(2);
  expect(trackingStepIndex("local_delivery", "delivered")).toBe(3);
  expect(trackingStepIndex("shipping", "shipped")).toBe(2);
  expect(trackingStepIndex("shipping", "out_for_delivery")).toBe(2);
  expect(trackingStepIndex("shipping", "delivered")).toBe(3);
});
