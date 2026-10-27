import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const { stockChanges } = createRequire(import.meta.url)('./inventory');

const book = { trackInventory: true, stockLevel: 5, variants: [{ id: 'pb', stock: 3 }, { id: 'hc', stockLevel: 2 }] };

test('two editions of one book are both decremented in a single update', () => {
  const { updates, oversold } = stockChanges([{ id: 'b', variantId: 'pb', quantity: 1 }, { id: 'b', variantId: 'hc', quantity: 1 }], { b: book }, -1);
  expect(updates).toHaveLength(1);
  expect(updates[0].data.stockLevel).toBe(3);
  expect(updates[0].data.variants.map(v => v.stock)).toEqual([2, 1]);
  expect(oversold).toBe(false);
});

test('restock adds back, untracked books are skipped', () => {
  const { updates } = stockChanges([{ id: 'b', quantity: 2 }, { id: 'u', quantity: 1 }], { b: { trackInventory: true, stockLevel: 0 }, u: { stockLevel: 0 } }, 1);
  expect(updates).toEqual([{ id: 'b', data: { stockLevel: 2 } }]);
});

test('selling more than is in stock floors at zero and reports oversold', () => {
  const { updates, oversold } = stockChanges([{ id: 'b', variantId: 'hc', quantity: 3 }], { b: book }, -1);
  expect(updates[0].data.variants[1].stock).toBe(0);
  expect(oversold).toBe(true);
});
