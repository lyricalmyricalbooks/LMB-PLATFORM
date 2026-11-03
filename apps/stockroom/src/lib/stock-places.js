// Stock in more than one place (plan 12.16, 3 November 2026): a studio and a market stall, say.
//
// A book's state keeps `places`, a map of place name to a count, carved out of the copies the press holds itself
// (`publisherOnHand` in lib/inventory.js, which is on hand minus the copies an author holds). Whatever is not in a
// named place is at "Main". Nothing here changes how many copies there are, what was sold or any tax figure:
//   - the total on hand is still `deriveOnHand`, from the sales ledger, exactly as before;
//   - a sale lowers the total, so Main goes down first; named places only shrink when Main is empty (see
//     `derivePlaces`), so no sale or void needs to know about places;
//   - a move writes one row to `placeMoves` and changes `places`, and nothing else.
// A book with no `places` behaves exactly as it always did: `derivePlaces` reports everything at Main.
import { deriveStockBreakdown } from './inventory.js';

export const MAIN_PLACE = 'Main';
export const PLACE_NAME_MAX = 40;
export const MAX_PLACES = 12;

/** A place name the way it is kept: trimmed, single spaces, at most 40 characters. '' when nothing is left. */
export function cleanPlaceName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, PLACE_NAME_MAX).trim();
}

const sameName = (a, b) => cleanPlaceName(a).toLowerCase() === cleanPlaceName(b).toLowerCase();
export const isMain = (name) => sameName(name, MAIN_PLACE);

const wholeCount = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Where the press's own copies are. Named places are filled in the order they were made, each limited to what is left
 * of the press's copies, so the counts always add up to `publisherOnHand` (Main holds the rest).
 * @returns {{ totalOnHand: number, publisherOnHand: number, authorHeld: number, main: number, places: { name: string, qty: number }[] }}
 */
export function derivePlaces(s, book) {
  const { totalOnHand, publisherOnHand, authorHeld } = deriveStockBreakdown(s, book);
  let left = publisherOnHand;
  const places = [];
  const map = s && s.places && typeof s.places === 'object' && !Array.isArray(s.places) ? s.places : {};
  for (const name of Object.keys(map)) {
    const qty = Math.min(wholeCount(map[name]), left);
    left -= qty;
    places.push({ name, qty });
  }
  return { totalOnHand, publisherOnHand, authorHeld, main: left, places };
}

/** Every place that can hold copies, Main first, with its count. */
export function placeCounts(s, book) {
  const d = derivePlaces(s, book);
  return [{ name: MAIN_PLACE, qty: d.main }, ...d.places];
}

/** "Studio 12 · Market stall 4", or '' for a book kept in one place. Main is named only when other places exist. */
export function placeSummary(s, book) {
  const d = derivePlaces(s, book);
  if (!d.places.length) return '';
  return [{ name: MAIN_PLACE, qty: d.main }, ...d.places].filter((p) => p.qty > 0).map((p) => `${p.name} ${p.qty}`).join(' · ');
}

const find = (names, wanted) => names.find((n) => sameName(n, wanted));

/**
 * Move copies between two places ("Main" or a place name; `to` may be a new place). Changes nothing else.
 * @param {object} s  book state (changed in place)
 * @param {object} book
 * @param {{ from: string, to: string, qty: number, note?: string, isoDate?: string, now?: number }} move
 * @returns {{ ok: true, move: object } | { ok: false, error: string }}
 */
export function movePlaceStock(s, book, { from, to, qty, note = '', isoDate = '', now = Date.now() }) {
  if (!s) return { ok: false, error: 'There is no stock to move.' };
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: 'Enter a number of copies, 1 or more.' };

  const counts = placeCounts(s, book);
  const fromName = isMain(from) ? MAIN_PLACE : find(counts.map((c) => c.name), from);
  if (!fromName) return { ok: false, error: 'Choose a place to move copies from.' };
  const toClean = cleanPlaceName(to);
  if (!toClean) return { ok: false, error: 'Choose a place to move the copies to.' };
  const toName = isMain(toClean) ? MAIN_PLACE : (find(counts.map((c) => c.name), toClean) || toClean);
  if (sameName(fromName, toName)) return { ok: false, error: 'Choose two different places.' };

  const have = counts.find((c) => c.name === fromName).qty;
  if (n > have) return { ok: false, error: `${fromName} has ${have} ${have === 1 ? 'copy' : 'copies'}.` };

  const existing = counts.some((c) => c.name === toName);
  if (!existing && counts.length >= MAX_PLACES + 1) return { ok: false, error: `You can keep up to ${MAX_PLACES} places besides Main.` };

  // Settle the map from the clamped counts first, so what is written is what was shown.
  const next = {};
  for (const c of counts) if (c.name !== MAIN_PLACE) next[c.name] = c.qty;
  if (fromName !== MAIN_PLACE) next[fromName] -= n;
  if (toName !== MAIN_PLACE) next[toName] = (next[toName] || 0) + n;
  s.places = next;

  const row = {
    id: 'pm_' + now + '_' + Math.random().toString(36).slice(2, 7),
    date: (isoDate && isoDate.slice(0, 10)) || new Date(now).toISOString().slice(0, 10),
    from: fromName, to: toName, qty: n, note: String(note || '').trim().slice(0, 200),
  };
  if (!Array.isArray(s.placeMoves)) s.placeMoves = [];
  s.placeMoves.push(row);
  return { ok: true, move: row };
}

/** Close a place: its copies go back to Main and the place is forgotten. Records a move when it held copies. */
export function removePlace(s, book, name) {
  const counts = placeCounts(s, book);
  const found = find(counts.map((c) => c.name).filter((n) => n !== MAIN_PLACE), name);
  if (!found) return { ok: false, error: 'There is no such place.' };
  const held = counts.find((c) => c.name === found).qty;
  if (held > 0) {
    const r = movePlaceStock(s, book, { from: found, to: MAIN_PLACE, qty: held, note: `Closed ${found}` });
    if (!r.ok) return r;
  }
  const next = { ...(s.places || {}) };
  delete next[found];
  s.places = next;
  return { ok: true };
}
