// The stockroom's Google Sheet on a Colophon shop (docs/plans/stockroom-google-sheet.md). The shop's one Google sign-in
// (admin Settings › Google, with Drive on) makes the sheet in the press's own Drive; each send replaces its Stock and
// Sales tabs with what the stockroom holds now, so sending twice changes nothing and a voided sale simply drops off.
// The older sheet route (an Apps Script the press deploys, `sheetsUrl`) is untouched and stays hidden on these shops.
//
// Pure: no DOM, no storage, no network. features/google-sheet.js draws the card and makes the calls.
import { getBookCurrencyCode, normalizeCurrencyCode, roundCents } from './money.js';
import { runsOnColophon } from './shop-profile.js';

/** The most sales lines one send carries: the newest ones. The shop's server takes no more. */
export const MAX_SALES_LINES = 5000;
/** When the page opens and the sheet is older than this, it is sent again by itself. */
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

/** A Colophon shop with both apps: the shop's server, which holds the Google link, is there to ask. */
export function googleSheetApplies(profile) {
  return runsOnColophon(profile) && profile?.apps?.shop === true && profile?.apps?.stockroom === true;
}

const text = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : '');

/**
 * One line per sale, newest first: date, book, order, where sold, copies, price, total, currency, notes. Stockist
 * movements (their own ledger), voided sales and the practice book are left out. `isPractice(book, id)` names the
 * practice book.
 */
export function salesSheetLines(books = {}, states = {}, { isPractice = () => false, max = MAX_SALES_LINES } = {}) {
  const lines = [];
  for (const [id, book] of Object.entries(books || {})) {
    const s = states?.[id];
    if (!book || !s || s._loadFailed || isPractice(book, id)) continue;
    const currency = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    for (const h of s.hist || []) {
      if (!h || h.voided || h.consignmentLink) continue;
      const qty = num(h.qty);
      const price = num(h.price);
      const total = qty !== '' && price !== '' ? roundCents(qty * price) : '';
      lines.push([text(h.date, 40), text(book.title, 200), text(h.num, 60), text(h.chan, 60), qty, price, total, currency, text(h.notes)]);
    }
  }
  lines.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return lines.slice(0, max);
}

/**
 * What the card shows, from the shop's Google answer: 'loading', 'error', 'off' (Google isn't connected or isn't
 * switched on yet), 'nodrive' (connected, Drive not on) or 'ready'.
 */
export function sheetCardState(status) {
  if (status === undefined) return 'loading';
  if (!status || status.error) return 'error';
  if (!status.enabled || !status.connected) return 'off';
  return (status.extrasChosen || []).includes('drive') ? 'ready' : 'nodrive';
}

/** The sheet's own address, only when it is a Google Sheets one. */
export function sheetUrl(status) {
  const url = status?.sheet?.url;
  return typeof url === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\//.test(url) ? url : '';
}

/** Send by itself on opening: ready, and never sent or last sent over REFRESH_AFTER_MS ago. */
export function sheetDue(status, now = Date.now()) {
  if (sheetCardState(status) !== 'ready') return false;
  const at = Date.parse(status?.sheet?.writtenAt || '');
  return !Number.isFinite(at) || now - at > REFRESH_AFTER_MS;
}

/** "Sent 5 minutes ago", "Sent today at 14:05", or "" when never. */
export function sentWords(writtenAt, now = Date.now()) {
  const at = Date.parse(writtenAt || '');
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((now - at) / 60000));
  if (mins < 1) return 'Sent just now';
  if (mins < 60) return `Sent ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Sent ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `Sent ${days} day${days === 1 ? '' : 's'} ago`;
}
