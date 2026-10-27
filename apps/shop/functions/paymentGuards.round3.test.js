import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { paypalCreateRequestId, lateFailureMayMarkFailed, refundProviderOf, paypalReversalCaptureId, discountUsedUp } = createRequire(import.meta.url)('./paymentGuards');
const { suspectOrders } = createRequire(import.meta.url)('./paymentSweep');
const { ordersDueReversalCheck } = createRequire(import.meta.url)('./stripeRecovery');

test('a PayPal retry with a new total gets a new request id', () => {
  const a = paypalCreateRequestId('ORD1', 'cad', 15.2);
  expect(a).toBe('create-ORD1-cad-1520');
  expect(paypalCreateRequestId('ORD1', 'usd', 15.2)).not.toBe(a);
  expect(paypalCreateRequestId('ORD1', 'cad', 16)).not.toBe(a);
  expect(paypalCreateRequestId('ORD1', 'CAD', 15.2)).toBe(a);
});

test('a late delayed-payment failure never undoes a paid order or another session', () => {
  expect(lateFailureMayMarkFailed({ paymentStatus: 'paid' }, 'cs_1')).toBe(false);
  expect(lateFailureMayMarkFailed({ paymentStatus: 'refunded' }, 'cs_1')).toBe(false);
  expect(lateFailureMayMarkFailed({ paymentStatus: 'unpaid', stripeCheckoutSessionId: 'cs_2' }, 'cs_1')).toBe(false);
  expect(lateFailureMayMarkFailed({ paymentStatus: 'unpaid', stripeCheckoutSessionId: 'cs_1' }, 'cs_1')).toBe(true);
  expect(lateFailureMayMarkFailed({ paymentStatus: 'unpaid' }, 'cs_1')).toBe(true);
});

test('refunds go to the provider that took the money', () => {
  expect(refundProviderOf({ stripePaymentIntentId: 'pi_1', paymentMethod: 'Stripe' })).toBe('stripe');
  expect(refundProviderOf({ paypalCaptureId: 'CAP1', paymentMethod: 'PayPal' })).toBe('paypal');
  expect(refundProviderOf({ paymentMethod: 'e-Transfer' })).toBe('manual');
  // A card order without its payment id must not be "refunded" by a status change.
  expect(refundProviderOf({ paymentMethod: 'Stripe' })).toBe(null);
  expect(refundProviderOf({ paymentMethod: 'PayPal' })).toBe(null);
});

test('PayPal refund and reversal webhooks name their capture', () => {
  expect(paypalReversalCaptureId({ event_type: 'PAYMENT.CAPTURE.REVERSED', resource: { id: 'CAP9' } })).toBe('CAP9');
  expect(paypalReversalCaptureId({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REF1', links: [
    { rel: 'self', href: 'https://api-m.paypal.com/v2/payments/refunds/REF1' },
    { rel: 'up', href: 'https://api-m.paypal.com/v2/payments/captures/CAP7' },
  ] } })).toBe('CAP7');
  expect(paypalReversalCaptureId({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1' } })).toBe(null);
});

test('a discount code past its usage limit is flagged', () => {
  expect(discountUsedUp({ usageLimit: 5, usageCount: 5 })).toBe(true);
  expect(discountUsedUp({ usageLimit: 5, usageCount: 4 })).toBe(false);
  expect(discountUsedUp({ usageCount: 100 })).toBe(false);
});

test('the missed-webhook sweep also checks hosted Checkout sessions', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const createdAt = '2026-10-07T11:00:00Z';
  const found = suspectOrders([
    { id: 'A', paymentStatus: 'unpaid', stripeCheckoutSessionId: 'cs_live_1', createdAt },
    { id: 'B', paymentStatus: 'unpaid', createdAt },
  ], now);
  expect(found.map(o => o.id)).toEqual(['A']);
});

test('pending refunds are re-checked with Stripe until they finish', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const due = ordersDueReversalCheck([{ id: 'P', paymentStatus: 'refund_pending', stripePaymentIntentId: 'pi_1', paidAt: '2026-10-06T12:00:00Z' }], now);
  expect(due.map(o => o.id)).toEqual(['P']);
});
