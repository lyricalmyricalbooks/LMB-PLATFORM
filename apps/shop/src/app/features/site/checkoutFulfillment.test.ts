import { expect, it } from 'vitest';
import { catalogFulfillmentItems, discountedPhysicalSubtotal, selectionAfterChange } from './checkoutFulfillment';

const books = new Map<string, any>([['print', { format: 'Paperback' }], ['mixed', { format: 'Paperback', variants: [{ id: 'epub', name: 'E-book', price: 10, format: 'EPUB' }] }]]);
it('classifies a digital variant from the complete catalog and allocates a cart-wide discount in cents', () => {
  const items = catalogFulfillmentItems([{ id: 'print', price: 20, quantity: 1 }, { id: 'mixed', variantId: 'epub', price: 10, quantity: 1 }], books);
  expect(items?.map(item => item.physical)).toEqual([true, false]);
  expect(discountedPhysicalSubtotal(items!, 9, { appliesTo: 'all', type: 'fixed' }, books)).toBe(14);
});
it('cannot offer local fulfillment from a truncated catalog or a digital-only cart', () => {
  expect(catalogFulfillmentItems([{ id: 'missing', price: 20, quantity: 1 }], books)).toBeNull();
  const digital = catalogFulfillmentItems([{ id: 'mixed', variantId: 'epub', price: 10, quantity: 1 }], books)!;
  expect(discountedPhysicalSubtotal(digital, 0, null, books)).toBe(0);
});
it('clears a changed option but keeps the selected method for review', () => {
  expect(selectionAfterChange({ method: 'pickup', optionId: 'pickup:shop' }, 'before', 'after')).toEqual({ method: 'pickup', optionId: '' });
  expect(selectionAfterChange({ method: 'shipping', optionId: 'mail' }, 'same', 'same')).toEqual({ method: 'shipping', optionId: 'mail' });
});

it('mirrors the server for a free gift: only a physical gift line is paid for by the discount', async () => {
  const { createRequire } = await import('node:module');
  const server = createRequire(import.meta.url)('../../../../functions/shared/localFulfillment.js');
  const catalog = new Map<string, any>([...books, ['gift', { format: 'Paperback' }], ['card', { productType: 'giftCard', variants: [{ id: 'g25', name: 'CA$25', price: 25, format: 'Paperback' }] }]]);
  const items = catalogFulfillmentItems([{ id: 'print', price: 20, quantity: 1 }, { id: 'gift', price: 8, quantity: 1, promoGift: true }, { id: 'card', variantId: 'g25', price: 25, quantity: 1 }], catalog)!;
  expect(items.map(item => item.physical)).toEqual([true, true, false]);
  expect(items[1].promoGift).toBe(true);
  expect(items[2].format).toBe('Gift card');
  const discount = { type: 'gift', giftBookId: 'gift' };
  const serverItems = items.map(item => ({ ...item, digital: !item.physical }));
  expect(discountedPhysicalSubtotal(items, 8, discount, catalog)).toBe(20);
  expect(discountedPhysicalSubtotal(items, 8, discount, catalog)).toBe(server.discountedPhysicalSubtotal(serverItems, 8, discount, {}));
  // A digital gift leaves the physical subtotal alone.
  const digitalGift = items.map(item => item.promoGift ? { ...item, physical: false } : item);
  expect(discountedPhysicalSubtotal(digitalGift, 8, discount, catalog)).toBe(server.discountedPhysicalSubtotal(digitalGift.map(item => ({ ...item, digital: !item.physical })), 8, discount, {}));
  expect(discountedPhysicalSubtotal(digitalGift, 8, discount, catalog)).toBe(20);
});
