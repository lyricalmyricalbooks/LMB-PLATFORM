import { expect, it } from 'vitest';
import { sitemapArtifacts } from './sitemapData.mjs';
it('retains legacy string parents whose published books belong to a child category', () => {
  const result = sitemapArtifacts('https://example.com/shop', [{ id: 'zine', title: 'Zine', status: 'published', categories: ['Zines'] }], [], [], { design: { categories: ['Books', { name: 'Zines', parentId: 'cat-0' }] } });
  expect(result.xml).toContain('/collections/books');
});
it('keeps empty published category routes available for noindex HTML rendering', () => {
  const settings = { design: { categories: ['Empty'] } };
  expect(sitemapArtifacts('https://example.com/shop', [], [], [], settings).xml).not.toContain('/collections/empty');
  expect(sitemapArtifacts('https://example.com/shop', [], [], [], settings, { includeEmptyCollections: true }).xml).toContain('/collections/empty');
});
it('omits empty categories while retaining alias and parent membership and sold-out books', () => {
  const categories = [{ id: 'parent', name: 'Books' }, { name: 'New zines', aliases: ['Old zines'], parentId: 'parent' }, 'Empty', 'Draft only', 'Future', 'PUBLICATIONS'];
  const books = [
    { id: 'one', title: 'One', status: 'published', categories: ['Old zines'], stockLevel: 0 },
    { id: 'draft', title: 'Draft', status: 'draft', categories: ['Draft only'] },
    { id: 'future', title: 'Future', status: 'published', scheduleDate: '2999-01-01', categories: ['Future'] },
  ];
  const result = sitemapArtifacts('https://example.com/shop', books, [], [], { design: { categories } });
  expect(result.xml).toContain('/collections/books');
  expect(result.xml).toContain('/collections/new-zines');
  expect(result.xml).toContain('/collections/publications');
  expect(result.xml).not.toContain('/collections/old-zines');
  expect(result.xml).not.toContain('/collections/empty');
  expect(result.xml).not.toContain('/collections/draft-only');
  expect(result.xml).not.toContain('/collections/future');
});
it('uses unique catalog routes, escapes XML, excludes private and draft pages, and scopes robots to the deployment path', () => {
  const result = sitemapArtifacts('https://example.com/shop/', [
    { id: 'one', title: 'One', slug: 'same', status: 'published' },
    { id: 'two', title: 'Two', slug: 'same', status: 'published' },
    { id: 'draft', title: 'Draft', status: 'draft' },
  ], [{ slug: 'about&us', status: 'published' }], []);
  expect(result.xml).toContain('https://example.com/shop/books/one');
  expect(result.xml).toContain('https://example.com/shop/books/two');
  expect(result.xml).toContain('/page/about%26us');
  expect(result.xml).not.toContain('/books/draft');
  expect(result.xml).not.toContain('/account');
  expect(result.xml).not.toContain('/wishlist');
  expect(result.robots).toContain('Disallow: /shop/admin');
  // /cart answers noindex; disallowing it would hide that from Google.
  expect(result.robots).not.toContain('/cart');
  expect(result.xml).not.toContain('/cart');
  expect(result.robots).toContain('Sitemap: https://example.com/shop/sitemap.xml');
});

it('indexes only visible published Studio categories and excludes noindex books', () => {
 const settings = { design: { categories: ['PUBLICATIONS', { name: 'Books', id: 'books' }, { name: 'Hidden', id: 'hidden', showInNav: false }, { name: 'Hidden child', parentId: 'hidden' }, { name: 'Zines', parentId: 'books' }, { name: 'Books' }] }, draftDesign: { categories: ['Draft category'] } };
 const result = sitemapArtifacts('https://example.com/shop', [{ id: 'test', title: 'Test', status: 'published', seoNoindex: true }, { id: 'real', title: 'Real', status: 'published', categories: ['Zines'] }], [], [{ name: 'Old disconnected collection' }], settings);
 expect(result.xml).toContain('/collections/publications'); expect(result.xml).toContain('/collections/books'); expect(result.xml).toContain('/collections/zines');
 expect(result.xml).not.toContain('/books/test'); expect(result.xml).toContain('/books/real');
 expect(result.xml).not.toContain('hidden'); expect(result.xml).not.toContain('draft-category'); expect(result.xml).not.toContain('old-disconnected');
 expect(result.count).toBe(5);
});

it('reads only the published design: scheduled designs are published into it by the server (Studio 3.5)', () => {
 const settings = { design: { categories: ['Old'] }, scheduledPublish: { at: '2000-01-01T00:00:00Z', design: { categories: ['Scheduled'] } } };
 const result = sitemapArtifacts('https://example.com/shop', [{ id: 'old-book', title: 'Book', status: 'published', categories: ['Old', 'Scheduled'] }], [], [], settings);
 expect(result.xml).toContain('/collections/old'); expect(result.xml).not.toContain('/collections/scheduled');
});

it('published store policies are listed so they render as real pages', () => {
  const result = sitemapArtifacts('https://example.com/shop', [], [], [], { policies: { returns: 'Thirty days.', terms: '  ', privacy: 'We keep little.' } });
  expect(result.xml).toContain('https://example.com/shop/page/policy-returns');
  expect(result.xml).toContain('https://example.com/shop/page/policy-privacy');
  expect(result.xml).not.toContain('policy-terms');
  expect(result.xml).not.toContain('policy-shipping');
});

it('lists book photos for Google Images and dates the home page by its newest content', () => {
  const result = sitemapArtifacts('https://example.com/shop', [
    { id: 'one', title: 'One', slug: 'one', status: 'published', updatedAt: '2026-09-02T00:00:00Z', photos: [{ url: '/shop/a.jpg' }, { url: 'https://cdn.example.com/b.jpg?x=1&y=2' }, { url: '/shop/a.jpg' }, { url: 'data:image/png;base64,AAA' }, {}] },
    { id: 'two', title: 'Two', slug: 'two', status: 'published', updatedAt: '2026-10-01T00:00:00Z' },
  ], [], [], {});
  expect(result.xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
  expect(result.xml.match(/<image:loc>/g)).toHaveLength(2);
  expect(result.xml).toContain('<image:loc>https://example.com/shop/a.jpg</image:loc>');
  expect(result.xml).toContain('<image:loc>https://cdn.example.com/b.jpg?x=1&amp;y=2</image:loc>');
  expect(result.xml).not.toContain('data:image');
  expect(result.xml).toMatch(/<loc>https:\/\/example\.com\/shop\/<\/loc>\n    <lastmod>2026-10-01<\/lastmod>/);
});



it("uses reviewed publication status to exclude drafts from product routes", () => {
  const result = sitemapArtifacts("https://example.com/shop", [
    { id: "test", title: "test", status: "draft" },
    { id: "antigravity-test", title: "Antigravity Test Book", status: "draft" },
    { id: "copy", title: "Altrove (Copy)", status: "published" },
    { id: "real", title: "Real Book", status: "published" },
  ] as any, [], [], {});
  expect(result.xml).toContain("/books/real-book");
  expect(result.xml).not.toContain("/books/test");
  expect(result.xml).not.toContain("antigravity-test");
  expect(result.xml).toContain("altrove-copy");
});
