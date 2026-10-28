import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createSquareApi, SQUARE_VERSION } from "./squareApi.js";
import { squareSignature, verifySquareSignature } from "./squareSignature.js";
import { seal, sealingKey, unseal } from "./tokenSeal.js";
import { readServiceConfig } from "./config.js";
import { createPaymentService } from "./service.js";
import { createStripeApi } from "./stripeApi.js";
import { handlePayments } from "./http.js";
import { refundedFee, squareFee, squareKey, SQUARE_SCOPES } from "./square.js";
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from "./fakes.js";
import { fakeSquareFetch, fakeSquareStates, fakeSquareTokens } from "./squareFakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const OTHER = "lark-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
const HOOK_TEST = "https://payments.platform.example/square/events/test";
const HOOK_LIVE = "https://payments.platform.example/square/events/live";
const ENV = {
  SQUARE_APPLICATION_ID_LIVE: "sq0idp-fakeLiveApp",
  SQUARE_APPLICATION_SECRET_LIVE: "sq0csp-fakeLiveSecret",
  SQUARE_APPLICATION_ID_TEST: "sandbox-sq0idb-fakeTestApp",
  SQUARE_APPLICATION_SECRET_TEST: "sandbox-sq0csb-fakeTestSecret",
  SQUARE_WEBHOOK_URL_LIVE: HOOK_LIVE,
  SQUARE_WEBHOOK_URL_TEST: HOOK_TEST,
  SQUARE_WEBHOOK_SIGNATURE_KEY_LIVE: "live-signature-key",
  SQUARE_WEBHOOK_SIGNATURE_KEY_TEST: "old-key, test-signature-key",
  SQUARE_TOKEN_KEY: TOKEN_KEY,
};

const squareRow = (fields = {}, payments = {}) => ({
  shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", region: "northamerica-northeast1",
  status: "live", serviceKeyHash: hashServiceKey(KEY), payments: { provider: "square", mode: "test", ...payments }, ...fields,
});

async function world({ env = {}, rows = [squareRow()], square = true } = {}) {
  const config = readServiceConfig({ ...ENV, ...env });
  const sq = fakeSquareFetch({ apps: config.square.apps });
  const stripe = fakeStripeFetch();
  const registry = fakeRegistry();
  for (const row of rows) await registry.createShop(row.shopId, row);
  const auditLog = fakeAuditLog();
  const tokens = fakeSquareTokens();
  const states = fakeSquareStates();
  const { deliver, delivered } = fakeDeliver();
  let clock = NOW;
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog, accounts: fakeAccounts(), deliver, config,
    ...(square ? { squareApi: createSquareApi({ fetch: sq.fetch, apps: config.square.apps }), tokens, states } : {}),
    now: () => clock,
  });
  const call = (op, args = {}, mode = "test", shopId = SHOP, key = KEY) => service.shopCall({ headers: { "X-Shop-Id": shopId, Authorization: `Bearer ${key}` }, body: { op, mode, args } });
  // Connect Square as the press would: the admin asks for the link, the press signs in, Square sends them back.
  const connect = async (merchantId = "MERCHANT1", { mode = "test", shopId = SHOP, key = KEY } = {}) => {
    if (!sq.world.merchants.has(merchantId)) sq.world.addMerchant(merchantId, mode);
    const link = await call("account.connectLink", { returnUrl: `https://${shopId}.web.app/admin/settings/payments` }, mode, shopId, key);
    assert.equal(link.status, 200, JSON.stringify(link.body));
    const state = new URL(link.body.url).searchParams.get("state");
    const code = `code-${merchantId}-${randomBytes(3).toString("hex")}`;
    sq.world.codes.set(code, merchantId);
    return service.squareOAuth({ code, state, response_type: "code" });
  };
  return { config, sq, registry, auditLog, tokens, states, delivered, service, call, connect, tick: (ms) => { clock += ms; } };
}

const eventsOf = (w, shopId = SHOP) => [...(w.registry.events.get(shopId)?.values() ?? [])];

const checkoutArgs = (fields = {}) => ({
  params: {
    referenceId: "order1", currency: "cad", buyerEmail: "reader@example.com", redirectUrl: `https://${SHOP}.web.app/checkout?success=true&order_id=order1`,
    lineItems: [{ name: "Moth Book", quantity: 2, unitAmountMinor: 2000 }, { name: "Shipping & Handling", quantity: 1, unitAmountMinor: 1000 }],
    ...fields,
  },
  idempotencyKey: "order1-square-5000",
});

// ── Settings, client, signature, sealing ─────────────────────────────────────────────────────────────────────────

test("Square settings: optional, Sandbox and production values never swapped, tokens need a sealing key", () => {
  const none = readServiceConfig({});
  assert.deepEqual(none.square.apps, { live: null, test: null });
  assert.equal(none.square.tokenKey, null);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_APPLICATION_ID_TEST: "sq0idp-production" }), /must be Square Sandbox values/);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_APPLICATION_SECRET_LIVE: "sandbox-sq0csb-x" }), /must be Square production values/);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_APPLICATION_SECRET_LIVE: "" }), /go together/);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_TOKEN_KEY: "" }), /SQUARE_TOKEN_KEY is needed/);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_TOKEN_KEY: "c2hvcnQ=" }), /32 bytes/);
  assert.throws(() => readServiceConfig({ ...ENV, SQUARE_WEBHOOK_URL_TEST: "http://payments.platform.example/x" }), /https address/);
  const config = readServiceConfig(ENV);
  assert.deepEqual(config.square.webhooks.test.keys, ["old-key", "test-signature-key"]);
});

test("the Square client sends the version, the press's token, and Square's OAuth shapes", async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, ...init, body: init.body && JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({}) }; };
  const api = createSquareApi({ fetch, apps: { live: { applicationId: "sq0idp-a", applicationSecret: "sq0csp-b" }, test: null } });
  await api.call("live", "GET", "/v2/payments/P1", { accessToken: "EAAAtoken" });
  assert.equal(seen[0].url, "https://connect.squareup.com/v2/payments/P1");
  assert.deepEqual(seen[0].headers, { "Square-Version": SQUARE_VERSION, Authorization: "Bearer EAAAtoken" });
  await api.obtainToken("live", { code: "c1" });
  assert.deepEqual(seen[1].body, { client_id: "sq0idp-a", client_secret: "sq0csp-b", grant_type: "authorization_code", code: "c1" });
  await api.obtainToken("live", { refreshToken: "r1" });
  assert.deepEqual(seen[2].body, { client_id: "sq0idp-a", client_secret: "sq0csp-b", grant_type: "refresh_token", refresh_token: "r1" });
  await api.revokeToken("live", "M1");
  assert.equal(seen[3].url, "https://connect.squareup.com/oauth2/revoke");
  assert.equal(seen[3].headers.Authorization, "Client sq0csp-b");
  assert.deepEqual(seen[3].body, { client_id: "sq0idp-a", merchant_id: "M1" });
  const url = new URL(api.authorizeUrl("live", { scopes: ["A", "B"], state: "s1" }));
  assert.equal(url.origin + url.pathname, "https://connect.squareup.com/oauth2/authorize");
  assert.equal(url.searchParams.get("scope"), "A B");
  assert.equal(url.searchParams.get("session"), "false");
  assert.throws(() => api.authorizeUrl("test", { scopes: ["A"], state: "s" }), /no Square Sandbox application/);
  await assert.rejects(api.call("live", "GET", "/v2/payments/P1", {}), /No access token/);
});

test("a Square refusal keeps Square's first error", async () => {
  const fetch = async () => ({ ok: false, status: 400, json: async () => ({ errors: [{ category: "INVALID_REQUEST_ERROR", code: "AMOUNT_TOO_HIGH", detail: "too much", field: "amount_money" }] }) });
  const api = createSquareApi({ fetch, apps: {} });
  await assert.rejects(api.call("test", "POST", "/v2/refunds", { accessToken: "t", body: {} }), (err) => err.code === "AMOUNT_TOO_HIGH" && err.statusCode === 400 && err.field === "amount_money");
});

test("Square's signature: the notification address then the raw body, Base64; rolled keys work", () => {
  const body = JSON.stringify({ merchant_id: "M1", type: "payment.updated" });
  const header = squareSignature("k2", HOOK_TEST, body);
  assert.match(header, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(verifySquareSignature(["k1", "k2"], HOOK_TEST, body, header), true);
  assert.equal(verifySquareSignature(["k1"], HOOK_TEST, body, header), false);
  assert.equal(verifySquareSignature(["k2"], HOOK_LIVE, body, header), false);
  assert.equal(verifySquareSignature(["k2"], HOOK_TEST, `${body} `, header), false);
  assert.equal(verifySquareSignature(["k2"], HOOK_TEST, body, ""), false);
});

test("sealed tokens open only with the key, for the same shop and mode", () => {
  const key = sealingKey(TOKEN_KEY);
  const sealed = seal(key, "square/moth-press/test", { accessToken: "EAAAsecret" });
  assert.doesNotMatch(sealed, /EAAAsecret/);
  assert.deepEqual(unseal(key, "square/moth-press/test", sealed), { accessToken: "EAAAsecret" });
  assert.throws(() => unseal(key, "square/lark-press/test", sealed));
  assert.throws(() => unseal(sealingKey(Buffer.alloc(32, 9).toString("base64")), "square/moth-press/test", sealed));
  const parts = sealed.split(".");
  const flipped = Buffer.from(parts[3], "base64");
  flipped[0] ^= 1;
  assert.throws(() => unseal(key, "square/moth-press/test", [...parts.slice(0, 3), flipped.toString("base64")].join(".")));
});

test("the fee on Square: the shop's percentage, within Square's cap, refunded in proportion", () => {
  const tenPercent = { basisPoints: 1000, refunded: true };
  assert.equal(squareFee(5000, "CAD", tenPercent), 500);
  // Square allows at most 90% (60% under its small-payment threshold).
  assert.equal(squareFee(5000, "CAD", { basisPoints: 10000, refunded: true }), 4500);
  assert.equal(squareFee(400, "CAD", { basisPoints: 10000, refunded: true }), 240);
  assert.equal(refundedFee({ app_fee_money: { amount: 500 }, total_money: { amount: 5000 } }, 2500), 250);
  assert.equal(refundedFee({ app_fee_money: { amount: 333 }, total_money: { amount: 1000 } }, 500), 166);
  assert.equal(refundedFee({ total_money: { amount: 1000 } }, 500), 0);
  assert.ok(squareKey(SHOP, "x".repeat(200)).length <= 45);
  assert.notEqual(squareKey(SHOP, "k"), squareKey(OTHER, "k"));
});

// ── Connect Square ───────────────────────────────────────────────────────────────────────────────────────────────

test("Connect Square: the press signs in, the registry gets the account, the tokens stay sealed with the platform", async () => {
  const w = await world();
  const before = await w.call("account.status");
  assert.equal(before.status, 200);
  assert.deepEqual(before.body, { provider: "square", mode: "test", platformFee: { percent: 0, refundedWithRefunds: true }, connected: false });

  const link = await w.call("account.connectLink", { returnUrl: `https://${SHOP}.web.app/admin/settings/payments` });
  const url = new URL(link.body.url);
  assert.equal(url.origin, "https://connect.squareupsandbox.com");
  assert.equal(url.searchParams.get("client_id"), ENV.SQUARE_APPLICATION_ID_TEST);
  assert.equal(url.searchParams.get("scope"), SQUARE_SCOPES.join(" "));
  assert.equal(url.searchParams.get("session"), null);
  assert.equal((await w.call("account.connectLink", { returnUrl: "https://evil.example/x" })).status, 400);

  const done = await w.connect("MERCHANT1");
  assert.equal(done.status, 302);
  assert.equal(done.headers.Location, `https://${SHOP}.web.app/admin/settings/payments?square=connected`);
  const row = await w.registry.getShop(SHOP);
  assert.deepEqual({ ...row.payments, connectedAt: "x" }, { provider: "square", mode: "test", accountId: "MERCHANT1", locationId: "LOCMERCHANT1", currency: "CAD", country: "CA", connectedAt: "x" });
  const stored = await w.tokens.get(SHOP, "test");
  assert.equal(stored.merchantId, "MERCHANT1");
  assert.doesNotMatch(JSON.stringify([...w.tokens.rows.values(), row, [...(w.auditLog.entries.get(SHOP)?.values() ?? [])]]), /EAAAfake|EQAAfake/);
  assert.equal(eventsOf(w).some((e) => e.kind === "payments.square-connected"), true);

  const after = await w.call("account.status");
  assert.equal(after.body.connected, true);
  assert.equal(after.body.chargesEnabled, true);
  assert.equal(after.body.locationName, "Main shop");
});

test("Connect Square refuses an old or reused state, and sends a refusal back as denied", async () => {
  const w = await world();
  const link = await w.call("account.connectLink", { returnUrl: `https://${SHOP}.web.app/admin` });
  const state = new URL(link.body.url).searchParams.get("state");
  const denied = await w.service.squareOAuth({ state, error: "access_denied", error_description: "user denied" });
  assert.equal(denied.headers.Location, `https://${SHOP}.web.app/admin?square=denied`);
  assert.equal((await w.service.squareOAuth({ state, code: "c" })).status, 400);
  assert.equal((await w.service.squareOAuth({ state: "nope", code: "c" })).status, 400);

  const late = await w.call("account.connectLink", { returnUrl: `https://${SHOP}.web.app/admin` });
  w.tick(16 * 60 * 1000);
  assert.equal((await w.service.squareOAuth({ state: new URL(late.body.url).searchParams.get("state"), code: "c" })).status, 400);
  assert.equal((await w.registry.getShop(SHOP)).payments.accountId, undefined);
});

test("one Square account per shop: another shop's account, or a second account, needs a person", async () => {
  const w = await world({ rows: [squareRow(), squareRow({ shopId: OTHER, projectId: OTHER, serviceKeyHash: hashServiceKey(`${KEY}-lark`) })] });
  assert.equal((await w.connect("MERCHANT1")).headers.Location.endsWith("square=connected"), true);
  const taken = await w.connect("MERCHANT1", { shopId: OTHER, key: `${KEY}-lark` });
  assert.match(taken.headers.Location, /square=in_use$/);
  assert.equal((await w.registry.getShop(OTHER)).payments.accountId, undefined);
  const second = await w.connect("MERCHANT2");
  assert.match(second.headers.Location, /square=other_account$/);
  assert.equal((await w.registry.getShop(SHOP)).payments.accountId, "MERCHANT1");
  // Signing in again with the same account just renews the connection.
  assert.match((await w.connect("MERCHANT1")).headers.Location, /square=connected$/);
});

// ── Shop calls ───────────────────────────────────────────────────────────────────────────────────────────────────

test("hosted checkout: the shop's own priced lines on the press's main location, once per key", async () => {
  const w = await world();
  assert.equal((await w.call("square.checkout.create", checkoutArgs())).body.error.code, "not_connected");
  await w.connect("MERCHANT1");
  const made = await w.call("square.checkout.create", checkoutArgs());
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.match(made.body.url, /^https:\/\/square\.link\//);
  const sent = w.sq.requests.find((r) => r.path === "/v2/online-checkout/payment-links");
  assert.equal(sent.mode, "test");
  assert.deepEqual(sent.body.order, {
    location_id: "LOCMERCHANT1", reference_id: "order1",
    line_items: [{ name: "Moth Book", quantity: "2", base_price_money: { amount: 2000, currency: "CAD" } }, { name: "Shipping & Handling", quantity: "1", base_price_money: { amount: 1000, currency: "CAD" } }],
  });
  assert.deepEqual(sent.body.checkout_options, { redirect_url: checkoutArgs().params.redirectUrl, allow_tipping: false, ask_for_shipping_address: false });
  assert.deepEqual(sent.body.pre_populated_data, { buyer_email: "reader@example.com" });
  assert.equal(sent.body.idempotency_key, squareKey(SHOP, "order1-square-5000"));
  const again = await w.call("square.checkout.create", checkoutArgs());
  assert.equal(again.body.id, made.body.id);

  assert.equal((await w.call("square.checkout.create", checkoutArgs({ redirectUrl: "https://evil.example/x" }))).status, 400);
  assert.equal((await w.call("square.checkout.create", checkoutArgs({ currency: "usd" }))).body.error.code, "currency_mismatch");
  assert.equal((await w.call("square.checkout.create", checkoutArgs({ lineItems: [{ name: "x", quantity: 1, unitAmountMinor: 1.5 }] }))).status, 400);
  assert.equal((await w.call("square.checkout.create", { ...checkoutArgs(), idempotencyKey: "" })).status, 400);
});

test("the platform fee rides on the checkout and goes back in proportion with a refund", async () => {
  const w = await world({ rows: [squareRow({ platformFee: { basisPoints: 1000 } })] });
  await w.connect("MERCHANT1");
  const made = await w.call("square.checkout.create", checkoutArgs());
  const sent = w.sq.requests.find((r) => r.path === "/v2/online-checkout/payment-links");
  assert.deepEqual(sent.body.checkout_options.app_fee_money, { amount: 500, currency: "CAD" });

  const payment = w.sq.world.pay(made.body.id);
  const look = await w.call("square.checkout.retrieve", { id: made.body.id });
  assert.deepEqual({ ...look.body, url: "x", squareOrderId: "x" }, { id: made.body.id, url: "x", squareOrderId: "x", referenceId: "order1", state: "COMPLETED", totalMinor: 5000, currency: "CAD", paymentIds: [payment.id] });
  const paid = await w.call("square.payments.retrieve", { id: payment.id });
  assert.equal(paid.body.status, "COMPLETED");
  assert.equal(paid.body.referenceId, "order1");
  assert.equal(paid.body.appFeeMinor, 500);

  const half = await w.call("square.refunds.create", { params: { paymentId: payment.id, amountMinor: 2500, reason: "requested_by_customer" }, idempotencyKey: "order1-refund-1" });
  assert.equal(half.status, 200, JSON.stringify(half.body));
  assert.equal(half.body.status, "PENDING");
  const refundSent = w.sq.requests.filter((r) => r.path === "/v2/refunds" && r.method === "POST").at(-1).body;
  assert.deepEqual(refundSent.app_fee_money, { amount: 250, currency: "CAD" });
  assert.ok(refundSent.idempotency_key.length <= 45);
  // The same key twice is one refund.
  assert.equal((await w.call("square.refunds.create", { params: { paymentId: payment.id, amountMinor: 2500 }, idempotencyKey: "order1-refund-1" })).body.id, half.body.id);
  // No amount: the rest.
  const rest = await w.call("square.refunds.create", { params: { paymentId: payment.id }, idempotencyKey: "order1-refund-2" });
  assert.equal(rest.body.amountMinor, 2500);
  const listed = await w.call("square.refunds.forPayment", { paymentId: payment.id });
  assert.deepEqual(listed.body.data.map((r) => r.amountMinor), [2500, 2500]);
  assert.equal((await w.call("square.refunds.retrieve", { id: half.body.id })).body.paymentId, payment.id);
});

test("a shop whose fee isn't refunded keeps it out of the refund", async () => {
  const w = await world({ rows: [squareRow({ platformFee: { basisPoints: 1000, refunded: false } })] });
  await w.connect("MERCHANT1");
  const made = await w.call("square.checkout.create", checkoutArgs());
  const payment = w.sq.world.pay(made.body.id);
  await w.call("square.refunds.create", { params: { paymentId: payment.id, amountMinor: 1000 }, idempotencyKey: "r" });
  assert.equal(w.sq.requests.filter((r) => r.path === "/v2/refunds").at(-1).body.app_fee_money, undefined);
});

test("disputes, cancels and deletes; another press's objects are out of reach", async () => {
  const w = await world({ rows: [squareRow(), squareRow({ shopId: OTHER, projectId: OTHER, serviceKeyHash: hashServiceKey(`${KEY}-lark`) })] });
  await w.connect("MERCHANT1");
  await w.connect("MERCHANT9", { shopId: OTHER, key: `${KEY}-lark` });
  const made = await w.call("square.checkout.create", checkoutArgs());
  const payment = w.sq.world.pay(made.body.id);
  const other = w.sq.world.pay((await w.call("square.checkout.create", { ...checkoutArgs({ redirectUrl: `https://${OTHER}.web.app/checkout` }), idempotencyKey: "other" }, "test", OTHER, `${KEY}-lark`)).body.id);
  for (let i = 0; i < 3; i += 1) w.sq.world.dispute(other.id);
  w.sq.world.dispute(payment.id);
  w.sq.world.dispute(payment.id);
  w.sq.world.dispute(payment.id);
  const disputes = await w.call("square.disputes.forPayment", { paymentId: payment.id });
  assert.equal(disputes.body.data.length, 3);
  assert.ok(disputes.body.data.every((d) => d.paymentId === payment.id && d.state === "EVIDENCE_REQUIRED"));

  const theirs = await w.call("square.payments.retrieve", { id: other.id });
  assert.equal(theirs.status, 404);
  const cancel = await w.call("square.payments.cancel", { id: payment.id });
  assert.equal(cancel.status, 400);
  assert.equal(cancel.body.error.type, "square_error");
  const open = await w.call("square.checkout.create", { ...checkoutArgs(), idempotencyKey: "second" });
  const gone = await w.call("square.checkout.delete", { id: open.body.id });
  assert.equal(gone.status, 200);
  assert.ok(gone.body.cancelledOrderId);
  assert.equal((await w.call("square.payments.retrieve", { id: "bad id!" })).status, 400);
});

test("a payment page closed when its stock hold ends (5.1): its Square order is cancelled; a payment keeps Square's own time", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const made = await w.call("square.checkout.create", checkoutArgs());
  const closed = await w.call("square.checkout.delete", { id: made.body.id });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.cancelledOrderId, made.body.squareOrderId);
  const deletes = w.sq.requests.filter((r) => r.method === "DELETE");
  assert.deepEqual(deletes.map((r) => r.path), [`/v2/online-checkout/payment-links/${made.body.id}`]);
  // The page is gone: reading or closing it again answers "not found", which the shop takes as already closed.
  assert.equal((await w.call("square.checkout.retrieve", { id: made.body.id })).status, 404);
  assert.equal((await w.call("square.checkout.delete", { id: made.body.id })).status, 404);

  // The shop tells a late payment from a slow event by when Square says the shopper paid.
  const open = await w.call("square.checkout.create", { ...checkoutArgs(), idempotencyKey: "second" });
  const payment = w.sq.world.pay(open.body.id);
  const read = await w.call("square.payments.retrieve", { id: payment.id });
  assert.equal(read.body.createdAt, payment.created_at);
  assert.equal(read.body.referenceId, "order1");
  // And the full refund of a late payment needs no amount: it refunds what is left.
  const refund = await w.call("square.refunds.create", { params: { paymentId: payment.id, reason: "Paid after the checkout closed" }, idempotencyKey: "late-order1" });
  assert.equal(refund.status, 200);
  assert.equal(refund.body.amountMinor, 5000);
});

test("each payment's fees and its payout: Square's processing fee, and the payout's lines page by page (7.10)", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const made = await w.call("square.checkout.create", checkoutArgs());
  const payment = w.sq.world.pay(made.body.id);
  payment.processing_fee = [{ effective_at: "2026-10-28T12:00:00Z", type: "INITIAL", amount_money: { amount: 145, currency: "CAD" } }];
  assert.equal((await w.call("square.payments.retrieve", { id: payment.id })).body.processingFeeMinor, 145);
  const refund = await w.call("square.refunds.create", { params: { paymentId: payment.id, amountMinor: 1000 }, idempotencyKey: "r1" });
  w.sq.world.refunds.get(refund.body.id).processing_fee = [{ type: "INITIAL", amount_money: { amount: -36, currency: "CAD" } }];
  assert.equal((await w.call("square.refunds.retrieve", { id: refund.body.id })).body.processingFeeMinor, -36);

  const money = (amount) => ({ amount, currency_code: "CAD" });
  const payoutId = w.sq.world.payout("MERCHANT1", [
    { type: "CHARGE", gross_amount_money: money(4000), fee_amount_money: money(145), net_amount_money: money(3855), type_charge_details: { payment_id: payment.id } },
    { type: "REFUND", gross_amount_money: money(-1000), fee_amount_money: money(-36), net_amount_money: money(-964), type_refund_details: { payment_id: payment.id, refund_id: refund.body.id } },
    { type: "CHARGE", gross_amount_money: money(500), fee_amount_money: money(20), net_amount_money: money(480), type_charge_details: { payment_id: "PAYother" } },
  ]);
  const payout = await w.call("square.payouts.retrieve", { id: payoutId });
  assert.deepEqual(payout.body, { id: payoutId, status: "PAID", arrivalDate: "2026-10-30", amountMinor: 3371, currency: "CAD", locationId: "LOCMERCHANT1" });
  const first = await w.call("square.payouts.entries", { id: payoutId });
  assert.equal(first.body.data.length, 2);
  assert.deepEqual(first.body.data[1], { id: `${payoutId}-e1`, type: "REFUND", paymentId: payment.id, refundId: refund.body.id, grossMinor: -1000, feeMinor: -36, netMinor: -964, currency: "CAD", effectiveAt: "2026-10-28T12:00:00Z" });
  const second = await w.call("square.payouts.entries", { id: payoutId, cursor: first.body.cursor });
  assert.deepEqual(second.body.data.map((e) => e.paymentId), ["PAYother"]);
  assert.equal(second.body.cursor, null);
  assert.equal((await w.call("square.payouts.entries", { id: payoutId, cursor: "two words" })).status, 400);

  // Another press's payout is out of reach, and connecting asks Square for the payout permissions.
  assert.equal((await w.call("square.payouts.retrieve", { id: "po_someone-else" })).status, 404);
  assert.ok(SQUARE_SCOPES.includes("PAYOUTS_READ") && SQUARE_SCOPES.includes("SETTLEMENTS_READ"));
});

test("modes: a test shop never takes live payments; a live shop has no Sandbox to test with", async () => {
  const w = await world({ rows: [squareRow({}, { mode: "live" })] });
  await w.connect("MERCHANT1", { mode: "live" });
  assert.equal(w.sq.requests.find((r) => r.path === "/oauth2/token").mode, "live");
  assert.equal((await w.call("square.checkout.create", checkoutArgs(), "live")).status, 200);
  assert.equal((await w.call("square.checkout.create", checkoutArgs(), "test")).body.error.code, "not_connected");

  const t = await world();
  await t.connect("MERCHANT1");
  assert.equal((await t.call("square.checkout.create", checkoutArgs(), "live")).body.error.code, "test_only");
});

test("an access token near its end is renewed first, logged, and still never stored in the clear", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const first = (await w.tokens.get(SHOP, "test")).sealed;
  assert.equal((await w.call("square.checkout.create", checkoutArgs())).status, 200);
  assert.equal(w.sq.requests.filter((r) => r.path === "/oauth2/token").length, 1);
  w.tick(24 * 24 * 60 * 60 * 1000); // 24 days on: the 30-day token ends within a week
  assert.equal((await w.call("square.payments.retrieve", { id: "PAYnone" })).status, 404);
  const tokenCalls = w.sq.requests.filter((r) => r.path === "/oauth2/token");
  assert.equal(tokenCalls.length, 2);
  assert.equal(tokenCalls[1].body.grant_type, "refresh_token");
  assert.notEqual((await w.tokens.get(SHOP, "test")).sealed, first);
  assert.ok(eventsOf(w).some((e) => e.kind === "payments.square-token-renewed"));
});

test("a shop on Square can't make Stripe calls, and a Stripe shop can't make Square ones", async () => {
  const stripeRow = squareRow({ shopId: OTHER, projectId: OTHER, serviceKeyHash: hashServiceKey(`${KEY}-lark`) }, { provider: "stripe", accountId: "acct_lark", mode: "test" });
  const w = await world({ rows: [squareRow(), stripeRow] });
  await w.connect("MERCHANT1");
  assert.equal((await w.call("paymentIntents.create", { params: { amount: 100, currency: "cad" }, idempotencyKey: "k" })).status, 400);
  assert.equal((await w.call("square.payments.retrieve", { id: "P1" }, "test", OTHER, `${KEY}-lark`)).status, 400);
  assert.equal((await w.call("account.status", {}, "test", SHOP, "wrong-key")).status, 401);
});

test("without the platform's Square application, a Square shop is told plainly", async () => {
  const w = await world({ square: false });
  const answer = await w.call("account.status");
  assert.equal(answer.status, 503);
  assert.equal(answer.body.error.code, "square_not_ready");
  assert.equal((await w.service.squareOAuth({ state: "x" })).status, 503);
});

// ── Events ───────────────────────────────────────────────────────────────────────────────────────────────────────

const squareEvent = (fields = {}) => JSON.stringify({ merchant_id: "MERCHANT1", type: "payment.updated", event_id: "e-1", created_at: "2026-10-28T12:00:00Z", data: { type: "payment", id: "PAY1", object: { payment: { id: "PAY1" } } }, ...fields });
const signed = (body, url = HOOK_TEST, key = "test-signature-key") => ({ "X-Square-HmacSha256-Signature": squareSignature(key, url, body) });

test("Square events: signature checked, shop found by account, passed on for the shop to look up", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const body = squareEvent();
  const ok = await w.service.squareEvent("test", signed(body), body);
  assert.deepEqual(ok, { status: 200, body: { forwarded: SHOP } });
  assert.deepEqual(w.delivered, [{ shopId: SHOP, rawBody: body }]);

  assert.equal((await w.service.squareEvent("test", signed(body, HOOK_LIVE), body)).status, 400);
  assert.equal((await w.service.squareEvent("test", signed(body, HOOK_TEST, "old-key"), body)).status, 200);
  assert.equal((await w.service.squareEvent("test", {}, body)).status, 400);
  // A live event for a Sandbox shop, and an account nobody has, are dropped.
  assert.equal((await w.service.squareEvent("live", signed(body, HOOK_LIVE, "live-signature-key"), body)).body.ignored !== undefined, true);
  const stranger = squareEvent({ merchant_id: "NOBODY" });
  assert.equal((await w.service.squareEvent("test", signed(stranger), stranger)).body.ignored !== undefined, true);
  assert.equal(w.delivered.length, 2);
  // A payout (each order's payout and fees, 7.10) is passed on too; an event about anything else is not.
  const payout = squareEvent({ type: "payout.paid", event_id: "e-2", data: { type: "payout", id: "po_1", object: { payout: { id: "po_1" } } } });
  assert.deepEqual((await w.service.squareEvent("test", signed(payout), payout)).body, { forwarded: SHOP });
  const other = squareEvent({ type: "customer.created", event_id: "e-3", data: { type: "customer", id: "C1" } });
  assert.ok((await w.service.squareEvent("test", signed(other), other)).body.ignored);
  assert.equal(w.delivered.length, 3);
});

test("a shop that doesn't take the event makes Square send it again", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: fakeStripeFetch().fetch, keys: w.config.keys }), registry: w.registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(),
    deliver: fakeDeliver(500).deliver, config: w.config, squareApi: createSquareApi({ fetch: w.sq.fetch, apps: w.config.square.apps }), tokens: w.tokens, states: w.states, now: () => NOW,
  });
  const body = squareEvent();
  assert.equal((await service.squareEvent("test", signed(body), body)).status, 502);
});

test("a press who disconnects the platform in Square: the shop is marked, its tokens dropped, calls refused", async () => {
  const w = await world();
  await w.connect("MERCHANT1");
  const body = squareEvent({ type: "oauth.authorization.revoked", event_id: "e-revoke", data: { type: "revocation", id: "x", object: { revocation: { revoked_at: "2026-10-28T12:00:00Z" } } } });
  assert.deepEqual(await w.service.squareEvent("test", signed(body), body), { status: 200, body: { disconnected: SHOP } });
  assert.ok((await w.registry.getShop(SHOP)).payments.disconnectedAt);
  assert.equal(await w.tokens.get(SHOP, "test"), null);
  assert.ok(eventsOf(w).some((e) => e.kind === "payments.disconnected"));
  assert.equal((await w.call("square.checkout.create", checkoutArgs())).body.error.code, "not_connected");
  assert.equal((await w.call("account.status")).body.connected, false);
  assert.equal(w.delivered.length, 0);
  // Connecting again brings it back.
  assert.match((await w.connect("MERCHANT1")).headers.Location, /square=connected$/);
  assert.equal((await w.registry.getShop(SHOP)).payments.disconnectedAt, undefined);
});

test("the web doors: Square's sign-in answer is a GET, its events a POST per environment", async () => {
  const w = await world();
  const link = await w.call("account.connectLink", { returnUrl: `https://${SHOP}.web.app/admin` });
  const state = new URL(link.body.url).searchParams.get("state");
  w.sq.world.addMerchant("MERCHANT1", "test");
  w.sq.world.codes.set("door-code", "MERCHANT1");
  const back = await handlePayments({ method: "GET", path: "/square/oauth", query: { code: "door-code", state } }, { service: w.service });
  assert.equal(back.status, 302);
  assert.equal((await handlePayments({ method: "POST", path: "/square/oauth" }, { service: w.service })).status, 405);
  const body = squareEvent();
  const event = await handlePayments({ method: "POST", path: "/square/events/test", headers: signed(body), rawBody: Buffer.from(body) }, { service: w.service });
  assert.equal(event.status, 200);
  assert.equal((await handlePayments({ method: "POST", path: "/square/events/elsewhere", rawBody: body }, { service: w.service })).status, 404);
  assert.equal((await handlePayments({ method: "POST", path: "/square/events/test", headers: {} }, { service: w.service })).status, 400);
});
