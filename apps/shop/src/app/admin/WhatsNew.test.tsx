// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { WhatsNew } from './WhatsNew';
import { APP_UPDATES } from './appUpdates';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); try { localStorage.clear(); } catch {} });

it('is a small button that opens every note in a pop-up and clears its new-update dot', async () => {
  const onHistoryOpen = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<WhatsNew appearance="light" onNavigate={() => {}} onHistoryOpen={onHistoryOpen} />));
  const button = container.querySelector<HTMLButtonElement>('button.rp-whats-new')!;
  expect(button.textContent).toContain(APP_UPDATES[0].title);
  expect(container.textContent).not.toContain(APP_UPDATES[0].summary);
  expect(container.querySelector('.rp-whats-new-dot')).not.toBeNull();
  await act(async () => button.click());
  expect(onHistoryOpen).toHaveBeenCalled();
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(APP_UPDATES[0].summary);
  expect(container.querySelector('.rp-whats-new-dot')).toBeNull();
  await act(async () => root.unmount());
});
