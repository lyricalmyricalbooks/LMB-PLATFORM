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
export const SELLS = Object.freeze(['books', 'zines', 'comics', 'prints', 'mix', 'clothing', 'shoes', 'jewelry', 'music', 'other']);
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
];

/** "Add new book" → "Add new product", "author" → "maker". */
export function goodsWords(text) {
  return SWAPS.reduce((out, [from, to]) => out.replace(from, to), String(text));
}

const same = (text) => text;

/** The word function for a sign-up answer: unchanged for a books shop. */
export function wordsFor(answer) {
  return sellsBooks(answer) ? same : goodsWords;
}

/** This shop's words. */
export const words = wordsFor(shopProfile?.sells);

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
