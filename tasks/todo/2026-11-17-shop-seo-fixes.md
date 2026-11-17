# Shop SEO fixes from the 17 November audit

Audit: https://claude.ai/artifact/FBTX7tQMGfdteSm4fBvwaG. Three problems plus small items, one PR.

- [x] Blank page names the template shop (456 Montrose Ave, lmb-test-shop): index.html carries only "Your Press";
      front door `shopShell` swaps in the shop's name, address, canonical and locale.
- [x] Own domain plus free address both open: front door 301s storefront pages to the main address when it points at
      the same shop (not previews, frames, profile or files).
- [x] Missing pages answer 200: `frontDoorRoutes.js` checks undrawn product/page addresses; missing = 404 + noindex,
      redirected = 301; unsure = 200.
- [x] Fallback robots.txt names the sitemap and disallows admin, checkout, account, wishlist, track.
- [x] og:locale follows the shop (fr_CA / en_US / en_CA) in useSEO and the front door.
- [x] Trailing-slash twins: front door 301s /books/x/ to /books/x (Julian: "fix everything").
- [x] App canonical, og:url and JSON-LD links use the profile's siteUrl (`shopOrigin`), not the page's origin.
- [x] Page size: the front door sent drawn pages uncompressed (83 KB on test-goods home); it now sends brotli/gzip.
- [ ] Later: split Studio's labels out of storeCopy.ts (about 55 KB of the shopper's first load is Studio labels and
      hints); draw a new shop's pages at sign-up and after catalogue changes (no on-demand publish run exists yet).

## Verification
- [x] `frontDoor.test.js`, `frontDoorRoutes.test.js` (parity with findProduct and the redirect list), `seo.test.ts`,
      `indexShell.test.ts`.
- [ ] Full shop tests, typecheck, lint, platform tests.
- [ ] Live check on a test shop after deploy (curl: 404 for a missing book, shop name in the head, no template address).

## Review
Single-site test shop (firebase.json rewrite to spa.html, no function) still answers 200 for missing pages: needs the
front door, which only the shared system has.
