// Stock counts for another shop system (plan 7.19): Backups › "Stock counts for another shop system".
//
// Pure: books and their states in, a spreadsheet out. It uses the inventory layout most shop systems read, one line
// per book and place: Handle, Title, Option1 Name, Option1 Value, SKU, Location, On hand (new). Source: "Exporting or
// importing inventory with a CSV file", https://help.shopify.com/en/manual/products/inventory/inventory-csv
// (docs/research/2026-10-28-next-build-plan.md › Moving in, [S15]). "On hand (new)" is the column that sets the count
// there. "On hand (current)" is left out on purpose: a system skips a line whose current count doesn't match its own,
// and a shop the press is moving into starts at 0.
//
// The copies on hand are split the way the app shows them: the press's own copies at one place, and the copies an
// author is holding at a second place, "With the author", only when there are any. Copies out on consignment are at
// the stores, not on hand, so they stay out. The press's words never name another system.
//
// Handle and the edition columns match the shop's "Books for another shop system" file (apps/shop/src/app/admin/
// shopExport.ts): the handle is the title in lower case with dashes, and a book with no editions is "Title" /
// "Default Title". A shop book given its own web address in the shop's editor has that address as its handle there,
// so the press may need to match those few by hand.
import { csvRow } from './csv.js';
import { deriveStockBreakdown } from './inventory.js';

export const STOCK_LOCATION_HEADINGS = ['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'SKU', 'Location', 'On hand (new)'];

export const AUTHOR_LOCATION = 'With the author';

/** The title as a web address part ("Moths of the North" → "moths-of-the-north"), as shopExport.ts makes it. */
export function handleOf(title, fallback = 'book') {
  return String(title || fallback).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'book';
}

const skuOf = (book) => {
  const sku = String(book?.sku || '').trim();
  if (sku) return sku;
  const isbn = String(book?.isbn || '').trim();
  return isbn && isbn !== '—' ? isbn : '';
};

/**
 * @param {Array<{ book: object, state: object }>} entries  every real book (test books already left out)
 * @param {{ location?: string }} [opts]  the name of the press's own place
 * @returns {string}
 */
export function stockLocationsCsv(entries, { location = 'Main location' } = {}) {
  const lines = [csvRow(STOCK_LOCATION_HEADINGS)];
  const used = new Set();
  for (const { book, state } of entries || []) {
    if (!book) continue;
    let handle = handleOf(book.title, book.id);
    for (let n = 2; used.has(handle); n++) handle = `${handleOf(book.title, book.id)}-${n}`;
    used.add(handle);
    const { publisherOnHand, authorHeld } = deriveStockBreakdown(state || {}, book);
    const row = (place, count) => csvRow([handle, book.title || '', 'Title', 'Default Title', skuOf(book), place, Math.max(0, Math.floor(count) || 0)]);
    lines.push(row(location, publisherOnHand));
    if (authorHeld > 0) lines.push(row(AUTHOR_LOCATION, authorHeld));
  }
  return lines.join('\n') + '\n';
}
