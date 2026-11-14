// The billing hub's calls and words (code plan 22.3): the call goes to the plan document's hub with the admin's
// sign-in and the shop's id, the platform's refusals come back in its words (the two-step one with the account page),
// and plan changes, badges and bills read in plain sentences.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
const { BillingCallError, alertCents, alertWords, billCoversWords, billEstimate, billState, billingCall, callAddress, moneyLike, previewWords, priceWords, statusBadge, trendWords } = await import("./platformBilling");

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
    expect(billCoversWords({ from: "2026-12-12T17:00:00Z", to: "2027-01-12T17:00:00Z" })).toBe("12 Dec 2026 – 12 Jan 2027");
    expect(billCoversWords({ from: "2026-10-12T16:00:00Z", to: "2026-11-12T17:00:00Z" })).toBe("12 Oct – 12 Nov 2026");
    expect(billCoversWords(null)).toBe("");
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

describe("the running-cost tracker's words", () => {
  const $ = (cents: number, sign = "$") => ({ cents, text: `${sign}${(cents / 100).toFixed(2)}` });
  const costs = (over: Record<string, unknown> = {}) => ({
    plusTax: true, monthEnd: $(321),
    estimate: { fee: $(500), discount: null, percentOff: null, running: $(321), beforeTax: $(821), freeTrial: false }, ...over,
  }) as any;

  it("taxes the estimate at the next bill's own rate, and says so when there is no bill to go by", () => {
    expect(billEstimate(costs(), { beforeTax: 768, tax: 100 })).toEqual({ total: "$9.28", parts: ["$5.00 fee", "$3.21 running cost", "$1.07 tax"], taxLater: false, free: false });
    expect(billEstimate(costs(), null)).toEqual({ total: "$8.21", parts: ["$5.00 fee", "$3.21 running cost"], taxLater: true, free: false });
    // No tax on the next bill (nowhere it must be collected): none on the estimate, and no "plus tax".
    expect(billEstimate(costs(), { beforeTax: 768, tax: 0 })).toMatchObject({ total: "$8.21", taxLater: false });
    expect(billEstimate(costs({ plusTax: false }), { beforeTax: 768, tax: 100 })).toMatchObject({ total: "$8.21", taxLater: false });
  });

  it("the founding discount comes off the fee only, US dollars stay US dollars, a trial month is free", () => {
    const founding = costs({ estimate: { fee: $(500), discount: $(125), percentOff: 25, running: $(321), beforeTax: $(696), freeTrial: false } });
    expect(billEstimate(founding, null)!.parts).toEqual(["$5.00 fee", "−$1.25 founding discount", "$3.21 running cost"]);
    const us = costs({ monthEnd: $(321, "US$"), estimate: { fee: $(500, "US$"), discount: null, percentOff: null, running: $(321, "US$"), beforeTax: $(821, "US$"), freeTrial: false } });
    expect(billEstimate(us, { beforeTax: 500, tax: 0 })!.total).toBe("US$8.21");
    const trial = costs({ estimate: { fee: $(500), discount: null, percentOff: null, running: $(0), beforeTax: $(500), freeTrial: true } });
    expect(billEstimate(trial, null)).toMatchObject({ free: true, total: "$8.21" });
    expect(billEstimate(costs({ estimate: { fee: $(500), discount: null, percentOff: null, running: null, beforeTax: null, freeTrial: false } }), null)).toBeNull();
    expect(moneyLike("CA$5.00", 123456)).toBe("CA$1,234.56");
  });

  it("compares with last month in plain words", () => {
    const last = { month: "2026-10", monthWords: "October 2026", cents: 268, text: "$2.68" };
    expect(trendWords({ change: 20, lastMonth: last })).toBe("20% more than October");
    expect(trendWords({ change: -31, lastMonth: last })).toBe("31% less than October");
    expect(trendWords({ change: 3, lastMonth: last })).toBe("About the same as October");
    expect(trendWords({ change: 189, lastMonth: last })).toBe("About 3 times October");
    expect(trendWords({ change: null, lastMonth: last })).toBe("");
  });

  it("says where the month stands against the owner's amount", () => {
    const alert = { cents: 2500, text: "$25.00", on: true, watched: $(821), passing: false, used: 0.33, sent: false };
    expect(alertWords(alert)).toEqual({ tone: "ok", words: "On track: about $8.21 before tax, under your $25.00." });
    expect(alertWords({ ...alert, watched: $(3100), passing: true }).words).toBe("Heading for about $31.00 before tax, past your $25.00.");
    expect(alertWords({ ...alert, watched: $(3100), passing: true, sent: true })).toEqual({ tone: "warn", words: "Heading for about $31.00 before tax. We emailed you." });
    expect(alertWords({ ...alert, watched: null }).words).toBe("We'll email you if a month looks set to pass $25.00.");
    expect(alertWords({ ...alert, on: false, cents: 0 }).tone).toBe("off");
  });
});
