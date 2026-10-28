// Payments through the platform (code plan 2.2): the shop holds no Stripe key and every call goes to the platform's
// payment service, as this shop, with its service key. A pretend service stands in for it; nothing reaches Stripe.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments } = require("./index.js");
const { createServiceCaller } = require("./platform.js");
const { readShopConfig } = require("../shopConfig.js");

const URL_ = "https://payments.platform.example";
const SHOP = "moth-press";
const KEY = "service-key-moth-press-0123456789abcdef0123";

// A pretend payment service: answers each op from `world`, like services/payments, and keeps every call.
function fakeService({ testOnly = false, answers = {} } = {}) {
  const calls = [];
  const world = {
    intents: new Map([["pi_paid", { id: "pi_paid", status: "succeeded", metadata: { order_id: "o1" }, latest_charge: { id: "ch_1", disputed: false } }]]),
    events: new Map([["evt_real", { id: "evt_real", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_1" } } }]]),
  };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const missing = (what) => reply(404, { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } });
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, ...body });
    if (init.headers.Authorization !== `Bearer ${KEY}` || init.headers["X-Shop-Id"] !== SHOP) return reply(401, { error: { code: "unknown_shop", message: "This shop can't use the platform's payments." } });
    if (answers[body.op]) return answers[body.op](body);
    if (body.mode === "live" && testOnly) return reply(403, { error: { type: "platform_error", code: "test_only", message: "This shop takes test payments only." } });
    const { op, args } = body;
    if (op === "paymentIntents.create") return reply(200, { id: "pi_new", amount: args.params.amount, client_secret: "pi_new_secret", metadata: args.params.metadata });
    if (op === "paymentIntents.retrieve") return world.intents.has(args.id) ? reply(200, world.intents.get(args.id)) : missing("payment_intent");
    if (op === "paymentIntents.cancel") return reply(200, { id: args.id, status: "canceled" });
    if (op === "checkout.sessions.create") return reply(200, { id: "cs_new", url: "https://checkout.stripe.example/cs_new" });
    if (op === "refunds.create") return reply(200, { id: "re_1", status: "succeeded", amount: args.params.amount, currency: "cad" });
    if (op === "refunds.list" || op === "disputes.list") return reply(200, { data: [] });
    if (op === "events.retrieve") return world.events.has(args.id) ? reply(200, world.events.get(args.id)) : missing("event");
    return reply(400, { error: { code: "bad_request", message: `unknown call ${op}` } });
  };
  return { fetch, calls, world };
}

function fakeDb({ website = {} } = {}) {
  const reads = [];
  const docs = { "settings/website": website };
  return {
    reads,
    collection: (name) => ({ doc: (id) => ({ async get() {
      reads.push(`${name}/${id}`);
      const data = docs[`${name}/${id}`];
      return { exists: data != null, data: () => data };
    } }) }),
  };
}

// The Stripe package must never be used in platform mode.
class NoStripe { constructor() { throw new Error("platform mode made a Stripe client"); } }

function make({ testMode = true, testOnly = false, serviceKey = KEY, answers } = {}) {
  const service = fakeService({ testOnly, answers });
  const db = fakeDb({ website: { payments: { testMode } } });
  const payments = createPayments({
    provider: "stripe", mode: "platform", service: { url: `${URL_}/`, shopId: SHOP, fetch: service.fetch, serviceKey: () => serviceKey },
    db, Stripe: NoStripe, liveSecretKey: { value: () => { throw new Error("no deployed key in platform mode"); } }, readAdminSecret: async () => ({}),
  });
  return { payments, service, db };
}

describe("payments through the platform", () => {
  test("every call goes to the service as this shop, with its key, and no Stripe client is made", async () => {
    const { payments, service, db } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    const intent = await card.createCardIntent({ amount: 4000, currency: "cad", orderId: "o1", idempotencyKey: "o1-card" });
    expect(intent.id).toBe("pi_new");
    expect(service.calls).toHaveLength(1);
    const [call] = service.calls;
    expect(call.url).toBe(`${URL_}/shop`);
    expect(call.headers).toEqual({ "Content-Type": "application/json", "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` });
    expect(call.op).toBe("paymentIntents.create");
    expect(call.mode).toBe("test");
    expect(call.args.idempotencyKey).toBe("o1-card");
    expect(call.args.params).toMatchObject({ amount: 4000, currency: "cad", metadata: { order_id: "o1" } });
    expect(db.reads).not.toContain("adminSecrets/stripe");
  });

  test("the shop's test mode picks the service's mode; a Checkout Session goes the same way", async () => {
    const { payments, service } = make({ testMode: false });
    const card = await payments.forCheckout({ payments: { testMode: false } });
    await card.createCheckoutSession({ line_items: [] }, { idempotencyKey: "o2-session" });
    expect(service.calls[0]).toMatchObject({ op: "checkout.sessions.create", mode: "live", args: { idempotencyKey: "o2-session" } });
  });

  test("an earlier attempt is read and cancelled through the service", async () => {
    const { payments, service } = make();
    service.world.intents.set("pi_old", { id: "pi_old", status: "requires_payment_method" });
    const card = await payments.forCheckout({ payments: { testMode: true } });
    expect(await card.settlePreviousIntent("pi_old")).toBe("cleared");
    expect(service.calls.map(c => c.op)).toEqual(["paymentIntents.retrieve", "paymentIntents.cancel"]);
  });

  test("payment lookups skip a mode the press's account can't use, like a key that doesn't know the id", async () => {
    const { payments, service } = make({ testOnly: true });
    const found = await payments.findOrderPayment("o1", { stripeMode: "live" }, { paymentIntentId: "pi_paid" });
    expect(found).toMatchObject({ intent: { id: "pi_paid" }, mode: "test" });
    expect(service.calls.map(c => c.mode)).toEqual(["live", "test"]);
  });

  test("the refund/dispute check reads the charge through the service", async () => {
    const { payments, service } = make();
    const seen = await payments.checkReversal("o1", { stripePaymentIntentId: "pi_paid", stripeMode: "test" }, {}, async ({ charge, listRefunds }) => ({ charge: charge.id, refunds: await listRefunds() }));
    expect(seen).toEqual({ charge: "ch_1", refunds: [] });
    expect(service.calls.find(c => c.op === "paymentIntents.retrieve").args).toEqual({ id: "pi_paid", params: { expand: ["latest_charge"] } });
  });

  test("a refund goes through the service with its idempotency key; the order's account record isn't sent", async () => {
    const { payments, service } = make();
    let called = false;
    const refund = await payments.refund({ mode: "test", accountId: "acct_recorded", paymentIntentId: "pi_paid", amountMinor: 1000, metadata: { order_id: "o1" }, idempotencyKey: "o1-refund-1", onCalling: () => { called = true; } });
    expect(refund).toEqual({ refundId: "re_1", amountMinor: 1000, currency: "cad", status: "succeeded" });
    expect(called).toBe(true);
    expect(service.calls[0]).toMatchObject({ op: "refunds.create", mode: "test", args: { idempotencyKey: "o1-refund-1", params: { payment_intent: "pi_paid", amount: 1000 } } });
    expect(JSON.stringify(service.calls[0])).not.toContain("acct_recorded");
  });

  test("a sweep's keys need no key reads in platform mode", async () => {
    const { payments, db } = make();
    const keys = await payments.readKeys();
    expect(keys.testMode).toBe(true);
    expect(Object.values(keys.secrets).every(Boolean)).toBe(true);
    expect(db.reads).not.toContain("adminSecrets/stripe");
  });

  test("a shop with no service key yet refuses plainly, before anything is sent", async () => {
    const { payments, service } = make({ serviceKey: "" });
    const card = await payments.forCheckout({ payments: { testMode: true } });
    await expect(card.createCardIntent({ amount: 1, currency: "cad", orderId: "o", idempotencyKey: "k" })).rejects.toMatchObject({ code: "not_connected" });
    expect(service.calls).toEqual([]);
  });

  test("the service's refusals keep their code and status, like Stripe's", async () => {
    const caller = createServiceCaller({ fetch: async () => ({ ok: false, status: 402, json: async () => ({ error: { type: "card_error", code: "card_declined", message: "Declined" } }) }), url: URL_, shopId: SHOP, readKey: async () => KEY });
    await expect(caller("refunds.create", "live", {})).rejects.toMatchObject({ type: "card_error", code: "card_declined", statusCode: 402, message: "Declined" });
    const offline = createServiceCaller({ fetch: async () => { throw new Error("ECONNRESET"); }, url: URL_, shopId: SHOP, readKey: async () => KEY });
    await expect(offline("refunds.create", "live", {})).rejects.toMatchObject({ type: "api_connection_error", statusCode: 502 });
  });

  test("the admin's key and webhook tools have nothing to do; payment domains are the platform's", async () => {
    const { payments } = make();
    expect(payments.deployedLiveKey()).toBe("");
    expect(await payments.checkKey("sk_live_x")).toMatchObject({ ok: false });
    expect(await payments.webhookEndpoints()).toEqual({ mode: "test", endpoints: null });
    await expect(payments.registerPaymentDomain("shop.example")).rejects.toThrow(/platform registers/);
  });
});

describe("events passed on by the platform", () => {
  const delivery = (event) => Buffer.from(JSON.stringify(event));

  test("an event is believed only as the service returns it, fetched again by its id", async () => {
    const { payments, service } = make();
    const client = await payments.webhookClient();
    // Whatever the delivery claims, the shop acts on the service's copy.
    const { event, lastError } = await payments.verifyWebhookEvent(client, delivery({ id: "evt_real", livemode: false, type: "checkout.session.completed", data: { object: { id: "cs_forged", amount_total: 1 } } }), undefined, []);
    expect(lastError).toBeNull();
    expect(event.data.object.id).toBe("cs_1");
    expect(service.calls).toEqual([expect.objectContaining({ op: "events.retrieve", mode: "test", args: { id: "evt_real" } })]);
  });

  test("a posted event the service can't fetch again changes nothing", async () => {
    const { payments } = make();
    const client = await payments.webhookClient();
    for (const raw of [delivery({ id: "evt_forged", livemode: false, type: "checkout.session.completed" }), delivery({ type: "x" }), Buffer.from("not json"), delivery({ id: "../evt", livemode: true })]) {
      const { event, lastError } = await payments.verifyWebhookEvent(client, raw, "t=1,v1=whatever", ["whsec_any"]);
      expect(event).toBeNull();
      expect(lastError).toBeInstanceOf(Error);
    }
  });

  test("an answer for another event id is refused", async () => {
    const { payments } = make({ answers: { "events.retrieve": () => ({ ok: true, status: 200, json: async () => ({ id: "evt_other" }) }) } });
    const { event } = await payments.verifyWebhookEvent(null, delivery({ id: "evt_real", livemode: false }), undefined, []);
    expect(event).toBeNull();
  });

  test("the webhook handler awaits the check, so a refused delivery stops before any order is touched", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
    expect(source).toContain("await payments.verifyWebhookEvent(client, req.rawBody, sig, secrets)");
    const handler = source.slice(source.indexOf("exports.stripeWebhook"));
    const verify = handler.indexOf("await payments.verifyWebhookEvent");
    const refused = handler.indexOf("if (!event)");
    const firstOrderRead = handler.search(/collection\("orders"\)|markStripeOrderPaid\(/);
    expect(verify).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(verify);
    expect(firstOrderRead).toBeGreaterThan(refused);
  });
});

describe("the shop's payment mode", () => {
  test("own unless the server settings say platform; platform needs the service's address", () => {
    expect(readShopConfig({}).paymentMode).toBe("own");
    expect(readShopConfig({}).paymentsServiceUrl).toBe("");
    const platform = readShopConfig({ SHOP_PAYMENT_MODE: "Platform", SHOP_PAYMENTS_SERVICE_URL: `${URL_}/` });
    expect(platform.paymentMode).toBe("platform");
    expect(platform.paymentsServiceUrl).toBe(URL_);
    expect(() => readShopConfig({ SHOP_PAYMENT_MODE: "platform" })).toThrow(/SHOP_PAYMENTS_SERVICE_URL/);
    expect(() => readShopConfig({ SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: "http://payments.example" })).toThrow(/https/);
    expect(() => readShopConfig({ SHOP_PAYMENT_MODE: "shared" })).toThrow('SHOP_PAYMENT_MODE is "shared". Set it to one of: own, platform');
  });

  test("an unknown mode, or platform without an address, is refused when payments are made", () => {
    const deps = { db: fakeDb(), Stripe: NoStripe, liveSecretKey: { value: () => "" }, readAdminSecret: async () => ({}) };
    expect(() => createPayments({ mode: "shared", ...deps })).toThrow('Payment mode "shared" is not available');
    expect(() => createPayments({ mode: "platform", service: { url: "", shopId: SHOP }, ...deps })).toThrow(/SHOP_PAYMENTS_SERVICE_URL/);
    expect(createPayments({ mode: "platform", service: { url: URL_, shopId: SHOP, fetch: async () => {} }, ...deps }).mode).toBe("platform");
  });

  test("the functions load in platform mode, and refuse to without the service's address", () => {
    const { execFileSync } = require("node:child_process");
    const dir = new URL("..", import.meta.url).pathname;
    const run = (env) => {
      try {
        execFileSync(process.execPath, ["-e", "require('./index.js')"], { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
        return "loaded";
      } catch (err) { return String(err.stderr); }
    };
    expect(run({ SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: URL_ })).toBe("loaded");
    expect(run({ SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: "" })).toContain("SHOP_PAYMENTS_SERVICE_URL");
  }, 30000);
});
