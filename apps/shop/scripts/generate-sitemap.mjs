#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sitemapArtifacts } from './sitemapData.mjs';
import { readPublicStorefront, publishedFingerprint, effectivePublishedSettings } from './publicStorefrontData.mjs';
import { llmsTxt } from './llmsTxt.mjs';
import { SHOP_BUILD_DIR, readShopProfileSync, shopSiteUrl } from './shopProfile.mjs';
import { FEED_FILE, SOCIAL_FEED_FILE, feedShopName, merchantFeedItems, merchantFeedXml, socialFeedCsv } from '../src/app/features/site/merchantFeed.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const siteUrl = await shopSiteUrl();
const { books, pages, settings, reviews } = await readPublicStorefront();
// Product pages live under /products/ in a shop that doesn't sell books (the server's copy of src/shared/shopSells.ts).
const productBase = createRequire(import.meta.url)('../functions/shared/shopSells.js').productBase(settings?.sells);
const indexed = sitemapArtifacts(siteUrl, books, pages, [], settings, { productBase });
// Keep noindex public listings crawlable so Google can read their robots tags.
const rendered = sitemapArtifacts(siteUrl, books.map(book => ({ ...book, seoNoindex: false })), pages, [], settings, { includeEmptyCollections: true, productBase });
const dist = SHOP_BUILD_DIR;
// A publish run (SHOP_BUILD_DIR set) writes only into its own copy, never into the app's public folder.
for (const directory of process.env.SHOP_BUILD_DIR ? [dist] : [dist, resolve(root, 'public')]) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'sitemap.xml'), indexed.xml);
  writeFileSync(resolve(directory, 'robots.txt'), indexed.robots);
}
writeFileSync(resolve(dist, 'prerender-routes.xml'), rendered.xml);
writeFileSync(resolve(dist, 'seo-published-fingerprint.txt'), publishedFingerprint({ books, pages, settings, reviews }) + '\n');
// Google Merchant Center fetches this file (Books › Google Shopping feed shows its address).
// The press's own name (Text & labels › Site name, plan 5.8), never the placeholder for a named shop.
const shopName = feedShopName(effectivePublishedSettings(settings));
const feed = merchantFeedItems(siteUrl, books, { shopName, productBase, currency: readShopProfileSync().currency });
writeFileSync(resolve(dist, FEED_FILE), merchantFeedXml(siteUrl, feed.items, { shopName }));
// Meta (Facebook and Instagram) and Pinterest fetch the same items as CSV (Books › Instagram, Facebook and Pinterest).
writeFileSync(resolve(dist, SOCIAL_FEED_FILE), socialFeedCsv(feed.items));
// AI assistants and AI search read /llms.txt for a plain summary of the shop and its books.
writeFileSync(resolve(dist, 'llms.txt'), llmsTxt(siteUrl, books, pages, settings, { shopName, productBase }));
console.log(`Google Shopping feed: ${feed.items.length} items, ${feed.skipped.length} published books left out.`);
console.log(`Generated ${indexed.count} indexable URLs and ${rendered.count} public HTML routes.`);
