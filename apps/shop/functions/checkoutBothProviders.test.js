// A shopper's card checkout, end to end, on a Stripe shop and on a Square shop (code plan 27, Julian 4 Nov 2026: "make
// sure if they choose stripe or square, that the checkout works for each"). Nothing is pretended in between: the
// shop's own checkout step and payments module (as deployed with SHOP_PAYMENT_PROVIDER) talk to the platform's real
// payment service (services/payments), which talks to stand-ins for Stripe's and Square's APIs. Each run: the shopper
// pays, the shop sees the order paid, the payment's own event is believed, and the owner refunds part of it.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';
import { readServiceConfig } from '../../../services/payments/config.js';
import { createPaymentService } from '../../../services/payments/service.js';
import { createStripeApi } from '../../../services/payments/stripeApi.js';
import { createSquareApi } from '../../../services/payments/squareApi.js';
import { squareSignature } from '../../../services/payments/squareSignature.js';
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from '../../../services/payments/fakes.js';
import { fakeSquareFetch, fakeSquareStates, fakeSquareTokens } from '../../../services/payments/squareFakes.js';
import { fakeAuditLog, fakeRegistry } from '../../../setup/fakes.js';
import { hashServiceKey } from '../../../services/email/http.js';

const require = createRequire(import.meta.url);
const { checkoutPaymentActions } = require('./checkoutPayment');
const { createPayments } = require('./payments/index.js');
import { readReturn } from '../src/app/features/site/checkoutFlow';

const SHOP = 'moth-press';
const KEY = 'shop-service-key-moth-press-0123456789abcdef';
const SERVICE_URL = 'https://payments.platform.example';
const HOOK_TEST = `${SERVICE_URL}/square/events/test`;
const ENV = {
  STRIPE_PLATFORM_TEST_KEY: 'sk_test_pretend',
  SQUARE_APPLICATION_ID_LIVE: 'sq0idp-fakeLiveApp', SQUARE_APPLICATION_SECRET_LIVE: 'sq0csp-fakeLiveSecret',
  SQUARE_APPLICATION_ID_TEST: 'sandbox-sq0idb-fakeTestApp', SQUARE_APPLICATION_SECRET_TEST: 'sandbox-sq0csb-fakeTestSecret',
  SQUARE_WEBHOOK_URL_LIVE: `${SERVICE_URL}/square/events/live`, SQUARE_WEBHOOK_URL_TEST: HOOK_TEST,
  SQUARE_WEBHOOK_SIGNATURE_KEY_LIVE: 'live-signature-key', SQUARE_WEBHOOK_SIGNATURE_KEY_TEST: 'test-signature-key',
  SQUARE_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const WEBSITE = { maintenance: { enabled: false }, payments: { testMode: true } };

const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

function shopDb(docs = {}) {
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({
        async get() { const data = docs[`${name}/${id}`]; return { exists: data != null, data: () => data }; },
        async set(data) { docs[`${name}/${id}`] = { ...data }; },
      }),
    }),
  };
}

// The platform's payment service with this one shop on it, and the shop's server reaching it over "HTTP".
async function platform(provider) {
  const config = readServiceConfig(ENV);
  const stripe = fakeStripeFetch();
  const sq = fakeSquareFetch({ apps: config.square.apps });
  const registry = fakeRegistry();
  const { deliver, delivered } = fakeDeliver();
  const accounts = fakeAccounts();
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts, deliver, config,
    squareApi: createSquareApi({ fetch: sq.fetch, apps: config.square.apps }), tokens: fakeSquareTokens(), states: fakeSquareStates(),
  });
  const row = { shopId: SHOP, projectId: SHOP, pressName: 'Moth Press', ownerEmail: 'owner@example.com', region: 'northamerica-northeast1', status: 'live', serviceKeyHash: hashServiceKey(KEY) };
  await registry.createShop(SHOP, { ...row, payments: { provider, mode: 'test' } });
  if (provider === 'stripe') {
    // The shop's connected Stripe account, made by setup (step 13) and finished by the press.
    const made = await service.createAccount(SHOP, { pressName: 'Moth Press', ownerEmail: 'owner@example.com', country: 'CA', currency: 'CAD', testMode: true, sells: 'books' });
    stripe.world.accounts.get(made.accountId).charges_enabled = true;
    await registry.updateShop(SHOP, { payments: { provider: 'stripe', mode: 'test', accountId: made.accountId } });
  }
  const call = (body) => service.shopCall({ headers: { 'X-Shop-Id': SHOP, Authorization: `Bearer ${KEY}` }, body });
  // What the shop's platform client sends (functions/payments/platform.js), answered by the service itself.
  const fetch = async (_url, init) => {
    const answer = await call(JSON.parse(init.body));
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  if (provider === 'square') {
    // The press connects its Square account from Settings › Payments (Sandbox, as the test shop does).
    sq.world.addMerchant('MERCHANT1', 'test');
    const link = await call({ op: 'account.connectLink', mode: 'test', args: { returnUrl: `https://${SHOP}.web.app/admin/settings/payments` } });
    const state = new URL(link.body.url).searchParams.get('state');
    sq.world.codes.set('code-1', 'MERCHANT1');
    await service.squareOAuth({ code: 'code-1', state, response_type: 'code' });
  }
  return { service, stripe, sq, registry, delivered, fetch };
}

// The shop as deployed for that provider, with the real checkout step (index.js wiring, pricing kept simple).
async function shop(provider) {
  const world = await platform(provider);
  const db = shopDb({ 'settings/website': WEBSITE });
  const payments = createPayments({
    provider, mode: 'platform', db, readAdminSecret: async () => ({}),
    service: { url: SERVICE_URL, shopId: SHOP, fetch: world.fetch, serviceKey: () => KEY },
  });
  const order = { customer: { name: 'Reader', email: 'reader@example.com', address: { country: 'Canada' } }, items: [{ id: 'moth-book', quantity: 2 }] };
  const holds = [];
  const orderRef = { get: async () => ({ exists: true, data: () => order }), update: async (data) => Object.assign(order, data) };
  const { handleStripeCheckout } = checkoutPaymentActions({
    ALLOWED_ORIGINS: [`https://${SHOP}.web.app`],
    canViewOrder: () => true, checkoutCurrencyOf: (c) => { const code = (c || 'cad').toLowerCase(); return ['cad', 'usd', 'eur', 'gbp', 'aud'].includes(code) ? code : null; },
    checkoutRefusal: () => null, clientIpOf: () => '203.0.113.1', db: { collection: () => ({ doc: () => orderRef }) },
    FALLBACK_RATES: { cad: 1, usd: 0.72 }, getCountryCode: () => 'CA', getExchangeRates: async () => ({ cad: 1, usd: 0.72 }), GiftCardError: class extends Error {},
    orderRequestIdentity: async () => null, orderRequestKey: () => 'key', payments,
    priceOrder: async () => ({
      items: [{ id: 'moth-book', title: 'Moth Book', price: 20, quantity: 2 }], settings: WEBSITE, appliedDiscount: null, fulfillment: null, shippingEstimate: null,
      subtotal: 40, discount: 0, shipping: 10, shippingMethod: { name: 'Canada Post' }, tax: 0, giftCardAmount: 0, giftCardRedemptions: [], total: 50,
    }),
    PricingError: class extends Error {}, publicErrorMessage: (err, fallback) => fallback, refusePreviousAttemptPaid: () => false,
    releaseSupersededAttempt: async () => null, reserveCheckout: async (orderId, lines, held, redemptions, mode) => { holds.push({ orderId, mode }); },
    serverGeoCountry: () => null, StockHoldError: class extends Error {}, stripeIntentKey: () => 'intent-key', testShop: true, practiceFor: async () => null,
  });
  const checkout = async (body) => {
    const out = res();
    await handleStripeCheckout({ body: { orderId: 'order1', returnUrl: `https://${SHOP}.web.app/checkout`, ...body }, headers: {} }, out);
    return out;
  };
  return { ...world, db, payments, order, holds, checkout };
}

describe("a shopper's card checkout works on whichever provider the press picked", () => {
  test('Stripe: the card form pays, the shop sees the order paid, and the owner refunds part of it', async () => {
    const s = await shop('stripe');
    const out = await s.checkout({ currency: 'cad', paymentElement: true });
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200);
    expect(out.body.clientSecret).toMatch(/^pi_fake\d+_secret/);
    const intentId = s.order.stripePaymentIntentId;
    expect(intentId).toMatch(/^pi_fake/);
    expect(s.holds).toEqual([{ orderId: 'order1', mode: true }]);
    // The charge was made on the press's own connected account, for the order's total, in cents.
    const intent = s.stripe.world.intents.get(intentId);
    expect(intent).toMatchObject({ amount: 5000, currency: 'cad', account: s.registry.shops.get(SHOP).payments.accountId });

    // The shopper's card goes through (Stripe's own form); the shop reads the payment back through the platform.
    Object.assign(intent, { status: 'succeeded', latest_charge: { id: 'ch_1', disputed: false } });
    const found = await s.payments.findOrderPayment('order1', s.order, { paymentIntentId: intentId });
    expect(found).toMatchObject({ mode: 'test', intent: { id: intentId, status: 'succeeded', amount: 5000, metadata: { order_id: 'order1' } } });

    const refund = await s.payments.refund({ mode: 'test', paymentIntentId: intentId, amountMinor: 1500, metadata: { order_id: 'order1' }, idempotencyKey: 'order1-refund-1' });
    expect(refund).toMatchObject({ amountMinor: 1500 });
    expect(['succeeded', 'pending']).toContain(String(refund.status).toLowerCase());
  });

  test('Square: Pay sends the shopper to Square, the shop sees the order paid, the payment event is believed, and the owner refunds part of it', async () => {
    const s = await shop('square');
    const out = await s.checkout({ currency: 'cad', embedded: false });
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200);
    expect(out.body.url).toMatch(/^https:\/\//);
    const sessionId = s.order.stripeCheckoutSessionId;
    expect(sessionId).toMatch(/^sqlink_/);
    expect(s.holds).toEqual([{ orderId: 'order1', mode: true }]);
    const link = s.sq.world.links.get(sessionId.slice('sqlink_'.length));
    expect(s.sq.world.orders.get(link.order_id).total_money).toEqual({ amount: 5000, currency: 'CAD' });

    // Square sends the shopper back to the shop's checkout, which knows to confirm the order with the server.
    const made = s.sq.requests.filter((r) => r.path === '/v2/online-checkout/payment-links' && r.method === 'POST').at(-1).body;
    const back = new URL(made.checkout_options.redirect_url);
    expect(back.origin).toBe(`https://${SHOP}.web.app`);
    expect(readReturn(back.search, back.pathname)).toMatchObject({ orderId: 'order1', landing: true, square: true });

    // The shopper pays on Square's page; back on the shop, the order is found paid.
    const payment = s.sq.world.pay(link.id);
    const found = await s.payments.findOrderPayment('order1', s.order, { sessionId });
    expect(found).toMatchObject({ mode: 'test', session: { id: sessionId, payment_status: 'paid', client_reference_id: 'order1', payment_intent: `sqpay_${payment.id}`, amount_total: 5000, currency: 'cad' } });

    // Square tells the platform; the platform passes it to this shop; the shop believes it only as Square reads it back.
    const body = JSON.stringify({ merchant_id: 'MERCHANT1', type: 'payment.updated', event_id: '7a8f5f28-54a1-4eb0-a98a-3111513fd4fc', created_at: '2026-11-04T12:00:00Z', data: { type: 'payment', id: payment.id, object: { payment: { id: payment.id } } } });
    const passed = await s.service.squareEvent('test', { 'X-Square-HmacSha256-Signature': squareSignature('test-signature-key', HOOK_TEST, body) }, body);
    expect(passed).toEqual({ status: 200, body: { forwarded: SHOP } });
    const { event } = await s.payments.verifyWebhookEvent(await s.payments.webhookClient(), Buffer.from(s.delivered[0].rawBody), undefined, []);
    expect(event.type).toBe('checkout.session.completed');
    expect(event.data.object.metadata?.order_id ?? event.data.object.client_reference_id).toBe('order1');

    const refund = await s.payments.refund({ mode: 'test', paymentIntentId: `sqpay_${payment.id}`, amountMinor: 1500, metadata: { order_id: 'order1' }, idempotencyKey: 'order1-refund-1' });
    expect(refund).toMatchObject({ amountMinor: 1500 });
    expect(['succeeded', 'pending']).toContain(String(refund.status).toLowerCase());
  });

  test('Square: a shopper browsing in US dollars pays the same order in the Square account\'s Canadian dollars', async () => {
    const s = await shop('square');
    const out = await s.checkout({ currency: 'usd', embedded: false });
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200);
    const link = s.sq.world.links.get(s.order.stripeCheckoutSessionId.slice('sqlink_'.length));
    expect(s.sq.world.orders.get(link.order_id).total_money).toEqual({ amount: 5000, currency: 'CAD' });
  });
});
