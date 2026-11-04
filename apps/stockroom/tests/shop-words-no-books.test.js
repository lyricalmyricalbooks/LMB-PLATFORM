// A shop that sells no books (code plan 12.18, part 2): the stockroom's counting words, its ISBN words and its reminders.
import { describe, it, expect } from 'vitest';
import { goodsWords, noBookWords, wordsFor, noteSellsAnswer } from '../src/lib/shop-words.js';
import { buildAttentionSignals, wordsAround } from '../src/lib/attention-signals.js';

describe('counting and making words', () => {
  it('copies, titles, readers, print runs and bookshops become items, products, shoppers, batches and stores', () => {
    expect(goodsWords('3 copies left before the next print run')).toBe('3 items left before the next batch');
    expect(goodsWords('Top titles for readers · 1 title')).toBe('Top products for shoppers · 1 product');
    expect(goodsWords('Add a bookshop that stocks you. Bookshops pay later.')).toBe('Add a store that stocks you. Stores pay later.');
    expect(goodsWords("Tell the press's owner")).toBe("Tell the shop's owner");
    expect(goodsWords('no printing cost recorded')).toBe('no making cost recorded');
    // Look-alikes stay.
    expect(goodsWords('Named for screen readers; page titles; Copy the link')).toBe('Named for screen readers; page titles; Copy the link');
  });

  it('a shop with no books says SKU; a mix of books and other things keeps ISBN', () => {
    expect(wordsFor('clothing')).toBe(noBookWords);
    expect(wordsFor('mixed')).toBe(goodsWords);
    expect(noBookWords('ISBN-13')).toBe('SKU or barcode');
    expect(noBookWords('978-X-XXXX-XXXX-X or —')).toBe('e.g. TEE-BLK-M or —');
    expect(noBookWords('Search by title, author, ISBN or SKU')).toBe('Search by title, maker, SKU');
    expect(wordsFor('mixed')('ISBN-13')).toBe('ISBN-13');
    expect(wordsFor('books')('ISBN-13 and 3 copies')).toBe('ISBN-13 and 3 copies');
  });

  it('a move between a mix and a shop with no books starts the page again in the new words', () => {
    globalThis.localStorage?.clear?.();
    expect(noteSellsAnswer('mixed', { sells: 'clothing' })).toBe(true);
  });
});

describe('reminders for a shop with no books', () => {
  const book = { id: 'tee', title: 'Book Club Tee', author: 'Book & Co', isbn: '', productionCost: 0, stripeLink: 'https://pay.example/x' };
  const run = (extra) => buildAttentionSignals({ books: [book], states: { tee: { hist: [] } }, today: '2026-11-04', ...extra });

  it('never asks for an ISBN, and a books shop still is', () => {
    expect(run({}).signals.map(s => s.id)).toContain('catalogue-isbn:tee');
    expect(run({ booksShop: false, words: noBookWords }).signals.map(s => s.id)).not.toContain('catalogue-isbn:tee');
  });

  it("says the reminders in the shop's words and keeps the product's own name and maker", () => {
    const cost = run({ booksShop: false, words: noBookWords }).signals.find(s => s.id === 'catalogue-cost:tee');
    expect(cost.detail).toContain('Book Club Tee has no making cost recorded');
    expect(cost.detail).not.toMatch(/\bbook\b/);
  });

  it('wordsAround leaves every kept name exactly as written', () => {
    expect(wordsAround('Book Club Tee by Book & Co: 3 copies of the book', goodsWords, ['Book Club Tee', 'Book & Co'])).toBe('Book Club Tee by Book & Co: 3 items of the product');
    expect(wordsAround('a book', goodsWords, [])).toBe('a product');
  });
});
