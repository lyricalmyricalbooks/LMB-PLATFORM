# Crawlable public HTML

Google can execute JavaScript, but a single-page app first serves the same empty
shell for every URL. The production build renders the public sitemap in Chromium
and writes one HTML file per public route: `index.html` for the home page and
`<route>.html` for every other route (`books/<slug>.html`, `page/<slug>.html`,
`collections/<slug>.html`). Firebase Hosting (`cleanUrls`) answers the slash-less
URL `/books/<slug>` from `books/<slug>.html` with HTTP 200, and
`trailingSlash: false` 301-redirects `/books/<slug>/` and `/books/<slug>.html` to it,
matching the slash-less canonical, `og:url`, JSON-LD and sitemap URLs. App routes
that were not prerendered get the clean app shell (`spa.html`) and unknown URLs a
real 404 that still renders the editable missing page (docs/FIREBASE_HOSTING.md).
These files contain actual published
Studio layouts, text, links, metadata and current page structured data. React
starts normally and continues loading live catalog and checkout data.

## Building and publishing

- Install dependencies with pnpm 10 (the deployment uses pnpm 10).
- Run `pnpm exec playwright install chromium` once locally. Linux CI installs
  Chromium and its OS dependencies before the build.
- Run `npm run build`. It builds Vite, generates the sitemap, then prerenders.
- `SITE_URL` is the public origin plus deployment path; `SITE_BASE` is the Vite
  base. For a custom root domain, set `SITE_URL=https://your-domain` and
  `SITE_BASE=/` together.
- Merge and deploy through the storefront workflow (`deploy-pages.yml`). Generated
  HTML lives only in `dist`; it is not committed. The workflow publishes it to
  Firebase Hosting at `https://lmb-test-shop.web.app` (site at the root).
  `cleanUrls` serves `books/<slug>.html` at `/books/<slug>` with HTTP 200 and
  `trailingSlash: false` 301-redirects `/books/<slug>/` and `/books/<slug>.html` to
  the slash-less canonical; app routes without a snapshot get `spa.html` (the clean
  app shell) and unknown URLs get a real 404 (`404.html` is the same shell). The old
  GitHub Pages address serves forwarding pages whose canonical links name the new
  pages (docs/FIREBASE_HOSTING.md).

Snapshots refresh on deployment. The Pages workflow checks published catalog,
page and Studio data every 15 minutes (at minutes 7, 22, 37 and 52). GitHub may
delay scheduled jobs. A SHA-256 fingerprint is compared against the marker in
the deployed site; unchanged content skips installation/build/deployment. Public
changes and scheduled releases trigger a rebuild; Studio draft-only edits do not.
A failed read fails the check, and a failed deployment never advances the marker.
Manual workflow dispatch and pushes to main always build. Live React data, authoritative prices and checkout validation remain
in force between deployments. Removed books/pages lose their generated route at
the next build, while the existing missing-page recovery handles unknown URLs.

## Boundaries

Only same-site home, book, custom-page and collection sitemap URLs are rendered.
Account, wishlist, checkout, tracking and admin routes are excluded. Rendering
uses a fresh unauthenticated browser context per page; browser caches, settings
objects and draft data are never serialized into output. Firestore Write-channel
and external analytics requests are blocked to avoid generating store activity.
An unavailable public-data load, application exception or empty shell fails the
build before new snapshots are written. No alternate content is served to bots.

The prerenderer consumes the existing sitemap. It does not invent categories,
product descriptions, reviews, ISBNs or catalog assignments. Route/canonical,
book metadata and sitemap changes are owned by the separate book SEO work.

## Verification after deployment

Fetch a published `/books/<slug>` or `/page/<slug>` URL (no trailing slash)
without JavaScript. It should return HTTP 200 with no redirect, that page's title/content, its public canonical URL
and crawlable links. Check the rendered page with JavaScript too: navigation
and Add to bag must still work and payment must keep using live server totals.
Then use Search Console URL Inspection and Google's Rich Results Test. Code and
local checks cannot certify indexing, ranking, or eligibility for rich results.

Sources:
- https://developers.google.com/search/docs/fundamentals/get-started-developers
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics

The first successful public bootstrap is reused across fresh browser contexts
within one build, reducing repeated catalog reads. It is held only in the
renderer process and browser session; it is never embedded in generated HTML.

Public catalog pagination uses document IDs so legacy books without `createdAt` remain consistent with the sitemap. Admin ordering and catalog records are unchanged. Rendering contexts decline analytics and marketing consent before app startup, preventing optional custom tracking scripts from running. Custom pages must finish loading their expected slug before capture.

## Catalog and category indexing

Studio's published visible shop categories (including visible children) generate
collection sitemap entries. Hidden categories/children and disconnected legacy
`collections` documents do not. Their existing MainSite routes get category-specific
Studio copy and category descriptions; capture waits for the selected category.

Books > Search (SEO) > Exclude this listing from search engines saves `seoNoindex`.
Excluded books stay in the shop and keep their URLs, prices and inventory. They
are omitted from the sitemap but included in public HTML rendering, with `noindex,
follow`, so crawlers can read the exclusion. The build-only route manifest is
`dist/prerender-routes.xml`; the published fingerprint contains only a digest.

## Google Search Console

Add a URL-prefix property for the shop's address,
`https://lmb-test-shop.web.app/` (or its own domain once connected). The old
GitHub Pages property only sees forwarding pages now.
Choose HTML tag verification. Copy its `content` token into Studio > Text & labels
> Site & sharing > Google Search Console verification token, then Publish.
The next HTML refresh emits that public verification meta tag. Finish Verify in
Search Console, then submit `sitemap.xml` in the property's Sitemaps screen.
Firebase authentication does not authorize Search Console; verification and
submission still require the owner's Google access. The token can be cleared to
remove the tag on the next deployment. No private OAuth secret is saved in Studio.

## Structured data (rich results)

Each public page carries one `seo-jsonld-page` script; several schema objects share
it as an `@graph` (`jsonLdDocument` in `src/app/lib/seo.ts`). Builders live in
`src/app/lib/bookSeo.ts`:

- **Home** — `BookStore` (name, description, logo, Instagram/social `sameAs` from
  Studio) linked to a `WebSite`.
- **Book pages** — `Product`+`Book` (with `author` Persons from Author / contributors, group credits left out) and a new-condition `Offer` sold by the shop,
  a `BreadcrumbList` (Shop › category › book) and, only when approved shopper reviews
  exist, `aggregateRating` plus up to five named review snippets. Nothing is invented:
  no reviews means no rating. The snapshot waits for `data-seo-reviews="ready"`.
- **Collections** — `CollectionPage` with an `ItemList` of up to 30 of its books
  (books excluded from search are left out) and a breadcrumb.
- **Custom/policy pages** — Home › page breadcrumb.

The sitemap adds `<image:image>` entries (up to 10 photos per indexable book) for
Google Images, and dates the home page by its newest book/page change.
Not emitted yet: Offer `shippingDetails` / `hasMerchantReturnPolicy` (need structured
return-window and shipping-time fields, not the free-text policies).
