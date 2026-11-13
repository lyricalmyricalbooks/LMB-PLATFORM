// A shop that sells in US dollars (shopConfig.currency "USD", from its record's SHOP_CURRENCY): every price it stores
// is in US dollars, so a US shopper is charged the price as it is, a Canadian or European shopper that price at the
// day's rate from the US dollar, and a Canadian shop is charged exactly as before. The real checkout step, the real
// rate reader and the real currency guard run; the payment service is a pretend one, so nothing is charged.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';

const realRequire = createRequire(import.meta.url);
const { checkoutPaymentActions } = realRequire('./checkoutPayment');
const { createPayments } = realRequire('./payments/index.js');
const { createRateReader, fallbackRatesFor } = realRequire('./exchangeRates');
const { checkoutCurrencyOf } = realRequire('./paymentGuards');
const { configForShop } = realRequire('./shopConfig');
const { runInShop } = realRequire('./shopScope');
const { shopCurrency, shopSign } = realRequire('./shopMoney');
const { orderMoneyFmt, refundAmountText, refundEmailFacts } = realRequire('./emailMoney');
const { chargedOf } = realRequire('./partialRefund');

const SERVICE_URL = 'https://payments.platform.example';
const NOW = Date.parse('2026-11-13T12:00:00Z');
const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

// A 50.00 order: a 40.00 book and 10.00 shipping, in the shop's own currency.
const PRICED = {
  items: [{ id: 'book', title: 'Moth Book', price: 40, quantity: 1 }], appliedDiscount: null, fulfillment: null, shippingEstimate: null,
  subtotal: 40, discount: 0, shipping: 10, shippingMethod: null, tax: 0, giftCardAmount: 0, giftCardRedemptions: [], total: 50,
};

/** One shop's checkout. `saved` is its settings/exchangeRates document; `feed` what the rate feed answers (null = down). */
function checkout({ currency, saved = null, feed = null }) {
  const intents = [];
  const fetched = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    intents.push(body);
    return { ok: true, status: 200, json: async () => ({ id: 'pi_new', client_secret: 'pi_new_secret', amount: body.args.params.amount, currency: body.args.params.currency }) };
  };
  const order = { customer: { email: 'reader@example.com', address: { country: 'United States' } }, items: [{ id: 'book', quantity: 1 }] };
  const orderRef = { get: async () => ({ exists: true, data: () => order }), update: async (data) => Object.assign(order, data) };
  const ratesRef = { get: async () => ({ data: () => saved ?? undefined }), set: async () => {} };
  const db = { collection: (name) => ({ doc: () => (name === 'settings' ? ratesRef : orderRef) }) };
  const payments = createPayments({
    provider: 'stripe', mode: 'platform', service: { url: SERVICE_URL, shopId: 'moth-press', fetch, serviceKey: () => 'key' },
    db, Stripe: class { constructor() { throw new Error('no Stripe client in platform mode'); } },
    liveSecretKey: { value: () => '' }, readAdminSecret: async () => ({}),
  });
  const feedFetch = async (url) => {
    fetched.push(String(url));
    if (!feed) throw new Error('offline');
    return new Response(JSON.stringify({ result: 'success', base_code: currency, rates: feed }), { status: 200 });
  };
  const { handleStripeCheckout } = checkoutPaymentActions({
    ALLOWED_ORIGINS: ['https://moth-press.web.app'],
    canViewOrder: () => true, checkoutCurrencyOf: (value) => checkoutCurrencyOf(value, currency), checkoutRefusal: () => null,
    clientIpOf: () => '203.0.113.1', db, FALLBACK_RATES: fallbackRatesFor(currency),
    getCountryCode: () => 'US', getExchangeRates: createRateReader({ db, base: () => currency, fetchImpl: feedFetch, now: () => NOW, log: { warn: () => {} } }),
    GiftCardError: class extends Error {}, orderRequestIdentity: async () => null, orderRequestKey: () => 'key', payments,
    priceOrder: async () => ({ ...PRICED, settings: { payments: { testMode: false } } }),
    PricingError: class extends Error {}, publicErrorMessage: (err, fallback) => fallback, refusePreviousAttemptPaid: () => false,
    releaseSupersededAttempt: async () => null, reserveCheckout: async () => {},
    serverGeoCountry: () => null, StockHoldError: class extends Error {}, stripeIntentKey: () => 'intent-key',
    testShop: false, practiceFor: async () => null,
  });
  const pay = async (body = {}) => {
    const out = res();
    await handleStripeCheckout({ token: null, body: { orderId: 'o1', paymentElement: true, returnUrl: 'https://moth-press.web.app/checkout', ...body }, headers: {} }, out);
    return out;
  };
  const intent = () => intents.find((c) => c.op === 'paymentIntents.create')?.args.params;
  return { pay, order, intent, fetched };
}

const fresh = (data) => ({ ...data, fetchedAt: new Date(NOW - 3600_000).toISOString() });

describe('a shop that sells in US dollars', () => {
  test('a US shopper is charged the price as it is, in US dollars', async () => {
    const shop = checkout({ currency: 'USD', saved: fresh({ base: 'USD', cad: 1.4, eur: 0.9 }) });
    expect((await shop.pay({ currency: 'usd' })).statusCode).toBe(200);
    expect(shop.intent()).toMatchObject({ amount: 5000, currency: 'usd' });
    expect(shop.order).toMatchObject({ expectedAmountMinor: 5000, expectedCurrency: 'usd', checkoutCurrency: 'USD', exchangeRate: 1, total: 50 });
  });

  test('a checkout that names no currency is charged in US dollars, never Canadian', async () => {
    const shop = checkout({ currency: 'USD', saved: fresh({ base: 'USD', cad: 1.4, eur: 0.9 }) });
    expect((await shop.pay()).statusCode).toBe(200);
    expect(shop.intent()).toMatchObject({ amount: 5000, currency: 'usd' });
  });

  test('a Canadian shopper is charged the US price at the day\'s rate from the US dollar', async () => {
    const shop = checkout({ currency: 'USD', saved: fresh({ base: 'USD', cad: 1.4, eur: 0.9 }) });
    expect((await shop.pay({ currency: 'cad' })).statusCode).toBe(200);
    expect(shop.intent()).toMatchObject({ amount: 7000, currency: 'cad' });
    expect(shop.order).toMatchObject({ expectedAmountMinor: 7000, expectedCurrency: 'cad', checkoutCurrency: 'CAD', exchangeRate: 1.4 });
  });

  test('rates saved from the Canadian dollar are never used: a US price is not cut to 0.71 of itself', async () => {
    // What a Canadian shop saves: 1 CAD = 0.71 USD. Read by a US shop it would charge US$35.50 for a US$50.00 order.
    const canadian = fresh({ base: 'CAD', usd: 0.71, eur: 0.62 });
    const shop = checkout({ currency: 'USD', saved: canadian, feed: { CAD: 1.41, EUR: 0.91 } });
    expect((await shop.pay({ currency: 'usd' })).statusCode).toBe(200);
    expect(shop.intent()).toMatchObject({ amount: 5000, currency: 'usd' });
    const other = checkout({ currency: 'USD', saved: canadian, feed: { CAD: 1.41, EUR: 0.91 } });
    await other.pay({ currency: 'cad' });
    expect(other.intent()).toMatchObject({ amount: 7050, currency: 'cad' });
    expect(other.fetched).toEqual(['https://open.er-api.com/v6/latest/USD']);
  });

  test('with no saved rates and the feed down, the fixed rates are from the US dollar too', async () => {
    const shop = checkout({ currency: 'USD' });
    await shop.pay({ currency: 'cad' });
    expect(shop.intent()).toMatchObject({ amount: Math.round(40 * 1.37 * 100) + Math.round(10 * 1.37 * 100), currency: 'cad' });
  });

  test('a currency the shop has no rate for is refused', async () => {
    const shop = checkout({ currency: 'USD' });
    expect(await shop.pay({ currency: 'gbp' })).toMatchObject({ statusCode: 400 });
    expect(shop.intent()).toBeUndefined();
  });
});

describe('a shop that sells in Canadian dollars is charged exactly as before', () => {
  test('Canadian shopper: the price as it is; US shopper: at the saved rate', async () => {
    const saved = fresh({ usd: 0.71, eur: 0.62 }); // saved before shops had a currency: no `base`
    const home = checkout({ currency: 'CAD', saved });
    await home.pay({ currency: 'cad' });
    expect(home.intent()).toMatchObject({ amount: 5000, currency: 'cad' });
    expect(home.order).toMatchObject({ checkoutCurrency: 'CAD', exchangeRate: 1 });
    const away = checkout({ currency: 'CAD', saved });
    await away.pay({ currency: 'usd' });
    expect(away.intent()).toMatchObject({ amount: 3550, currency: 'usd' });
    expect(away.order).toMatchObject({ expectedAmountMinor: 3550, expectedCurrency: 'usd', exchangeRate: 0.71 });
    const none = checkout({ currency: 'CAD', saved });
    await none.pay();
    expect(none.intent()).toMatchObject({ amount: 5000, currency: 'cad' });
  });

  test('rates saved from the US dollar are never used by a Canadian shop', async () => {
    const shop = checkout({ currency: 'CAD', saved: fresh({ base: 'USD', cad: 1.4, eur: 0.9 }), feed: { USD: 0.7, EUR: 0.6 } });
    await shop.pay({ currency: 'usd' });
    expect(shop.intent()).toMatchObject({ amount: 3500, currency: 'usd' });
    expect(shop.fetched).toEqual(['https://open.er-api.com/v6/latest/CAD']);
  });
});

describe('emails and refunds name the shop\'s own currency', () => {
  const usShop = { id: 'us-press', config: configForShop('us-press', { ownerEmail: 'owner@example.com', server: { SHOP_CURRENCY: 'USD' } }, {}) };
  const caShop = { id: 'ca-press', config: configForShop('ca-press', { ownerEmail: 'owner@example.com', server: {} }, {}) };

  test('a US shop writes its amounts in US dollars and converts only for another currency', () => {
    runInShop(usShop, () => {
      expect(shopCurrency()).toBe('USD');
      expect(shopSign()).toBe('US$');
      expect(orderMoneyFmt(50, {})).toBe('US$50.00');
      expect(orderMoneyFmt(50, { checkoutCurrency: 'USD', exchangeRate: 1 })).toBe('US$50.00');
      expect(orderMoneyFmt(50, { checkoutCurrency: 'CAD', exchangeRate: 1.4 })).toBe('CA$70.00');
      expect(refundAmountText({ refund: { amount: 12 } })).toBe('US$12.00');
      expect(chargedOf({ total: 50 })).toEqual({ minor: 5000, currency: 'USD' });
      expect(refundEmailFacts({ total: 0, giftCardsRestoredAt: 'x' }, [{ minor: 2500, last4: '1234' }]).giftText).toBe('US$25.00');
    });
  });

  test('a Canadian shop, and a server with no shop record, write Canadian dollars as before', () => {
    runInShop(caShop, () => {
      expect(shopCurrency()).toBe('CAD');
      expect(orderMoneyFmt(50, {})).toBe('CA$50.00');
      expect(orderMoneyFmt(50, { checkoutCurrency: 'USD', exchangeRate: 0.71 })).toBe('US$35.50');
    });
    expect(shopCurrency()).toBe('CAD');
    expect(orderMoneyFmt(50, { checkoutCurrency: 'USD', exchangeRate: 0.71 })).toBe('US$35.50');
    expect(chargedOf({ total: 50 })).toEqual({ minor: 5000, currency: 'CAD' });
  });
});
