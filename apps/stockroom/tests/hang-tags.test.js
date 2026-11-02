import { describe, it, expect } from 'vitest';
import { hangTagsHtml, tagList, tagPrice, HANG_TAGS_PER_SHEET } from '../src/lib/hang-tags.js';

const book = { title: 'The Hound', author: 'Ian Willms', price: 24, currency: 'CA$', isbn: '978-1-0000-0000-0' };

describe('hang tags', () => {
  it('prints the title, author, price and ISBN of each book', () => {
    const html = hangTagsHtml({ books: [book] });
    expect(html).toContain('The Hound');
    expect(html).toContain('Ian Willms');
    expect(html).toContain('CA$ 24.00');
    expect(html).toContain('ISBN 978-1-0000-0000-0');
  });

  it('leaves a blank line to write in when a book has no price', () => {
    expect(tagPrice('', 'CA$')).toBe('CA$ ____');
    expect(tagPrice(undefined)).toBe('____');
    expect(tagPrice(-3, '€')).toBe('€ ____');
  });

  it('repeats each book by the copies asked for, within 1 to 10, and skips untitled books', () => {
    expect(tagList([book, { title: ' ' }], 3)).toHaveLength(3);
    expect(tagList([book], 0)).toHaveLength(1);
    expect(tagList([book], 99)).toHaveLength(10);
  });

  it('starts a new sheet after eight tags, and escapes what a person typed', () => {
    const html = hangTagsHtml({ books: [{ ...book, title: '<b>x</b>' }], copies: HANG_TAGS_PER_SHEET + 1 });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('says to pick a book when none is given', () => {
    expect(hangTagsHtml({ books: [] })).toContain('Pick at least one book');
  });
});
