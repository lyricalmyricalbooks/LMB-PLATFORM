// In-person sales as the bookkeeper's daily lines (plan 7.13).
//
// The shop's "Download for your bookkeeper" file has one line per day: sales
// before tax, shipping, discounts, gift cards sold and used, refunds, each tax
// by its name in the books, card fees, net. The tax-season export adds the
// same lines for fair and in-person sales, with the same columns and the same
// tax names, so a press with both apps hands its bookkeeper one set of
// numbers. tests/bookkeeping-days.test.js checks this file against the shop's
// (apps/shop/src/shared/bookkeeping.ts and taxBooks.ts).
//
// A stockroom sale records the price only, so the tax on it comes from the
// Tax Centre's "Tax on in-person sales" setting: a rate, its name in the books
// and whether the prices already include it. No setting = no tax column.
//
// Pure: no DOM, no state.

import { IN_PERSON_CHANNELS } from './market-day.js';

/** The columns before and after the tax columns, exactly as the shop writes them. */
export const DAY_COLUMNS_BEFORE_TAX = Object.freeze(['Date', 'Sales before tax', 'Shipping', 'Discounts', 'Gift cards sold', 'Gift cards used', 'Refunds']);
export const DAY_COLUMNS_AFTER_TAX = Object.freeze(['Card fees', 'Net', 'Currency']);

/** The names offered for a tax, the shop's list (TAX_BOOK_NAMES in taxBooks.ts). */
export const TAX_BOOK_NAMES = Object.freeze(['GST', 'HST ON', 'HST NS', 'HST NB', 'HST NL', 'HST PE', 'PST BC', 'PST MB', 'PST SK', 'QST', 'Exempt', 'Sales tax']);

const CANADA = {
  AB: 'alberta', BC: 'british columbia', MB: 'manitoba', NB: 'new brunswick', NL: 'newfoundland and labrador',
  NS: 'nova scotia', NT: 'northwest territories', NU: 'nunavut', ON: 'ontario', PE: 'prince edward island',
  QC: 'quebec', SK: 'saskatchewan', YT: 'yukon',
};
const HST = new Set(['ON', 'NS', 'NB', 'NL', 'PE']);
const PST = new Set(['BC', 'MB', 'SK']);
const clean = (v) => String(v ?? '').trim();

function canadaCode(region) {
  const text = clean(region);
  if (!text) return '';
  if (text.length === 2 && CANADA[text.toUpperCase()]) return text.toUpperCase();
  const name = text.toLowerCase().replace(/é/g, 'e');
  return Object.keys(CANADA).find((code) => CANADA[code] === name) || '';
}

/**
 * The shop's suggested name for a rate (GST, HST ON, PST BC, QST, Exempt…),
 * the same rules as suggestedTaxBookName in the shop's taxBooks.ts.
 * @param {{country?: string, region?: string, rate?: string|number}|null} rate
 */
export function suggestedTaxBookName(rate) {
  if (!rate) return 'Sales tax';
  const percent = Number(clean(rate.rate));
  if (percent === 0) return 'Exempt';
  if (['ca', 'canada'].includes(clean(rate.country).toLowerCase())) {
    const code = canadaCode(rate.region);
    if (percent === 5) return 'GST';
    if (HST.has(code)) return `HST ${code}`;
    if (code === 'QC') return percent === 9.975 ? 'QST' : 'GST + QST';
    if (PST.has(code)) return percent <= 7 ? `PST ${code}` : `GST + PST ${code}`;
    return code ? `Tax ${code}` : 'Sales tax';
  }
  const place = clean(rate.region) || clean(rate.country);
  return place ? `Sales tax ${place}`.slice(0, 40) : 'Sales tax';
}

/**
 * The saved "Tax on in-person sales" setting, cleaned, or null when there is
 * none (or the rate isn't a number from 0 to 100).
 * @param {*} setting  TAX_CENTER.settings.inPersonTax
 * @returns {{rate: number, name: string, included: boolean}|null}
 */
export function inPersonTaxOf(setting) {
  if (!setting || clean(setting.rate) === '') return null;
  const rate = Number(clean(setting.rate));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  const name = clean(setting.bookName).replace(/\s+/g, ' ').slice(0, 40)
    || suggestedTaxBookName({ country: setting.country || 'Canada', region: setting.region, rate });
  return { rate, name, included: setting.included !== false };
}

/** Is this history row a fair or in-person sale that counts? */
export function isInPersonSale(row) {
  return !!row && !row.voided && !row.gratuity && IN_PERSON_CHANNELS.has(row.chan) && /^\d{4}-\d{2}-\d{2}/.test(String(row.date || ''));
}

/**
 * One line per day with in-person sales, oldest first, in the shop's day-line
 * shape (cents). `sales` are { date, amount } in the export's currency, tax
 * included or not as the setting says.
 *
 * @param {Array<{date: string, amount: number}>} sales
 * @param {{tax?: {rate: number, name: string, included: boolean}|null, currency?: string}} [opts]
 */
export function inPersonDailyLines(sales, { tax = null, currency = 'CAD' } = {}) {
  const gross = new Map();
  for (const sale of sales || []) {
    const day = String(sale.date || '').slice(0, 10);
    const cents = Math.round((Number(sale.amount) || 0) * 100);
    if (!day || !cents) continue;
    gross.set(day, (gross.get(day) || 0) + cents);
  }
  return [...gross].sort(([a], [b]) => a.localeCompare(b)).map(([date, cents]) => {
    let salesCents = cents;
    let taxCents = 0;
    if (tax && tax.rate > 0) {
      if (tax.included) { salesCents = Math.round(cents / (1 + tax.rate / 100)); taxCents = cents - salesCents; }
      else taxCents = Math.round(cents * tax.rate / 100);
    }
    return {
      date, salesCents, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0, refundsCents: 0,
      taxes: tax && taxCents ? { [tax.name]: taxCents } : {},
      feesCents: 0, netCents: salesCents + taxCents, currency,
    };
  });
}

/** The day lines as CSV rows (header first), the columns the shop's Days sheet uses. */
export function dayLineRows(days) {
  const taxes = [...new Set(days.flatMap((d) => Object.keys(d.taxes)))].sort((a, b) => a.localeCompare(b));
  const money = (c) => (c / 100).toFixed(2);
  return [
    [...DAY_COLUMNS_BEFORE_TAX, ...taxes, ...DAY_COLUMNS_AFTER_TAX],
    ...days.map((d) => [d.date, money(d.salesCents), money(d.shippingCents), money(d.discountsCents), money(d.giftCardsSoldCents),
      money(d.giftCardsUsedCents), money(d.refundsCents), ...taxes.map((t) => money(d.taxes[t] || 0)), money(d.feesCents), money(d.netCents), d.currency]),
  ];
}
