import { describe, expect, it } from 'vitest';
import { llmsTxt } from './llmsTxt.mjs';

const now = new Date('2026-10-18T12:00:00Z');
const settings = {
  info: { name: 'Lyricalmyrical Books', description: 'An independent press in Toronto.', email: 'shop@example.com' },
  location: { street: '1 Private Lane', city: 'Toronto', state: 'Ontario', country: 'Canada' },
  policies: { shipping: 'We ship.', returns: '' },
};
const books = [
  { id: 'a', title: 'The Hound', slug: 'the-hound', status: 'published', subtitle: 'Ian Willms', format: 'Hardcover', pageCount: 120, publishDate: '2024-05-01', language: 'English', isbn: '9780000000001', description: '<p>Photographs of a [dog].</p>', retailPrice: 60, stockLevel: 3 },
  { id: 'b', title: 'Draft', slug: 'draft', status: 'draft' },
  { id: 'c', title: 'Hidden', slug: 'hidden', status: 'published', seoNoindex: true },
  { id: 'd', title: 'Later', slug: 'later', status: 'published', scheduleDate: '2030-01-01' },
  { id: 'e', title: 'Gift card', slug: 'gift', status: 'published', productType: 'giftCard' },
];
const pages = [{ id: 'p', title: 'About', slug: 'about', status: 'published', metaDescription: 'Who we are.' }, { id: 'q', title: 'Secret', slug: 'secret', status: 'draft' }];

describe('llms.txt', () => {
  const text = llmsTxt('https://lyricalmyricalbooks.com/', books, pages, settings, { now });
  it('opens with the shop, its summary and where it is, never the street', () => {
    expect(text.startsWith('# Lyricalmyrical Books\n\n> An independent press in Toronto.\n\nBased in Toronto, Ontario, Canada. Contact: shop@example.com.')).toBe(true);
    expect(text).not.toContain('Private Lane');
  });
  it('lists only live, indexable books with their artist and facts, and no price', () => {
    expect(text).toContain('- [The Hound](https://lyricalmyricalbooks.com/books/the-hound): by Ian Willms · Hardcover · 120 pages · published 2024 · in English · ISBN 9780000000001. Photographs of a [dog].');
    for (const hidden of ['Draft', 'Hidden', 'Later', 'Gift card']) expect(text).not.toContain(`[${hidden}]`);
    expect(text).not.toMatch(/\$|CAD|60/);
  });
  it('lists published pages, the sitemap and only the policies the shop has', () => {
    expect(text).toContain('- [About](https://lyricalmyricalbooks.com/page/about): Who we are.');
    expect(text).not.toContain('Secret');
    expect(text).toContain('- [Every page (sitemap)](https://lyricalmyricalbooks.com/sitemap.xml)');
    expect(text).toContain('- [Shipping policy](https://lyricalmyricalbooks.com/page/policy-shipping)');
    expect(text).not.toContain('Returns policy');
  });
});
