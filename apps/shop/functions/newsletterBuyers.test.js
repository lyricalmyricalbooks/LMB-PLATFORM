// Newsletter to past buyers (newsletterSend.js): paid in the last two years, real orders only, merged with the list.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';
const { pastBuyerEmails, recipientRows, audienceOf, audienceCount } = createRequire(import.meta.url)('./newsletterSend');

const now = Date.parse('2026-11-11T00:00:00Z');
const orders = [
  { paymentStatus: 'paid', createdAt: '2026-10-01T00:00:00Z', customer: { email: 'Ann@Example.com' } },
  { paymentStatus: 'paid', createdAt: '2023-01-01T00:00:00Z', customer: { email: 'old@example.com' } },
  { paymentStatus: 'unpaid', createdAt: '2026-10-01T00:00:00Z', customer: { email: 'cart@example.com' } },
  { paymentStatus: 'paid', isTest: true, createdAt: '2026-10-01T00:00:00Z', customer: { email: 'test@example.com' } },
  { paymentStatus: 'refunded', paidAt: { toMillis: () => now - 1000 }, customer: { email: 'bob@example.com' } },
];

describe('past buyers', () => {
  test('only real, paid orders from the last two years', () => {
    expect(pastBuyerEmails(orders, now)).toEqual(['ann@example.com', 'bob@example.com']);
  });
  test('merges with the list once per address; a pending sign-up who bought still counts', () => {
    const list = [{ id: 'ann@example.com', data: { email: 'ann@example.com' } }, { id: 'zed@example.com', data: { email: 'zed@example.com', status: 'pending' } }];
    const buyers = ['ann@example.com', 'zed@example.com'];
    expect(recipientRows(list, buyers, 'everyone').map(r => r.id)).toEqual(['ann@example.com', 'zed@example.com']);
    expect(recipientRows(list, buyers, 'buyers').every(r => r.data.status === 'buyer')).toBe(true);
    const rows = recipientRows(list, buyers, 'everyone');
    expect(audienceCount(rows.map(r => r.data), new Set(['zed@example.com']), e => e)).toBe(1);
  });
  test('an unknown choice means the mailing list', () => {
    expect(audienceOf('nope')).toBe('list');
    expect(audienceOf('buyers')).toBe('buyers');
  });
});
