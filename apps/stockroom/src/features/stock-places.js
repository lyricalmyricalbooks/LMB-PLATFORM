// Stock in more than one place (plan 12.16): the "Move between places" pop-up on the book's dashboard.
// The rules live in lib/stock-places.js; this is the DOM around them. Nothing runs at module load.
import { BOOKS, states, activeBook } from '../core/store.js';
import { openM, closeM, attemptCloseModal } from '../lib/modal.js';
import { registerActions } from '../lib/actions.js';
import { escapeHtml as esc } from '../lib/html.js';
import { placeCounts, movePlaceStock, removePlace, MAIN_PLACE, PLACE_NAME_MAX } from '../lib/stock-places.js';
import { $, isAuthor, saveState, showToast, today, updateAllOverview } from '../main.js';
import { updateDash } from './dashboard.js';

const NEW_PLACE = '__new__';
const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

function current() {
  if (!activeBook || activeBook === 'all' || isAuthor()) return null;
  const book = BOOKS[activeBook], s = states[activeBook];
  return book && s ? { book, s } : null;
}

function fillSelects(keepFrom, keepTo) {
  const c = current(); if (!c) return;
  const counts = placeCounts(c.s, c.book);
  const from = $('sp-from'), to = $('sp-to');
  if (from) {
    from.innerHTML = counts.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (${p.qty})</option>`).join('');
    if (keepFrom && counts.some((p) => p.name === keepFrom)) from.value = keepFrom;
  }
  if (to) {
    to.innerHTML = counts.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (${p.qty})</option>`).join('')
      + `<option value="${NEW_PLACE}">A new place…</option>`;
    to.value = keepTo && (keepTo === NEW_PLACE || counts.some((p) => p.name === keepTo))
      ? keepTo : (counts.length > 1 ? counts[1].name : NEW_PLACE);
  }
  const list = $('sp-places');
  if (list) {
    list.innerHTML = counts.filter((p) => p.name !== MAIN_PLACE).map((p) =>
      `<li><span>${esc(p.name)}: <strong>${copies(p.qty)}</strong></span> <button type="button" class="btn sm tx" data-sp-close="${esc(p.name)}" title="Move its copies back to Main and remove this place">Close</button></li>`).join('');
    list.onclick = (e) => { const b = e.target.closest && e.target.closest('[data-sp-close]'); if (b) closeStockPlace(b.getAttribute('data-sp-close')); };
  }
}

function chosen() {
  const to = $('sp-to')?.value;
  return {
    from: $('sp-from')?.value || MAIN_PLACE,
    to: to === NEW_PLACE ? ($('sp-new')?.value || '') : to,
    qty: parseInt($('sp-qty')?.value, 10) || 0,
    note: ($('sp-note')?.value || '').trim(),
  };
}

function openStockPlacesModal() {
  const c = current(); if (!c) return;
  if ($('sp-modal-title')) $('sp-modal-title').textContent = `Move between places · ${c.book.title}`;
  if ($('sp-qty')) $('sp-qty').value = 1;
  if ($('sp-note')) $('sp-note').value = '';
  if ($('sp-new')) { $('sp-new').value = ''; $('sp-new').maxLength = PLACE_NAME_MAX; }
  fillSelects();
  updateStockPlacesPreview();
  openM('stock-places');
}

function updateStockPlacesPreview() {
  const c = current(); if (!c) return;
  const toSel = $('sp-to')?.value;
  const newWrap = $('sp-new-wrap');
  if (newWrap) newWrap.style.display = toSel === NEW_PLACE ? '' : 'none';
  const { from, to, qty } = chosen();
  const preview = $('sp-preview'), btn = $('sp-submit-btn');
  const counts = placeCounts(c.s, c.book);
  const have = (counts.find((p) => p.name === from) || { qty: 0 }).qty;
  const limit = $('sp-qty-limit-label');
  if (limit) limit.textContent = `(max ${have} available)`;
  let msg = '', ok = false;
  if (qty < 1) msg = 'Enter a number of copies, 1 or more.';
  else if (qty > have) msg = `<span style="color:var(--red, #ef4444);">${esc(from)} has only ${copies(have)}.</span>`;
  else if (!String(to).trim()) msg = 'Name the new place.';
  else if (from.toLowerCase() === String(to).trim().toLowerCase()) msg = 'Choose two different places.';
  else { ok = true; msg = `<strong>Moving</strong> ${copies(qty)} from <strong>${esc(from)}</strong> to <strong>${esc(String(to).trim())}</strong>. The total on hand stays the same.`; }
  if (preview) preview.innerHTML = msg;
  if (btn) btn.disabled = !ok;
}

function stepStockPlaces(delta) {
  const input = $('sp-qty'); if (!input) return;
  input.value = Math.max(1, (parseInt(input.value, 10) || 0) + delta);
  updateStockPlacesPreview();
}

async function submitStockPlaces() {
  const c = current(); if (!c) return;
  const { from, to, qty, note } = chosen();
  const r = movePlaceStock(c.s, c.book, { from, to, qty, note, isoDate: today() });
  if (!r.ok) { showToast(r.error, 'warn'); return; }
  await saveState(activeBook);
  closeM('stock-places');
  updateDash(); updateAllOverview();
  showToast(`✓ Moved ${copies(r.move.qty)} from ${r.move.from} to ${r.move.to}`);
}

async function closeStockPlace(name) {
  const c = current(); if (!c) return;
  const r = removePlace(c.s, c.book, name);
  if (!r.ok) { showToast(r.error, 'warn'); return; }
  await saveState(activeBook);
  fillSelects(); updateStockPlacesPreview(); updateDash(); updateAllOverview();
  showToast(`✓ Closed ${name}; its copies are back in Main`);
}

/** Name the pop-up's buttons; main.js calls this once at start-up. */
function startStockPlaces() {
  registerActions({
  'places.open': () => openStockPlacesModal(),
  'places.close': () => attemptCloseModal('stock-places'),
  'places.preview': () => updateStockPlacesPreview(),
  'places.step': (el) => stepStockPlaces(parseInt(el.dataset.delta, 10) || 0),
  'places.submit': () => submitStockPlaces(),
  });
}

export { startStockPlaces, openStockPlacesModal, updateStockPlacesPreview, stepStockPlaces, submitStockPlaces, closeStockPlace };
