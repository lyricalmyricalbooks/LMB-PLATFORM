// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FulfillmentMethodPicker } from './FulfillmentMethodPicker';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('keeps configured pickup and delivery beside carrier shipping and emits stable IDs', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  await act(async () => root.render(<FulfillmentMethodPicker
    method="shipping" optionId="Canada Post Regular" onSelect={onSelect}
    shippingQuotes={[{ id: 'Canada Post Regular', name: 'Canada Post Regular', price: 9 }]}
    localQuotes={[{ id: 'pickup:shop', method: 'pickup', name: 'Bookshop', price: 0, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' }, instructions: 'Bring ID', hours: '10–5', estimate: 'Ready tomorrow' }, { id: 'local_delivery:west', method: 'local_delivery', name: 'West end delivery', price: 5, instructions: 'At your door', estimate: 'Two days' }]}
    words={{ shipping: 'Ship', pickup: 'Collect', local_delivery: 'Deliver locally', review: 'Review your choice', free: 'Free' }}
    formatPrice={amount => `$${amount}`} />));
  // Pickup is a row in the shipping list (like "Local pickup — Free"), not its own button.
  expect(host.textContent).toContain('Canada Post Regular');
  expect(host.textContent).toContain('Bookshop');
  expect(host.textContent).toContain('Bring ID');
  expect(host.querySelector('button[data-method="pickup"]')).toBeNull();
  expect(host.textContent).toContain('Deliver locally');
  await act(async () => host.querySelector<HTMLInputElement>('input[value="pickup:shop"]')!.click());
  expect(onSelect).toHaveBeenCalledWith({ method: 'pickup', optionId: 'pickup:shop' });
  await act(async () => root.render(<FulfillmentMethodPicker
    method="pickup" optionId="pickup:shop" onSelect={onSelect}
    shippingQuotes={[{ id: 'Canada Post Regular', name: 'Canada Post Regular', price: 9 }]}
    localQuotes={[{ id: 'pickup:shop', method: 'pickup', name: 'Bookshop', price: 0, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' }, instructions: 'Bring ID', hours: '10–5', estimate: 'Ready tomorrow' }]}
    words={{ shipping: 'Ship', pickup: 'Collect', local_delivery: 'Deliver locally', review: 'Review your choice', free: 'Free' }}
    formatPrice={amount => `$${amount}`} />));
  expect(host.textContent).toContain('Free');
  await act(async () => host.querySelector<HTMLInputElement>('input[value="Canada Post Regular"]')!.click());
  expect(onSelect).toHaveBeenCalledWith({ method: 'shipping', optionId: 'Canada Post Regular' });
  await act(async () => root.unmount());
});

it('shows a review notice when a selected option has disappeared', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<FulfillmentMethodPicker method="pickup" optionId="" onSelect={() => {}}
    shippingQuotes={[]} localQuotes={[]} words={{ shipping: 'Ship', pickup: 'Collect', local_delivery: 'Deliver locally', review: 'Review your choice', free: 'Free' }} formatPrice={amount => `$${amount}`} />));
  expect(host.textContent).toContain('Review your choice');
  await act(async () => root.unmount());
});

it('keeps disabled local services out of ordinary shipping checkout', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<FulfillmentMethodPicker method="shipping" optionId="mail" onSelect={() => {}}
    availableMethods={['shipping']} shippingQuotes={[{ id: 'mail', name: 'Mail', price: 4 }]} localQuotes={[]}
    words={{ group: 'Fulfillment choices', shipping: 'Ship', pickup: 'Collect', local_delivery: 'Deliver locally', review: 'Review your choice', free: 'Free' }} formatPrice={amount => `$${amount}`} />));
  expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Fulfillment choices');
  expect(host.querySelector('button[data-method="pickup"]')).toBeNull();
  expect(host.querySelector('button[data-method="local_delivery"]')).toBeNull();
  await act(async () => root.unmount());
});
