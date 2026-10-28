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

  it("a shop with its own keys keeps the secret-key step", () => {
    expect(testSaleSteps({ payments: {}, now }).map((s) => s.id)).toContain("testKey");
  });
});

describe("test sale walkthrough on a platform shop", () => {
  const ids = (steps: ReturnType<typeof testSaleSteps>) => steps.map((s) => s.id);

  it("has no secret-key step: four steps on a practice order", () => {
    for (const platform of ["stripe", "square"] as const) {
      const steps = testSaleSteps({ payments: { stripe: { testSecretKeyStored: false } }, platform, now });
      expect(ids(steps)).toEqual(["practice", "order", "email", "refund"]);
      expect(steps.map((s) => s.label)).toEqual(["Start a practice order", "Pay with the practice card", "See the confirmation email", "Refund it"]);
      expect(steps.some((s) => /secret key|sk_test/i.test(`${s.label} ${s.howTo}`))).toBe(false);
      expect(done(steps)).toEqual([]);
    }
  });

  it("shows the test card for the shop's provider", () => {
    expect(testSaleSteps({ payments: {}, platform: "stripe", now })[1].howTo).toContain("4242 4242 4242 4242");
    expect(testSaleSteps({ payments: {}, platform: "square", now })[1].howTo).toContain("4111 1111 1111 1111");
  });

  it("ticks the first step while practice runs, and says when the shop must be private first", () => {
    expect(done(testSaleSteps({ payments: {}, platform: "stripe", practice: { active: true }, now }))).toEqual(["practice"]);
    expect(testSaleSteps({ payments: {}, platform: "stripe", practice: { active: false, refusal: "shop_open" }, now })[0].howTo).toMatch(/private/);
  });

  it("ticks each step from the practice order, its email and its refund", () => {
    const order = { id: "o1", orderId: "LM-8", isTest: true, sandboxPayment: true, practiceOrder: true, paymentStatus: "paid", createdAt: "2026-10-10T10:00:00Z", customer: { email: "owner@example.com" } };
    const emailLog = [{ status: "sent", to: "owner@example.com", subject: "Order confirmed: LM-8" }];
    expect(done(testSaleSteps({ payments: {}, platform: "stripe", orders: [order], emailLog, now }))).toEqual(["practice", "order", "email"]);
    expect(done(testSaleSteps({ payments: {}, platform: "square", orders: [{ ...order, paymentStatus: "refunded" }], emailLog, now }))).toEqual(["practice", "order", "email", "refund"]);
  });
});

