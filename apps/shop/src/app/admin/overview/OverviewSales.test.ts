import { describe, expect, it } from "vitest";
import { moneySteps } from "./OverviewSales";

const run = (steps: ReturnType<typeof moneySteps>) => steps.slice(1, -1).reduce((v, s) => (s.kind === "minus" ? v - s.value : v + s.value), steps[0].value);

describe("moneySteps (Where the money goes)", () => {
  it("walks from list price to the net figure", () => {
    const cur = { subtotal: 100, discounts: 10, shipping: 12, tax: 13, giftCards: 5, revenue: 110, refunded: 20, net: 90 };
    const steps = moneySteps(cur);
    expect(steps.map(s => s.key)).toEqual(["books", "codes", "ship", "tax", "gift", "refunds", "net"]);
    expect(run(steps)).toBeCloseTo(90);
    expect(steps.at(-1)!.value).toBe(90);
  });
  it("shows what the totals don't explain as Rounding & adjustments, never fakes it", () => {
    const cur = { subtotal: 100, discounts: 0, shipping: 0, tax: 0, giftCards: 0, revenue: 97.5, refunded: 0, net: 97.5 };
    const steps = moneySteps(cur);
    expect(steps.find(s => s.key === "other")).toMatchObject({ kind: "minus", value: 2.5, label: "Rounding & adjustments" });
    expect(steps.find(s => s.key === "other")?.hint).toBeTruthy();
    expect(run(steps)).toBeCloseTo(97.5);
  });
  it("names each step in plain words", () => {
    const steps = moneySteps({ subtotal: 100, discounts: 10, shipping: 12, tax: 13, giftCards: 0, revenue: 115, refunded: 0, net: 115 });
    expect(steps.map(s => s.hint)).toEqual(["list price", "discounts", "postage charged", "sales tax collected", "after refunds"]);
  });
  it("leaves out empty steps", () => {
    const steps = moneySteps({ subtotal: 40, discounts: 0, shipping: 0, tax: 0, giftCards: 0, revenue: 40, refunded: 0, net: 40 });
    expect(steps.map(s => s.key)).toEqual(["books", "net"]);
  });
});
