// Plan item 1.31: sandbox checkouts hold stock only on the shop the platform marks as its test shop (SHOP_TEST_SHOP,
// shopConfig.testShop), so the release check (docs/test-shop.md) covers the hold. Everywhere else a sandbox checkout
// holds nothing, as before, and a live checkout always holds stock and gift cards.
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { checkoutPaymentActions } = require('./checkoutPayment');
const here = path.dirname(fileURLToPath(import.meta.url));

class StockHoldError extends Error { constructor(message, code) { super(message); this.code = code; } }
class GiftCardError extends Error {}
class PricingError extends Error {}

function checkout({ testMode, testShop, giftCards = [], holdFails = false }) {
  const holds = [];
  const order = { customer: { email: 'Shopper@Example.com', address: { country: 'Canada' } }, items: [{ id: 'book', quantity: 1 }] };
  const orderRef = { get: async () => ({ exists: true, data: () => order }), update: async (data) => Object.assign(order, data) };
  const card = {
    createCheckoutSession: async () => ({ id: 'cs_1', url: 'https://checkout.example/cs_1', client_secret: 'secret' }),
    createCardIntent: async () => ({ id: 'pi_1', client_secret: 'pi_secret' }),
    settlePreviousIntent: async () => 'done',
  };
  const items = [{ id: 'book', title: 'Book', price: 10, quantity: 1 }];
  const { handleStripeCheckout } = checkoutPaymentActions({
    ALLOWED_ORIGINS: ['https://shop.example'],
    canViewOrder: () => true,
    checkoutCurrencyOf: (c) => (c || 'cad').toLowerCase(),
    checkoutRefusal: () => null,
    clientIpOf: () => '203.0.113.1',
    db: { collection: () => ({ doc: () => orderRef }) },
    FALLBACK_RATES: { cad: 1 },
    getCountryCode: () => 'CA',
    getExchangeRates: async () => ({ cad: 1 }),
    GiftCardError,
    orderRequestIdentity: async () => null,
    orderRequestKey: () => 'key',
    payments: { forCheckout: async () => card },
    priceOrder: async () => ({
      items, settings: { payments: { testMode } }, appliedDiscount: null, fulfillment: null, shippingEstimate: null,
      subtotal: 10, discount: 0, shipping: 0, shippingMethod: null, tax: 0,
      giftCardAmount: giftCards.reduce((sum, g) => sum + g.amount, 0), giftCardRedemptions: giftCards, total: 10,
    }),
    PricingError,
    publicErrorMessage: (err, fallback) => fallback,
    refusePreviousAttemptPaid: () => false,
    releaseSupersededAttempt: async () => null,
    reserveCheckout: async (orderId, lines, held, redemptions, mode) => {
      holds.push({ orderId, lines, redemptions, mode });
      if (holdFails) throw new StockHoldError('Only 0 left.', 'insufficient_stock');
    },
    serverGeoCountry: () => null,
    StockHoldError,
    stripeIntentKey: () => 'intent-key',
    testShop,
  });
  const run = async (body) => {
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await handleStripeCheckout({ body: { orderId: 'o1', currency: 'cad', ...body }, headers: {} }, res);
    return res;
  };
  return { run, holds, order };
}

describe('sandbox stock holds on the platform test shop', () => {
  test('a sandbox checkout on a normal shop holds nothing, as before', async () => {
    const shop = checkout({ testMode: true, testShop: false });
    const res = await shop.run({});
    expect(res.statusCode).toBe(200);
    expect(shop.holds).toEqual([]);
    expect(shop.order.stripeMode).toBe('test');
  });

  test('a sandbox checkout on the test shop holds the stock like a live one', async () => {
    const shop = checkout({ testMode: true, testShop: true });
    const res = await shop.run({});
    expect(res.statusCode).toBe(200);
    expect(shop.holds).toHaveLength(1);
    expect(shop.holds[0]).toMatchObject({ orderId: 'o1', lines: [{ id: 'book', quantity: 1 }], mode: true });
    expect(shop.order.stripeMode).toBe('test');
  });

  test('the test shop holds stock but not gift cards in sandbox (a sandbox payment never debits them)', async () => {
    const giftCards = [{ cardId: 'g1', amount: 4 }];
    const shop = checkout({ testMode: true, testShop: true, giftCards });
    const res = await shop.run({ paymentElement: true });
    expect(res.statusCode).toBe(200);
    expect(shop.holds).toHaveLength(1);
    expect(shop.holds[0].redemptions).toEqual([]);
  });

  test('a sold-out book stops a sandbox checkout on the test shop, the same answer a live shopper gets', async () => {
    const shop = checkout({ testMode: true, testShop: true, holdFails: true });
    const res = await shop.run({});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Only 0 left.', code: 'insufficient_stock' });
    expect(shop.order.stripeCheckoutSessionId).toBeUndefined();
  });

  test('a live checkout holds stock and gift cards on every shop', async () => {
    const giftCards = [{ cardId: 'g1', amount: 4 }];
    for (const testShop of [false, true]) {
      const shop = checkout({ testMode: false, testShop, giftCards });
      const res = await shop.run({ paymentElement: true });
      expect(res.statusCode).toBe(200);
      expect(shop.holds).toHaveLength(1);
      expect(shop.holds[0]).toMatchObject({ redemptions: giftCards, mode: false });
    }
  });

  test('without the flag passed in, a shop is a normal shop', async () => {
    const shop = checkout({ testMode: true, testShop: undefined });
    await shop.run({});
    expect(shop.holds).toEqual([]);
  });

  test('index.js passes the platform flag from shopConfig, not from shop settings the owner can change', () => {
    const source = fs.readFileSync(path.join(here, 'index.js'), 'utf8');
    const call = source.slice(source.indexOf('= checkoutPaymentActions({'));
    expect(call.slice(0, call.indexOf('});'))).toContain('testShop: shopConfig.testShop');
  });
});
