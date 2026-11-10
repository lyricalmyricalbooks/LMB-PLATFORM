import { expect, it } from 'vitest';
import { lastUpdated, lastUpdatedLine } from './lastUpdated';

it('reads the release stamp the platform puts on each build, and nothing without one', () => {
  const stamp = lastUpdated({ VITE_SHOP_RELEASE: '1.2.9-g9644c9fe047e', VITE_SHOP_BUILT_AT: '2026-11-10T23:52:00.000Z' });
  expect(stamp?.version).toBe('1.2.9-g9644c9fe047e');
  expect(stamp?.at.toISOString()).toBe('2026-11-10T23:52:00.000Z');
  expect(lastUpdatedLine(stamp!)).toMatch(/^Last updated .*2026/);
  expect(lastUpdated({})).toBeNull();
  expect(lastUpdated({ VITE_SHOP_RELEASE: '1.2.9', VITE_SHOP_BUILT_AT: 'not a time' })).toBeNull();
  expect(lastUpdated({ VITE_SHOP_BUILT_AT: '2026-11-10T23:52:00.000Z' })).toBeNull();
});
