// Plan 7.13: the tax-season export's fair and in-person day lines use the
// shop's bookkeeping format — the same columns, the same money format and the
// same tax names — checked here against the shop's own code.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DAY_COLUMNS_AFTER_TAX, DAY_COLUMNS_BEFORE_TAX, dayLineRows, inPersonDailyLines, inPersonTaxOf, isInPersonSale, suggestedTaxBookName,
} from '../src/lib/bookkeeping-days.js';
import { csvRow } from '../src/lib/csv.js';
import { suggestedTaxBookName as shopSuggestion, TAX_BOOK_NAMES } from '../../shop/src/shared/taxBooks.ts';
import { bookkeepingDaysCsv } from '../../shop/src/app/admin/bookkeepingCsv.ts';

const csvOf = (rows) => rows.map(csvRow).join('\n') + '\n';

describe('in-person day lines match the shop\'s bookkeeping file', () => {
  test('same tax names as the shop', () => {
    const cases = [];
    for (const region of ['Ontario', 'ON', 'Nova Scotia', 'Québec', 'British Columbia', 'Manitoba', 'Alberta', 'Yukon', '']) {
      for (const rate of ['0', '5', '7', '9.975', '12', '13', '14.975', '15']) cases.push({ country: 'Canada', region, rate });
    }
    cases.push({ country: 'United States', region: 'New York', rate: '8.875' }, null);
    for (const c of cases) expect(suggestedTaxBookName(c), JSON.stringify(c)).toBe(shopSuggestion(c));
    // The name suggestions offered in the export dialog are the shop's.
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const offered = [...html.match(/<datalist id="tc-ip-tax-names">(.*?)<\/datalist>/)[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    expect(offered).toEqual(TAX_BOOK_NAMES);
  });

  test('a day of fair sales writes the same CSV as the shop writes for the same money', () => {
    const tax = inPersonTaxOf({ rate: '13', bookName: '', included: true, region: 'Ontario' });
    expect(tax).toEqual({ rate: 13, name: 'HST ON', included: true });
    const days = inPersonDailyLines([{ date: '2026-09-12', amount: 22.6 }, { date: '2026-09-12', amount: 11.3 }, { date: '2026-09-13', amount: 20 }], { tax });
    expect(days.map((d) => [d.date, d.salesCents, d.taxes['HST ON'], d.netCents])).toEqual([['2026-09-12', 3000, 390, 3390], ['2026-09-13', 1770, 230, 2000]]);
    // The shop, given orders with the same sales and tax, writes the same file.
    const orders = days.map((d, i) => ({
      id: `o${i}`, paymentStatus: 'paid', paidAt: `${d.date}T15:00:00.000Z`,
      subtotal: d.salesCents / 100, tax: d.taxes['HST ON'] / 100, total: d.netCents / 100, taxLines: [{ name: 'HST ON', cents: d.taxes['HST ON'] }],
    }));
    expect(csvOf(dayLineRows(days))).toBe(bookkeepingDaysCsv(orders, { month: '2026-09', currency: 'CAD', timeZone: 'UTC' }));
    expect(dayLineRows(days)[0]).toEqual([...DAY_COLUMNS_BEFORE_TAX, 'HST ON', ...DAY_COLUMNS_AFTER_TAX]);
  });

  test('tax added on top, and no tax set', () => {
    const onTop = inPersonDailyLines([{ date: '2026-03-01', amount: 20 }], { tax: inPersonTaxOf({ rate: '5', included: false }) });
    expect(onTop[0]).toMatchObject({ salesCents: 2000, taxes: { GST: 100 }, netCents: 2100 });
    const none = inPersonDailyLines([{ date: '2026-03-01', amount: 20 }], { tax: inPersonTaxOf(undefined) });
    expect(none[0]).toMatchObject({ salesCents: 2000, taxes: {}, netCents: 2000, feesCents: 0, currency: 'CAD' });
    expect(dayLineRows(none)[0]).toEqual([...DAY_COLUMNS_BEFORE_TAX, ...DAY_COLUMNS_AFTER_TAX]);
    expect(inPersonTaxOf({ rate: 'abc' })).toBe(null);
    expect(inPersonTaxOf({ rate: '' })).toBe(null);
    expect(inPersonTaxOf({ rate: '7', bookName: '  PST   BC ' })?.name).toBe('PST BC');
  });

  test('only fair and in-person sales count', () => {
    expect(isInPersonSale({ chan: 'Book Fair', date: '2026-09-12', qty: 1, price: 20 })).toBe(true);
    expect(isInPersonSale({ chan: 'In Person', date: '2026-09-12' })).toBe(true);
    expect(isInPersonSale({ chan: 'Website', date: '2026-09-12' })).toBe(false);
    expect(isInPersonSale({ chan: 'Consignment', date: '2026-09-12' })).toBe(false);
    expect(isInPersonSale({ chan: 'Book Fair', date: '2026-09-12', voided: true })).toBe(false);
    expect(isInPersonSale({ chan: 'Book Fair', date: '2026-09-12', gratuity: true })).toBe(false);
    expect(isInPersonSale({ chan: 'Book Fair', date: '' })).toBe(false);
  });
});
