// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useConfirm } from './components';
import { useFocusTrap } from '../../lib/useFocusTrap';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('answers a replaced question with "no" so the earlier await never hangs', async () => {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  let ask!: ReturnType<typeof useConfirm>[0];
  function Host() { const [a, node] = useConfirm(); ask = a; return <>{node}</>; }
  const root = createRoot(container);
  await act(async () => root.render(<Host />));
  let first: Promise<boolean>, second: Promise<boolean>;
  await act(async () => { first = ask({ title: 'One', message: 'm' }); });
  await act(async () => { second = ask({ title: 'Two', message: 'm', confirmLabel: 'Yes please' }); });
  await expect(first!).resolves.toBe(false);
  const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Yes please')!;
  await act(async () => confirmBtn.click());
  await expect(second!).resolves.toBe(true);
  await act(async () => root.unmount());
});

it('keeps Shift+Tab inside the trap when the dialog surface itself has focus', async () => {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  function Trap() {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, true, () => {});
    return <div ref={ref} tabIndex={-1}><button>first</button><button>last</button></div>;
  }
  const root = createRoot(container);
  await act(async () => root.render(<Trap />));
  const node = container.firstElementChild as HTMLElement;
  // jsdom has no layout: make the buttons count as visible.
  node.querySelectorAll('button').forEach((b) => Object.defineProperty(b, 'offsetParent', { get: () => node }));
  node.focus();
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  node.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  expect(document.activeElement?.textContent).toBe('last');
  await act(async () => root.unmount());
});
