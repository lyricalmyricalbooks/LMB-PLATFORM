import { describe, expect, test } from "vitest";
import { blankPlanForm, nextText, planFormOf, planFromForm, planPriceFromText, stateBadge, trialFromText } from "./membersView";

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

describe("Members page words", () => {
  test("every state has a badge", () => {
    expect(stateBadge("pastDue")).toEqual({ label: "Payment failed", tone: "danger" });
    expect(stateBadge("trial").label).toBe("Free trial");
    expect(stateBadge("pending").label).toBe("Not paid yet");
  });
  test("what happens next", () => {
    expect(nextText({ state: "active", periodEnd: "2026-12-18T12:00:00Z", trialEnd: "", endedAt: "" })).toBe("Next payment Dec 18, 2026");
    expect(nextText({ state: "ending", periodEnd: "2026-12-18T12:00:00Z", trialEnd: "", endedAt: "" })).toContain("no more payments");
    expect(nextText({ state: "trial", periodEnd: "", trialEnd: "2026-12-02T12:00:00Z", endedAt: "" })).toBe("Trial ends Dec 2, 2026, first payment then");
  });
  test("prices and trials typed by the owner", () => {
    expect(planPriceFromText("$15", money)).toEqual({ minor: 1500 });
    expect(planPriceFromText("1,250.50", money)).toEqual({ minor: 125050 });
    expect(planPriceFromText("1", money)).toEqual({ problem: "Enter a price from $2.00 to $5000.00." });
    expect(planPriceFromText("abc", money)).toHaveProperty("problem");
    expect(trialFromText("")).toEqual({ days: 0 });
    expect(trialFromText("61")).toHaveProperty("problem");
  });
  test("the form round-trips a plan", () => {
    const plan = { name: "Friends", description: "Hello", perks: ["A", "B"], interval: "year" as const, priceMinor: 9000, trialDays: 7, hidden: false, memberPercent: 15 };
    expect(planFromForm(planFormOf(plan), money)).toEqual({ plan });
    expect(planFromForm(blankPlanForm(), money)).toEqual({ problem: "Give the plan a name.", field: "name" });
    expect(planFromForm({ ...blankPlanForm(), name: "X", price: "15", perks: " one \n\n two " }, money)).toMatchObject({ plan: { perks: ["one", "two"], trialDays: 0, priceMinor: 1500, memberPercent: 0 } });
    expect(planFromForm({ ...blankPlanForm(), name: "X", price: "15", percent: "10 %" }, money)).toMatchObject({ plan: { memberPercent: 10 } });
    for (const percent of ["51", "7.5", "-3", "lots"]) expect(planFromForm({ ...blankPlanForm(), name: "X", price: "15", percent }, money)).toMatchObject({ field: "percent" });
  });
});
