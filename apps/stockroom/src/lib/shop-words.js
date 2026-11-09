// The stockroom's words for what the shop sells (plan 10.23, 29 October 2026).
//
// The stockroom is written for books. A shop whose sign-up answer to "What do you sell?" isn't a book answer (the shop
// profile's `sells`, written by setup) reads "product" and "maker" instead of "book" and "author". The same swaps as
// the shop's admin (apps/shop/src/app/admin/sells.ts goodsWords). A books shop, a profile with no answer or an answer
// this version doesn't know keeps every word as it is.
//
// Two ways in: `words(text)` for messages built in code, and `applyPageWords(root)` once at start-up for the page's
// own text (index.html holds no owner data, so a product the owner named "Sketch book" is never touched).

import { shopProfile } from './shop-profile.js';

/** The sign-up answers (signup/form.js PUBLISHES), in the form's order. */
export const SELLS = Object.freeze(['books', 'zines', 'comics', 'prints', 'mix', 'mixed', 'clothing', 'shoes', 'jewelry', 'music', 'other']);
const BOOK_ANSWERS = new Set(['books', 'zines', 'comics', 'mix']);

/** True for a shop that sells books: a book answer, no answer, or one this version doesn't know. */
export function sellsBooks(answer) {
  return !answer || BOOK_ANSWERS.has(answer) || !SELLS.includes(answer);
}

// "an author" first, so it becomes "a maker", not "an maker"; a book fair is a market.
const SWAPS = [
  [/\ban author\b/g, 'a maker'], [/\bAn author\b/g, 'A maker'],
  [/\bBook [Ff]airs\b/g, 'Markets'], [/\bBook [Ff]air\b/g, 'Market'], [/\bbook fairs\b/g, 'markets'], [/\bbook fair\b/g, 'market'],
  [/(?<![-\w])books\b/g, 'products'], [/(?<![-\w])Books\b/g, 'Products'], [/(?<![-\w])BOOKS\b/g, 'PRODUCTS'],
  [/(?<![-\w])book\b/g, 'product'], [/(?<![-\w])Book\b/g, 'Product'], [/(?<![-\w])BOOK\b/g, 'PRODUCT'],
  [/\bauthors\b/g, 'makers'], [/\bAuthors\b/g, 'Makers'], [/\bauthor\b/g, 'maker'], [/\bAuthor\b/g, 'Maker'],
  // Counting and making words (4 November 2026), as in the shop's admin: copies are items, titles are products, readers
  // are shoppers (screen readers and page titles stay), a print run is a batch and a printing cost a making cost.
  [/\bcopies\b/g, 'items'], [/\bCopies\b/g, 'Items'],
  [/(?<!(?:page|SEO|search|tab|meta) )\btitles\b/g, 'products'], [/(?<!(?:Page|SEO|Search|Tab|Meta) )\bTitles\b/g, 'Products'],
  [/(?<![Ss]creen )\breaders\b/g, 'shoppers'], [/(?<![Ss]creen )\breader\b/g, 'shopper'], [/\bReaders\b/g, 'Shoppers'], [/\bReader\b/g, 'Shopper'],
  [/\bprint runs\b/g, 'batches'], [/\bprint run\b/g, 'batch'], [/\bPrint runs\b/g, 'Batches'], [/\bPrint [Rr]un\b/g, 'Batch'],
  [/\bprinting costs?\b/g, 'making cost'], [/\bPrinting costs?\b/g, 'Making cost'],
  [/\bbookshops\b/g, 'stores'], [/\bBookshops\b/g, 'Stores'], [/\bbookshop\b/g, 'store'], [/\bBookshop\b/g, 'Store'],
  [/\b(\d+) title\b/g, '$1 product'],
  [/\bthe press's\b/g, "the shop's"], [/\bThe press's\b/g, "The shop's"], [/\byour press's\b/g, "your shop's"],
];

/** "Add new book" → "Add new product", "author" → "maker". */
export function goodsWords(text) {
  return SWAPS.reduce((out, [from, to]) => out.replace(from, to), String(text));
}

// A shop with no books at all keeps its products' codes in the ISBN box (the website link sends a product's SKU there,
// shop functions/inventoryLink.js codeOf), so the box and the words about it say SKU. A shop of books and other things
// keeps "ISBN": its books have one.
const CODE_SWAPS = [
  [/\bISBN or SKU\b/g, 'SKU'], [/\bISBN, SKU\b/g, 'SKU'], [/\bISBN-13\b/g, 'SKU or barcode'],
  [/978-X-XXXX-XXXX-X/g, 'e.g. TEE-BLK-M'], [/\bISBNs\b/g, 'SKUs'], [/\bISBN\b/g, 'SKU'],
];

/** goodsWords for a shop with no books at all: ISBN is SKU too. */
export function noBookWords(text) {
  return CODE_SWAPS.reduce((out, [from, to]) => out.replace(from, to), goodsWords(text));
}

const same = (text) => text;

/** The word function for a sign-up answer: unchanged for a books shop; "mixed" (books and other things) keeps ISBN. */
export function wordsFor(answer) {
  if (sellsBooks(answer)) return same;
  return answer === 'mixed' ? goodsWords : noBookWords;
}

// What the owner chose later in the shop's Settings › What you sell (plan 12.14). The shop's server copies it into the
// stockroom's settings (`settings/sells`); this device keeps the last one it saw so the page starts in the right words.
export const SELLS_KEY = 'lm-sells';
function storedSells() {
  try { return globalThis.localStorage?.getItem(SELLS_KEY) || null; } catch { return null; }
}
/** What this shop sells: the owner's later answer when this device has seen one, else the profile's. */
export function currentAnswer(profile = shopProfile, stored = storedSells()) {
  return (SELLS.includes(stored) ? stored : null) || profile?.sells;
}

/** This shop's words. */
export const words = wordsFor(currentAnswer());

/**
 * Called once signed in with the owner's answer from the stockroom's settings. When it names different words than the page
 * started with, the device keeps it and the caller reloads once, so the page starts in the new words from the top (the
 * page's text is rewritten in place and can't be turned back). Returns true when a reload is needed.
 */
export function noteSellsAnswer(answer, profile = shopProfile) {
  if (!SELLS.includes(answer)) return false;
  const was = currentAnswer(profile);
  if (answer === was) return false;
  try { globalThis.localStorage?.setItem(SELLS_KEY, answer); } catch { return false; }
  // Books answers share one set of words, a mix of books and other things another and the rest a third, so only a move
  // between sets needs a fresh start.
  return wordsFor(answer) !== wordsFor(was);
}

// Words that name something real whatever the shop sells: a tax expense category.
const KEEP = new Set(['Books, Research & Reference']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TEMPLATE', 'CODE', 'PRE']);
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'data-tip'];

/**
 * Puts the page's own words in this shop's words. An `<option>` with no `value` is saved by its text, so it gets its
 * old text as its `value` first and what the app stores never changes. `[data-keep-words]` keeps a part as written.
 */
export function applyPageWords(root, w = words) {
  if (w === same || !root) return;
  const doc = root.ownerDocument || root;
  const keep = (el) => !!el.closest?.('[data-keep-words]');
  const walker = doc.createTreeWalker(root, 1 /* SHOW_ELEMENT */);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el.nodeType !== 1 || SKIP.has(el.tagName) || keep(el)) continue;
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value) el.setAttribute(name, w(value));
    }
    if (el.tagName === 'OPTION') {
      const text = el.textContent;
      if (KEEP.has(text.trim())) continue;
      if (!el.hasAttribute('value')) el.setAttribute('value', text);
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.nodeValue.trim() && !KEEP.has(node.nodeValue.trim())) {
        const next = w(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }
    }
  }
}

export const ACK_KEY = 'lm-sells-ack';
/**
 * The words this page is showing, when the shop should be told (once per change): the owner's answer is on this device
 * and the shop hasn't heard it from here yet. null when there is nothing to say.
 */
export function wordsToReport(profile = shopProfile) {
  let stored = null; let acked = null;
  try { stored = globalThis.localStorage?.getItem(SELLS_KEY); acked = globalThis.localStorage?.getItem(ACK_KEY); } catch { return null; }
  if (!SELLS.includes(stored) || stored === acked) return null;
  return currentAnswer(profile) === stored ? stored : null;
}
export function wordsReported(answer) {
  try { globalThis.localStorage?.setItem(ACK_KEY, answer); } catch { /* the shop is told again next time */ }
}
