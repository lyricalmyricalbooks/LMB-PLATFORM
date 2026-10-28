import { describe, expect, test } from "vitest";
import { accountConnected, feeLine, providerName, returnNotice, withoutReturnFlags } from "./platformPayments";
import { paymentHealth } from "./paymentHealth";

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
});
