import { describe, expect, it } from "vitest";
import { testSaleSteps } from "./testSaleWalkthrough";

const now = Date.parse("2026-10-10T12:00:00Z");
const done = (steps: ReturnType<typeof testSaleSteps>) => steps.filter((s) => s.done).map((s) => s.id);

describe("test sale walkthrough", () => {
  it("starts with nothing ticked", () => {
    expect(done(testSaleSteps({ payments: {}, now }))).toEqual([]);
  });

  it("ticks each step from real data", () => {
    const order = { id: "o1", orderId: "LM-7", isTest: true, paymentStatus: "paid", createdAt: "2026-10-10T10:00:00Z", customer: { email: "me@x.co" } };
    const steps = testSaleSteps({
      payments: { testMode: true, stripe: { testSecretKeyStored: true } }, now,
      orders: [order, { id: "real", paymentStatus: "paid", createdAt: "2026-10-10T10:00:00Z" }],
      webhook: { test: { lastReceivedAt: "2026-10-10T10:01:00Z" } },
      emailLog: [{ status: "sent", to: "me@x.co", subject: "Order confirmed: LM-7" }],
    });
    expect(done(steps)).toEqual(["testMode", "testKey", "order", "webhook", "email"]);
  });

  it("finishes when the test order is refunded and test mode is off", () => {
    const order = { id: "o1", isTest: true, paymentStatus: "refunded", createdAt: "2026-10-09T10:00:00Z" };
    expect(done(testSaleSteps({ payments: { testMode: false }, orders: [order], now }))).toEqual(["testMode", "order", "refund", "liveMode"]);
  });

  it("ignores test orders older than a week", () => {
    const order = { id: "o1", isTest: true, paymentStatus: "paid", createdAt: "2026-09-01T10:00:00Z" };
    expect(done(testSaleSteps({ payments: {}, orders: [order], now }))).toEqual([]);
  });
});
