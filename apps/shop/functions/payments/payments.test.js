// functions/payments (code plan 1.11) against a fake Firestore and a fake Stripe: which key each mode uses, the
// order-account lookup, refunds, the refund/dispute check and the webhook client. No network, no real keys.
import { describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments, wrongAccount } = require("./index.js");

function fakeStripe(behaviour = {}) {
  const made = [];
  const calls = [];
  class Stripe {
    constructor(key, opts) {
      made.push({ key, opts });
      const call = (name, fallback) => async (...args) => {
        calls.push({ key, name, args });
        const fn = behaviour[name];
        return fn ? fn(key, ...args) : fallback;
      };
      this.paymentIntents = { retrieve: call("paymentIntents.retrieve", { id: "pi_x", metadata: {} }) };
      this.checkout = { sessions: { retrieve: call("checkout.sessions.retrieve", { id: "cs_x" }) } };
      this.disputes = { list: call("disputes.list", { data: [] }) };
      this.refunds = { list: call("refunds.list", { data: [] }), create: call("refunds.create", { id: "re_1", status: "succeeded", amount: 1000, currency: "cad" }) };
      this.webhooks = { constructEvent: (body, sig, secret) => {
        calls.push({ key, name: "constructEvent", args: [body, sig, secret] });
        if (secret !== behaviour.goodSecret) throw new Error(`bad signature for ${secret}`);
        return { id: "evt_1", body };
      } };
    }
  }
  return { Stripe, made, calls };
}

function fakeDb({ website = null, stripeSecret = null, failSettings = false } = {}) {
  const reads = [];
  const docs = { "settings/website": website, "adminSecrets/stripe": stripeSecret };
  return {
    reads,
    collection: (name) => ({ doc: (id) => ({ async get() {
      reads.push(`${name}/${id}`);
      if (failSettings && name === "settings") throw new Error("UNAVAILABLE");
      const data = docs[`${name}/${id}`];
      return { exists: data != null, data: () => data };
    } }) }),
  };
}

function make({ website, stripeSecret, failSettings, liveSecret = "sk_live_deployed", behaviour } = {}) {
  const db = fakeDb({ website, stripeSecret, failSettings });
  const stripe = fakeStripe(behaviour);
  const readAdminSecret = async (id) => {
    const snap = await db.collection("adminSecrets").doc(id).get();
    return snap.exists ? snap.data() || {} : {};
  };
  const liveSecretKey = { value: () => { if (liveSecret instanceof Error) throw liveSecret; return liveSecret; } };
  return { db, ...stripe, payments: createPayments({ db, Stripe: stripe.Stripe, liveSecretKey, readAdminSecret }) };
}

const notFound = () => Object.assign(new Error("No such payment_intent"), { code: "resource_missing" });

describe("keys", () => {
  test("the admin-only secret wins over an older public copy", async () => {
    const { payments } = make({ stripeSecret: { secretKey: "sk_live_private" } });
    expect(await payments.withPrivateStripeKeys({ secretKey: "sk_live_public", testSecretKey: "sk_test_public" }))
      .toEqual({ secretKey: "sk_live_private", testSecretKey: "sk_test_public" });
  });

  test("a client per mode, acting for a connected account when one is named", async () => {
    const { payments, made } = make({ website: { payments: { stripe: { testSecretKey: "sk_test_saved" } } } });
    const test = await payments.getStripeClientForMode("test", "acct_1");
    expect(made.at(-1)).toEqual({ key: "sk_test_saved", opts: undefined });
    expect(test.requestOptions).toEqual({ stripeAccount: "acct_1" });
    const live = await payments.getStripeClientForMode("live");
    expect(made.at(-1).key).toBe("sk_live_deployed");
    expect(live.requestOptions).toEqual({});
  });

  test("a mode with no key refuses instead of guessing", async () => {
    const { payments } = make({ liveSecret: "" });
    await expect(payments.getStripeClientForMode("test")).rejects.toThrow("Stripe test secret key is not configured.");
    await expect(payments.getStripeClientForMode("live")).rejects.toThrow("Stripe live secret key is not configured.");
  });

  test("stripeSecretFor never throws, even when the deployed secret is missing", async () => {
    const { payments } = make({ liveSecret: new Error("secret not set") });
    expect(await payments.stripeSecretFor("live")).toBe("");
    expect(await payments.stripeSecretFor("test")).toBe("");
  });

  test("readStripeKeys reads the settings once, with the sweep's short timeout", async () => {
    const { payments, db } = make({ website: { payments: { testMode: true, stripe: { testSecretKey: "sk_test_public" } } }, stripeSecret: { secretKey: "sk_live_private" } });
    const keys = await payments.readStripeKeys();
    expect(keys).toEqual({ testMode: true, secrets: { test: "sk_test_public", live: "sk_live_private" }, clientOptions: { timeout: 20000, maxNetworkRetries: 1 } });
    expect(db.reads.sort()).toEqual(["adminSecrets/stripe", "settings/website"]);
  });

  test("readStripeKeys fails loudly when a read fails, so the sweep falls back to per-order reads", async () => {
    const { payments } = make({ failSettings: true });
    await expect(payments.readStripeKeys()).rejects.toThrow("UNAVAILABLE");
  });
});

describe("payment lookups", () => {
  test("tries the order's own mode first and skips an account that doesn't know the payment", async () => {
    const { payments, calls } = make({
      website: { payments: { stripe: { testSecretKey: "sk_test_1" } } },
      behaviour: { "paymentIntents.retrieve": (key) => { if (key === "sk_test_1") throw notFound(); return { id: "pi_1", metadata: { order_id: "o1" } }; } },
    });
    const found = await payments.retrieveOrderPayment("o1", { stripeMode: "test" }, { paymentIntentId: "pi_1" });
    expect(found).toEqual({ intent: { id: "pi_1", metadata: { order_id: "o1" } }, mode: "live" });
    expect(calls.map(c => c.key)).toEqual(["sk_test_1", "sk_live_deployed"]);
  });

  test("a payment that names another order is not this order's", async () => {
    const { payments } = make({ behaviour: { "checkout.sessions.retrieve": () => ({ id: "cs_1", client_reference_id: "other" }) } });
    expect(await payments.retrieveOrderPayment("o1", {}, { sessionId: "cs_1" })).toBeNull();
  });

  test("any other Stripe error is thrown, not skipped", async () => {
    const { payments } = make({ behaviour: { "paymentIntents.retrieve": () => { throw Object.assign(new Error("rate limited"), { type: "StripeRateLimitError" }); } } });
    await expect(payments.retrieveOrderPayment("o1", {}, { paymentIntentId: "pi_1" })).rejects.toThrow("rate limited");
  });

  test("with the sweep's keys, no settings are read and clients get the sweep's options", async () => {
    const { payments, db, made } = make({ behaviour: { "paymentIntents.retrieve": () => ({ id: "pi_1", metadata: { order_id: "o1" } }) } });
    const keys = { testMode: false, secrets: { test: "", live: "sk_live_k" }, clientOptions: { timeout: 20000 } };
    expect((await payments.retrieveOrderPayment("o1", {}, { paymentIntentId: "pi_1" }, keys)).mode).toBe("live");
    expect(db.reads).toEqual([]);
    expect(made).toEqual([{ key: "sk_live_k", opts: { timeout: 20000 } }]);
  });

  test("wrongAccount names only the errors that mean another account may hold the id", () => {
    expect(wrongAccount({ code: "resource_missing" })).toBe(true);
    expect(wrongAccount({ statusCode: 404 })).toBe(true);
    expect(wrongAccount({ type: "StripeAuthenticationError" })).toBe(true);
    expect(wrongAccount({ type: "StripeConnectionError" })).toBe(false);
    expect(wrongAccount(null)).toBe(false);
  });
});

describe("refund/dispute check", () => {
  const charge = { amount: 3000, amount_refunded: 0, disputed: true };
  const behaviour = {
    "paymentIntents.retrieve": () => ({ id: "pi_1", metadata: { order_id: "o1" }, latest_charge: charge }),
    "disputes.list": () => ({ data: [{ id: "dp_1", status: "needs_response" }] }),
    "refunds.list": () => ({ data: [{ id: "re_1", status: "failed" }] }),
  };

  test("hands the charge, its dispute and the refunds (asked only when wanted) to the caller", async () => {
    const { payments, calls } = make({ behaviour });
    const apply = vi.fn(async ({ charge: c, dispute, listRefunds }) => ({ c, dispute, refunds: await listRefunds() }));
    const out = await payments.checkReversal("o1", { stripePaymentIntentId: "pi_1", stripeMode: "live" }, {}, apply);
    expect(out).toEqual({ c: charge, dispute: { id: "dp_1", status: "needs_response" }, refunds: [{ id: "re_1", status: "failed" }] });
    expect(calls.map(c => c.name)).toEqual(["paymentIntents.retrieve", "disputes.list", "refunds.list"]);
    expect(calls[0].args).toEqual(["pi_1", { expand: ["latest_charge"] }]);
    expect(calls[2].args).toEqual([{ payment_intent: "pi_1", limit: 10 }]);
  });

  test("no refunds read when the caller doesn't ask", async () => {
    const { payments, calls } = make({ behaviour });
    await payments.checkReversal("o1", { stripePaymentIntentId: "pi_1" }, {}, async () => "done");
    expect(calls.map(c => c.name)).not.toContain("refunds.list");
  });

  test("nothing to check without a PaymentIntent, for another order's intent, or without a charge", async () => {
    const apply = vi.fn();
    expect(await make({ behaviour }).payments.checkReversal("o1", { stripePaymentIntentId: "cs_1" }, {}, apply)).toBeNull();
    expect(await make({ behaviour }).payments.checkReversal("o2", { stripePaymentIntentId: "pi_1" }, {}, apply)).toBeNull();
    const noCharge = { "paymentIntents.retrieve": () => ({ metadata: { order_id: "o1" }, latest_charge: "ch_1" }) };
    expect(await make({ behaviour: noCharge }).payments.checkReversal("o1", { stripePaymentIntentId: "pi_1" }, {}, apply)).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("refunds", () => {
  test("a full refund in the order's mode and account, with the caller's idempotency key", async () => {
    const { payments, calls, made } = make({ website: { payments: { stripe: { testSecretKey: "sk_test_1" } } } });
    const order = [];
    const outcome = await payments.refundPayment({
      mode: "test", accountId: "acct_1", paymentIntentId: "pi_1", metadata: { order_id: "o1" }, idempotencyKey: "order-refund-o1-full",
      onCalling: () => order.push("calling"),
    });
    expect(made.at(-1).key).toBe("sk_test_1");
    expect(order).toEqual(["calling"]);
    expect(calls[0].args).toEqual([
      { payment_intent: "pi_1", reason: "requested_by_customer", metadata: { order_id: "o1" } },
      { stripeAccount: "acct_1", idempotencyKey: "order-refund-o1-full" },
    ]);
    expect(outcome).toEqual({ refundId: "re_1", amountMinor: 1000, currency: "cad", status: "succeeded" });
  });

  test("a partial refund names its amount; any mode but test is live", async () => {
    const { payments, calls, made } = make();
    await payments.refundPayment({ mode: undefined, paymentIntentId: "pi_1", amountMinor: 250, metadata: {}, idempotencyKey: "k" });
    expect(made.at(-1).key).toBe("sk_live_deployed");
    expect(calls[0].args[0].amount).toBe(250);
    expect(calls[0].args[1]).toEqual({ idempotencyKey: "k" });
  });

  test("a refund Stripe did not accept throws; a missing key throws before Stripe is called", async () => {
    const refused = make({ behaviour: { "refunds.create": () => ({ id: "re_2", status: "failed" }) } });
    await expect(refused.payments.refundPayment({ paymentIntentId: "pi_1", metadata: {}, idempotencyKey: "k" })).rejects.toThrow("Stripe refund was not accepted (status: failed).");
    const noKey = make({ liveSecret: "" });
    const onCalling = vi.fn();
    await expect(noKey.payments.refundPayment({ paymentIntentId: "pi_1", metadata: {}, idempotencyKey: "k", onCalling })).rejects.toThrow("not configured");
    expect(onCalling).not.toHaveBeenCalled();
    expect(noKey.calls).toEqual([]);
  });
});

describe("webhook", () => {
  test("uses the key for the shop's current mode, else the deployed one", async () => {
    const testShop = make({ website: { payments: { testMode: true, stripe: { testSecretKey: "sk_test_1" } } } });
    await testShop.payments.webhookClient();
    expect(testShop.made.at(-1).key).toBe("sk_test_1");
    const liveNoKey = make({ website: { payments: { testMode: false } } });
    await liveNoKey.payments.webhookClient();
    expect(liveNoKey.made.at(-1).key).toBe("sk_live_deployed");
  });

  test("a failed settings read falls back to the deployed key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = make({ failSettings: true });
    await app.payments.webhookClient();
    expect(app.made.at(-1).key).toBe("sk_live_deployed");
    warn.mockRestore();
  });

  test("a delivery verifies against any of the signing secrets, else reports the last error", async () => {
    const { payments } = make({ behaviour: { goodSecret: "whsec_2" } });
    const stripe = await payments.webhookClient();
    expect(payments.verifyWebhookEvent(stripe, "body", "sig", ["whsec_1", "whsec_2"])).toEqual({ event: { id: "evt_1", body: "body" }, lastError: null });
    const failed = payments.verifyWebhookEvent(stripe, "body", "sig", ["whsec_1", "whsec_3"]);
    expect(failed.event).toBeNull();
    expect(failed.lastError.message).toBe("bad signature for whsec_3");
    expect(payments.verifyWebhookEvent(stripe, "body", "sig", [])).toEqual({ event: null, lastError: null });
  });
});

describe("one door", () => {
  // Every other file reaches Stripe through this module. The two checkout files move in plan 1.12.
  const STILL_TO_MOVE = ["checkoutAdmin.js", "checkoutPayment.js"];
  test("no other functions file makes a Stripe client, refunds or verifies a webhook itself", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
    const offenders = fs.readdirSync(dir)
      .filter(f => f.endsWith(".js") && !f.includes(".test.") && !STILL_TO_MOVE.includes(f))
      .filter(f => {
        const text = fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
        return /new Stripe\(|\.refunds\.create\(|\.webhooks\.constructEvent\(/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
