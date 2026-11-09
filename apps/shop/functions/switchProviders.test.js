// A shop that switched card providers after opening (code plan 27.6b): deployed with the new provider and
// SHOP_PAYMENT_EARLIER naming the old one, it still looks up, refunds and reads the fees of orders the old provider
// took, and believes the old provider's events. The shop's payments module talks to the platform's real payment
// service (services/payments), which talks to stand-ins for Stripe's and Square's APIs.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';
import { readServiceConfig } from '../../../services/payments/config.js';
import { createPaymentService } from '../../../services/payments/service.js';
import { createStripeApi } from '../../../services/payments/stripeApi.js';
import { createSquareApi } from '../../../services/payments/squareApi.js';
import { squareSignature } from '../../../services/payments/squareSignature.js';
import { accountOnly, withOtherAccounts } from '../../../services/payments/accountSlots.js';
import { fakeAccounts, fakeDeliver, fakeStripeFetch, pretendPaymentsEnv } from '../../../services/payments/fakes.js';
import { fakeSquareFetch, fakeSquareStates, fakeSquareTokens } from '../../../services/payments/squareFakes.js';
import { fakeAuditLog, fakeRegistry } from '../../../setup/fakes.js';
import { hashServiceKey } from '../../../services/email/http.js';

const require = createRequire(import.meta.url);
const { createPayments } = require('./payments/index.js');
const { readShopConfig } = require('./shopConfig.js');

const SHOP = 'moth-press';
const KEY = 'shop-service-key-moth-press-0123456789abcdef';
const SERVICE_URL = 'https://payments.platform.example';
const HOOK_TEST = `${SERVICE_URL}/square/events/test`;
const ENV = {
  ...pretendPaymentsEnv(),
  SQUARE_APPLICATION_ID_TEST: 'sandbox-sq0idb-fakeTestApp', SQUARE_APPLICATION_SECRET_TEST: 'sandbox-sq0csb-fakeTestSecret',
  SQUARE_WEBHOOK_URL_TEST: HOOK_TEST, SQUARE_WEBHOOK_SIGNATURE_KEY_TEST: 'test-signature-key',
  SQUARE_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const RETURN = `https://${SHOP}.web.app/admin/settings/payments`;

const shopDb = () => ({
  collection: (name) => ({ doc: (id) => ({ async get() { const data = name === 'settings' && id === 'website' ? { payments: { testMode: true } } : null; return { exists: data != null, data: () => data }; } }) }),
});

async function platform(provider) {
  const config = readServiceConfig(ENV);
  const stripe = fakeStripeFetch();
  const sq = fakeSquareFetch({ apps: config.square.apps });
  const registry = fakeRegistry();
  const { deliver, delivered } = fakeDeliver();
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), deliver, config,
    squareApi: createSquareApi({ fetch: sq.fetch, apps: config.square.apps }), tokens: fakeSquareTokens(), states: fakeSquareStates(),
  });
  await registry.createShop(SHOP, {
    shopId: SHOP, projectId: SHOP, pressName: 'Moth Press', ownerEmail: 'owner@example.com', country: 'CA', currency: 'CAD',
    region: 'northamerica-northeast1', status: 'live', serviceKeyHash: hashServiceKey(KEY), payments: { provider, mode: 'test' },
  });
  const call = (op, args = {}) => service.shopCall({ headers: { 'X-Shop-Id': SHOP, Authorization: `Bearer ${KEY}` }, body: { op, mode: 'test', args } });
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const answer = await call(body.op, body.args);
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  const connectSquare = async () => {
    if (!sq.world.merchants.has('MERCHANT1')) sq.world.addMerchant('MERCHANT1', 'test');
    const link = await call('account.connectLink', { returnUrl: RETURN });
    sq.world.codes.set('code-1', 'MERCHANT1');
    await service.squareOAuth({ code: 'code-1', state: new URL(link.body.url).searchParams.get('state') });
  };
  const stripeAccount = async () => {
    const made = await service.createAccount(SHOP, { pressName: 'Moth Press', ownerEmail: 'owner@example.com', country: 'CA', currency: 'CAD', testMode: true, sells: 'books' });
    stripe.world.accounts.get(made.accountId).charges_enabled = true;
    await registry.updateShop(SHOP, { payments: { provider: 'stripe', mode: 'test', accountId: made.accountId, chargesEnabled: true } });
    return made.accountId;
  };
  // The switch itself (next code plan row): the next account takes sales, the current one moves to `earlier`.
  const switchNow = async () => {
    const before = (await registry.getShop(SHOP)).payments;
    await registry.updateShop(SHOP, { payments: withOtherAccounts({ ...before.next, earlier: [accountOnly(before)] }) });
  };
  const shop = (current, earlier = null) => createPayments({
    provider: current, earlier, mode: 'platform', db: shopDb(), readAdminSecret: async () => ({}),
    service: { url: SERVICE_URL, shopId: SHOP, fetch, serviceKey: () => KEY },
  });
  return { service, stripe, sq, registry, delivered, call, connectSquare, stripeAccount, switchNow, shop };
}

describe('a shop that switched card providers keeps serving the orders the old one took', () => {
  test('Stripe to Square: an older Stripe order is still found, refunded and its events believed; new sales go to Square', async () => {
    const p = await platform('stripe');
    const accountId = await p.stripeAccount();
    const before = p.shop('stripe');
    const card = await before.forCheckout({ payments: { testMode: true } });
    const intent = await card.createCardIntent({ amount: 5000, currency: 'cad', orderId: 'order1', idempotencyKey: 'order1-5000' });
    Object.assign(p.stripe.world.intents.get(intent.id), { status: 'succeeded', latest_charge: { id: 'ch_1', disputed: false } });

    await p.connectSquare();
    await p.switchNow();
    const after = p.shop('square', 'stripe');
    expect(after.provider).toBe('square');
    const order = { stripePaymentIntentId: intent.id, stripeMode: 'test' };
    expect(await after.findOrderPayment('order1', order, { paymentIntentId: intent.id })).toMatchObject({ mode: 'test', intent: { id: intent.id, status: 'succeeded' } });
    const refund = await after.refund({ mode: 'test', paymentIntentId: intent.id, amountMinor: 1500, metadata: { order_id: 'order1' }, idempotencyKey: 'order1-refund-1' });
    expect(refund).toMatchObject({ amountMinor: 1500 });
    expect(p.stripe.requests.filter((r) => r.path === '/v1/refunds').at(-1).headers['Stripe-Account']).toBe(accountId);

    // The old account's event, passed on by the platform as a Stripe one, is fetched again from Stripe.
    p.stripe.world.events.set('evt_old1', { id: 'evt_old1', object: 'event', type: 'charge.refunded', livemode: false, account: accountId, data: { object: { id: 'ch_1' } } });
    const raw = Buffer.from(JSON.stringify({ id: 'evt_old1', livemode: false }));
    const believed = await after.verifyWebhookEvent(await after.webhookClient(), raw, undefined, [], { platformEvent: 'stripe' });
    expect(believed.event).toMatchObject({ id: 'evt_old1', type: 'charge.refunded', provider: 'stripe' });

    // New sales: only Square's checkout. A Stripe card form can't be made any more.
    const link = await p.call('square.checkout.create', { params: { referenceId: 'order2', currency: 'CAD', redirectUrl: `https://${SHOP}.web.app/checkout?order_id=order2`, lineItems: [{ name: 'Moth Book', quantity: 1, unitAmountMinor: 5000 }] }, idempotencyKey: 'order2' });
    expect(link.status).toBe(200);
    expect((await p.call('paymentIntents.create', { params: { amount: 100, currency: 'cad' }, idempotencyKey: 'order3' })).body.error.code).toBe('switched_provider');
  });

  test('Square to Stripe: an older Square order is still found, refunded, its fees read and its events believed', async () => {
    const p = await platform('square');
    await p.connectSquare();
    const made = await p.call('square.checkout.create', { params: { referenceId: 'order1', currency: 'CAD', redirectUrl: `https://${SHOP}.web.app/checkout?order_id=order1`, lineItems: [{ name: 'Moth Book', quantity: 1, unitAmountMinor: 5000 }] }, idempotencyKey: 'order1' });
    const payment = p.sq.world.pay(made.body.id);
    const sessionId = `sqlink_${made.body.id}`;
    const paymentId = `sqpay_${payment.id}`;

    expect((await p.call('account.onboardingLink', { returnUrl: RETURN, refreshUrl: RETURN })).status).toBe(200);
    await p.switchNow();
    const after = p.shop('stripe', 'square');
    const order = { stripePaymentIntentId: paymentId, stripeCheckoutSessionId: sessionId, stripeMode: 'test' };

    expect(await after.findOrderPayment('order1', order, { sessionId })).toMatchObject({ session: { id: sessionId, payment_status: 'paid', payment_intent: paymentId } });
    const account = await after.clientForMode('test', null);
    expect((await after.readAttempt(account, { sessionId })).session).toMatchObject({ id: sessionId, payment_status: 'paid' });
    expect((await after.paymentMoney('order1', order)).parts.charge).toMatchObject({ currency: 'cad' });
    const refund = await after.refund({ mode: 'test', paymentIntentId: paymentId, amountMinor: 1500, metadata: { order_id: 'order1' }, idempotencyKey: 'order1-refund-1' });
    expect(refund).toMatchObject({ amountMinor: 1500 });

    // Square's refund event reaches the shop through the platform, named as Square's, and is read back from Square.
    const refundId = [...p.sq.world.refunds.keys()].at(-1);
    const body = JSON.stringify({ merchant_id: 'MERCHANT1', type: 'refund.updated', event_id: '7a8f5f28-54a1-4eb0-a98a-3111513fd4fc', created_at: '2026-11-09T12:00:00Z', data: { type: 'refund', id: refundId, object: { refund: { id: refundId } } } });
    expect(await p.service.squareEvent('test', { 'X-Square-HmacSha256-Signature': squareSignature('test-signature-key', HOOK_TEST, body) }, body)).toEqual({ status: 200, body: { forwarded: SHOP } });
    const raw = Buffer.from(p.delivered.at(-1).rawBody);
    const believed = await after.verifyWebhookEvent(await after.webhookClient(), raw, undefined, [], { platformEvent: 'square' });
    expect(believed.event).toMatchObject({ type: 'charge.refunded', provider: 'square' });
    // Without the platform's word it is taken for the current provider's, which doesn't know it.
    expect((await after.verifyWebhookEvent(await after.webhookClient(), raw, undefined, [])).event).toBeNull();
  });

  test('the earlier provider is set only for a switch through the platform, and never the current one', () => {
    const platformEnv = { SHOP_PAYMENT_MODE: 'platform', SHOP_PAYMENTS_SERVICE_URL: SERVICE_URL };
    expect(readShopConfig({ ...platformEnv, SHOP_PAYMENT_PROVIDER: 'square', SHOP_PAYMENT_EARLIER: 'Stripe' }).earlierPaymentProvider).toBe('stripe');
    expect(readShopConfig(platformEnv).earlierPaymentProvider).toBeNull();
    expect(() => readShopConfig({ ...platformEnv, SHOP_PAYMENT_EARLIER: 'stripe' })).toThrow(/SHOP_PAYMENT_EARLIER/);
    expect(() => readShopConfig({ SHOP_PAYMENT_EARLIER: 'square' })).toThrow(/SHOP_PAYMENT_EARLIER/);
    expect(() => readShopConfig({ ...platformEnv, SHOP_PAYMENT_EARLIER: 'paypal' })).toThrow(/SHOP_PAYMENT_EARLIER/);
    expect(() => createPayments({ provider: 'stripe', earlier: 'square', db: shopDb(), readAdminSecret: async () => ({}) })).toThrow(/through the platform only/);
  });
});
