// @vitest-environment jsdom
// The stockroom's Google Sheet on a Colophon shop (docs/plans/stockroom-google-sheet.md): the Sales lines, the card's
// states, sending through the shop's server, refreshing by itself, and never touching the older sheet route.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { expensesSheetLines, googleSheetApplies, salesSheetLines, sheetSignalInput, sheetCardState, sheetDue, sheetUrl, sentWords, REFRESH_AFTER_MS } from '../src/lib/google-sheet.js';
import { openGoogleSheet, sendGoogleSheet, refreshGoogleSheetIfDue, __resetGoogleSheet } from '../src/features/google-sheet.js';

const PROFILE = {
  version: 1, shopId: 'moth-press', functionsRegion: 'us-central1', siteUrl: 'https://mothpress.example',
  firebase: { projectId: 'moth-press' }, apps: { shop: true, stockroom: true }, payments: { mode: 'platform' },
};
const NOW = Date.parse('2026-11-04T12:00:00Z');
const BOOKS = { moth: { id: 'moth', title: 'Moth Book', currency: 'CAD' }, test: { id: 'test', title: 'Test' } };
const STATES = {
  moth: {
    hist: [
      { date: '2026-11-01', num: 'F-1', chan: 'Fair', qty: 2, price: 18, notes: '' },
      { date: '2026-11-03', num: 'W-9', chan: 'Website', qty: 1, price: 18.5, notes: 'gift' },
      { date: '2026-11-02', num: 'V-1', chan: 'Fair', qty: 1, price: 18, voided: true },
      { date: '2026-11-02', num: 'C-1', chan: 'Stockist', qty: 5, price: 10, consignmentLink: 'x' },
    ],
  },
  test: { hist: [{ date: '2026-11-04', qty: 1, price: 1 }] },
};
STATES.moth.expenses = [
  { id: 1, date: '2026-10-01', cat: 'Printing', ref: 'INV-4', amount: 400, currency: 'CAD', desc: 'Riso run' },
  { id: 2, date: '2026-10-05', cat: 'Fair fee', amount: 30, currency: 'CAD', voided: true },
  { id: 3, date: '2026-10-06', cat: 'Fair fee', amount: 20, currency: 'CAD', pendingAuth: true },
];
STATES.moth.artistPayouts = [{ id: 9, date: '2026-10-20', method: 'E-transfer', amount: 50, currency: 'CAD' }];
const READY = { enabled: true, connected: true, extrasChosen: ['drive'], sheet: { url: 'https://docs.google.com/spreadsheets/d/s1/edit', writtenAt: '2026-11-04T11:55:00Z', rows: 3, sales: 2 } };

describe('the Sales lines and the card', () => {
  it('lists live sales newest first and leaves out voided, stockist and practice ones', () => {
    const lines = salesSheetLines(BOOKS, STATES, { isPractice: (b) => b.title === 'Test' });
    expect(lines).toEqual([
      ['2026-11-03', 'Moth Book', 'W-9', 'Website', 1, 18.5, 18.5, 'CAD', 'gift'],
      ['2026-11-01', 'Moth Book', 'F-1', 'Fair', 2, 18, 36, 'CAD', ''],
    ]);
    expect(salesSheetLines(BOOKS, STATES, { max: 1 })).toHaveLength(1);
    expect(salesSheetLines({ moth: BOOKS.moth }, { moth: { _loadFailed: true, hist: STATES.moth.hist } })).toEqual([]);
  });

  it('lists costs and payments to artists newest first, leaving out voided and unapproved ones', () => {
    expect(expensesSheetLines(BOOKS, STATES, { isPractice: (b) => b.title === 'Test' })).toEqual([
      ['2026-10-20', 'Moth Book', 'Payment to artist', 'E-transfer', '', 50, 'CAD', 50, ''],
      ['2026-10-01', 'Moth Book', 'Expense', 'Printing', 'INV-4', 400, 'CAD', 400, 'Riso run'],
    ]);
  });

  it('shows only on a Colophon shop with both apps', () => {
    expect(googleSheetApplies(PROFILE)).toBe(true);
    expect(googleSheetApplies({ ...PROFILE, apps: { shop: false, stockroom: true } })).toBe(false);
    expect(googleSheetApplies({ ...PROFILE, payments: { mode: 'own' } })).toBe(false);
  });

  it('reads the state, the sheet address and when it is due', () => {
    expect(sheetCardState(undefined)).toBe('loading');
    expect(sheetCardState({ error: 'x' })).toBe('error');
    expect(sheetCardState({ enabled: false })).toBe('off');
    expect(sheetCardState({ enabled: true, connected: true, extrasChosen: [] })).toBe('nodrive');
    expect(sheetCardState(READY)).toBe('ready');
    expect(sheetUrl({ sheet: { url: 'https://evil.example/x' } })).toBe('');
    expect(sheetDue(READY, NOW)).toBe(false);
    expect(sheetDue(READY, Date.parse(READY.sheet.writtenAt) + REFRESH_AFTER_MS + 1)).toBe(true);
    expect(sheetDue({ ...READY, sheet: null }, NOW)).toBe(true);
    expect(sheetDue({ enabled: true, connected: true, extrasChosen: [] }, NOW)).toBe(false);
    expect(sentWords(READY.sheet.writtenAt, NOW)).toBe('Sent 5 minutes ago');
    expect(sheetSignalInput(READY)).toEqual({ state: 'ready', hasSheet: true, writtenAt: READY.sheet.writtenAt });
  });
});

describe('the Google Sheet tab', () => {
  let calls;
  let answers;
  let heard;
  const deps = () => ({
    profile: PROFILE, getIdToken: async () => 'tok', books: () => BOOKS, states: () => STATES,
    isPractice: (b) => b.title === 'Test', toast: vi.fn(), now: () => NOW, onStatus: (st) => heard.push(st),
    fetchFn: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body, auth: init.headers.Authorization });
      const answer = answers[body.step];
      return { ok: true, json: async () => (typeof answer === 'function' ? answer(body) : answer) };
    },
  });
  beforeEach(() => {
    __resetGoogleSheet();
    calls = [];
    heard = [];
    answers = { status: READY, sheetSync: { available: true, url: READY.sheet.url, writtenAt: '2026-11-04T12:00:00Z', rows: 3, sales: 2 } };
    document.body.innerHTML = '<div id="google-sheet-card"></div>';
  });
  const card = () => document.getElementById('google-sheet-card');

  it('asks the shop, shows when it was sent and links to the sheet', async () => {
    await openGoogleSheet(deps());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: 'https://us-central1-moth-press.cloudfunctions.net/createStripeCheckoutSession', body: { action: 'googleConnect', step: 'status' }, auth: 'Bearer tok' });
    expect(card().dataset.state).toBe('ready');
    expect(card().textContent).toContain('Sent 5 minutes ago · 3 products · 2 sales · 0 costs');
    expect(card().querySelector('a[target=_blank]').getAttribute('href')).toBe(READY.sheet.url);
  });

  it('Send now sends the sales lines; the stock is read by the shop itself', async () => {
    await openGoogleSheet(deps());
    card().querySelector('[data-gs=send]').click();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body.step).toBe('sheetSync');
    expect(calls[1].body.sales).toHaveLength(2);
    expect(calls[1].body.expenses).toHaveLength(2);
    expect(calls[1].body.rows).toBeUndefined();
    await vi.waitFor(() => expect(card().textContent).toContain('Sent just now'));
    // The to-do list hears the opening answer and the fresh send.
    expect(heard.map((h) => h.sheet?.writtenAt)).toEqual([READY.sheet.writtenAt, '2026-11-04T12:00:00Z']);
  });

  it('without Google or without Drive, it points to Settings › Google and sends nothing', async () => {
    answers.status = { enabled: true, connected: true, extrasChosen: [] };
    await openGoogleSheet(deps());
    expect(card().dataset.state).toBe('nodrive');
    expect(card().querySelector('a[target=_top]').getAttribute('href')).toBe('/admin#settings/google');
    expect(card().querySelector('[data-gs=send]')).toBeNull();
    expect(calls.map((c) => c.body.step)).toEqual(['status']);
  });

  it('a sheet over six hours old is sent again by itself, once per page load, without a toast', async () => {
    answers.status = { ...READY, sheet: { ...READY.sheet, writtenAt: '2026-11-04T01:00:00Z' } };
    const d = deps();
    expect(await refreshGoogleSheetIfDue(d)).toBe(true);
    expect(await refreshGoogleSheetIfDue(d)).toBe(false);
    expect(calls.map((c) => c.body.step)).toEqual(['status', 'sheetSync']);
    expect(d.toast).not.toHaveBeenCalled();
  });

  it("the shop's refusal shows in its own words; a deleted sheet says so", async () => {
    answers.sheetSync = { error: 'Your stockroom isn\'t set up in this shop yet, so there is no stock list to send.' };
    await openGoogleSheet(deps());
    await sendGoogleSheet(deps());
    expect(card().textContent).toContain('isn\'t set up in this shop yet');
    answers.sheetSync = { available: true, gone: true };
    await sendGoogleSheet(deps());
    expect(card().textContent).toContain('deleted in Google Drive');
  });
});

describe('the older sheet route is left alone', () => {
  it('opening, sending and refreshing never store anything in the browser, so the older connection stays empty', async () => {
    __resetGoogleSheet();
    localStorage.clear();
    document.body.innerHTML = '<div id="google-sheet-card"></div>';
    const fetchFn = async (url, init) => ({ ok: true, json: async () => (JSON.parse(init.body).step === 'status' ? { ...READY, sheet: null } : { available: true, url: READY.sheet.url, writtenAt: '2026-11-04T12:00:00Z', rows: 3, sales: 2 }) });
    const d = { profile: PROFILE, getIdToken: async () => 'tok', books: () => BOOKS, states: () => STATES, isPractice: () => false, toast: () => {}, now: () => NOW, fetchFn };
    await refreshGoogleSheetIfDue(d);
    await openGoogleSheet(d);
    await sendGoogleSheet(d);
    expect(localStorage.length).toBe(0);
  });
});
