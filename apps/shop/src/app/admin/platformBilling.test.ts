// The billing hub's calls and words (code plan 22.3): the call goes to the plan document's hub with the admin's
// sign-in and the shop's id, the platform's refusals come back in its words (the two-step one with the account page),
// and plan changes, badges and bills read in plain sentences.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
const { BillingCallError, alertCents, billState, billingCall, callAddress, previewWords, priceWords, statusBadge } = await import("./platformBilling");

const PLAN = { hub: "https://platform.example/api/shop-billing/", shopId: "moth-press" };
const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;

describe("billingCall", () => {
  it("posts to the hub with the admin's sign-in and this shop's id, which a caller can't override", async () => {
    const fetch = vi.fn(async () => answer(200, { ok: true, billing: { status: "trialing" } }));
    const result = await billingCall(PLAN, "status", { shopId: "someone-else" }, { fetch, token: async () => "pass-1" });
    expect(result.billing.status).toBe("trialing");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://platform.example/api/shop-billing/status");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pass-1");
    expect(JSON.parse(String(init.body)).shopId).toBe("moth-press");
  });

  it("brings back the platform's words, and the account page when a change needs two-step sign-in", async () => {
    const fetch = vi.fn(async () => answer(403, { ok: false, message: "Finish it on your account page.", twoStep: true, accountPage: "https://platform.example/account/billing?shop=moth-press" }));
    const error = await billingCall(PLAN, "cancel", {}, { fetch, token: async () => "t" }).catch((e) => e);
    expect(error).toBeInstanceOf(BillingCallError);
    expect(error.message).toBe("Finish it on your account page.");
    expect(error.twoStep).toBe(true);
    expect(error.accountPage).toBe("https://platform.example/account/billing?shop=moth-press");
  });

  it("never follows an account page that isn't https, says so when offline, and needs a sign-in and a hub", async () => {
    const odd = vi.fn(async () => answer(403, { ok: false, message: "No", twoStep: true, accountPage: "javascript:alert(1)" }));
    expect((await billingCall(PLAN, "cancel", {}, { fetch: odd, token: async () => "t" }).catch((e) => e)).accountPage).toBeNull();
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(billingCall(PLAN, "status", {}, { fetch: offline, token: async () => "t" })).rejects.toThrow(/couldn't reach billing/);
    await expect(billingCall(PLAN, "status", {}, { fetch: offline, token: async () => null })).rejects.toThrow(/Sign in again/);
    await expect(billingCall({ hub: null, shopId: "x" }, "status")).rejects.toThrow(/haven't reached this admin/);
    expect(() => callAddress("http://platform.example/api/", "status")).toThrow();
    expect(() => callAddress(PLAN.hub, "../admin")).toThrow();
    expect(callAddress(PLAN.hub, "payment-methods/primary")).toBe("https://platform.example/api/shop-billing/payment-methods/primary");
  });
});

describe("words", () => {
  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  it("a plan change in sentences: what opens, what closes and when, and what it costs", () => {
    expect(previewWords({ plan: "both", planName: "Shop and stockroom", price: "$39.00", from: "shop", adds: ["stockroom"], closes: [], immediate: false, closesAt: null, downloadUntil: null, prorate: true, prorated: { amount: 500, text: "$5.00" } }, date))
      .toEqual(["The stockroom opens right away.", "You pay $5.00 today for the rest of this month. After that it's $39.00 a month."]);
    expect(previewWords({ plan: "shop", planName: "Shop", price: "$29.00", from: "both", adds: [], closes: ["stockroom"], immediate: false, closesAt: "2026-12-01T00:00:00Z", downloadUntil: "2027-03-01T00:00:00Z", prorate: false, prorated: null }, date))
      .toEqual(["The stockroom stays open until 2026-12-01, the end of the month you've paid for. You can download everything in it until 2027-03-01.", "The new price, $29.00 a month, starts with your next payment."]);
  });

  it("badges and bill states say where things stand", () => {
    expect(statusBadge({ status: "trialing", cancelAtPeriodEnd: false, paymentWay: "monthly" }).word).toBe("Free trial");
    expect(statusBadge({ status: "active", cancelAtPeriodEnd: true, paymentWay: "monthly" }).word).toBe("Ending");
    expect(statusBadge({ status: "past_due", cancelAtPeriodEnd: false, paymentWay: "monthly" }).tone).toBe("danger");
    expect(statusBadge({ status: "canceled", cancelAtPeriodEnd: true, paymentWay: "payAsYouSell" }).word).toBe("Closed");
    // Paying as they sell, Stripe's plan has ended on purpose and the shop is open; cancelling it says Ending.
    expect(statusBadge({ status: "canceled", access: "open", cancelAtPeriodEnd: false, paymentWay: "payAsYouSell" }).word).toBe("Paying as you sell");
    expect(statusBadge({ status: "canceled", access: "open", cancelAtPeriodEnd: true, paymentWay: "payAsYouSell" }).word).toBe("Ending");
    expect(statusBadge({ status: "canceled", access: "closed", cancelAtPeriodEnd: true, paymentWay: "payAsYouSell" }).word).toBe("Closed");
    expect(billState("open").word).toBe("Waiting for payment");
    expect(billState("paid").tone).toBe("success");
  });
});

describe("pay what you use", () => {
  it("the amount a press types for the heads-up email: dollars and cents, 0 turns it off, nothing odd", () => {
    expect([alertCents("25"), alertCents("$25.50"), alertCents("25,5"), alertCents("0"), alertCents("10000")]).toEqual([2500, 2550, 2550, 0, 1_000_000]);
    expect([alertCents(""), alertCents("abc"), alertCents("-5"), alertCents("10000.01"), alertCents("1.234")]).toEqual([null, null, null, null, null]);
  });

  it("the price says the running cost comes on top only under pay what you use", () => {
    const usage = { fee: "$5.00", lastMonth: null, alert: { cents: 2500, text: "$25.00" } };
    expect(priceWords({ price: "$5.00", plusTax: true, usage })).toBe("$5.00 a month + running cost plus tax");
    expect(priceWords({ price: "$39.00", plusTax: true, usage: undefined })).toBe("$39.00 a month plus tax");
    expect(priceWords({ price: "$5.00", plusTax: false, usage }, "$3.75")).toBe("$3.75 a month + running cost");
  });
});
