// The shop profile's `payments` (plan 2.2): checked like the platform's format, and turned into the card form's Stripe
// settings when the platform takes the payments.
import { describe, expect, it } from "vitest";
import example from "../../../../profile/examples/test-shop.json";
// @ts-expect-error plain JavaScript module from the platform folder
import { profileProblems } from "../../../../profile/profile.js";
import { parseShopProfile, platformStripe, type ShopProfile } from "./shopProfile";

const platform = { provider: "stripe", mode: "platform", stripe: { accountId: "acct_1Moth", publishableKey: "pk_live_abc", testPublishableKey: "pk_test_abc" } };

describe("the shop profile's payments", () => {
  it("keeps valid payments, which the platform's format accepts too", () => {
    const parsed = parseShopProfile({ ...example, payments: platform });
    expect(parsed?.payments).toEqual(platform);
    expect(profileProblems(parsed)).toEqual([]);
    expect(parseShopProfile({ ...example, payments: { provider: "stripe", mode: "own" } })?.payments).toEqual({ provider: "stripe", mode: "own" });
  });

  it("refuses the whole profile when payments are wrong, so a shop never half-reads one", () => {
    for (const payments of [
      null,
      "stripe",
      { provider: "paypal", mode: "own" },
      { provider: "stripe", mode: "shared" },
      { ...platform, stripe: { accountId: "not-an-account" } },
      { ...platform, stripe: { ...platform.stripe, publishableKey: "sk_live_secret" } },
      { ...platform, stripe: { ...platform.stripe, testPublishableKey: "pk_live_abc" } },
    ]) {
      expect(parseShopProfile({ ...example, payments }), JSON.stringify(payments)).toBeNull();
    }
  });

  it("drops anything the format doesn't know, so nothing extra reaches the page's settings", () => {
    const parsed = parseShopProfile({ ...example, payments: { ...platform, stripe: { ...platform.stripe, secretKey: "sk_live_x" } } });
    expect(parsed?.payments?.stripe).toEqual(platform.stripe);
  });
});

describe("the card form's Stripe settings", () => {
  const withPayments = (payments?: unknown) => parseShopProfile({ ...example, ...(payments ? { payments } : {}) }) as ShopProfile;

  it("through the platform: its publishable key for the shop's mode, acting for the press's account", () => {
    expect(platformStripe(false, withPayments(platform))).toEqual({ publishableKey: "pk_live_abc", stripeAccount: "acct_1Moth" });
    expect(platformStripe(true, withPayments(platform))).toEqual({ publishableKey: "pk_test_abc", stripeAccount: "acct_1Moth" });
  });

  it("a missing key for that mode leaves the key empty, so checkout shows Stripe as not set up", () => {
    expect(platformStripe(false, withPayments({ ...platform, stripe: { accountId: "acct_1Moth" } }))?.publishableKey).toBe("");
  });

  it("the shop's own keys otherwise", () => {
    expect(platformStripe(false, withPayments())).toBeNull();
    expect(platformStripe(false, withPayments({ provider: "stripe", mode: "own" }))).toBeNull();
    expect(platformStripe(false, withPayments({ provider: "square", mode: "platform" }))).toBeNull();
  });
});
