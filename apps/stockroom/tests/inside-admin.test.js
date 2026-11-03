// The stockroom inside the combined admin (shop + stockroom plan): src/lib/inside-admin.js and
// its startInsideAdmin. Only a frame on the same address, on the plan with both apps, counts; only messages
// from that framing page are obeyed.
import { describe, it, expect, vi } from 'vitest';
import {
  FROM_ADMIN, FROM_STOCKROOM, STOCKROOM_PAGE_EVENT, adminMessage, combinedPlan, isInsideAdmin, parseTabHash, stockroomMessage,
} from '../src/lib/inside-admin.js';

const BOTH = { apps: { shop: true, stockroom: true } };
const ORIGIN = 'https://lmb-test-shop.web.app';

function framed({ parentOrigin = ORIGIN, top = false, throws = false } = {}) {
  const parent = { get location() { if (throws) throw new Error('cross-origin'); return { origin: parentOrigin }; } };
  const win = { location: { origin: ORIGIN }, parent };
  win.self = win;
  win.top = top ? win : parent;
  return win;
}

describe('combined plan', () => {
  it('is only both apps on', () => {
    expect(combinedPlan(BOTH)).toBe(true);
    expect(combinedPlan({ apps: { shop: false, stockroom: true } })).toBe(false);
    expect(combinedPlan({ apps: { shop: true, stockroom: false } })).toBe(false);
    expect(combinedPlan(null)).toBe(false);
  });
});

describe('inside the admin', () => {
  it('is a frame on the same address, on the plan with both apps', () => {
    expect(isInsideAdmin(framed(), BOTH)).toBe(true);
  });
  it('is never the stockroom opened on its own, another site\'s frame, or a one-app plan', () => {
    expect(isInsideAdmin(framed({ top: true }), BOTH)).toBe(false);
    expect(isInsideAdmin(framed({ parentOrigin: 'https://elsewhere.example' }), BOTH)).toBe(false);
    expect(isInsideAdmin(framed({ throws: true }), BOTH)).toBe(false);
    expect(isInsideAdmin(framed(), { apps: { shop: false, stockroom: true } })).toBe(false);
    expect(isInsideAdmin(null, BOTH)).toBe(false);
  });
});

describe('#tab= links', () => {
  it('reads a page name and nothing else', () => {
    expect(parseTabHash('#tab=consignment')).toBe('consignment');
    expect(parseTabHash('tab=pos')).toBe('pos');
    expect(parseTabHash('#tab=')).toBe(null);
    expect(parseTabHash('#tab=<script>')).toBe(null);
    expect(parseTabHash('#website-order=abc')).toBe(null);
    expect(parseTabHash('')).toBe(null);
  });
});

describe('messages from the admin', () => {
  const win = framed();
  const ev = (data, over = {}) => ({ source: win.parent, origin: ORIGIN, data, ...over });
  it('opens a page and follows the look', () => {
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'open', tab: 'pos' }), win)).toEqual({ type: 'open', tab: 'pos' });
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'look', look: 'paper', appearance: 'dark' }), win))
      .toEqual({ type: 'look', look: 'paper', appearance: 'dark' });
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'look', look: 'BAD!', appearance: 'sepia' }), win)).toBe(null);
  });
  it('ignores any other sender, address or shape', () => {
    const open = { source: FROM_ADMIN, type: 'open', tab: 'pos' };
    expect(adminMessage(ev(open, { source: {} }), win)).toBe(null);
    expect(adminMessage(ev(open, { origin: 'https://elsewhere.example' }), win)).toBe(null);
    expect(adminMessage(ev({ ...open, source: 'someone' }), win)).toBe(null);
    expect(adminMessage(ev({ ...open, tab: '../x' }), win)).toBe(null);
    expect(adminMessage(ev('open'), win)).toBe(null);
  });
  it('answers in its own name', () => {
    expect(stockroomMessage('page', { tab: 'pos' })).toEqual({ source: FROM_STOCKROOM, type: 'page', tab: 'pos' });
  });
});

describe('starting inside the admin', () => {
  it('marks the page, opens the linked page, and tells the admin it is ready', async () => {
    const { startInsideAdmin } = await import('../src/lib/inside-admin.js');
    const listeners = {};
    const posted = [];
    const parent = { location: { origin: ORIGIN }, postMessage: (m, o) => posted.push([m, o]) };
    const classes = new Set();
    const win = {
      location: { origin: ORIGIN, hash: '#tab=consignment', pathname: '/stockroom/app', search: '' },
      parent,
      history: { state: null, replaceState: vi.fn() },
      document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    win.self = win;
    win.top = parent;
    // The real switchTab announces every page it opens.
    const switchTab = vi.fn((tab) => listeners[STOCKROOM_PAGE_EVENT]?.({ detail: tab }));
    const setAdminLook = vi.fn();
    const setThemePreference = vi.fn();
    expect(startInsideAdmin({ switchTab, setAdminLook, setThemePreference }, { win, profile: BOTH })).toBe(true);
    expect(classes.has('inside-admin')).toBe(true);
    expect(switchTab).toHaveBeenCalledWith('consignment');
    expect(win.history.replaceState).toHaveBeenCalled();
    expect(posted.map(([m]) => m.type)).toEqual(['page', 'ready']);
    expect(posted.every(([, o]) => o === ORIGIN)).toBe(true);

    listeners.message({ source: parent, origin: ORIGIN, data: { source: FROM_ADMIN, type: 'open', tab: 'pos' } });
    expect(switchTab).toHaveBeenLastCalledWith('pos');
    listeners.message({ source: parent, origin: ORIGIN, data: { source: FROM_ADMIN, type: 'look', look: 'ledger', appearance: 'dark' } });
    expect(setAdminLook).toHaveBeenCalledWith('ledger');
    expect(setThemePreference).toHaveBeenCalledWith('dark', { announce: false });
    listeners.message({ source: {}, origin: ORIGIN, data: { source: FROM_ADMIN, type: 'open', tab: 'expenses' } });
    expect(switchTab).not.toHaveBeenCalledWith('expenses');
    // A page opened from inside (a link, the book picker) is reported too, so the admin's menu follows.
    posted.length = 0;
    listeners[STOCKROOM_PAGE_EVENT]({ detail: 'dashboard' });
    expect(posted.map(([m]) => m)).toEqual([{ source: FROM_STOCKROOM, type: 'page', tab: 'dashboard' }]);
  });
});

describe('questions from the admin', () => {
  const win = framed();
  const ev = (data) => ({ source: win.parent, origin: ORIGIN, data });
  it('takes a book question, a find question and a page to open with its book', () => {
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'ask', id: 'q1', what: 'book', book: 'b-12' }), win)).toEqual({ type: 'ask', id: 'q1', what: 'book', book: 'b-12' });
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'ask', id: 'q2', what: 'find', isbn: '978-1', title: 'Poems' }), win)).toEqual({ type: 'ask', id: 'q2', what: 'find', isbn: '978-1', title: 'Poems' });
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'open', tab: 'dashboard', book: 'b-12' }), win)).toEqual({ type: 'open', tab: 'dashboard', book: 'b-12' });
  });
  it('ignores any other question or a bad id', () => {
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'ask', id: 'q1', what: 'everything' }), win)).toBe(null);
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'ask', id: '<x>', what: 'book', book: 'b' }), win)).toBe(null);
    expect(adminMessage(ev({ source: FROM_ADMIN, type: 'ask', id: 'q1', what: 'book' }), win)).toBe(null);
  });
  it('answers in its own name, with the id it was asked under', async () => {
    const { startInsideAdmin } = await import('../src/lib/inside-admin.js?answers');
    const listeners = {};
    const posted = [];
    const parent = { location: { origin: ORIGIN }, postMessage: (m) => posted.push(m) };
    const w = {
      location: { origin: ORIGIN, hash: '', pathname: '/stockroom/app', search: '' }, parent,
      history: { state: null, replaceState() {} },
      document: { documentElement: { classList: { add() {} } } },
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    w.self = w; w.top = parent;
    const selectBook = vi.fn();
    const switchTab = vi.fn();
    startInsideAdmin({ switchTab, setAdminLook() {}, setThemePreference() {}, selectBook, answer: async (what, args) => ({ what, ...args }) }, { win: w, profile: BOTH });
    listeners.message({ source: parent, origin: ORIGIN, data: { source: FROM_ADMIN, type: 'ask', id: 'q9', what: 'book', book: 'b-1' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(posted.at(-1)).toEqual({ source: FROM_STOCKROOM, type: 'answer', id: 'q9', result: { what: 'book', book: 'b-1' } });
    listeners.message({ source: parent, origin: ORIGIN, data: { source: FROM_ADMIN, type: 'open', tab: 'dashboard', book: 'b-1' } });
    expect(selectBook).toHaveBeenCalledWith('b-1');
    expect(switchTab).toHaveBeenLastCalledWith('dashboard');
  });
});
