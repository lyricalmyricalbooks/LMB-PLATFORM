import { describe, expect, it } from 'vitest';
import { publicRoutes } from './prerenderHtml.mjs';
import { sitemapArtifacts } from './sitemapData.mjs';

// Fault #29: a free-text book slug must never abort the prerender (and so every deploy).
const base = 'https://example.com/shop';
const xml = (...slugs: string[]) => '<urlset>' + ['https://example.com/shop/', ...slugs.map(s => `https://example.com/shop/books/${s}`)].map(u => `<url><loc>${u}</loc></url>`).join('') + '</urlset>';

describe('unsafe slugs never abort the build', () => {
  it('prerender skips a free-text slug with a warning callback instead of throwing', () => {
    const skipped: string[] = [];
    const routes = publicRoutes(xml('moon-vol-1', encodeURIComponent('Moon: Vol 2'), encodeURIComponent('a/b'), 'x.', '%E0%A4%A'), base, route => skipped.push(route));
    expect(routes).toEqual(['/', '/books/moon-vol-1']);
    expect(skipped).toHaveLength(4);
  });
  it('the sitemap leaves such a slug out', () => {
    const books = [{ id: 'a', status: 'published', title: 'A', slug: 'good-book' }, { id: 'b', status: 'published', title: 'B', slug: 'Moon: Vol 2' }];
    const { xml: sitemap } = sitemapArtifacts(base, books as any, [], [], {});
    expect(sitemap).toContain('/books/good-book');
    expect(sitemap).not.toContain('Moon');
  });
});
