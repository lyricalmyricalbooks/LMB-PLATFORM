// The fair helper's till (docs/combined-admin.md › Fair helpers plan, step 3).
//
// Someone the shop's owner gave the "fairHelper" role on the Team signs in at the stockroom's address and sees only
// this: the till's books and prices (fairTill/menu, kept by the owner's stockroom), a cart, the ways of paying, and
// the sales they rang up today. A sale goes into the inbox (fairSales) and the owner's stockroom brings it into the
// books (features/fair-helpers.js). With no signal a sale waits on this phone, in Firestore's own queue, and goes
// when the signal comes back; the screen says how many are waiting. Nothing else of the press is read or written.
import { escapeHtml } from '../lib/html.js';
import { words } from '../lib/shop-words.js';
import { registerActions } from '../lib/actions.js';
import { FAIR_METHODS, FAIR_UNDO_MS } from '../lib/fair-mode.js';
import { helperCopiesLeft, helperDay, helperSaleDoc, newSaleId } from '../lib/fair-helper.js';
import '../styles/fair-helper-view.css';

const FAIR_KEY = 'lm-helper-fair';
const SHOWN_LIMIT = 60;

const state = { email: '', menu: null, sales: [], cart: {}, search: '', fair: '', menuFailed: false, note: '', undoId: '', qr: null };
let undoTimer = null;
let qrTimer = null;
// How often the till asks whether a QR payment went through, and for how long (the code stops working at 30 minutes).
const QR_CHECK_MS = 3000;
const QR_LIFE_MS = 30 * 60 * 1000;
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
        <p class="section-subcopy">Signed in as ${escapeHtml(email)}. ${words("The sales you ring up here go straight to the press's stockroom.")}</p>
      </div>
      <button class="btn sm" data-action="helper.signOut">Sign out</button>
    </div>
    <div id="fh-sync" class="fh-sync" role="status"></div>
    <div class="form-group fh-field"><label for="fh-fair">Today's fair</label>
      <input id="fh-fair" type="text" maxlength="80" placeholder="${words('e.g. Harbour Book Fair')}" value="${escapeHtml(fair)}" data-on-change="helper.fair" autocomplete="off"></div>
    <div class="fh-layout">
      <section class="fh-books-col" aria-label="${words('Books')}">
        <div class="form-group fh-field"><label for="fh-search">${words('Find a book')}</label>
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
  if (!menu.books?.length) return '<div class="empty-state"><div class="e-icon">📚</div>' + words("No books on the till yet. The press's owner adds them by opening their stockroom.") + '</div>';
  if (!books.length) return `<div class="empty-state">${words('No book matches')} “${escapeHtml(search)}”.</div>`;
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
function cartHtml(menu, cart, note = '', canUndo = false, cardPay = false) {
  const byId = new Map((menu?.books || []).map((b) => [b.id, b]));
  const lines = Object.entries(cart).filter(([id, qty]) => qty > 0 && byId.has(id));
  const head = '<h2 class="fh-h">This sale</h2>';
  const undo = canUndo ? ' <button type="button" class="btn sm fh-undo" data-action="helper.undo">Undo</button>' : '';
  const noteHtml = note ? `<p class="fh-done" role="status">${escapeHtml(note)}${undo}</p>` : '';
  if (!lines.length) return `${head}${noteHtml}<p class="fh-note">${words('Tap a book to add it.')}</p>`;
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
  // On the plan with both apps, QR / Stripe shows a payment code the customer pays by card (startCardPay).
  const pay = FAIR_METHODS.map((m) => {
    const action = cardPay && m.value === 'Stripe QR' ? 'helper.qr' : 'helper.charge';
    return `<button type="button" class="btn fh-pay" data-action="${action}" data-method="${escapeHtml(m.value)}"><span aria-hidden="true">${m.icon}</span> ${escapeHtml(m.label)}</button>`;
  }).join('');
  return `${head}<ul class="fh-lines">${rows}</ul>
    <p class="fh-total">Total <strong class="tnum">${escapeHtml(totalsText(totals))}</strong></p>
    <p class="fh-label">How did they pay?</p>
    <div class="fh-pay-row">${pay}</div>
    <button type="button" class="btn sm fh-clear" data-action="helper.clear">Clear this sale</button>`;
}

/**
 * A card payment by QR in progress: the code for the customer to scan, and what the till is waiting for. `qr` is
 * { status: 'starting' | 'waiting' | 'offline' | 'failed', amount, currency, message }. Pure.
 */
function qrHtml(qr) {
  const head = '<h2 class="fh-h">Card payment by QR</h2>';
  const cancel = '<button type="button" class="btn sm fh-clear" data-action="helper.qrCancel">Cancel and choose another way</button>';
  if (qr.status === 'starting') return `${head}<p class="fh-note" role="status">Making the payment code…</p>${cancel}`;
  if (qr.status === 'failed') return `${head}<p class="fh-qr-problem" role="alert">${escapeHtml(qr.message || 'The payment code couldn\'t be made.')}</p>${cancel}`;
  const amount = Number.isFinite(qr.amount) ? money(qr.amount / 100, qr.currency) : '';
  const wait = qr.status === 'offline'
    ? '<p class="fh-qr-wait" role="status">⚠ No signal, so the till can\'t check the payment yet. Keep this open: it checks again when the signal is back.</p>'
    : '<p class="fh-qr-wait" role="status"><span class="spinner" aria-hidden="true"></span> Waiting for the payment. The sale is recorded by itself once it goes through.</p>';
  return `${head}
    <p class="fh-total">To pay <strong class="tnum">${escapeHtml(amount)}</strong></p>
    <p class="fh-note">Ask the customer to scan this with their phone's camera and pay by card.</p>
    <div class="fh-qr-code" id="fh-qr-code" role="img" aria-label="Payment code for ${escapeHtml(amount)}"></div>
    ${qr.test ? '<p class="fh-note">Test mode: the shop is taking practice payments only.</p>' : ''}
    ${wait}${cancel}`;
}

/**
 * The end-of-day count: what came in each way of paying, with the cash the helper should hand the owner first.
 * Nothing when nothing was kept today. Pure.
 */
function countHtml(day) {
  if (!day.kept) return '';
  const order = ['Cash', ...FAIR_METHODS.map((m) => m.value).filter((v) => v !== 'Cash')];
  const rows = order.filter((m) => day.byMethod?.[m]).map((m) => {
    const label = m === 'Cash' ? 'Cash to hand over' : FAIR_METHODS.find((x) => x.value === m)?.label || m;
    return `<li class="fh-count-row${m === 'Cash' ? ' is-cash' : ''}"><span>${escapeHtml(label)}</span><strong class="tnum">${escapeHtml(totalsText(day.byMethod[m]))}</strong></li>`;
  }).join('');
  return `<details class="fh-count"><summary>End of day: count the cash</summary>
    <ul class="fh-count-list">${rows}</ul>
    <p class="fh-note">Count the cash box against the first line, then hand it to the press's owner.</p></details>`;
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
  const summary = day.kept ? `${words(plural(day.units, 'book', 'books'))} in ${plural(day.kept, 'sale', 'sales')} · ${escapeHtml(totalsText(day.totals))}` : 'No sales kept today';
  return `${head}<p class="fh-day tnum">${summary}</p>
    ${countHtml(day)}
    <ul class="fh-sales">${rows}</ul>
    <p class="fh-note">${words("Rang one up by mistake? Tap Undo straight after the sale. Later, tell the press's owner: they can void it in their stockroom.")}</p>`;
}

function paint(parts = ['sync', 'books', 'cart', 'today']) {
  const today = localDay();
  const day = helperDay(state.sales, today);
  const left = helperCopiesLeft(state.menu, state.sales);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (parts.includes('sync')) set('fh-sync', syncHtml(day, navigator.onLine !== false));
  if (parts.includes('books')) set('fh-books', booksHtml(state.menu, state.search, left, state.cart, state.menuFailed));
  if (parts.includes('cart')) {
    set('fh-cart', state.qr ? qrHtml(state.qr) : cartHtml(state.menu, state.cart, state.note, !!state.undoId, !!api?.cardPay));
    if (state.qr?.url) drawQr(state.qr.url);
  }
  if (parts.includes('today')) set('fh-today', todayHtml(day));
}

const cartLines = () => Object.entries(state.cart).filter(([, qty]) => qty > 0).map(([bookId, qty]) => ({ bookId, qty }));

/** The payment code, drawn with the QR library the stockroom page already loads (index.html qrcodejs). */
function drawQr(url) {
  const box = document.getElementById('fh-qr-code');
  if (!box || box.dataset.url === url) return;
  box.dataset.url = url;
  box.innerHTML = '';
  const QR = window.QRCode;
  if (typeof QR !== 'function') { box.innerHTML = `<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open the payment page</a>`; return; }
  new QR(box, { text: url, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.M });
}

function stopQrChecks() {
  clearTimeout(qrTimer);
  qrTimer = null;
}

/** QR / Stripe: the server prices the sale from the menu and opens a card checkout; the sale is recorded once it's paid. */
async function startCardPay() {
  const lines = cartLines();
  if (!lines.length || state.qr) return;
  const id = newSaleId();
  state.qr = { id, lines, status: 'starting', startedAt: Date.now() };
  state.note = '';
  paint(['cart']);
  let answer;
  try {
    answer = await api.cardPay('start', { saleId: id, lines });
  } catch (e) {
    answer = { error: navigator.onLine === false ? 'No signal, so a payment code can\'t be made. Use the card reader or cash.' : (e?.message || '') };
  }
  if (state.qr?.id !== id) return; // cancelled meanwhile
  if (!answer?.url) {
    state.qr = { ...state.qr, status: 'failed', message: answer?.error || 'The payment code couldn\'t be made. Use the card reader or cash.' };
    paint(['cart']);
    return;
  }
  state.qr = { ...state.qr, status: 'waiting', url: answer.url, sessionId: answer.sessionId, amount: answer.amount, currency: answer.currency, test: !!answer.test };
  paint(['cart']);
  checkCardPay(id);
}

async function checkCardPay(id) {
  stopQrChecks();
  const qr = state.qr;
  if (!qr || qr.id !== id || !qr.sessionId) return;
  let answer = null;
  try { answer = await api.cardPay('status', { sessionId: qr.sessionId }); } catch (_) { answer = null; }
  if (state.qr?.id !== id) return;
  if (answer?.paid) {
    const lines = state.qr.lines;
    state.qr = null;
    charge('Stripe QR', { id, lines });
    return;
  }
  if (answer && answer.open === false) {
    state.qr = { ...state.qr, status: 'failed', message: 'The payment code ran out before it was paid. Cancel, then try again or use another way.' };
    paint(['cart']);
    return;
  }
  if (Date.now() - qr.startedAt > QR_LIFE_MS) {
    state.qr = { ...state.qr, status: 'failed', message: 'The payment code ran out. Cancel, then try again.' };
    paint(['cart']);
    return;
  }
  const status = answer ? 'waiting' : 'offline';
  if (state.qr.status !== status) { state.qr = { ...state.qr, status }; paint(['cart']); }
  qrTimer = setTimeout(() => checkCardPay(id), QR_CHECK_MS);
}

function cancelCardPay() {
  const qr = state.qr;
  stopQrChecks();
  state.qr = null;
  // The cart stays as it was, so another way of paying is one tap.
  if (qr?.sessionId) api.cardPay('cancel', { sessionId: qr.sessionId }).catch(() => {});
  paint(['cart']);
}

function charge(method, { id = newSaleId(), lines = null } = {}) {
  const day = localDay();
  const cart = lines || cartLines();
  const made = helperSaleDoc({ id, by: state.email, day, fair: state.fair, method, cart }, state.menu);
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
    'helper.add': (el) => { if (state.qr) return; const id = el.dataset.book; state.cart[id] = (state.cart[id] || 0) + 1; state.note = ''; state.undoId = ''; paint(['books', 'cart']); },
    'helper.less': (el) => { if (state.qr) return; const id = el.dataset.book; state.cart[id] = Math.max(0, (state.cart[id] || 0) - 1); paint(['books', 'cart']); },
    'helper.clear': () => { state.cart = {}; state.note = ''; paint(['books', 'cart']); },
    'helper.charge': (el) => charge(el.dataset.method),
    'helper.undo': () => undoLast(),
    'helper.qr': () => { startCardPay(); },
    'helper.qrCancel': () => cancelCardPay(),
    'helper.search': (el) => { state.search = el.value; paint(['books']); },
    'helper.fair': (el) => { state.fair = el.value.replace(/\s+/g, ' ').trim().slice(0, 80); saveFair(state.fair, localDay()); },
    'helper.signOut': () => api.signOut(),
  });
}

/**
 * Shows the helper's till in place of the app. `watchMenu`, `watchMySales`, `addSale` and `cancelSale` are
 * firebase.js's _fbWatchFairMenu, _fbWatchMyFairSales, _fbAddFairSale and _fbCancelFairSale; `signOut` signs out.
 * `cardPay(action, body)` asks the shop's server for a card payment by QR (plan with both apps only; without it,
 * QR / Stripe just records the sale, as before).
 */
function showFairHelperView({ email, watchMenu, watchMySales, addSale, cancelSale, signOut, cardPay = null }) {
  api = { addSale, cancelSale, signOut, cardPay };
  state.email = String(email || '').toLowerCase();
  state.fair = readFair(localDay());
  for (const id of ['pw-gate', 'pw-app']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  root().innerHTML = frameHtml(state.email, state.fair);
  registerHelperActions();
  paint();
  watchMenu((menu) => { state.menu = menu || { books: [] }; state.menuFailed = false; paint(['books', 'cart']); },
    () => { if (!state.menu) { state.menuFailed = true; paint(['books']); } });
  watchMySales(state.email, (docs) => { state.sales = docs; paint(['sync', 'books', 'today']); }, () => {});
  window.addEventListener('online', () => { paint(['sync']); if (state.qr?.sessionId) checkCardPay(state.qr.id); });
  window.addEventListener('offline', () => paint(['sync']));
}

export { booksHtml, cartHtml, qrHtml, showFairHelperView, syncHtml, todayHtml };
