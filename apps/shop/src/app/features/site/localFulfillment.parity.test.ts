import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { quoteLocalFulfillment, normalizePostalCode, validateLocalFulfillment } from './localFulfillment';
const server = createRequire(import.meta.url)('../../../../functions/shared/localFulfillment.js');
const config: any = { enabled: true, pickupLocations: [{ id: 'store', enabled: true, name: 'Store', price: 0, address: { street: '1 Real St', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'Canada' } }], deliveryZones: [{ id: 'west', enabled: true, name: 'West', postalPrefixes: ['m6g'], postalCodes: ['M5V 2T6'], price: 4, minimumSubtotal: 20 }, { id: 'overlap', enabled: true, name: 'Overlap', postalPrefixes: ['M6G'], postalCodes: [], price: 8, minimumSubtotal: 0 }] };
const destination = { zip: 'm6g 3h1', country: 'CA' };
describe('local fulfillment browser/server parity', () => {
  const cases = [
    ['enabled overlap', config, destination, 20, [{ quantity: 1 }], 3],
    ['disabled', { ...config, enabled: false }, destination, 20, [{ quantity: 1 }], 0],
    ['below physical minimum', config, destination, 19.99, [{ quantity: 1 }], 2],
    ['exact match', config, { zip: 'M5V2T6', country: 'Canada' }, 20, [{ quantity: 1 }], 2],
    ['exact stays exact', config, { zip: 'M5V2T7', country: 'Canada' }, 20, [{ quantity: 1 }], 1],
    ['digital only', config, destination, 20, [{ format: 'digital', quantity: 1 }], 0],
    ['empty physical', config, destination, 20, [], 0],
    ['non-Canadian', config, { ...destination, country: 'US' }, 20, [{ quantity: 1 }], 1],
  ] as const;
  for (const [label, settings, address, subtotal, items, count] of cases) it(label, () => {
    const quotes = quoteLocalFulfillment(settings, address, subtotal, [...items]);
    expect(quotes).toEqual(server.quoteLocalFulfillment(settings, address, subtotal, items));
    expect(quotes).toHaveLength(count);
    expect(new Set(quotes.map(q => q.id)).size).toBe(count);
  });
  for (const price of [-1, NaN, Infinity, null, '', '4', 0.001]) it(`rejects invalid amount ${price}`, () => {
    const invalid = { ...config, deliveryZones: [{ ...config.deliveryZones[0], price }] };
    expect(quoteLocalFulfillment(invalid, destination, 20, [{ quantity: 1 }])).toEqual([]);
    expect(server.quoteLocalFulfillment(invalid, destination, 20, [{ quantity: 1 }])).toEqual([]);
  });
  it('validates postal configuration, addresses and duplicate IDs', () => {
    expect(normalizePostalCode(' m6g 3h1 ')).toBe('M6G3H1');
    for (const patch of [{ postalPrefixes: ['M6'] }, { postalPrefixes: ['D6G'] }, { postalCodes: ['M5V'] }, { minimumSubtotal: null }]) expect(validateLocalFulfillment({ ...config, deliveryZones: [{ ...config.deliveryZones[0], ...patch }] }).length).toBeGreaterThan(0);
    expect(quoteLocalFulfillment({ ...config, pickupLocations: [{ ...config.pickupLocations[0], address: {} }] }, destination, 20, [{ quantity: 1 }])).toEqual([]);
    expect(quoteLocalFulfillment({ ...config, deliveryZones: [config.deliveryZones[0], config.deliveryZones[0]] }, destination, 20, [{ quantity: 1 }])).toEqual([]);
  });
  it('rejects actual digital formats and invalid physical quantities', () => {
    for (const format of ['e-book', 'epub', 'PDF', 'audiobook', 'ebook']) {
      expect(quoteLocalFulfillment(config, destination, 20, [{ format, quantity: 1 }])).toEqual([]);
      expect(server.quoteLocalFulfillment(config, destination, 20, [{ format, quantity: 1 }])).toEqual([]);
    }
    for (const quantity of [-1, 0, 0.5, NaN, undefined]) expect(quoteLocalFulfillment(config, destination, 20, [{ quantity }])).toEqual([]);
    expect(quoteLocalFulfillment({ ...config, pickupLocations: [{ ...config.pickupLocations[0], address: { ...config.pickupLocations[0].address, state: 'California' } }] }, destination, 20, [{ quantity: 1 }])).toEqual([]);
  });
});


it('compares calculated subtotals in cents at minimum boundaries', () => {
  for (const [subtotal, minimum] of [[0.1 + 0.7, 0.8], [0.29 * 100, 29]]) {
    const settings = { ...config, pickupLocations: [], deliveryZones: [{ ...config.deliveryZones[0], minimumSubtotal: minimum }] };
    expect(quoteLocalFulfillment(settings, destination, subtotal, [{ quantity: 1 }])).toHaveLength(1);
    expect(server.quoteLocalFulfillment(settings, destination, subtotal, [{ quantity: 1 }])).toHaveLength(1);
  }
});
it('rejects malformed inactive pickup address shapes without requiring active address values', () => {
  for (const address of [undefined, null, '', { street: 4 }]) {
    const settings = { ...config, pickupLocations: [{ ...config.pickupLocations[0], enabled: false, address }] };
    expect(validateLocalFulfillment(settings).length).toBeGreaterThan(0);
    expect(server.validateLocalFulfillment(settings).length).toBeGreaterThan(0);
  }
  expect(validateLocalFulfillment({ ...config, pickupLocations: [{ ...config.pickupLocations[0], enabled: false, address: { street: '', city: '', state: '', zip: '', country: '' } }] })).toEqual([]);
});
describe('pickup limited to Toronto', () => {
  const toronto: any = { ...config, deliveryZones: [], pickupLocations: [{ ...config.pickupLocations[0], postalPrefixes: ['M'] }] };
  const cases = [
    ['Toronto address', { zip: 'M6G 3H1', country: 'CA' }, 1],
    ['Ottawa address', { zip: 'K1A 0B1', country: 'CA' }, 0],
    ['no address yet', {}, 0],
    ['US address', { zip: 'M6G3H1', country: 'US' }, 0],
  ] as const;
  for (const [label, address, count] of cases) it(label, () => {
    const quotes = quoteLocalFulfillment(toronto, address, 20, [{ quantity: 1 }]);
    expect(quotes).toEqual(server.quoteLocalFulfillment(toronto, address, 20, [{ quantity: 1 }]));
    expect(quotes).toHaveLength(count);
  });
  it('no areas means everyone may pick up', () => {
    expect(quoteLocalFulfillment({ ...toronto, pickupLocations: [{ ...toronto.pickupLocations[0], postalPrefixes: [] }] }, {}, 20, [{ quantity: 1 }])).toHaveLength(1);
  });
  it('rejects invalid pickup areas on both sides', () => {
    const bad = { ...toronto, pickupLocations: [{ ...toronto.pickupLocations[0], postalPrefixes: ['Toronto'] }] };
    expect(validateLocalFulfillment(bad)).toEqual(server.validateLocalFulfillment(bad));
    expect(validateLocalFulfillment(bad).length).toBeGreaterThan(0);
  });
});
it('an enabled pickup needs only a province, not a street address', () => {
  const noStreet: any = { enabled: true, deliveryZones: [], pickupLocations: [{ id: 'p', enabled: true, name: 'Local pickup', price: 0, postalPrefixes: ['M'], address: { street: '', city: 'Toronto', state: 'ON', zip: '', country: 'Canada' } }] };
  expect(validateLocalFulfillment(noStreet)).toEqual([]);
  expect(server.validateLocalFulfillment(noStreet)).toEqual([]);
  expect(quoteLocalFulfillment(noStreet, { zip: 'M6G3H1', country: 'CA' }, 3, [{ quantity: 1 }])).toEqual(server.quoteLocalFulfillment(noStreet, { zip: 'M6G3H1', country: 'CA' }, 3, [{ quantity: 1 }]));
  expect(quoteLocalFulfillment(noStreet, { zip: 'M6G3H1', country: 'CA' }, 3, [{ quantity: 1 }])).toHaveLength(1);
});
