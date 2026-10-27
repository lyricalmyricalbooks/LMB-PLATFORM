import { describe, expect, it } from 'vitest';
import { autoBookSeo, bookCreators, creatorLinks, creatorPeople, namesCreator, bookMetadata, bookStructuredData, defaultBookTitle, breadcrumbData, canonicalUrl, collectionStructuredData, isbn13, ratingData, seoChecks, fittingTitle, leadSentences, seoTopicList, siteStructuredData, snippet, profileLinks } from './bookSeo';
const book = { id: 'one', title: 'Photo book', description: '<p>Art &amp; photography.</p>', retailPrice: 24, stockLevel: 0, status: 'published', slug: 'photo-book', metaTitle: 'An artist’s photo book', metaDescription: 'A unique collection of photographs.', seoImage: 'https://example.com/share.jpg' };
describe('book search metadata', () => {
  it('uses saved search fields and sharing image', () => {
    expect(bookMetadata(book)).toMatchObject({ title: book.metaTitle, description: book.metaDescription, image: book.seoImage, exactTitle: true });
  });
  it('falls back to clean catalog text without changing the catalog', () => {
    expect(bookMetadata({ ...book, metaTitle: '', metaDescription: '', seoImage: '' }).description).toBe('Art & photography.');
    expect(book.description).toBe('<p>Art &amp; photography.</p>');
  });
  it('strips tracking parameters and fragments from canonical URLs', () => {
    expect(canonicalUrl('https://example.com/shop/books/one?utm_source=x#reviews')).toBe('https://example.com/shop/books/one');
  });
  it('names the slash-less URL for content routes reached with a trailing slash, but keeps the home slash', () => {
    expect(canonicalUrl('https://example.com/shop/books/one/')).toBe('https://example.com/shop/books/one');
    expect(canonicalUrl('https://example.com/shop/page/about/?x=1')).toBe('https://example.com/shop/page/about');
    expect(canonicalUrl('https://example.com/shop/collections/art/')).toBe('https://example.com/shop/collections/art');
    expect(canonicalUrl('https://example.com/shop/')).toBe('https://example.com/shop/');
  });
  it('emits Product and Book markup using the displayed currency and price', () => {
    const data = bookStructuredData(book, { currency: 'EUR', price: 19.2, url: 'https://example.com/shop/books/one' });
    expect(data['@type']).toEqual(['Product', 'Book']);
    expect(data.offers).toMatchObject({ priceCurrency: 'EUR', price: '19.20', availability: 'https://schema.org/OutOfStock' });
    expect(data.description).toBe('Art & photography.');
    expect(data.aggregateRating).toBeUndefined();
  });
  it('supports backorders and variant availability without inventing stock', () => {
    const options = { currency: 'CAD', price: 24, url: 'https://example.com/books/one' };
    expect(bookStructuredData({ ...book, onBackorder: true }, options).offers.availability).toBe('https://schema.org/BackOrder');
    expect(bookStructuredData({ ...book, variants: [{ stock: 2 }, { stock: 0 }] }, options).offers.availability).toBe('https://schema.org/InStock');
  });
  it('resolves relative cover images to absolute URLs for crawlers', () => {
    const data = bookStructuredData({ ...book, seoImage: '', photos: [{ url: '/shop/cover.jpg' }] }, { currency: 'CAD', price: 24, url: 'https://example.com/shop/books/one' });
    expect(data.image).toEqual(['https://example.com/shop/cover.jpg']);
  });
  it('flags missing content and draft visibility with actionable checks', () => {
    const checks = seoChecks({ ...book, description: '', metaDescription: '', status: 'draft' });
    expect(checks.find(c => c.id === 'description')?.ok).toBe(false);
    expect(checks.find(c => c.id === 'published')?.ok).toBe(false);
  });
  it('adds star ratings only from real reviews and marks new copies sold by the shop', () => {
    const options = { currency: 'CAD', price: 24, url: 'https://example.com/books/one', seller: 'Lyricalmyrical Books' };
    const reviews = [
      { authorName: 'Ana', rating: 5, title: 'Lovely', body: '<p>Beautiful prints.</p>', createdAt: '2026-09-01T10:00:00Z' },
      { authorName: 'Ben', rating: 4, body: 'Great paper.' },
      { authorName: '', rating: 3, body: 'No name, counted but not quoted.' },
      { authorName: 'Bad', rating: 9, body: 'Out of range is ignored.' },
    ];
    const data: any = bookStructuredData(book, { ...options, reviews });
    expect(data.aggregateRating).toMatchObject({ ratingValue: 4, reviewCount: 3, bestRating: 5 });
    expect(data.review).toHaveLength(2);
    expect(data.review[0]).toMatchObject({ author: { name: 'Ana' }, name: 'Lovely', reviewBody: 'Beautiful prints.', datePublished: '2026-09-01' });
    expect(data.offers).toMatchObject({ itemCondition: 'https://schema.org/NewCondition', seller: { name: 'Lyricalmyrical Books' } });
    expect(bookStructuredData(book, { ...options, reviews: [] }).aggregateRating).toBeUndefined();
    expect(ratingData([{ authorName: 'A', rating: 5 }])).not.toHaveProperty('review');
  });
  it('builds breadcrumb trails with clean absolute URLs', () => {
    const data = breadcrumbData([{ name: 'Shop', url: 'https://example.com/shop/' }, { name: '', url: 'https://example.com/x' }, { name: 'Altrove', url: 'https://example.com/shop/books/altrove?utm=1' }]);
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Shop', item: 'https://example.com/shop/' },
      { '@type': 'ListItem', position: 2, name: 'Altrove', item: 'https://example.com/shop/books/altrove' },
    ]);
  });
  it('describes a category as a list of its books', () => {
    const books = Array.from({ length: 35 }, (_, i) => ({ name: `Book ${i}`, url: `https://example.com/shop/books/b${i}`, image: i === 0 ? '/shop/c.jpg' : undefined }));
    const data: any = collectionStructuredData({ name: 'Photography', description: '<b>Photo</b> books', url: 'https://example.com/shop/collections/photography', books });
    expect(data['@type']).toBe('CollectionPage');
    expect(data.description).toBe('Photo books');
    expect(data.mainEntity.itemListElement).toHaveLength(30);
    expect(data.mainEntity.itemListElement[0]).toMatchObject({ position: 1, name: 'Book 0', image: 'https://example.com/shop/c.jpg' });
  });
  it('links the shop and website and keeps only https profile links', () => {
    const [org, site]: any[] = siteStructuredData({ name: 'Lyricalmyrical Books', url: 'https://example.com/shop/', logo: '/shop/logo.png', sameAs: ['https://instagram.com/x', '', 'javascript:alert(1)', 42] });
    expect(org).toMatchObject({ '@type': 'BookStore', '@id': 'https://example.com/shop/#organization', logo: 'https://example.com/shop/logo.png', sameAs: ['https://instagram.com/x'] });
    expect(site).toMatchObject({ '@type': 'WebSite', publisher: { '@id': 'https://example.com/shop/#organization' } });
    expect(org.knowsAbout).toBeUndefined();
  });
  it('adds other profiles, the contact email and the town (never the street) to the shop', () => {
    expect(profileLinks('https://www.goodreads.com/x\nhttp://old.example.com, https://bsky.app/profile/y https://www.goodreads.com/x\nnot a link')).toEqual(['https://www.goodreads.com/x', 'https://bsky.app/profile/y']);
    expect(profileLinks(undefined)).toEqual([]);
    const [org]: any[] = siteStructuredData({ name: 'Shop', url: 'https://example.com/', sameAs: ['https://instagram.com/x', 'https://instagram.com/x', 'https://bsky.app/profile/y'], email: 'hello@example.com', area: { city: 'Toronto', region: 'Ontario', country: 'Canada' } });
    expect(org.sameAs).toEqual(['https://instagram.com/x', 'https://bsky.app/profile/y']);
    expect(org.email).toBe('hello@example.com');
    expect(org.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Toronto', addressRegion: 'Ontario', addressCountry: 'Canada' });
    const [bare]: any[] = siteStructuredData({ name: 'Shop', url: 'https://example.com/', email: 'not an email', area: {} });
    expect(bare.email).toBeUndefined();
    expect(bare.address).toBeUndefined();
  });
  it('ties a book to the shop by @id when the shop published it, and keeps co-publishers by name', () => {
    const opts = { currency: 'CAD', price: 24, url: 'https://example.com/books/one', seller: 'Lyricalmyrical Books', shopUrl: 'https://example.com/' };
    const own: any = bookStructuredData({ ...book, publisher: 'Lyricalmyrical' } as any, opts);
    expect(own.publisher).toEqual({ '@type': 'Organization', '@id': 'https://example.com/#organization', url: 'https://example.com/', name: 'Lyricalmyrical' });
    expect(own.offers.seller).toMatchObject({ '@id': 'https://example.com/#organization', name: 'Lyricalmyrical Books' });
    expect((bookStructuredData({ ...book, publisher: 'Lyricalmyrical Books (Toronto)' } as any, opts) as any).publisher['@id']).toBe('https://example.com/#organization');
    expect((bookStructuredData({ ...book, publisher: 'Other Press' } as any, opts) as any).publisher).toEqual({ '@type': 'Organization', name: 'Other Press' });
    expect((bookStructuredData({ ...book, publisher: 'Lyricalmyrical Books' } as any, { ...opts, shopUrl: undefined }) as any).publisher).toEqual({ '@type': 'Organization', name: 'Lyricalmyrical Books' });
  });
  it('lists what the shop publishes as knowsAbout, trimmed and without repeats', () => {
    expect(seoTopicList(" Art books, Photography books,, art books ,Artists' books\nZines")).toEqual(['Art books', 'Photography books', "Artists' books", 'Zines']);
    expect(seoTopicList('')).toEqual([]);
    const [org]: any[] = siteStructuredData({ name: 'Shop', url: 'https://example.com/', topics: ['Art books', 'Photobooks'] });
    expect(org.knowsAbout).toEqual(['Art books', 'Photobooks']);
  });
  it('cuts long fallback descriptions at a word boundary but keeps custom ones exact', () => {
    const long = 'Photographs '.repeat(20).trim();
    const meta = bookMetadata({ ...book, metaDescription: '', description: long });
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description.endsWith('Photographs…')).toBe(true);
    expect(snippet('Short text.')).toBe('Short text.');
    const custom = 'x'.repeat(200);
    expect(bookMetadata({ ...book, metaDescription: custom }).description).toBe(custom);
  });
  it('adds only the edition facts the catalog holds, with a validated ISBN-13 as GTIN', () => {
    expect(isbn13('978-0-306-40615-7')).toBe('9780306406157');
    expect(isbn13('978-0-306-40615-8')).toBe('');
    expect(isbn13('0306406152')).toBe('');
    const data = bookStructuredData({ ...book, isbn: '978-0-306-40615-7', format: 'Hardcover', pageCount: 128, publishDate: '2025-04-01T00:00:00Z', edition: 'First edition' }, { currency: 'CAD', price: 24, url: 'https://example.com/books/one' });
    expect(data).toMatchObject({ gtin13: '9780306406157', bookFormat: 'https://schema.org/Hardcover', numberOfPages: 128, datePublished: '2025-04-01', bookEdition: 'First edition' });
    const bare = bookStructuredData({ ...book, isbn: 'pending', pageCount: 0, format: 'Print' }, { currency: 'CAD', price: 24, url: 'https://example.com/books/one' });
    for (const key of ['gtin13', 'bookFormat', 'numberOfPages', 'datePublished', 'bookEdition']) expect(bare).not.toHaveProperty(key);
  });
  it('includes the sharing image in product images without duplicates', () => {
    const data = bookStructuredData({ ...book, photos: [{ url: 'https://example.com/share.jpg' }, { url: '/back.jpg' }] }, { currency: 'CAD', price: 24, url: 'https://example.com/books/one' });
    expect(data.image).toEqual(['https://example.com/share.jpg', 'https://example.com/back.jpg']);
  });
});

describe('search listing auto-fill', () => {
  it('takes whole opening sentences, or cuts one long sentence on a word', () => {
    expect(leadSentences('One. Two words. ' + 'Long sentence '.repeat(20) + 'end.', 40)).toBe('One. Two words.');
    expect(leadSentences('word '.repeat(60), 30).endsWith('…')).toBe(true);
    expect(leadSentences('')).toBe('');
  });
  it('picks the first title that fits with the format', () => {
    expect(fittingTitle(['A very long title that will never fit inside sixty characters at all', 'Short'])).toBe('Short');
    expect(fittingTitle(['x'.repeat(70)]).length).toBeLessThanOrEqual(60);
  });
  it('writes a book title with author and shop name when they fit', () => {
    const seo = autoBookSeo({ title: 'Night Songs', authorName: 'A. Poet', description: '<p>Poems about the city at night. Second sentence here.</p>' }, 'Lyricalmyrical Books');
    expect(seo).toEqual({ metaTitle: 'Night Songs by A. Poet — Lyricalmyrical Books', metaDescription: 'Poems about the city at night. Second sentence here.' });
    const long = autoBookSeo({ title: 'An Extremely Long Title For A Collection Of Poems', authorName: 'Someone Else' }, 'Lyricalmyrical Books');
    // With the author it would be 65 characters, so the plain title is used.
    expect(long.metaTitle).toBe('An Extremely Long Title For A Collection Of Poems');
  });
  it('describes a book with no description from its real facts only', () => {
    expect(autoBookSeo({ title: 'Zine', format: 'paperback', pageCount: 32, publisher: 'Lyricalmyrical' }).metaDescription)
      .toBe('Zine. Paperback, 32 pages. Published by Lyricalmyrical.');
    expect(autoBookSeo({ title: '' })).toEqual({ metaTitle: '', metaDescription: '' });
  });
});

describe('book creators from Author / contributors', () => {
  const byline = (title: string, author: string) => `${title} by ${author}`;
  it('reads the contributors box, splits lists and skips group credits', () => {
    expect(bookCreators({ subtitle: 'Ian Willms' })).toEqual(['Ian Willms']);
    expect(bookCreators({ subtitle: 'Zoe Moss, Lucia Bellemare & Ana Ruiz' })).toEqual(['Zoe Moss', 'Lucia Bellemare', 'Ana Ruiz']);
    expect(bookCreators({ subtitle: 'Various artists' })).toEqual([]);
    expect(bookCreators({ subtitle: 'AA.VV.' })).toEqual([]);
    expect(bookCreators({ subtitle: 'Subverso Magazines x Lyricalmyrical Books' })).toEqual([]);
    expect(bookCreators({ authorName: 'A. Poet' })).toEqual(['A. Poet']);
    expect(bookCreators({})).toEqual([]);
  });
  it('names the creators in Book JSON-LD when there is no legacy authorName', () => {
    const data: any = bookStructuredData({ id: 'h', title: 'The Hound', subtitle: 'Ian Willms', price: 65 } as any, { currency: 'CAD', price: 65, url: 'https://shop.test/books/the-hound' });
    expect(data.author).toEqual([{ '@type': 'Person', name: 'Ian Willms' }]);
    const group: any = bookStructuredData({ id: 'c', title: 'Collections #1', subtitle: 'Various artists', price: 65 } as any, { currency: 'CAD', price: 65, url: 'https://shop.test/books/c' });
    expect(group).not.toHaveProperty('author');
  });
  it('titles a book "Title by Author" only while it stays short', () => {
    expect(defaultBookTitle({ title: 'The Hound', subtitle: 'Ian Willms' }, byline)).toBe('The Hound by Ian Willms');
    expect(defaultBookTitle({ title: 'Collections #1', subtitle: 'Various artists' }, byline)).toBe('Collections #1');
    expect(defaultBookTitle({ title: 'A Rather Long Photobook Title Indeed', subtitle: 'Someone With A Long Name' }, byline)).toBe('A Rather Long Photobook Title Indeed');
    expect(defaultBookTitle({ title: 'Untitled' }, byline)).toBe('Untitled');
  });
  it('auto-fill uses the contributors box too', () => {
    expect(autoBookSeo({ title: 'The Hound', subtitle: 'Ian Willms' }, 'Lyricalmyrical Books').metaTitle).toBe('The Hound by Ian Willms — Lyricalmyrical Books');
  });
});

describe('artist links', () => {
  const hound: any = { id: 'h', title: 'The Hound', subtitle: 'Ian Willms', retailPrice: 60, stockLevel: 3, status: 'published',
    creatorLinks: [{ name: 'ian willms', url: 'https://www.ianwillms.com' }, { name: '', url: 'https://x.com' }, { name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Panos', url: 'https://www.panos.co.uk/' }] };
  it('keeps only named http(s) links', () => {
    expect(creatorLinks(hound)).toEqual([{ name: 'ian willms', url: 'https://www.ianwillms.com/' }, { name: 'Panos', url: 'https://www.panos.co.uk/' }]);
    expect(creatorLinks({ creatorLinks: 'nope' } as any)).toEqual([]);
  });
  it('gives the credited artist their website and other links as contributors', () => {
    const people = creatorPeople(hound);
    expect(people.authors).toEqual([{ '@type': 'Person', name: 'Ian Willms', url: 'https://www.ianwillms.com/', sameAs: ['https://www.ianwillms.com/'] }]);
    expect(people.contributors.map(p => p.name)).toEqual(['Panos']);
    const data: any = bookStructuredData(hound, { currency: 'CAD', price: 60, url: 'https://example.com/books/the-hound' });
    expect(data.author[0].sameAs).toEqual(['https://www.ianwillms.com/']);
    expect(data.contributor[0].url).toBe('https://www.panos.co.uk/');
    expect(bookStructuredData({ ...hound, creatorLinks: [] }, { currency: 'CAD', price: 60, url: 'https://e.com/b' }).author).toEqual([{ '@type': 'Person', name: 'Ian Willms' }]);
  });
  it('checks the listing names the artist and has their website', () => {
    expect(namesCreator('Oltre il Tempo by Isabella Tortolà', 'Isabella Tortola')).toBe(true);
    const checks = seoChecks({ ...hound, metaTitle: 'The Hound', metaDescription: 'A photobook about a bus.', creatorLinks: [] });
    expect(checks.find(c => c.id === 'creator')?.ok).toBe(false);
    expect(checks.find(c => c.id === 'creatorLink')?.ok).toBe(false);
    const done = seoChecks({ ...hound, metaTitle: 'The Hound by Ian Willms' });
    expect(done.find(c => c.id === 'creator')?.ok).toBe(true);
    expect(done.find(c => c.id === 'creatorLink')?.ok).toBe(true);
    expect(seoChecks({ ...hound, subtitle: 'Various artists' }).some(c => c.id === 'creator')).toBe(false);
  });
});
