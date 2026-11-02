// Your stockroom is ready (code plan 17.12): a one-screen check a press with both apps (a shop and a stockroom) sees the
// first time its stockroom opens, above All Books. The platform's setup has already turned the shop-to-stockroom link on
// (setup step 16), so this says what the stockroom holds and that the shop's sales come here. The five-step guide stays
// for stockroom-only presses (setup-guide.js). Pure: which screen shows, the plain sentences it states, its HTML.
// Hiding it is remembered in this browser (localStorage), as the guide's is.
import { escapeHtml as esc } from './html.js';

export const READY_KEY = 'stockroom-ready-check';

/** Shows for a press whose profile names both the shop and the stockroom (never the built-in profile). */
export function readyApplies(profile, builtIn) {
  return !!profile && profile !== builtIn && profile.apps?.stockroom === true && profile.apps?.shop === true;
}

/** The plain sentences the screen says, from the books the stockroom holds. Each is a full sentence. */
export function readyLines(books = []) {
  const list = (books || []).filter(Boolean);
  const titles = list.length;
  const inStock = list.filter((b) => Number(b.maxPrint) > 0).length;
  const lines = [];
  if (titles === 0) {
    lines.push('Your stockroom has no books yet. Add them here, or bring them over when you set up your shop, and they appear in this list.');
  } else {
    lines.push(`Your stockroom holds ${titles} ${titles === 1 ? 'title' : 'titles'}${inStock ? `, and ${inStock} ${inStock === 1 ? 'has' : 'have'} copies counted` : ''}.`);
  }
  lines.push("Your shop's sales are linked to this stockroom, so each sale counts down the stock here.");
  return lines;
}

/** Whether the screen is still to show: not hidden in this browser. */
export function showReady(saved = {}) {
  return !saved?.hiddenAt;
}

/** Reads the saved state; a blocked or broken store reads as nothing saved. */
export function readReady(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(READY_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function writeReady(saved, storage = globalThis.localStorage) {
  try { storage?.setItem(READY_KEY, JSON.stringify(saved)); return true; } catch { return false; }
}

/** The screen: its sentences, and two buttons named by action (main.js registers ready.open and ready.hide). */
export function readyHtml(lines) {
  const items = lines.map((line) => `<li>${esc(line)}</li>`).join('');
  return `<section class="overview-section stockroom-ready" aria-labelledby="stockroom-ready-title">
    <div class="overview-section-head">
      <div>
        <h2 class="section-hed sec-head-title" id="stockroom-ready-title">Your stockroom is ready</h2>
        <p class="section-sub">Your shop and your stockroom are linked. Here is where things stand.</p>
      </div>
      <button type="button" class="btn sm" data-action="ready.hide">Got it</button>
    </div>
    <ul class="stockroom-ready-list">${items}</ul>
    <div class="setup-guide-actions"><button type="button" class="btn sm" data-action="ready.open" data-tab="sheets">Open books</button></div>
  </section>`;
}
