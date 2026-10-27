import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { orderMoneyFmt } = createRequire(import.meta.url)('./emailMoney');

test('emails show the currency the customer paid in', () => {
  expect(orderMoneyFmt(10, { checkoutCurrency: 'USD', exchangeRate: 0.73 })).toBe('US$7.30');
  expect(orderMoneyFmt(10, { checkoutCurrency: 'EUR', exchangeRate: 0.66 })).toBe('€6.60');
  expect(orderMoneyFmt(10, { checkoutCurrency: 'CAD', exchangeRate: 1 })).toBe('CA$10.00');
  expect(orderMoneyFmt(10, {})).toBe('CA$10.00');
});

const { refundAmountText, withoutTrackingLines, chargedTotalFmt } = createRequire(import.meta.url)('./emailMoney');

test('the email total is the exact amount the payment was created for', () => {
  expect(chargedTotalFmt({ total: 10, checkoutCurrency: 'USD', exchangeRate: 0.7299, expectedAmountMinor: 731, expectedCurrency: 'usd' })).toBe('US$7.31');
  expect(chargedTotalFmt({ total: 10, checkoutCurrency: 'CAD', exchangeRate: 1, expectedAmountMinor: 1003, expectedCurrency: 'cad' })).toBe('CA$10.03');
  expect(chargedTotalFmt({ total: 0, expectedAmountMinor: 0, expectedCurrency: 'cad' })).toBe('CA$0.00');
  // Manual and older orders have no charge record: the converted total.
  expect(chargedTotalFmt({ total: 10, checkoutCurrency: 'USD', exchangeRate: 0.73 })).toBe('US$7.30');
});

test('refund emails show what went back, in its own currency', () => {
  expect(refundAmountText({ refund: { amount: 12.4, currency: 'USD' }, total: 17 })).toBe('US$12.40');
  expect(refundAmountText({ refund: { amount: 17, currency: 'CAD' }, checkoutCurrency: 'USD', exchangeRate: 0.7, total: 17 })).toBe('CA$17.00');
  expect(refundAmountText({ total: 10, checkoutCurrency: 'EUR', exchangeRate: 0.66 })).toBe('€6.60');
});

test('a shipped email with no tracking number drops the tracking lines', () => {
  const body = "Hi {{customer_name}},\n\nGood news! Your order {{order_id}} has shipped with {{tracking_carrier}} and is on its way.\n\nTracking number: {{tracking_number}}\n\nUse the button below to follow your parcel on the carrier's website.";
  const out = withoutTrackingLines(body);
  expect(out).toContain('has shipped and is on its way.');
  expect(out).not.toContain('{{tracking');
  expect(out).not.toContain("carrier's website");
});
