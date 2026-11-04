// @vitest-environment jsdom
// A page's main buttons (PageActions) go into the spot the shell keeps in the page header; with no spot they stay put.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { PageActions, PageActionsSlot } from './components';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('puts the buttons in the header spot when the shell gives one', () => {
  const header = document.createElement('div');
  const page = document.createElement('div');
  document.body.replaceChildren(header, page);
  act(() => {
    createRoot(page).render(
      <PageActionsSlot.Provider value={header}>
        <p>Body</p>
        <PageActions><button type="button">Add book</button></PageActions>
      </PageActionsSlot.Provider>,
    );
  });
  expect(header.textContent).toBe('Add book');
  expect(page.textContent).toBe('Body');
});

it('keeps the buttons on the page when there is no header spot', () => {
  const page = document.createElement('div');
  document.body.replaceChildren(page);
  act(() => { createRoot(page).render(<PageActions><button type="button">New discount</button></PageActions>); });
  expect(page.querySelector('.rp-page-actions-inline')?.textContent).toBe('New discount');
});
