// v4 payment sheet (mockup 1j): How they pay, cash given, Change due / Still to pay,
// and Charge, which records the sale with posConfirmSale only once the cash covers it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test, vi } from 'vitest';
import { appSource } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const src = appSource.replace(/\r\n/g, '\n');
const $ = (id) => document.getElementById(id);

beforeEach(() => {
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
});

function sheet(sale) {
  const start = src.indexOf('const SHEET_NOTES');
  const end = src.indexOf('// True while a sale is being written', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const confirm = vi.fn();
  const toast = vi.fn();
  const pick = (value) => { $('pos-payment-method').value = value; };
  const api = new Function('$', 'posPickPayment', 'posConfirmSale', 'showToast', 'sale', `
    let posPendingSale = sale;
    const posSyncPaymentSeg = () => {};
    const escapeHtml = (s) => String(s);
    const registerActions = () => {};
    const posFormat = (n) => '$' + n.toFixed(2);
    ${src.slice(start, end)}
    return { posSheetPaint, posSheetPick, posSheetCash, posSheetCharge };
  `)($, pick, confirm, toast, sale);
  return { api, confirm, toast };
}

const cashSale = () => ({ method: 'Cash', totalAmount: 32, totalCharged: '$32.00', currency: 'CAD' });

test('cash short of the total says what is still to pay and does not charge', () => {
  const { api, confirm, toast } = sheet(cashSale());
  api.posSheetCash(20);
  expect($('pos-sheet-change').hidden).toBe(false);
  expect($('pos-sheet-change').dataset.tone).toBe('short');
  expect($('pos-sheet-change').textContent).toContain('Still to pay$12.00');
  expect($('pos-sheet-charge').getAttribute('aria-disabled')).toBe('true');
  api.posSheetCharge();
  expect(confirm).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('$12.00 still to pay', 'warn');
});

test('enough cash shows the change due and charges', () => {
  const { api, confirm } = sheet(cashSale());
  api.posSheetCash(50);
  expect($('pos-sheet-change').dataset.tone).toBe('covered');
  expect($('pos-sheet-change').textContent).toContain('Change due$18.00');
  expect($('pos-sheet-charge').textContent).toBe('Charge $32.00');
  api.posSheetCharge();
  expect(confirm).toHaveBeenCalledTimes(1);
});

test('no cash typed yet charges as before; Exact fills the total', () => {
  const { api, confirm } = sheet(cashSale());
  api.posSheetPaint();
  expect($('pos-sheet-change').hidden).toBe(true);
  api.posSheetCash('exact');
  expect($('pos-sheet-given').value).toBe('32.00');
  api.posSheetCharge();
  expect(confirm).toHaveBeenCalledTimes(1);
});

test('picking card hides the cash box, shows what to do, and becomes the sale method', () => {
  const sale = cashSale();
  const { api, confirm } = sheet(sale);
  api.posSheetCash(10);
  api.posSheetPick('Card');
  expect(sale.method).toBe('Card');
  expect($('pos-payment-method').value).toBe('Card');
  expect($('pos-sheet-cash').hidden).toBe(true);
  expect($('pos-sheet-note').textContent).toMatch(/card on your reader/);
  api.posSheetCharge();
  expect(confirm).toHaveBeenCalledTimes(1);
});

test('the sheet buttons are named actions, never inline code', () => {
  const start = html.indexOf('id="m-pos-sale-confirm"');
  const block = html.slice(start, html.indexOf('</div></div>', start));
  expect(block).toContain('data-action="pos.sheetCharge"');
  expect(block.match(/data-action="pos\.sheetPick"/g)).toHaveLength(5);
  expect(block).not.toMatch(/onclick="posSheet/);
});
