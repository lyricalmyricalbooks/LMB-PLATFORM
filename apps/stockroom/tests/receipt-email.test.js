// What the background receipt sweep still uses from the retired Gmail receipt finder (14 November 2026).
import { describe, it, expect } from 'vitest';
import { RECEIPT_NOISE, RECEIPT_QUERY, receiptSkipReason, receiptTextForAi, receiptWorthReading } from '../src/lib/receipt-email.js';

describe('the receipt search', () => {
  it('looks for receipt-shaped mail and leaves out the shop’s own mail', () => {
    expect(RECEIPT_QUERY).toContain('category:purchases');
    expect(RECEIPT_NOISE).toContain('-from:me');
  });
});

describe('trimming what the AI is paid to read', () => {
  it('drops tracking links, footer boilerplate and repeated lines, but keeps amounts', () => {
    const body = [
      'Thanks for your order',
      'View this email in your browser: https://click.shop.example/ls/click?upn=' + 'x'.repeat(300),
      'Subtotal $10.00', 'Subtotal $10.00', 'Tax $1.30',
      'Total $11.30 https://track.example/abc',
      'Unsubscribe | Privacy policy | Manage preferences',
      '© 2026 Shop Inc. All rights reserved.',
    ].join('\n');
    expect(receiptTextForAi(body)).toBe('Thanks for your order\nSubtotal $10.00\nTax $1.30\nTotal $11.30');
  });

  it('keeps a footer-looking line that also carries a figure', () => {
    expect(receiptTextForAi('Amount paid $12.50 — see our privacy policy')).toContain('$12.50');
  });
});

describe('deciding what is worth an AI read', () => {
  it('treats a lone small logo picture as nothing attached', () => {
    expect(receiptWorthReading({ subject: 'Hello', body: 'Thanks', fileParts: [{ name: 'logo.png', mime: 'image/png', size: 3000 }] })).toBe(false);
    expect(receiptWorthReading({ subject: 'Hello', body: 'Thanks', fileParts: [{ name: 'scan.png', mime: 'image/png', size: 300000 }] })).toBe(true);
  });

  it('skips delivery and account notes unless a document is attached', () => {
    expect(receiptSkipReason({ subject: 'Your order has shipped', body: 'Order total $42.00', fileParts: [] })).toBe('notification');
    expect(receiptSkipReason({ subject: 'Rate your recent purchase', body: 'You paid $42.00', fileParts: [] })).toBe('notification');
    expect(receiptSkipReason({ subject: 'Your order has shipped', body: '', fileParts: [{ name: 'invoice.pdf', mime: 'application/pdf', size: 50000 }] })).toBe('');
    expect(receiptSkipReason({ subject: 'Your receipt from Shop', body: 'Total $42.00', fileParts: [] })).toBe('');
  });

  it('skips mail with no amount and nothing attached', () => {
    expect(receiptWorthReading({ subject: 'Your parcel shipped', body: 'Track it here', fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: 'Order #4412 confirmed', body: 'Thanks!', fileParts: [] })).toBe(false);
  });

  it('keeps anything with an amount or an attachment', () => {
    expect(receiptWorthReading({ subject: '', body: 'Total: 12.50', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Payment of CAD 40', body: '', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Paiement', body: '1 234,56 €', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Reçu', body: 'Montant : 12,50 $', fileParts: [] })).toBe(true);
    expect(receiptWorthReading({ subject: 'Invoice', body: 'Attached.', fileParts: [{ name: 'inv.pdf' }] })).toBe(true);
  });

  it('checks a very long run of digits for an amount at once', () => {
    const started = performance.now();
    expect(receiptWorthReading({ subject: '', body: '1'.repeat(100000), fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: '', body: 'total ' + '1,'.repeat(50000), fileParts: [] })).toBe(false);
    expect(receiptWorthReading({ subject: '', body: '1'.repeat(100000) + ' $', fileParts: [] })).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
