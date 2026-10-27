#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapArtifacts } from './sitemapData.mjs';
import { readPublicStorefront, publishedFingerprint, effectivePublishedSettings } from './publicStorefrontData.mjs';
import { llmsTxt } from './llmsTxt.mjs';
import { FEED_FILE, merchantFeedItems, merchantFeedXml } from '../src/app/features/site/merchantFeed.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const siteUrl = process.env.SITE_URL || 'https://lmb-test-shop.web.app';
const { books, pages, settings, reviews } = await readPublicStorefront();
const indexed = sitemapArtifacts(siteUrl, books, pages, [], settings);
// Keep noindex public listings crawlable so Google can read their robots tags.
const rendered = sitemapArtifacts(siteUrl, books.map(book => ({ ...book, seoNoindex: false })), pages, [], settings, { includeEmptyCollections: true });
for (const directory of ['dist', 'public']) {
  mkdirSync(resolve(root, directory), { recursive: true });
  writeFileSync(resolve(root, directory, 'sitemap.xml'), indexed.xml);
  writeFileSync(resolve(root, directory, 'robots.txt'), indexed.robots);
}
writeFileSync(resolve(root, 'dist/prerender-routes.xml'), rendered.xml);
writeFileSync(resolve(root, 'dist/seo-published-fingerprint.txt'), publishedFingerprint({ books, pages, settings, reviews }) + '\n');
// Google Merchant Center fetches this file (Books › Google Shopping feed shows its address).
const design = effectivePublishedSettings(settings).design || {};
const shopName = (typeof design.copy?.siteName === 'string' && design.copy.siteName.trim()) || (typeof design.siteName === 'string' && design.siteName.trim()) || 'Lyricalmyrical Books';
const feed = merchantFeedItems(siteUrl, books, { shopName });
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist', FEED_FILE), merchantFeedXml(siteUrl, feed.items, { shopName }));
// AI assistants and AI search read /llms.txt for a plain summary of the shop and its books.
writeFileSync(resolve(root, 'dist', 'llms.txt'), llmsTxt(siteUrl, books, pages, settings, { shopName }));
console.log(`Google Shopping feed: ${feed.items.length} items, ${feed.skipped.length} published books left out.`);
console.log(`Generated ${indexed.count} indexable URLs and ${rendered.count} public HTML routes.`);
