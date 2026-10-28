// The shop's plan in the admin (plan 6.6, 6.7): the banner per state, Settings › Plan's facts, and which plans lock the
// admin to Plan & billing.
import { describe, expect, it } from "vitest";
import { daysLeft, parsePlatformPlan, planBanner, planFacts, planLocked, type PlatformPlan } from "./platformPlan";

const NOW = Date.parse("2026-11-05T15:00:00.000Z");
const DAY = 86400_000;
const LINK = "https://platform.example/account/billing?shop=moth-press";
const doc = (over: Record<string, unknown> = {}) => ({
  plan: "shop", state: "trial", access: "open", trialEnd: new Date(NOW + 9 * DAY).toISOString(), nextPaymentAt: null, hasCard: false,
  cancelAtPeriodEnd: false, endsAt: null, paymentWay: "monthly", link: LINK, closing: null, updatedAt: "x", ...over,
});
const plan = (over: Record<string, unknown> = {}) => parsePlatformPlan(doc(over)) as PlatformPlan;

describe("the plan banner, per state", () => {
  it("trial with no card: days left and Add a card", () => {
    expect(planBanner(plan(), NOW)).toMatchObject({ tone: "info", title: "Free trial: 9 days left.", action: "Add a card" });
    expect(planBanner(plan({ trialEnd: new Date(NOW + 2.5 * DAY).toISOString() }), NOW)).toMatchObject({ tone: "warning", title: "Free trial: 3 days left." });
    expect(planBanner(plan({ trialEnd: new Date(NOW + 3 * 3600_000).toISOString() }), NOW)?.title).toBe("Free trial: last day.");
  });
  it("trial with a card: the first payment, and no request for a card", () => {
    const b = planBanner(plan({ hasCard: true, nextPaymentAt: new Date(NOW + 9 * DAY).toISOString() }), NOW);
    expect(b).toMatchObject({ tone: "info", title: "Free trial: 9 days left.", action: "See your plan" });
    expect(b?.detail).toMatch(/first payment is on 14 November 2026/);
  });
  it("a declined payment", () => {
    expect(planBanner(plan({ state: "payment-problem", hasCard: true }), NOW)).toMatchObject({ tone: "danger", title: "We couldn't take this month's payment.", action: "Update your card" });
  });
  it("a plan ending", () => {
    expect(planBanner(plan({ state: "active", cancelAtPeriodEnd: true, endsAt: "2026-11-30T15:00:00.000Z", hasCard: true }), NOW))
      .toMatchObject({ tone: "warning", title: "Your plan ends on 30 November 2026.", action: "Keep my plan" });
  });
  it("paused and closed", () => {
    expect(planBanner(plan({ state: "paused", access: "paused" }), NOW)).toMatchObject({ tone: "danger", title: "Your shop is paused.", action: "Add a card" });
    const closed = planBanner(plan({ state: "closed", access: "closed", closing: { stage: "closed", closedAt: "2027-01-01T15:00:00.000Z", downloadUntil: "2027-04-01T15:00:00.000Z", deleteAfter: "2027-04-01T15:00:00.000Z" } }), NOW);
    expect(closed).toMatchObject({ tone: "danger", title: "Your shop is closed." });
    expect(closed?.detail).toMatch(/before 1 April 2027/);
  });
  it("nothing for an active plan, or a shop with no plan", () => {
    expect(planBanner(plan({ state: "active", hasCard: true }), NOW)).toBeNull();
    expect(planBanner(null, NOW)).toBeNull();
  });
  it("uses plain words only", () => {
    const states = [plan(), plan({ hasCard: true }), plan({ state: "payment-problem" }), plan({ state: "paused", access: "paused" }), plan({ state: "closed", access: "closed" }), plan({ cancelAtPeriodEnd: true, endsAt: "2026-11-30T15:00:00.000Z", state: "active" })];
    for (const p of states) {
      const b = planBanner(p, NOW)!;
      for (const words of [b.title, b.detail, b.action, ...planFacts(p, NOW).map((f) => `${f.label} ${f.value}`)]) {
        expect(words).not.toMatch(/Firebase|Google Cloud|\bAPI\b|webhook|secret|deploy|Stripe|subscription/i);
      }
    }
  });
});

describe("reading the plan document", () => {
  it("locks the admin only for a paused or closed plan", () => {
    expect(planLocked(plan())).toBe(false);
    expect(planLocked(plan({ state: "payment-problem" }))).toBe(false);
    expect(planLocked(plan({ access: "paused", state: "paused" }))).toBe(true);
    expect(planLocked(plan({ access: "closed", state: "closed" }))).toBe(true);
    expect(planLocked(null)).toBe(false);
  });
  it("never reads a broken document as open, and never trusts a link that isn't https", () => {
    expect(parsePlatformPlan(doc({ access: "maybe" }))?.access).toBe("paused");
    expect(parsePlatformPlan(doc({ access: "maybe" }))?.state).toBe("paused");
    expect(parsePlatformPlan(doc({ link: "javascript:alert(1)" }))?.link).toBeNull();
    expect(parsePlatformPlan(doc({ state: "gold" }))).toBeNull();
    expect(parsePlatformPlan(null)).toBeNull();
    expect(parsePlatformPlan(doc())?.paymentWay).toBe("monthly");
  });
  it("Settings › Plan lists the plan, where it is, the trial's end, the card and the way of paying", () => {
    expect(planFacts(plan(), NOW)).toEqual([
      { label: "Plan", value: "Shop" },
      { label: "Where it is", value: "Free trial" },
      { label: "Trial ends", value: "14 November 2026 (9 days left)" },
      { label: "Card on file", value: "No card yet" },
      { label: "How you pay", value: "Monthly" },
    ]);
    const paid = planFacts(plan({ plan: "both", state: "active", hasCard: true, nextPaymentAt: "2026-12-05T15:00:00.000Z" }), NOW);
    expect(paid).toContainEqual({ label: "Next payment", value: "5 December 2026" });
    expect(paid).toContainEqual({ label: "Plan", value: "Shop and stockroom" });
    expect(daysLeft(null, NOW)).toBe(0);
    expect(daysLeft(new Date(NOW - DAY).toISOString(), NOW)).toBe(0);
  });
});
