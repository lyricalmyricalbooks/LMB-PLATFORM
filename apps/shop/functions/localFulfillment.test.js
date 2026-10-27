import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { quoteLocalFulfillment } = createRequire(import.meta.url)('./shared/localFulfillment');
const config = { enabled: true, pickupLocations: [], deliveryZones: [{ id: 'west', enabled: true, name: 'West', postalPrefixes: ['m6g'], postalCodes: ['M5V 2T6'], price: 4, minimumSubtotal: 20 }] };
test('local delivery eligibility fails closed and preserves exact codes', () => {
  expect(quoteLocalFulfillment(config, { country: 'Canada', zip: 'm6g 3h1' }, 20, [{ quantity: 1 }])).toHaveLength(1);
  expect(quoteLocalFulfillment({ ...config, enabled: false }, { zip: 'M6G3H1', country: 'CA' }, 20, [{ quantity: 1 }])).toEqual([]);
  expect(quoteLocalFulfillment(config, { zip: 'M5V2T7', country: 'CA' }, 20, [{ quantity: 1 }])).toEqual([]);
  expect(quoteLocalFulfillment(config, { zip: 'M6G3H1', country: 'CA' }, 19.99, [{ quantity: 1 }])).toEqual([]);
  expect(quoteLocalFulfillment(config, { zip: 'M6G3H1', country: 'CA' }, 20, [])).toEqual([]);
});

test('bogoPercent: missing means fully free, explicit values clamp to 0-100', () => {
  const { bogoPercent } = createRequire(import.meta.url)('./shared/localFulfillment');
  expect(bogoPercent(undefined)).toBe(100);
  expect(bogoPercent(null)).toBe(100);
  expect(bogoPercent(40)).toBe(40);
  expect(bogoPercent(0)).toBe(0);
  expect(bogoPercent(250)).toBe(100);
});
