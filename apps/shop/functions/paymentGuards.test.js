import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { checkoutCurrencyOf, paidAmountCheck, toMinor } = createRequire(import.meta.url)('./paymentGuards');

test('only the shop currencies are accepted', () => {
  expect(checkoutCurrencyOf(undefined)).toBe('cad');
  expect(checkoutCurrencyOf('USD')).toBe('usd');
  expect(checkoutCurrencyOf('inr')).toBeNull();
  expect(checkoutCurrencyOf('mxn')).toBeNull();
});

test('a payment must match the amount and currency it was created for', () => {
  const order = { expectedAmountMinor: 10000, expectedCurrency: 'cad' };
  expect(paidAmountCheck(order, 10000, 'CAD').ok).toBe(true);
  expect(paidAmountCheck(order, 165, 'cad').ok).toBe(false);
  expect(paidAmountCheck(order, 10000, 'inr').ok).toBe(false);
  expect(paidAmountCheck({}, 1, 'inr')).toEqual({ ok: true, unverified: true });
  expect(toMinor('12.34')).toBe(1234);
});

test('discount dates follow the shop calendar day in Toronto', () => {
  const { discountDateState } = createRequire(import.meta.url)('./paymentGuards');
  // 9pm Toronto on 6 Oct = 01:00 UTC on 7 Oct: a code whose last day is the 6th still works.
  const evening = new Date('2026-10-07T01:00:00Z');
  expect(discountDateState({ expiryDate: '2026-10-06' }, evening)).toBeNull();
  expect(discountDateState({ expiryDate: '2026-10-05' }, evening)).toBe('expired');
  expect(discountDateState({ startDate: '2026-10-07' }, evening)).toBe('not_started');
  expect(discountDateState({ startDate: '2026-10-06' }, evening)).toBeNull();
  expect(discountDateState({ expiryDate: '2026-10-06T12:00:00Z' }, evening)).toBe('expired');
});

test('only live, published books (as an edition when they have editions) can be bought', () => {
  const { purchaseProblem } = createRequire(import.meta.url)('./paymentGuards');
  const now = '2026-10-06T12:00:00.000Z';
  expect(purchaseProblem({ status: 'published' }, null, now)).toBeNull();
  expect(purchaseProblem({}, null, now)).toBeNull();
  expect(purchaseProblem({ status: 'draft' }, null, now)).toBe('unavailable');
  expect(purchaseProblem({ status: 'archived' }, null, now)).toBe('unavailable');
  expect(purchaseProblem({ status: 'published', scheduleDate: '2026-10-07' }, null, now)).toBe('unavailable');
  expect(purchaseProblem({ status: 'published', scheduleDate: '2026-10-06' }, null, now)).toBeNull();
  expect(purchaseProblem({ status: 'published', variants: [{ id: 'pb' }] }, null, now)).toBe('choose_edition');
  expect(purchaseProblem({ status: 'published', variants: [{ id: 'pb' }] }, 'pb', now)).toBeNull();
  // Coming soon books are shown but never sold, whatever the browser sends.
  expect(purchaseProblem({ status: 'published', comingSoon: true }, null, now)).toBe('unavailable');
  expect(purchaseProblem({ status: 'published', comingSoon: true, variants: [{ id: 'pb' }] }, 'pb', now)).toBe('unavailable');
  expect(purchaseProblem({ status: 'published', comingSoon: false }, null, now)).toBeNull();
});

test('PayPal partial refunds add up to a full refund', () => {
  const { paypalRefundedTotalMinor } = createRequire(import.meta.url)('./paymentGuards');
  expect(paypalRefundedTotalMinor({}, { id: 'r1', amount: { value: '10.00' } })).toBe(1000);
  expect(paypalRefundedTotalMinor({ refundedAmountMinor: 1000, paypalRefundIds: ['r1'] }, { id: 'r2', amount: { value: '10.00' } })).toBe(2000);
  // A repeated delivery of the same refund doesn't count twice.
  expect(paypalRefundedTotalMinor({ refundedAmountMinor: 1000, paypalRefundIds: ['r1'] }, { id: 'r1', amount: { value: '10.00' } })).toBe(1000);
  // PayPal's own running total wins when sent.
  expect(paypalRefundedTotalMinor({ refundedAmountMinor: 500 }, { id: 'r3', amount: { value: '5.00' }, seller_payable_breakdown: { total_refunded_amount: { value: '20.00' } } })).toBe(2000);
});

test('a plain release date opens in Toronto, matching the storefront', () => {
  const { purchaseProblem } = createRequire(import.meta.url)('./paymentGuards');
  const book = { status: 'published', scheduleDate: '2026-10-08' };
  expect(purchaseProblem(book, null, '2026-10-08T00:30:00.000Z')).toBe('unavailable');
  expect(purchaseProblem(book, null, '2026-10-08T04:30:00.000Z')).toBeNull();
});
