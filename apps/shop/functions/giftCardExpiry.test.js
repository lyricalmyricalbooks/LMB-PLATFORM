// Admin › Gift cards › Change expiry (giftCardAdmin op "setExpiry"): validates the date and records history.
import { expect, test } from 'vitest';
import { createRequire } from 'module';
const { expiryChange } = createRequire(import.meta.url)('./giftCards.js');

const now = new Date('2026-10-10T15:00:00Z');

test('sets, changes and removes an expiry with a history line', () => {
  const set = expiryChange({ history: [] }, '2027-01-31', { actor: 'owner', now });
  expect(set.expiresOn).toBe('2027-01-31');
  expect(set.history.at(-1)).toMatchObject({ type: 'expiry', minor: 0, actor: 'owner', reason: 'Expiry set to 2027-01-31' });
  const removed = expiryChange({ expiresOn: '2027-01-31', history: set.history }, '', { now });
  expect(removed.expiresOn).toBe('');
  expect(removed.history.at(-1).reason).toBe('Expiry removed (was 2027-01-31)');
});

test('refuses bad, past or unchanged dates', () => {
  expect(() => expiryChange({}, '2027-02-30', { now })).toThrow(/real date/);
  expect(() => expiryChange({}, 'soon', { now })).toThrow(/real date/);
  expect(() => expiryChange({}, '2026-10-01', { now })).toThrow(/today or a later/);
  expect(() => expiryChange({ expiresOn: '2027-01-01' }, '2027-01-01', { now })).toThrow(/already/);
  expect(() => expiryChange({}, '', { now })).toThrow(/already never/);
});
