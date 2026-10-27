# Storefront repair verification — 2 October 2026

Branch: codex/storefront-readiness. Verification uses the local repaired build with published Firestore catalog/settings; this is not a deployed-payment certification.

## Repairs and evidence

- Collision-safe product URLs: all seven currently published card links are distinct and every destination displays the matching title. Catalog fields remain untouched. Sitemap uses the same resolver and reads all REST pages.
- Catalog paging: fetches beyond 100 books; regression verifies 101 records and guards a stuck cursor. Firestore snapshots are excluded from the cache.
- Phone (390 × 844): menu opens; search finds Altrove; Escape closes search; USD selection works; wishlist navigation works. Category/subcategory links and existing hidden-header controls are covered by rendering tests.
- Page recovery: an unknown URL shows a title and working home link. Page reads reset on slug change and ignore stale responses.
- Policies: About page displays Shipping Policy and Terms of Service links through the shared footer. Studio can hide/show the page footer.
- Checkout: add-to-cart works with keyboard on phone and a real pointer on desktop. Invalid Stripe key shows a configuration alert and disables payment. Two checkout exits reach the catalog without page errors. Test cart cleaned afterward.
- Stripe cleanup: regression verifies an already-destroyed Element cannot crash navigation and repeated cleanup destroys only once. Wrong-mode, placeholder and secret keys are rejected.
- Validation: npm test — 410 tests in 85 files passed. Production build passed; existing large-bundle and mixed Firebase-import warnings remain. Targeted server order/label calculations — 12 tests passed.

Screenshots and browser scripts are saved locally in output/playwright/ (not committed). The native in-app automation could not initialize because of a sandbox helper error; Playwright CLI supplied the real-browser checks.

## Required before taking live payments

Configure valid mode-matched Stripe publishable keys in Payments and server secrets in Firebase Functions. Complete sandbox card success/failure/3DS, duplicate webhook, inventory, discount, tax/shipping, email, refund and label-fulfillment checks; then switch to live mode and verify the release. No order/payment/provider mutation was made in these browser checks.

Owner must replace or unpublish placeholder book/page content. These repairs do not invent descriptions, remove catalog records or certify Shopify feature parity. Code delivery through a PR does not deploy GitHub Pages until merged and the deployment succeeds.

## Merchant controls

Settings > Design > Studio > Style > Header & announcement bar > Show phone navigation.
Text & labels > Header > Mobile menu. Existing search/wishlist/account/currency toggles apply.
Style > Custom pages > Show page footer / Show missing-page message / Show return to store link.
Text & labels > Custom pages & 404 edits recovery words; Checkout edits payment configuration/load errors.
Use the phone preview, click the menu or recovery region to open its controls, then Publish after reviewing the draft. Authenticated admin navigation was not exercised; these paths are verified against the source labels.
