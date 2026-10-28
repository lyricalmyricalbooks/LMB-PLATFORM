// Set up your stockroom (code plan 6.9): a five-step guide at the top of All Books for a press whose plan is the
// stockroom alone. The shop's guide lives in the shop's admin; a press with both apps sees that one, so this shows
// only when the profile the page opened with names the stockroom and not the shop. Pure: the caller passes plain facts
// and the saved ticks, and gets the steps and their HTML. The ticks and "hidden" live in this browser (localStorage)
// because every step but one is worked out from the books themselves.
import { escapeHtml as esc } from './html.js';

export const GUIDE_KEY = 'stockroom-setup-guide';

const STEPS = [
  { id: 'books', title: 'Add your first book', why: 'Add each title with its price and print run. Its stock count, sales and bookshops all follow from here.', tab: 'sheets', action: 'Add a book' },
  { id: 'stock', title: 'Count your stock', why: 'Type how many copies you printed, so the stockroom knows what you have on hand.', tab: 'sheets', action: 'Open books' },
  { id: 'sale', title: 'Record your first sale', why: 'Ring up a sale on the register, at a fair or by hand. Stock comes off as you sell.', tab: 'pos', action: 'Open the register' },
  { id: 'store', title: 'Add a bookshop that stocks you', why: 'Note the copies you left with a bookshop, and what they owe you comes out of each sale they report.', tab: 'consignment', action: 'Open bookshops' },
  { id: 'phone', title: 'Put the stockroom on your phone', why: "Open this page on your phone and choose Add to Home Screen. It works at fairs with no signal and catches up when you're back online.", manual: true },
];

/** Whether this stockroom shows the guide: a stockroom-only plan's own profile (never the built-in one). */
export function guideApplies(profile, builtIn) {
  return !!profile && profile !== builtIn && profile.apps?.stockroom === true && profile.apps?.shop === false;
}

/**
 * facts: { books: [{ maxPrint }], states: { [id]: { hist, stores } } }; saved: { done: { [id]: when }, hiddenAt }.
 * Returns the five steps with `done`.
 */
export function guideSteps({ books = [], states = {} } = {}, saved = {}) {
  const list = books.filter(Boolean);
  const stateOf = (b) => states[b.id] || {};
  const auto = {
    books: list.length > 0,
    stock: list.some((b) => Number(b.maxPrint) > 0),
    sale: list.some((b) => (stateOf(b).hist || []).length > 0),
    store: list.some((b) => (stateOf(b).stores || []).length > 0),
  };
  return STEPS.map((s) => ({ ...s, done: s.manual ? !!saved?.done?.[s.id] : !!auto[s.id] }));
}

export function showGuide(steps, saved = {}) {
  return !saved?.hiddenAt && steps.some((s) => !s.done);
}

/** Reads the saved ticks; a blocked or broken store reads as nothing saved. */
export function readGuide(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(GUIDE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function writeGuide(saved, storage = globalThis.localStorage) {
  try { storage?.setItem(GUIDE_KEY, JSON.stringify(saved)); return true; } catch { return false; }
}

/** The card. Its buttons name actions (lib/actions.js), registered in main.js: guide.open, guide.tick, guide.hide. */
export function guideHtml(steps) {
  const done = steps.filter((s) => s.done).length;
  const rows = steps.map((s, i) => `
    <li class="setup-guide-step${s.done ? ' is-done' : ''}">
      <span class="setup-guide-num" aria-hidden="true">${s.done ? '✓' : i + 1}</span>
      <div class="setup-guide-text">
        <strong>${esc(s.title)}</strong>${s.done ? '<span class="sr-only"> (done)</span>' : ''}
        ${s.done ? '' : `<p>${esc(s.why)}</p>`}
      </div>
      ${s.done ? '' : `<div class="setup-guide-actions">${s.tab ? `<button type="button" class="btn sm" data-action="guide.open" data-tab="${esc(s.tab)}">${esc(s.action)}</button>` : ''}${s.manual ? `<button type="button" class="btn sm" data-action="guide.tick" data-id="${esc(s.id)}">Mark done</button>` : ''}</div>`}
    </li>`).join('');
  return `<section class="overview-section setup-guide" aria-labelledby="setup-guide-title">
    <div class="sec-head">
      <div class="sec-head-titles">
        <div class="sec-kicker"><span class="sec-kicker-dot"></span>${done} of ${steps.length} done</div>
        <h2 class="section-hed sec-head-title" id="setup-guide-title">Set up your stockroom</h2>
        <p class="section-subcopy">Five steps from your first book to selling at your next fair. Most tick themselves.</p>
      </div>
      <button type="button" class="btn sm" data-action="guide.hide">Hide this guide</button>
    </div>
    <ol class="setup-guide-list">${rows}</ol>
  </section>`;
}
