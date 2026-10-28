import { describe, expect, test } from "vitest";
import { accountConnected, dueDateText, feeLine, joinWords, needsLine, paymentsReady, providerName, returnNotice, withoutReturnFlags } from "./platformPayments";
import { paymentHealth } from "./paymentHealth";
import { alertRoute, cardAccountAlert } from "./adminAlerts";

describe("Card payments through Colophon", () => {
  test("the fee is shown in plain words, with what happens on a refund", () => {
    expect(feeLine(undefined)).toMatch(/no fee/);
    expect(feeLine({ percent: 0, refundedWithRefunds: true })).toMatch(/no fee/);
    expect(feeLine({ percent: 2, refundedWithRefunds: true })).toBe("Colophon keeps 2% of each card sale before it reaches your payouts, on top of your card provider's own fee. When you refund a sale, the same share of the fee comes back to you.");
    expect(feeLine({ percent: 1.5, refundedWithRefunds: false })).toMatch(/^Colophon keeps 1\.5% .* stays with Colophon when you refund/);
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
