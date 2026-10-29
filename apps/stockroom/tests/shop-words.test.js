// The stockroom's words follow what the shop sells (plan 10.23): src/lib/shop-words.js.
import { describe, it, expect } from 'vitest';
import { applyPageWords, goodsWords, sellsBooks, wordsFor } from '../src/lib/shop-words.js';
import { parseShopProfile, DEFAULT_SHOP_PROFILE } from '../src/lib/shop-profile.js';
import { indexBody } from './helpers/load-app.js';

describe('shop words', () => {
  it('a books shop, no answer or an unknown one keeps every word', () => {
    for (const answer of [undefined, null, '', 'books', 'zines', 'comics', 'mix', 'spaceships']) {
      expect(sellsBooks(answer), String(answer)).toBe(true);
      expect(wordsFor(answer)('Add new book for an author')).toBe('Add new book for an author');
    }
  });

  it('any other answer says product and maker, with "a maker" not "an maker"', () => {
    for (const answer of ['prints', 'clothing', 'shoes', 'jewelry', 'music', 'other']) expect(sellsBooks(answer)).toBe(false);
    expect(goodsWords('Add new book')).toBe('Add new product');
    expect(goodsWords('All BOOKS, Books and books by an author. An author’s pile, Authors.'))
      .toBe('All PRODUCTS, Products and products by a maker. A maker’s pile, Makers.');
    expect(goodsWords('Book Fair, book fairs & a book fair')).toBe('Market, markets & a market');
    // Words that only look alike are left alone.
    expect(goodsWords('e-book, Facebook, notebook, bookkeeping')).toBe('e-book, Facebook, notebook, bookkeeping');
  });

  it('the shop profile carries the answer, and a badly shaped one is left out without refusing the profile', () => {
    expect(parseShopProfile({ ...DEFAULT_SHOP_PROFILE, sells: 'clothing' }).sells).toBe('clothing');
    const odd = parseShopProfile({ ...DEFAULT_SHOP_PROFILE, sells: 'Clothing!' });
    expect(odd).not.toBe(null);
    expect('sells' in odd).toBe(false);
  });

  it('rewrites the page’s words but never what the app saves', () => {
    document.body.innerHTML = `
      <h2 title="Book picker" aria-label="Choose a book">Add new book</h2>
      <input placeholder="Book title" value="book">
      <select id="chan"><option>Book Fair</option><option value="Website">Website</option></select>
      <select><option>Books, Research &amp; Reference</option></select>
      <textarea>book notes</textarea>
      <p data-keep-words>The book stays</p>`;
    applyPageWords(document.body, goodsWords);
    const h2 = document.querySelector('h2');
    expect(h2.textContent).toBe('Add new product');
    expect(h2.getAttribute('title')).toBe('Product picker');
    expect(h2.getAttribute('aria-label')).toBe('Choose a product');
    const input = document.querySelector('input');
    expect(input.getAttribute('placeholder')).toBe('Product title');
    expect(input.value).toBe('book');
    // A sale's channel is saved by the option's value: it stays "Book Fair" while the label changes.
    const chan = document.getElementById('chan');
    expect(chan.options[0].textContent).toBe('Market');
    expect(chan.value).toBe('Book Fair');
    expect(document.querySelectorAll('select')[1].options[0].textContent).toBe('Books, Research & Reference');
    expect(document.querySelector('textarea').value).toBe('book notes');
    expect(document.querySelector('p').textContent).toBe('The book stays');
  });

  it('a books shop leaves the page exactly as written', () => {
    document.body.innerHTML = '<h2>Add new book</h2><select><option>Book Fair</option></select>';
    const before = document.body.innerHTML;
    applyPageWords(document.body, wordsFor('books'));
    expect(document.body.innerHTML).toBe(before);
  });

  it('for a clothing shop, the stockroom page has no "book" or "author" left (plan 10.23 scan)', () => {
    document.body.innerHTML = indexBody();
    applyPageWords(document.body, wordsFor('clothing'));
    const left = [];
    const walker = document.createTreeWalker(document.body, 4 /* SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, textarea, template, code, pre, [data-keep-words]')) continue;
      const text = node.nodeValue.trim();
      if (text === 'Books, Research & Reference') continue;
      if (/(?<![-\w])(books?|authors?)\b/i.test(text)) left.push(text);
    }
    for (const el of document.body.querySelectorAll('[placeholder], [title], [aria-label], [data-tip]')) {
      for (const name of ['placeholder', 'title', 'aria-label', 'data-tip']) {
        const value = el.getAttribute(name);
        if (value && /(?<![-\w])(books?|authors?)\b/i.test(value)) left.push(`${name}: ${value}`);
      }
    }
    expect(left).toEqual([]);
  });
});
