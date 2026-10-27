// functions/payments (code plan 1.11) against a fake Firestore and a fake Stripe: which key each mode uses, the
// order-account lookup, refunds, the refund/dispute check and the webhook client. No network, no real keys.
import { describe, expect, test, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments, PROVIDER_NAMES, INTERFACE } = require("./index.js");
const { createStripeProvider, wrongAccount } = require("./stripe.js");

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
  return { db, ...stripe, payments: createStripeProvider({ db, Stripe: stripe.Stripe, liveSecretKey, readAdminSecret }) };
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
    const test = await payments.clientForMode("test", "acct_1");
    expect(made.at(-1)).toEqual({ key: "sk_test_saved", opts: undefined });
    expect(test.requestOptions).toEqual({ stripeAccount: "acct_1" });
    const live = await payments.clientForMode("live");
    expect(made.at(-1).key).toBe("sk_live_deployed");
    expect(live.requestOptions).toEqual({});
  });

  test("a mode with no key refuses instead of guessing", async () => {
    const { payments } = make({ liveSecret: "" });
    await expect(payments.clientForMode("test")).rejects.toThrow("Stripe test secret key is not configured.");
    await expect(payments.clientForMode("live")).rejects.toThrow("Stripe live secret key is not configured.");
  });

  test("stripeSecretFor never throws, even when the deployed secret is missing", async () => {
    const { payments } = make({ liveSecret: new Error("secret not set") });
    expect(await payments.stripeSecretFor("live")).toBe("");
    expect(await payments.stripeSecretFor("test")).toBe("");
  });

  test("readKeys reads the settings once, with the sweep's short timeout", async () => {
    const { payments, db } = make({ website: { payments: { testMode: true, stripe: { testSecretKey: "sk_test_public" } } }, stripeSecret: { secretKey: "sk_live_private" } });
    const keys = await payments.readKeys();
    expect(keys).toEqual({ testMode: true, secrets: { test: "sk_test_public", live: "sk_live_private" }, clientOptions: { timeout: 20000, maxNetworkRetries: 1 } });
    expect(db.reads.sort()).toEqual(["adminSecrets/stripe", "settings/website"]);
  });

  test("readKeys fails loudly when a read fails, so the sweep falls back to per-order reads", async () => {
    const { payments } = make({ failSettings: true });
    await expect(payments.readKeys()).rejects.toThrow("UNAVAILABLE");
  });
});

describe("payment lookups", () => {
  test("tries the order's own mode first and skips an account that doesn't know the payment", async () => {
    const { payments, calls } = make({
      website: { payments: { stripe: { testSecretKey: "sk_test_1" } } },
      behaviour: { "paymentIntents.retrieve": (key) => { if (key === "sk_test_1") throw notFound(); return { id: "pi_1", metadata: { order_id: "o1" } }; } },
    });
    const found = await payments.findOrderPayment("o1", { stripeMode: "test" }, { paymentIntentId: "pi_1" });
    expect(found).toEqual({ intent: { id: "pi_1", metadata: { order_id: "o1" } }, mode: "live" });
    expect(calls.map(c => c.key)).toEqual(["sk_test_1", "sk_live_deployed"]);
  });

  test("a payment that names another order is not this order's", async () => {
    const { payments } = make({ behaviour: { "checkout.sessions.retrieve": () => ({ id: "cs_1", client_reference_id: "other" }) } });
    expect(await payments.findOrderPayment("o1", {}, { sessionId: "cs_1" })).toBeNull();
  });

  test("any other Stripe error is thrown, not skipped", async () => {
    const { payments } = make({ behaviour: { "paymentIntents.retrieve": () => { throw Object.assign(new Error("rate limited"), { type: "StripeRateLimitError" }); } } });
    await expect(payments.findOrderPayment("o1", {}, { paymentIntentId: "pi_1" })).rejects.toThrow("rate limited");
  });

  test("with the sweep's keys, no settings are read and clients get the sweep's options", async () => {
    const { payments, db, made } = make({ behaviour: { "paymentIntents.retrieve": () => ({ id: "pi_1", metadata: { order_id: "o1" } }) } });
    const keys = { testMode: false, secrets: { test: "", live: "sk_live_k" }, clientOptions: { timeout: 20000 } };
    expect((await payments.findOrderPayment("o1", {}, { paymentIntentId: "pi_1" }, keys)).mode).toBe("live");
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
    const outcome = await payments.refund({
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
    await payments.refund({ mode: undefined, paymentIntentId: "pi_1", amountMinor: 250, metadata: {}, idempotencyKey: "k" });
    expect(made.at(-1).key).toBe("sk_live_deployed");
    expect(calls[0].args[0].amount).toBe(250);
    expect(calls[0].args[1]).toEqual({ idempotencyKey: "k" });
  });

  test("a refund Stripe did not accept throws; a missing key throws before Stripe is called", async () => {
    const refused = make({ behaviour: { "refunds.create": () => ({ id: "re_2", status: "failed" }) } });
    await expect(refused.payments.refund({ paymentIntentId: "pi_1", metadata: {}, idempotencyKey: "k" })).rejects.toThrow("Stripe refund was not accepted (status: failed).");
    const noKey = make({ liveSecret: "" });
    const onCalling = vi.fn();
    await expect(noKey.payments.refund({ paymentIntentId: "pi_1", metadata: {}, idempotencyKey: "k", onCalling })).rejects.toThrow("not configured");
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

// A Stripe whose every method records its call and answers from `answers[name]` (a value or a function of the args).
function recordingStripe(answers = {}) {
  const made = [];
  const calls = [];
  const resource = (prefix) => new Proxy({}, { get: (_, method) => async (...args) => {
    const name = `${prefix}.${String(method)}`;
    calls.push({ name, args });
    const answer = answers[name];
    return typeof answer === "function" ? answer(...args) : answer;
  } });
  class Stripe {
    constructor(key, opts) {
      made.push({ key, opts });
      this.paymentIntents = resource("paymentIntents");
      this.checkout = { sessions: resource("checkout.sessions") };
      this.accounts = resource("accounts");
      this.balance = resource("balance");
      this.webhookEndpoints = resource("webhookEndpoints");
      this.paymentMethodDomains = resource("paymentMethodDomains");
    }
  }
  return { Stripe, made, calls };
}

function makeWith(answers, { website = null, stripeSecret = null, liveSecret = "sk_live_deployed" } = {}) {
  const db = fakeDb({ website, stripeSecret });
  const stripe = recordingStripe(answers);
  const readAdminSecret = async (id) => {
    const snap = await db.collection("adminSecrets").doc(id).get();
    return snap.exists ? snap.data() || {} : {};
  };
  const liveSecretKey = { value: () => { if (liveSecret instanceof Error) throw liveSecret; return liveSecret; } };
  return { ...stripe, payments: createStripeProvider({ db, Stripe: stripe.Stripe, liveSecretKey, readAdminSecret }) };
}

describe("checkout (plan 1.12)", () => {
  test("uses the key for the shop's current mode, and refuses with the shopper-safe message when there is none", async () => {
    const live = makeWith({}, { stripeSecret: { secretKey: "sk_live_private" } });
    await live.payments.forCheckout({ payments: { testMode: false } });
    expect(live.made).toEqual([{ key: "sk_live_private", opts: undefined }]);
    const deployed = makeWith({});
    await deployed.payments.forCheckout({});
    expect(deployed.made[0].key).toBe("sk_live_deployed");
    const test = makeWith({}, { stripeSecret: { testSecretKey: "sk_test_private" } });
    await test.payments.forCheckout({ payments: { testMode: true, stripe: { testSecretKey: "sk_test_public" } } });
    expect(test.made[0].key).toBe("sk_test_private");
    await expect(makeWith({}).payments.forCheckout({ payments: { testMode: true } })).rejects.toThrow("Stripe Test Secret Key is not configured in settings.");
    await expect(makeWith({}, { liveSecret: "" }).payments.forCheckout({})).rejects.toThrow("Stripe Secret Key is not configured.");
  });

  test("an earlier payment that took (or may be taking) the money blocks a new one", async () => {
    for (const status of ["succeeded", "processing", "requires_capture"]) {
      const app = makeWith({ "paymentIntents.retrieve": { id: "pi_1", status } });
      expect(await (await app.payments.forCheckout({})).settlePreviousIntent("pi_1")).toBe("in_progress");
      expect(app.calls.map(c => c.name)).toEqual(["paymentIntents.retrieve"]);
    }
  });

  test("an unfinished earlier payment is cancelled; a finished-without-paying one is left alone", async () => {
    const open = makeWith({ "paymentIntents.retrieve": { id: "pi_1", status: "requires_action" }, "paymentIntents.cancel": {} });
    expect(await (await open.payments.forCheckout({})).settlePreviousIntent("pi_1")).toBe("cleared");
    expect(open.calls.map(c => [c.name, c.args[0]])).toEqual([["paymentIntents.retrieve", "pi_1"], ["paymentIntents.cancel", "pi_1"]]);
    const cancelled = makeWith({ "paymentIntents.retrieve": { id: "pi_1", status: "canceled" } });
    expect(await (await cancelled.payments.forCheckout({})).settlePreviousIntent("pi_1")).toBe("cleared");
    expect(cancelled.calls.map(c => c.name)).toEqual(["paymentIntents.retrieve"]);
  });

  test("a failed cancel is fine only when a simultaneous request already cancelled it", async () => {
    let reads = 0;
    const raced = makeWith({
      "paymentIntents.retrieve": () => ({ id: "pi_1", status: reads++ ? "canceled" : "requires_payment_method" }),
      "paymentIntents.cancel": () => { throw new Error("already cancelled"); },
    });
    expect(await (await raced.payments.forCheckout({})).settlePreviousIntent("pi_1")).toBe("cleared");
    const live = makeWith({
      "paymentIntents.retrieve": { id: "pi_1", status: "requires_payment_method" },
      "paymentIntents.cancel": () => { throw new Error("network"); },
    });
    await expect((await live.payments.forCheckout({})).settlePreviousIntent("pi_1")).rejects.toThrow("network");
  });

  test("the card-form intent and the Checkout Session carry exactly what checkout priced", async () => {
    const app = makeWith({ "paymentIntents.create": { id: "pi_new" }, "checkout.sessions.create": { id: "cs_new" } });
    const card = await app.payments.forCheckout({});
    expect(await card.createCardIntent({ amount: 4250, currency: "cad", orderId: "o1", idempotencyKey: "pi-key" })).toEqual({ id: "pi_new" });
    expect(app.calls[0].args).toEqual([{
      amount: 4250, currency: "cad", automatic_payment_methods: { enabled: true }, description: "Order o1",
      metadata: { order_id: "o1", checkout: "payment_element" },
    }, { idempotencyKey: "pi-key" }]);
    const params = { mode: "payment", client_reference_id: "o1" };
    expect(await card.createCheckoutSession(params, { idempotencyKey: "cs-key" })).toEqual({ id: "cs_new" });
    expect(app.calls[1].args).toEqual([params, { idempotencyKey: "cs-key" }]);
  });
});

describe("admin: key test, webhook setup, wallet domains (plan 1.12)", () => {
  test("deployedLiveKey never throws", () => {
    expect(makeWith({}).payments.deployedLiveKey()).toBe("sk_live_deployed");
    expect(makeWith({}, { liveSecret: new Error("not set") }).payments.deployedLiveKey()).toBe("");
  });

  test("checkKey names the account, falls back to a balance read, and reports a rejected key", async () => {
    const named = makeWith({ "accounts.retrieve": { id: "acct_1", settings: { dashboard: { display_name: "Press" } }, charges_enabled: true } });
    expect(await named.payments.checkKey("sk_test_1")).toEqual({ ok: true, accountId: "acct_1", accountName: "Press", chargesEnabled: true });
    const restricted = makeWith({ "accounts.retrieve": () => { throw new Error("no permission"); }, "balance.retrieve": {} });
    expect(await restricted.payments.checkKey("rk_live_1")).toEqual({ ok: true, accountId: null });
    const rejected = makeWith({ "accounts.retrieve": () => { throw new Error("first"); }, "balance.retrieve": () => { throw new Error("Invalid API Key"); } });
    expect(await rejected.payments.checkKey("sk_live_bad")).toEqual({ ok: false, error: "Invalid API Key" });
    expect(rejected.made.map(m => m.key)).toEqual(["sk_live_bad", "sk_live_bad"]);
  });

  test("webhook endpoints of the current mode's account; none without a key", async () => {
    const app = makeWith({ "webhookEndpoints.list": { data: [] }, "webhookEndpoints.create": { id: "we_1" } },
      { website: { payments: { testMode: true } }, stripeSecret: { testSecretKey: "sk_test_1" } });
    const { mode, endpoints } = await app.payments.webhookEndpoints();
    expect(mode).toBe("test");
    expect(app.made[0].key).toBe("sk_test_1");
    await endpoints.list();
    await endpoints.remove("we_0");
    await endpoints.create({ url: "u" });
    await endpoints.update("we_1", { disabled: false });
    expect(app.calls.map(c => [c.name, ...c.args])).toEqual([
      ["webhookEndpoints.list", { limit: 100 }], ["webhookEndpoints.del", "we_0"],
      ["webhookEndpoints.create", { url: "u" }], ["webhookEndpoints.update", "we_1", { disabled: false }],
    ]);
    expect(await makeWith({}, { website: { payments: { testMode: true } } }).payments.webhookEndpoints()).toEqual({ mode: "test", endpoints: null });
  });

  test("a wallet domain is created once, then re-validated", async () => {
    const fresh = makeWith({ "paymentMethodDomains.list": { data: [] }, "paymentMethodDomains.create": { id: "pmd_1", apple_pay: { status: "active" } } });
    expect(await fresh.payments.registerPaymentDomain("shop.example")).toEqual({ id: "pmd_1", apple_pay: { status: "active" } });
    expect(fresh.calls.map(c => [c.name, c.args[0]])).toEqual([
      ["paymentMethodDomains.list", { domain_name: "shop.example", limit: 1 }],
      ["paymentMethodDomains.create", { domain_name: "shop.example", enabled: true }],
    ]);
    const known = makeWith({ "paymentMethodDomains.list": { data: [{ id: "pmd_1" }] }, "paymentMethodDomains.validate": { id: "pmd_1" } });
    await known.payments.registerPaymentDomain("shop.example");
    expect(known.calls.map(c => [c.name, c.args[0]])).toEqual([["paymentMethodDomains.list", { domain_name: "shop.example", limit: 1 }], ["paymentMethodDomains.validate", "pmd_1"]]);
    await expect(makeWith({}, { website: { payments: { testMode: true } } }).payments.registerPaymentDomain("shop.example")).rejects.toThrow("Stripe is not configured.");
  });
});

describe("provider choice", () => {
  const deps = () => {
    const db = fakeDb();
    return { db, Stripe: fakeStripe().Stripe, liveSecretKey: { value: () => "sk_live_deployed" }, readAdminSecret: async () => ({}) };
  };

  test("Stripe is the default and, so far, the only provider", () => {
    expect(PROVIDER_NAMES).toEqual(["stripe"]);
    expect(createPayments(deps()).provider).toBe("stripe");
    expect(createPayments({ provider: "stripe", ...deps() }).provider).toBe("stripe");
  });

  test("callers get exactly the provider interface, nothing provider-only", () => {
    const payments = createPayments(deps());
    expect(Object.keys(payments).sort()).toEqual(["provider", ...INTERFACE].sort());
    for (const name of INTERFACE) expect(typeof payments[name], name).toBe("function");
    expect(payments.withPrivateStripeKeys).toBeUndefined();
    expect(Object.isFrozen(payments)).toBe(true);
  });

  test("an unknown provider is refused by name", () => {
    expect(() => createPayments({ provider: "square", ...deps() })).toThrow('Payment provider "square" is not available. Choose one of: stripe.');
  });

  test("the front calls through to the provider unchanged", async () => {
    const { db, liveSecretKey, readAdminSecret } = deps();
    const stripe = fakeStripe({ "paymentIntents.retrieve": () => ({ id: "pi_1", metadata: { order_id: "o1" } }) });
    const payments = createPayments({ db, Stripe: stripe.Stripe, liveSecretKey, readAdminSecret });
    expect(await payments.findOrderPayment("o1", {}, { paymentIntentId: "pi_1" })).toEqual({ intent: { id: "pi_1", metadata: { order_id: "o1" } }, mode: "live" });
  });

  test("the shop's server settings name the provider, keeping stripe for anything unknown", () => {
    const { readShopConfig } = require("../shopConfig.js");
    expect(readShopConfig({}).paymentProvider).toBe("stripe");
    expect(readShopConfig({ SHOP_PAYMENT_PROVIDER: " Stripe " }).paymentProvider).toBe("stripe");
    expect(readShopConfig({ SHOP_PAYMENT_PROVIDER: "square" }).paymentProvider).toBe("stripe");
  });
});

describe("unpaid attempt (cancel an unpaid order, a shopper's retry)", () => {
  test("reads the intent and session it is given, keeping the first when the second read fails", async () => {
    const app = makeWith({
      "paymentIntents.retrieve": { id: "pi_1", status: "requires_action" },
      "checkout.sessions.retrieve": () => { throw new Error("network"); },
    });
    const account = await app.payments.clientForMode("live", "acct_1");
    const found = {};
    await expect(app.payments.readAttempt(account, { intentId: "pi_1", sessionId: "cs_1" }, found)).rejects.toThrow("network");
    expect(found).toEqual({ intent: { id: "pi_1", status: "requires_action" } });
    expect(app.calls.map(c => c.args)).toEqual([["pi_1", {}, { stripeAccount: "acct_1" }], ["cs_1", {}, { stripeAccount: "acct_1" }]]);
    expect(await app.payments.readAttempt(account, { intentId: "", sessionId: "x" })).toEqual({});
  });

  test("stops an open session and an unfinished intent; ignores a refusal and a finished one", async () => {
    const app = makeWith({ "checkout.sessions.expire": {}, "paymentIntents.cancel": () => { throw new Error("already gone"); } });
    const account = await app.payments.clientForMode("live");
    expect(await app.payments.stopAttempt(account, { session: { id: "cs_1", status: "open" }, intent: { id: "pi_1", status: "requires_payment_method" } })).toEqual(["checkout"]);
    expect(app.calls.map(c => c.name)).toEqual(["checkout.sessions.expire", "paymentIntents.cancel"]);
    app.calls.length = 0;
    expect(await app.payments.stopAttempt(account, { session: { id: "cs_1", status: "complete" }, intent: { id: "pi_1", status: "succeeded" } })).toEqual([]);
    expect(app.calls).toEqual([]);
  });
});

describe("one door", () => {
  // Every other functions file reaches the payment provider through this module, by its provider-neutral names.
  const outside = async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
    return fs.readdirSync(dir).filter(f => f.endsWith(".js") && !f.includes(".test."))
      .map(f => ({ f, text: fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*\/\/.*$/gm, "") }));
  };

  test("no other file makes a Stripe client or calls Stripe's API itself", async () => {
    const STRIPE_API = /new Stripe\(|\.(paymentIntents|refunds|disputes|webhooks|webhookEndpoints|paymentMethodDomains|balance|accounts)\.[a-z]+\(|\.checkout\.sessions\./;
    expect((await outside()).filter(({ text }) => STRIPE_API.test(text)).map(({ f }) => f)).toEqual([]);
  });

  test("no other file uses the Stripe provider's own helper names", async () => {
    const STRIPE_HELPERS = /\b(getStripeClientForMode|readStripeKeys|withPrivateStripeKeys|stripeSecretFor|createStripeProvider|refundPayment)\b/;
    expect((await outside()).filter(({ text }) => STRIPE_HELPERS.test(text)).map(({ f }) => f)).toEqual([]);
  });
});
