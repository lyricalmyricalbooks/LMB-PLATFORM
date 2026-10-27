import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { optOutId, unsubscribeToken, tokenMatches, footerAddress } = createRequire(import.meta.url)('./marketingOptOut');

test('an unsubscribe link only works for its own address', () => {
  const t = unsubscribeToken('Ada@Example.com ', 'k1');
  expect(tokenMatches('ada@example.com', t, 'k1')).toBe(true);
  expect(tokenMatches('bob@example.com', t, 'k1')).toBe(false);
  expect(tokenMatches('ada@example.com', t, 'other-key')).toBe(false);
  expect(tokenMatches('ada@example.com', 'short', 'k1')).toBe(false);
});

test('opt-outs are keyed by a hash of the normalised email', () => {
  expect(optOutId('ADA@example.com')).toBe(optOutId(' ada@example.com'));
  expect(optOutId('ada@example.com')).not.toContain('@');
});

test('the footer address skips blank parts', () => {
  expect(footerAddress({ street: '456 Montrose Ave', city: 'Toronto', state: 'ON', zip: '' })).toBe('456 Montrose Ave, Toronto, ON');
  expect(footerAddress(undefined)).toBe('');
});

test('a mangled unsubscribe token is refused, not a crash', () => {
  expect(tokenMatches('ada@example.com', 'é'.repeat(40), 'k1')).toBe(false);
});

test('a newsletter confirm token is not an unsubscribe token (the purpose is signed)', async () => {
  const { purposeToken, purposeTokenMatches, unsubscribeToken, tokenMatches } = createRequire(import.meta.url)('./marketingOptOut');
  const confirm = purposeToken('Ada@Example.com ', 'k1', 'newsletter-confirm');
  expect(purposeTokenMatches('ada@example.com', confirm, 'k1', 'newsletter-confirm')).toBe(true);
  expect(tokenMatches('ada@example.com', confirm, 'k1')).toBe(false);
  expect(purposeTokenMatches('ada@example.com', unsubscribeToken('ada@example.com', 'k1'), 'k1', 'newsletter-confirm')).toBe(false);
  expect(purposeTokenMatches('bob@example.com', confirm, 'k1', 'newsletter-confirm')).toBe(false);
});
