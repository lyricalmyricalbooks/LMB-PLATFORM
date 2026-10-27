import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { discountedPhysicalSubtotal, resolveLocalSelection } = createRequire(import.meta.url)('./shared/localFulfillment');
const config = {
  enabled: true,
  pickupLocations: [{ id: 'shop', enabled: true, name: 'Shop', price: 2, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA' }, instructions: 'Call on arrival', hours: '10–5', estimate: 'Tomorrow' }],
  deliveryZones: [{ id: 'west', enabled: true, name: 'West', price: 5, minimumSubtotal: 20, postalPrefixes: ['M6G'], postalCodes: [], instructions: 'Leave at door', estimate: '2 days' }],
};
const items = [{ id: 'print', quantity: 1, price: 30, format: 'Paperback' }, { id: 'ebook', quantity: 1, price: 10, format: 'E-book' }];
test('cart-wide discount is allocated to physical cents only', () => {
  expect(discountedPhysicalSubtotal(items, 10, null, {})).toBe(22.5);
});
test('targeted discount uses verified eligible physical catalog lines', () => {
  expect(discountedPhysicalSubtotal(items, 10, { appliesTo: 'products', selectedProducts: ['ebook'] }, {})).toBe(30);
  expect(discountedPhysicalSubtotal(items, 10, { appliesTo: 'categories', selectedCategories: ['sale'] }, { print: { categories: ['sale'] } })).toBe(20);
});
test('BOGO physical allocation never exceeds charged discount or invents a qualifying set', () => {
  expect(discountedPhysicalSubtotal([items[0]], 5, { type: 'bogo', buyQuantity: 2, getQuantity: 1 }, {})).toBe(30);
  expect(discountedPhysicalSubtotal([{ ...items[0], quantity: 3 }], 5, { type: 'bogo', buyQuantity: 2, getQuantity: 1, getDiscountValue: 100 }, {})).toBe(85);
});
test('server resolves the current pickup fee and ignores client snapshot', () => {
  const result = resolveLocalSelection(config, { method: 'pickup', optionId: 'pickup:shop', price: 0, fulfillment: { name: 'Spoof' } }, null, 30, [items[0]]);
  expect(result.cost).toBe(2);
  expect(result.fulfillment).toMatchObject({ method: 'pickup', optionId: 'pickup:shop', name: 'Shop', price: 2, address: { zip: 'M6G3H1' } });
});
test('free-shipping promotion keeps the selected local method identity', () => {
  const result = resolveLocalSelection(config, { method: 'pickup', optionId: 'pickup:shop' }, null, 30, [items[0]], true);
  expect(result).toMatchObject({ cost: 0, method: 'pickup', fulfillment: { method: 'pickup', optionId: 'pickup:shop', locationId: 'shop', price: 0 } });
});
test('unavailable delivery choice fails closed', () => {
  expect(() => resolveLocalSelection(config, { method: 'local_delivery', optionId: 'local_delivery:west' }, { country: 'CA', zip: 'M6G3H1' }, 19.99, [items[0]])).toThrow();
  expect(() => resolveLocalSelection({ ...config, enabled: false }, { method: 'pickup', optionId: 'pickup:shop' }, null, 30, [items[0]])).toThrow();
  expect(() => resolveLocalSelection(config, { method: 'pickup', optionId: 'pickup:missing' }, null, 30, [items[0]])).toThrow();
});
test('delivery requires a full Canadian destination', () => {
  expect(() => resolveLocalSelection(config, { method: 'local_delivery', optionId: 'local_delivery:west' }, { country: 'CA', zip: 'M6G3H1' }, 30, [items[0]])).toThrow();
  expect(resolveLocalSelection(config, { method: 'local_delivery', optionId: 'local_delivery:west' }, { street: '2 Main', city: 'Toronto', state: 'ON', country: 'CA', zip: 'M6G3H1' }, 30, [items[0]]).fulfillment.destination.street).toBe('2 Main');
});
