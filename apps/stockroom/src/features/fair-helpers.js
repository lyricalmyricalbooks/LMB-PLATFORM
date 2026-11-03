// Fair helpers, the owner's side (docs/combined-admin.md › Fair helpers plan, step 2). On the plan with both apps,
// the publisher's stockroom keeps the till's menu for helpers up to date (fairTill/menu: each book's title, price,
// currency and copies on hand) and brings the sales helpers ring up (fairSales) into the books through the ledger's
// one sale-writing path, so the stockroom stays the only writer of a book. Each sale is claimed on the server first,
// so two of the owner's devices never both bring it in, and its records carry the sale's id, so a book that already
// holds it is skipped. The checks are in lib/fair-helper.js; nothing runs at import time.
import { renderHist } from '../main.js';
import { BOOKS, states, onBookEvent } from '../core/store.js';
import { combinedPlan } from '../lib/inside-admin.js';
import { shopProfile } from '../lib/shop-profile.js';
import { fairMenu, helperImportPlan } from '../lib/fair-helper.js';
import { buildPaymentMeta, getBookCurrencyCode } from '../lib/money.js';
import { updateDash } from './dashboard.js';
import { writeOrderToLedger } from './sales-ledger.js';

/** The channel every till sale is recorded under (pos.js _posItemToManualPayload). */
const FAIR_CHANNEL = 'Book Fair';
const MENU_WAIT_MS = 4000;
let _started = false;
let _menuTimer = null;
let _lastMenu = '';
const _busy = new Set();
const _refused = new Set();

/** Publisher only, on the plan with both apps, once every book has loaded. Safe to call more than once. */
function startFairHelpers({ win = window, profile = shopProfile } = {}) {
  if (_started || !win.IS_PUBLISHER || !combinedPlan(profile)) return false;
  if (typeof win._fbWatchFairSales !== 'function' || typeof win._fbWriteFairMenu !== 'function') return false;
  if (typeof win._useFirestoreGlobal === 'function' && !win._useFirestoreGlobal()) return false;
  _started = true;
  onBookEvent('book-saved', () => scheduleMenu());
  onBookEvent('book-changed', () => scheduleMenu());
  win.addEventListener('online', () => scheduleMenu(0));
  scheduleMenu(0);
  win._fbWatchFairSales((docs) => { bringInSales(docs).catch((e) => console.warn('Fair helper sales: could not bring in', e)); });
  return true;
}

/** The menu from this device's own records: list price, the book's currency, copies on hand. */
function currentMenu(books = BOOKS, bookStates = states) {
  return fairMenu(Object.values(books || {}).map((b) => ({
    id: b.id,
    title: b.title,
    price: b.listPrice,
    cur: getBookCurrencyCode(b),
    onHand: Number.isFinite(bookStates?.[b.id]?.stock) ? bookStates[b.id].stock : null,
  })));
}

function scheduleMenu(wait = MENU_WAIT_MS) {
  clearTimeout(_menuTimer);
  _menuTimer = setTimeout(() => { publishMenu().catch((e) => console.warn('Fair helper menu: not saved', e)); }, wait);
}

async function publishMenu() {
  const menu = currentMenu();
  const key = JSON.stringify(menu.books);
  // Unchanged since the last write from this device: nothing to send.
  if (key === _lastMenu) return;
  await window._fbWriteFairMenu(menu);
  _lastMenu = key;
}

/** A book holds a record of this helper sale already (brought in earlier, or by another of the owner's devices). */
function alreadyIn(bookId, num) {
  return (states[bookId]?.hist || []).some((h) => h && h.num === num && h.chan === FAIR_CHANNEL);
}

/**
 * Brings each helper sale not yet brought in into the books. Returns how many sales it brought in. A sale with a
 * problem (a book the stockroom no longer has, an odd quantity) is left in the inbox, untouched, and said once.
 */
async function bringInSales(docs, { claim = (id) => window._fbClaimFairSale(id) } = {}) {
  let brought = 0;
  for (const sale of docs || []) {
    if (!sale || sale.imported || _busy.has(sale.id) || _refused.has(sale.id)) continue;
    const plan = helperImportPlan(sale, Object.keys(BOOKS), alreadyIn);
    if (plan.problem) {
      _refused.add(sale.id);
      console.warn(`Fair helper sale ${sale.id} not brought in: ${plan.problem}`);
      continue;
    }
    _busy.add(sale.id);
    try {
      // The server says which device brings it in; offline, the claim fails and the sale waits for the next look.
      if (!(await claim(sale.id))) continue;
      for (const row of plan.rows) {
        const book = BOOKS[row.bookId];
        writeOrderToLedger(row.bookId, {
          num: row.num, chan: FAIR_CHANNEL, qty: row.qty, price: row.price, notes: row.notes, date: row.date,
          payment: buildPaymentMeta({ book, qty: row.qty, unitPrice: row.price, fxEnabled: false }),
          enteredBy: 'Publisher', extra: { fairHelper: String(sale.by || '') },
        });
      }
      brought++;
    } finally {
      _busy.delete(sale.id);
    }
  }
  if (brought) {
    renderHist();
    updateDash();
    if (typeof window.renderAllOverview === 'function') window.renderAllOverview();
  }
  return brought;
}

export {
  bringInSales,
  currentMenu,
  startFairHelpers,
};
