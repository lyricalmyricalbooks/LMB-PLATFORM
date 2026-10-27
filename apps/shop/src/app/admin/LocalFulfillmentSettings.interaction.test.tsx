// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
const { getSettings, updateLocalFulfillment } = vi.hoisted(() => ({ getSettings: vi.fn(), updateLocalFulfillment: vi.fn() }));
vi.mock('./api', () => ({ adminApi: { getSettings, updateLocalFulfillment } }));
import { LocalFulfillmentSettings, useLocalFulfillmentDraft } from './LocalFulfillmentSettings';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); getSettings.mockReset(); });
it('blocks all configuration editing while initial settings are loading', async () => {
  getSettings.mockReturnValue(new Promise(() => {}));
  const root = createRoot(container);
  await act(async () => { root.render(<LocalFulfillmentSettings />); });
  const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add pickup location')!;
  expect(add.matches(':disabled')).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[role="switch"]')!.matches(':disabled')).toBe(true);
  await act(async () => root.unmount());
});
it('repairs malformed disabled addresses without a render crash', async () => {
  getSettings.mockResolvedValue({ localFulfillment: { enabled: false, pickupLocations: [{ id: 'old', enabled: false, name: 'Old', price: 0, address: null }], deliveryZones: [] } });
  const root = createRoot(container);
  await act(async () => { root.render(<LocalFulfillmentSettings />); });
  expect(container.textContent).toContain('Street address');
  await act(async () => root.unmount());
});

it('keeps unsaved records when the parent switches Shipping views', async () => {
  getSettings.mockResolvedValue({ localFulfillment: { enabled: false, pickupLocations: [], deliveryZones: [] } });
  function ShippingViews() {
    const draft = useLocalFulfillmentDraft();
    const [local, setLocal] = useState(true);
    return <><button onClick={() => setLocal(value => !value)}>Switch view</button>{local ? <LocalFulfillmentSettings draft={draft} /> : <p>Overview</p>}</>;
  }
  const root = createRoot(container);
  await act(async () => root.render(<ShippingViews />));
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
  await act(async () => button('Add pickup location').click());
  expect(container.textContent).toContain('Name shoppers see');
  await act(async () => button('Switch view').click());
  expect(container.textContent).toContain('Overview');
  await act(async () => button('Switch view').click());
  expect(container.textContent).toContain('Name shoppers see');
  expect(getSettings).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
it('does not accept edits before delayed settings arrive', async () => {
  let resolve: (value: any) => void = () => {};
  getSettings.mockReturnValue(new Promise(done => { resolve = done; }));
  const root = createRoot(container);
  await act(async () => root.render(<LocalFulfillmentSettings />));
  const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add pickup location')!;
  await act(async () => add.click());
  expect(container.textContent).not.toContain('Name shoppers see');
  await act(async () => resolve({ localFulfillment: { enabled: false, pickupLocations: [], deliveryZones: [] } }));
  expect(add.matches(':disabled')).toBe(false);
  await act(async () => add.click());
  expect(container.textContent).toContain('Name shoppers see');
  await act(async () => root.unmount());
});

it('one switch turns on free Toronto pickup and saves it without an address', async () => {
  const { adminApi } = await import('./api');
  getSettings.mockResolvedValue({ localFulfillment: { enabled: false, pickupLocations: [], deliveryZones: [] } });
  const root = createRoot(container);
  await act(async () => root.render(<LocalFulfillmentSettings />));
  const quick = Array.from(container.querySelectorAll<HTMLElement>('[role="switch"]')).find(el => el.closest('label, div')?.textContent?.includes('Free local pickup for Toronto'))!;
  await act(async () => quick.click());
  const saved = (adminApi.updateLocalFulfillment as any).mock.calls.at(-1)[0];
  expect(saved.enabled).toBe(true);
  expect(saved.pickupLocations[0]).toMatchObject({ enabled: true, price: 0, postalPrefixes: ['M'], address: { street: '', city: 'Toronto', state: 'ON' } });
  await act(async () => root.unmount());
});

it('the quick pickup switch saves only itself, not other unsaved edits', async () => {
  getSettings.mockResolvedValue({ localFulfillment: { enabled: false, pickupLocations: [], deliveryZones: [] } });
  updateLocalFulfillment.mockReset().mockResolvedValue(undefined);
  const root = createRoot(container);
  await act(async () => root.render(<LocalFulfillmentSettings />));
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
  await act(async () => button('Add delivery zone').click());
  const quick = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  await act(async () => quick.click());
  expect(updateLocalFulfillment).toHaveBeenCalledTimes(1);
  const savedConfig = updateLocalFulfillment.mock.calls[0][0];
  expect(savedConfig.deliveryZones).toEqual([]);
  expect(savedConfig.pickupLocations[0].enabled).toBe(true);
  // The unsaved delivery zone is still on screen, waiting for Save.
  expect(container.textContent).toContain('Minimum physical merchandise subtotal');
  await act(async () => root.unmount());
});
