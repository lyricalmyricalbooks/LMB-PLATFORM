import { describe, expect, test } from "vitest";
import { accountConnected, dueDateText, feeLine, joinWords, movedLine, needsLine, otherProvider, payoutLine, paymentsReady, providerName, returnNotice, switchingLine, switchStage, withoutReturnFlags } from "./platformPayments";
import { paymentHealth } from "./paymentHealth";
import { alertRoute, cardAccountAlert } from "./adminAlerts";

describe("Card payments through Colophon", () => {
  test("the fee is shown in plain words, with what happens on a refund", () => {
    expect(feeLine(undefined)).toMatch(/no fee/);
    expect(feeLine({ percent: 0, refundedWithRefunds: true })).toMatch(/no fee/);
    expect(feeLine({ percent: 2, refundedWithRefunds: true })).toBe("Colophon keeps 2% of each card sale before it reaches your payouts, on top of your card provider's own fee. When you refund a sale, the same share of the fee comes back to you.");
    expect(feeLine({ percent: 1.5, refundedWithRefunds: false })).toMatch(/^Colophon keeps 1\.5% .* stays with Colophon when you refund/);
  });

  test("payouts say when the money arrives, in plain words", () => {
    const stripe = (payoutSchedule: Parameters<typeof payoutLine>[0]["payoutSchedule"]) => payoutLine({ provider: "stripe", payoutSchedule });
    const base = { delayDays: null, weeklyAnchor: null, monthlyAnchor: null };
    expect(stripe({ ...base, interval: "daily", delayDays: 2 })).toBe("Stripe pays your sales into your bank every day, about 2 days after each sale.");
    expect(stripe({ ...base, interval: "daily", delayDays: 1 })).toMatch(/about 1 day after/);
    expect(stripe({ ...base, interval: "daily" })).toBe("Stripe pays your sales into your bank every day.");
    expect(stripe({ ...base, interval: "weekly", weeklyAnchor: "friday" })).toBe("Stripe pays your sales into your bank every Friday.");
    expect(stripe({ ...base, interval: "monthly", monthlyAnchor: 1 })).toBe("Stripe pays your sales into your bank on the 1st of each month.");
    expect(stripe({ ...base, interval: "monthly", monthlyAnchor: 22 })).toMatch(/on the 22nd of each month\.$/);
    expect(stripe({ ...base, interval: "monthly", monthlyAnchor: 11 })).toMatch(/the 11th/);
    expect(stripe({ ...base, interval: "monthly", monthlyAnchor: 31 })).toMatch(/31st of each month, or on the last day of a shorter month\.$/);
    expect(stripe({ ...base, interval: "manual" })).toMatch(/until a payout is started by hand/);
    expect(stripe(null)).toBe("Stripe pays your sales into your own bank account on its usual schedule.");
    expect(stripe({ ...base, interval: "weekly" })).toMatch(/usual schedule/);
    expect(payoutLine({ provider: "square", payoutSchedule: { ...base, interval: "daily" } })).toBe("Square pays your sales into your own bank account on its usual schedule.");
  });

  test("Square is connected when the platform says so; Stripe once its details are in", () => {
    expect(accountConnected({ provider: "square", connected: true })).toBe(true);
    expect(accountConnected({ provider: "square", connected: false })).toBe(false);
    expect(accountConnected({ provider: "stripe", detailsSubmitted: false })).toBe(false);
    expect(accountConnected({ provider: "stripe", detailsSubmitted: true })).toBe(true);
    expect(providerName("square")).toBe("Square");
    expect(providerName(undefined)).toBe("Stripe");
  });

  test("coming back from Square or Stripe shows what happened, once", () => {
    expect(returnNotice("?square=connected")?.tone).toBe("success");
    expect(returnNotice("?square=denied")?.tone).toBe("warning");
    expect(returnNotice("?square=in_use")?.text).toMatch(/another shop/);
    expect(returnNotice("?square=other_account")?.text).toMatch(/different Square account/);
    expect(returnNotice("?square=failed")?.tone).toBe("danger");
    expect(returnNotice("?stripe=refresh")?.text).toMatch(/expired/);
    expect(returnNotice("")).toBeNull();
    expect(withoutReturnFlags("https://shop.yourpress.example/admin?square=connected#settings/payments/methods")).toBe("https://shop.yourpress.example/admin#settings/payments/methods");
  });

  test("cards through the platform count as a way to pay, with no keys in the settings", () => {
    expect(paymentHealth({}, false).map((i) => i.id)).toContain("no-gateway");
    expect(paymentHealth({}, true).map((i) => i.id)).not.toContain("no-gateway");
  });

  test("what Stripe still needs reads in plain words with its deadline: due, past due, done", () => {
    const deadline = "2026-11-12T17:00:00.000Z";
    expect(dueDateText(deadline, "America/Toronto")).toBe("12 November");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
    const due = { provider: "stripe" as const, detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: false, needs: [{ words: "your bank details", pastDue: false }], deadline };
    expect(needsLine(due, "America/Toronto")).toBe("Stripe needs your bank details by 12 November.");
    expect(needsLine({ ...due, deadline: null })).toBe("Stripe needs your bank details.");
    const late = { ...due, pastDue: true, needs: [{ words: "your bank details", pastDue: true }, { words: "your agreement to Stripe's terms", pastDue: true }, { words: "your date of birth", pastDue: false }] };
    expect(needsLine(late, "America/Toronto")).toBe("Stripe needs your bank details and your agreement to Stripe's terms now. The deadline has passed, so Stripe has paused card payments or payouts until it has them. It also needs your date of birth by 12 November.");
    const done = { ...due, payoutsEnabled: true, needs: [], deadline: null };
    expect(needsLine(done)).toBeNull();
    expect(needsLine({ provider: "square", connected: true, needs: [{ words: "x", pastDue: true }] })).toBeNull();
    // The step ticks itself only once cards and payouts both work (Square pays out by itself).
    expect(paymentsReady(due)).toBe(false);
    expect(paymentsReady(done)).toBe(true);
    expect(paymentsReady({ provider: "square", connected: true, chargesEnabled: true })).toBe(true);
    expect(paymentsReady({ provider: "stripe", detailsSubmitted: false, chargesEnabled: true, payoutsEnabled: true })).toBe(false);
  });

  test("a past-due requirement puts a banner on every admin page that opens Payments; nothing otherwise", () => {
    const late = { provider: "stripe" as const, detailsSubmitted: true, pastDue: true, needs: [{ words: "your bank details", pastDue: true }], deadline: null };
    const alert = cardAccountAlert(late)!;
    expect(alert.tone).toBe("danger");
    expect(alert.title).toBe("Stripe has paused your payments");
    expect(alert.detail).toMatch(/^Stripe needs your bank details now\..* Open Payments and press Continue with Stripe\.$/);
    expect(alertRoute(alert)).toEqual({ tab: "settings", settingsTab: "payments", subTab: "pay-methods" });
    // Hiding it lasts until what's missing changes.
    expect(cardAccountAlert({ ...late, needs: [{ words: "a photo of your ID", pastDue: true }] })!.key).not.toBe(alert.key);
    expect(cardAccountAlert({ ...late, pastDue: false })).toBeNull();
    expect(cardAccountAlert(null)).toBeNull();
    expect(cardAccountAlert({ provider: "square", connected: true, pastDue: true })).toBeNull();
  });

  test("an expired Stripe page sends the owner back to the one Continue with Stripe button", () => {
    expect(returnNotice("?stripe=refresh")?.text).toBe("That Stripe page expired. Press Continue with Stripe to get a new one.");
  });
});

describe("Switching to the other card provider", () => {
  test("the stage follows the account being connected", () => {
    expect(switchStage(null)).toBe("start");
    expect(switchStage({ next: null })).toBe("start");
    expect(switchStage({ provider: "square", connected: true, chargesEnabled: false })).toBe("connecting");
    expect(switchStage({ provider: "stripe", detailsSubmitted: false, chargesEnabled: false })).toBe("connecting");
    expect(switchStage({ provider: "square", connected: true, chargesEnabled: true })).toBe("ready");
    expect(switchStage({ provider: "stripe", detailsSubmitted: true, chargesEnabled: true })).toBe("ready");
    expect(switchStage({ provider: "square", connected: true, chargesEnabled: true, switching: { to: "square", accountId: "MLR1", at: "2026-11-09T12:00:00Z" } })).toBe("switching");
    expect([otherProvider("stripe"), otherProvider("square")]).toEqual(["square", "stripe"]);
  });

  test("a switch under way says when it started, and after a day that Colophon is on it", () => {
    const answer = { provider: "square" as const, switching: { to: "square" as const, accountId: "MLR1", at: "2026-11-03T12:00:00Z" } };
    const soon = Date.parse("2026-11-03T20:00:00Z");
    expect(switchingLine(answer, "Stripe", soon, "UTC")).toBe("Started 3 November. New sales keep going to Stripe until it's done.");
    expect(switchingLine(answer, "Stripe", Date.parse("2026-11-09T12:00:00Z"), "UTC")).toBe("Started 3 November. It's taking longer than usual, and Colophon is on it. New sales keep going to Stripe until it's done.");
    expect(switchingLine({ switching: null }, "Stripe", soon)).toBe("New sales keep going to Stripe until it's done.");
  });

  test("after a finished switch, the page says when the shop moved and where older orders refund", () => {
    const answer = { next: null, earlier: [{ provider: "stripe" as const, until: "2026-11-09T13:00:00Z" }] };
    expect(movedLine(answer, "square", "UTC")).toBe("Moved from Stripe on 9 November. Orders from before then still refund through Stripe.");
    expect(movedLine({ next: null, earlier: [] }, "square")).toBeNull();
    expect(movedLine(answer, "stripe")).toBeNull();
    expect(movedLine(null, "stripe")).toBeNull();
  });

  test("coming back from Square on a Stripe shop is a switch being set up", () => {
    expect(returnNotice("?square=connected", "stripe")?.text).toBe("Square is connected. Switch whenever you're ready.");
    expect(returnNotice("?square=denied", "stripe")?.text).not.toMatch(/Connect Square/);
    expect(returnNotice("?square=connected", "square")?.text).toMatch(/can take cards now/);
  });
});
