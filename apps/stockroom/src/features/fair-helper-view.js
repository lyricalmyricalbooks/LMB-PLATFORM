// The fair helper's till (docs/combined-admin.md › Fair helpers plan, step 3).
//
// Someone the shop's owner gave the "fairHelper" role on the Team signs in at the stockroom's address and sees only
// this: the till's books and prices (fairTill/menu, kept by the owner's stockroom), a cart, the ways of paying, and
// the sales they rang up today. A sale goes into the inbox (fairSales) and the owner's stockroom brings it into the
// books (features/fair-helpers.js). With no signal a sale waits on this phone, in Firestore's own queue, and goes
// when the signal comes back; the screen says how many are waiting. Nothing else of the press is read or written.
import { escapeHtml } from '../lib/html.js';
import { registerActions } from '../lib/actions.js';
import { FAIR_METHODS, FAIR_UNDO_MS } from '../lib/fair-mode.js';
import { helperCopiesLeft, helperDay, helperSaleDoc, newSaleId } from '../lib/fair-helper.js';
import '../styles/fair-helper-view.css';

const FAIR_KEY = 'lm-helper-fair';
const SHOWN_LIMIT = 60;

const state = { email: '', menu: null, sales: [], cart: {}, search: '', fair: '', menuFailed: false, note: '', undoId: '' };
let undoTimer = null;
let api = null;

const localDay = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const money = (n, cur) => `${cur} ${(Math.round(n * 100) / 100).toFixed(2)}`;
const totalsText = (totals) => Object.entries(totals).map(([cur, n]) => money(n, cur)).join(' + ');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function readFair(day) {
  try {
    const saved = JSON.parse(localStorage.getItem(FAIR_KEY) || 'null');
    return saved && saved.day === day ? String(saved.name || '') : '';
  } catch (_) { return ''; }
}
function saveFair(name, day) {
  try { localStorage.setItem(FAIR_KEY, JSON.stringify({ name, day })); } catch (_) { /* private mode: this visit only */ }
}

function root() {
  let el = document.getElementById('fair-helper-view');
  if (!el) {
    el = document.createElement('main');
    el.id = 'fair-helper-view';
    el.className = 'fair-helper-view';
    document.body.appendChild(el);
  }
  return el;
}

/** The page frame: head, fair name, search, and the four parts that repaint on their own. Pure. */
function frameHtml(email, fair) {
  return `
    <div class="sec-head">
      <div class="sec-head-titles">
        <div class="sec-kicker"><span class="sec-kicker-dot"></span>Fair helper</div>
        <h1 class="section-hed sec-head-title">Fair till</h1>
        <p class="section-subcopy">Signed in as ${escapeHtml(email)}. The sales you ring up here go straight to the press's stockroom.</p>
      </div>
      <button class="btn sm" data-action="helper.signOut">Sign out</button>
    </div>
    <div id="fh-sync" class="fh-sync" role="status"></div>
    <div class="form-group fh-field"><label for="fh-fair">Today's fair</label>
      <input id="fh-fair" type="text" maxlength="80" placeholder="e.g. Harbour Book Fair" value="${escapeHtml(fair)}" data-on-change="helper.fair" autocomplete="off"></div>
    <div class="fh-layout">
      <section class="fh-books-col" aria-label="Books">
        <div class="form-group fh-field"><label for="fh-search">Find a book</label>
          <input id="fh-search" type="search" placeholder="Title" data-on-input="helper.search" autocomplete="off"></div>
        <div id="fh-books"></div>
      </section>
      <section class="fh-cart-col" aria-label="This sale">
        <div id="fh-cart"></div>
        <div id="fh-today"></div>
      </section>
    </div>`;
}

/** The sync line: everything uploaded, or how many sales wait for signal. Pure. */
function syncHtml(day, online) {
  if (day.waiting) {
    return `<span class="fh-sync-wait">⚠ ${plural(day.waiting, 'sale is', 'sales are')} waiting for signal${online ? '' : ' (no connection)'}. Keep this page open; ${day.waiting === 1 ? 'it goes' : 'they go'} as soon as the signal is back.</span>`;
  }
  return `<span class="fh-sync-ok">✓ Every sale is uploaded.</span>`;
}

/** The book list for a menu, search and copies left. Pure. */
function booksHtml(menu, search, left, cart, failed = false) {
  if (!menu) {
    return failed
      ? '<div class="empty-state"><div class="e-icon">⚠</div>The till couldn\'t load. Check the signal and reopen this page.</div>'
      : '<div class="empty-state"><div class="e-icon">⏳</div>Loading the till…</div>';
  }
  const q = search.trim().toLowerCase();
  const books = (menu.books || []).filter((b) => !q || b.title.toLowerCase().includes(q));
  if (!menu.books?.length) return '<div class="empty-state"><div class="e-icon">📚</div>No books on the till yet. The press\'s owner adds them by opening their stockroom.</div>';
  if (!books.length) return `<div class="empty-state">No book matches “${escapeHtml(search)}”.</div>`;
  const rows = books.slice(0, SHOWN_LIMIT).map((b) => {
    const n = left[b.id];
    const inCart = cart[b.id] || 0;
    const stock = n == null ? '' : n - inCart <= 0 ? '<span class="fh-none">None left</span>' : `${n - inCart} left`;
    return `<li><button type="button" class="fh-book" data-action="helper.add" data-book="${escapeHtml(b.id)}" aria-label="Add ${escapeHtml(b.title)}">
      ${coverHtml(b)}
      <span class="fh-book-title">${escapeHtml(b.title)}</span>
      <span class="fh-book-meta"><strong class="tnum">${escapeHtml(money(b.price, b.cur))}</strong>${stock ? ` · ${stock}` : ''}${inCart ? ` · <span class="fh-in-cart">${inCart} in this sale</span>` : ''}</span>
    </button></li>`;
  }).join('');
  const more = books.length > SHOWN_LIMIT ? `<p class="fh-note">Showing ${SHOWN_LIMIT} of ${books.length}. Type a title to find the rest.</p>` : '';
  return `<ul class="fh-book-list">${rows}</ul>${more}`;
}

/** A book's cover on the till: the website's photo, or its colour (the owner's till shows the same), or a plain box. */
function coverHtml(b) {
  if (b.cover && /^https:\/\//.test(b.cover)) {
    return `<img class="fh-cover" src="${escapeHtml(b.cover)}" alt="" width="36" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  const colour = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(String(b.accent || '')) ? b.accent : '';
  return `<span class="fh-cover" aria-hidden="true"${colour ? ` style="background:${colour}"` : ''}></span>`;
}

/** The cart, its total and the ways of paying. Pure. */
function cartHtml(menu, cart, note = '', canUndo = false) {
  const byId = new Map((menu?.books || []).map((b) => [b.id, b]));
  const lines = Object.entries(cart).filter(([id, qty]) => qty > 0 && byId.has(id));
  const head = '<h2 class="fh-h">This sale</h2>';
  const undo = canUndo ? ' <button type="button" class="btn sm fh-undo" data-action="helper.undo">Undo</button>' : '';
  const noteHtml = note ? `<p class="fh-done" role="status">${escapeHtml(note)}${undo}</p>` : '';
  if (!lines.length) return `${head}${noteHtml}<p class="fh-note">Tap a book to add it.</p>`;
  const totals = {};
  const rows = lines.map(([id, qty]) => {
    const b = byId.get(id);
    totals[b.cur] = (totals[b.cur] || 0) + qty * b.price;
    return `<li class="fh-line"><span class="fh-line-title">${escapeHtml(b.title)}</span>
      <span class="fh-qty">
        <button type="button" class="btn sm" data-action="helper.less" data-book="${escapeHtml(id)}" aria-label="One fewer ${escapeHtml(b.title)}">−</button>
        <span class="tnum" aria-label="Quantity">${qty}</span>
        <button type="button" class="btn sm" data-action="helper.add" data-book="${escapeHtml(id)}" aria-label="One more ${escapeHtml(b.title)}">+</button>
      </span>
      <strong class="tnum">${escapeHtml(money(qty * b.price, b.cur))}</strong></li>`;
  }).join('');
  const pay = FAIR_METHODS.map((m) => `<button type="button" class="btn fh-pay" data-action="helper.charge" data-method="${escapeHtml(m.value)}"><span aria-hidden="true">${m.icon}</span> ${escapeHtml(m.label)}</button>`).join('');
  return `${head}<ul class="fh-lines">${rows}</ul>
    <p class="fh-total">Total <strong class="tnum">${escapeHtml(totalsText(totals))}</strong></p>
    <p class="fh-label">How did they pay?</p>
    <div class="fh-pay-row">${pay}</div>
    <button type="button" class="btn sm fh-clear" data-action="helper.clear">Clear this sale</button>`;
}

/** Today's sales by this helper. Pure. */
function todayHtml(day) {
  const head = '<h2 class="fh-h">Your sales today</h2>';
  if (!day.sales.length) return `${head}<p class="fh-note">None yet.</p>`;
  const rows = day.sales.map((s) => {
    const what = (s.lines || []).map((l) => `${l.title}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ');
    const totals = {};
    for (const l of s.lines || []) totals[l.cur] = (totals[l.cur] || 0) + l.qty * l.price;
    const method = FAIR_METHODS.find((m) => m.value === s.method)?.label || s.method;
    const status = s.cancelled ? 'Undone' : s.pending ? '<span class="fh-wait">Waiting for signal</span>' : s.imported ? 'In the books' : 'Uploaded';
    return `<li class="fh-sale${s.cancelled ? ' is-undone' : ''}"><span class="fh-sale-what">${escapeHtml(what)}</span><span class="fh-sale-meta">${escapeHtml(method)} · ${status}</span><strong class="tnum">${escapeHtml(totalsText(totals))}</strong></li>`;
  }).join('');
  const summary = day.kept ? `${plural(day.units, 'book', 'books')} in ${plural(day.kept, 'sale', 'sales')} · ${escapeHtml(totalsText(day.totals))}` : 'No sales kept today';
  return `${head}<p class="fh-day tnum">${summary}</p>
    <ul class="fh-sales">${rows}</ul>
    <p class="fh-note">Rang one up by mistake? Tap Undo straight after the sale. Later, tell the press's owner: they can void it in their stockroom.</p>`;
}

function paint(parts = ['sync', 'books', 'cart', 'today']) {
  const today = localDay();
  const day = helperDay(state.sales, today);
  const left = helperCopiesLeft(state.menu, state.sales);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (parts.includes('sync')) set('fh-sync', syncHtml(day, navigator.onLine !== false));
  if (parts.includes('books')) set('fh-books', booksHtml(state.menu, state.search, left, state.cart, state.menuFailed));
  if (parts.includes('cart')) set('fh-cart', cartHtml(state.menu, state.cart, state.note, !!state.undoId));
  if (parts.includes('today')) set('fh-today', todayHtml(day));
}

function charge(method) {
  const day = localDay();
  const cart = Object.entries(state.cart).filter(([, qty]) => qty > 0).map(([bookId, qty]) => ({ bookId, qty }));
  const made = helperSaleDoc({ id: newSaleId(), by: state.email, day, fair: state.fair, method, cart }, state.menu);
  if (!made) { state.note = 'That sale couldn\'t be recorded. Check the books in it and try again.'; paint(['cart']); return; }
  // Not awaited: offline the write waits on this phone, and the watch shows it at once as waiting for signal.
  api.addSale(made.id, made.doc).catch((e) => {
    console.error('Fair helper sale refused', e);
    state.note = 'A sale was refused. You may no longer be a fair helper for this press; ask its owner.';
    paint(['cart']);
  });
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const label = FAIR_METHODS.find((m) => m.value === method)?.label || method;
  state.cart = {};
  state.note = `✓ Sold ${plural(count, 'book', 'books')} · ${label}`;
  // A short Undo for a wrong tap, like the owner's own till.
  state.undoId = made.id;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { state.undoId = ''; paint(['cart']); }, FAIR_UNDO_MS);
  paint(['books', 'cart']);
}

function undoLast() {
  const id = state.undoId;
  if (!id) return;
  state.undoId = '';
  clearTimeout(undoTimer);
  // Offline it waits in the same queue as the sale, so the two reach the server together.
  api.cancelSale(id).catch((e) => {
    console.error('Fair helper undo refused', e);
    state.note = 'That sale is already in the books, so it can\'t be undone here. Tell the press\'s owner: they can void it.';
    paint(['cart']);
  });
  state.note = '↩ Sale undone';
  paint(['cart']);
}

let registered = false;
function registerHelperActions() {
  if (registered) return;
  registered = true;
  registerActions({
    'helper.add': (el) => { const id = el.dataset.book; state.cart[id] = (state.cart[id] || 0) + 1; state.note = ''; state.undoId = ''; paint(['books', 'cart']); },
    'helper.less': (el) => { const id = el.dataset.book; state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1); paint(['books', 'cart']); },
    'helper.clear': () => { state.cart = {}; state.note = ''; paint(['books', 'cart']); },
    'helper.charge': (el) => charge(el.dataset.method),
    'helper.undo': () => undoLast(),
    'helper.search': (el) => { state.search = el.value; paint(['books']); },
    'helper.fair': (el) => { state.fair = el.value.replace(/\s+/g, ' ').trim().slice(0, 80); saveFair(state.fair, localDay()); },
    'helper.signOut': () => api.signOut(),
  });
}

/**
 * Shows the helper's till in place of the app. `watchMenu`, `watchMySales`, `addSale` and `cancelSale` are
 * firebase.js's _fbWatchFairMenu, _fbWatchMyFairSales, _fbAddFairSale and _fbCancelFairSale; `signOut` signs out.
 */
function showFairHelperView({ email, watchMenu, watchMySales, addSale, cancelSale, signOut }) {
  api = { addSale, cancelSale, signOut };
  state.email = String(email || '').toLowerCase();
  state.fair = readFair(localDay());
  for (const id of ['pw-gate', 'pw-app']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  root().innerHTML = frameHtml(state.email, state.fair);
  registerHelperActions();
  paint();
  watchMenu((menu) => { state.menu = menu || { books: [] }; state.menuFailed = false; paint(['books', 'cart']); },
    () => { if (!state.menu) { state.menuFailed = true; paint(['books']); } });
  watchMySales(state.email, (docs) => { state.sales = docs; paint(['sync', 'books', 'today']); }, () => {});
  window.addEventListener('online', () => paint(['sync']));
  window.addEventListener('offline', () => paint(['sync']));
}

export { booksHtml, cartHtml, showFairHelperView, syncHtml, todayHtml };
