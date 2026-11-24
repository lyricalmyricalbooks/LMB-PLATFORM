# Storefront (shop pages, checkout, SEO, photos)

Shopper-facing pages, checkout (`src/app/Checkout.tsx` too), SEO and prerendering, photos and the storefront bundle. Every storefront part must be editable in Studio: read the rules under Theme editor in `src/app/admin/studio/CLAUDE.md` before adding one. The repo-wide rules are in the root `CLAUDE.md`.

**New storefront extras live in one folder (25 October 2026).** A line, button or box a Studio switch turns on goes in
`features/site/extras/<name>/`: its component, its tests and a `feature.ts` (`StorefrontFeature`, `extras/featureKit.ts`) listing its
Style controls (group, `after`, sub-section), Text & labels words and click-to-edit regions. `extras/registry.ts` collects every folder
(`import.meta.glob`), and STYLE_GROUPS, STYLE_SUBSECTIONS, COPY_SCHEMA and REGION_GROUPS add them, so a new extra edits none of those
lists by hand. feature.ts holds data only (shopper code reads it). `extras/featureKit.test.ts` checks every folder. Move an older extra
into a folder when you next change it. Moved so far: `pdp-payment-icons`, `pdp-tax-note`, `footer-back-to-top`,
`cart-tab-reminder` (26 October 2026), `pdp-in-bag`, `pdp-free-shipping`, `pdp-ship-by`, `pdp-ask-question`,
`pdp-sale-countdown`, `footer-currency`, `pdp-release-countdown` (27 October 2026); each move left the four lists identical
apart from the order of `files`. Folders apply in name order, except that a folder whose anchor (`after`, `subsectionAfter`, copy or
regions `after`) names a key or id another folder adds applies after that folder (`orderFeatures` in featureKit.ts; `pdp-free-shipping` anchors on
`pdp-release-countdown`'s keys); a missing anchor, or two folders anchored on each other, throws.

## Standing rules

### Authority and checkout
- Every price, total, discount, tip, fee, deposit, pickup, ship-by and tax line in the browser is display only; the server prices and charges, and only the order record's `paid` confirms an order. Never add a second sign-up or payment path to a page that links to another (Classes links to Book a time).
- Checkout steps and landing outcomes are events in `features/site/checkoutFlow.ts`, never new `useState` flags. Step components (`Checkout*Step.tsx`, `CheckoutOrderSummary.tsx`) are display only; state, checks and payment calls stay in `Checkout.tsx` (`checkoutWiring.test.ts`).
- Add any new shopper-editable order field to `cardAttemptKey`; `createCheckoutSubmission().reset()` runs only from `onPageRestored`. A missing or wrong-mode publishable key blocks payment; never fall back to hosted Checkout.
- Server refusals map to Text & labels words by code, never raw. Optional server asks (pickup times, bookings, membership) fail open, so checkout never blocks on them; ask only when the feature is live.
- No third-party IP lookup in the browser. Client and server exchange-rate freshness windows and bounds stay equal.

### Shop profile and addresses
- `src/lib/shopProfile.ts` is the only door to the shop's Firebase web settings, functions region and bot-check key; `public/shop-profile.js` must equal `DEFAULT_SHOP_PROFILE` (tested), all or nothing. Never put plan, test mode, payment account or emails in the profile (server-only).
- Canonical, `og:url` and JSON-LD links are built on `shopOrigin()` (`lib/canonicalUrl.ts`), never `window.location.origin`. Keep the template name `Your Press` in `index.html` (`scripts/indexShell.test.ts`); the front door (`functions/frontDoor.js`) swaps in the shop's name.
- Build product links with `productHref(slug)` / `productSegment()` (`lib/productHref.ts`), never a hard-coded `/books/`; code reading an address back accepts both `books` and `products` (`productSlugOf`, `isProductPath`).
- Product slugs stay unique and catalog records are never rewritten to fix one.

### Bundle and data
- The shopper entry stays free of Auth, the full Firestore SDK and `admin/api.ts`: get Lite through `lib/lite.ts` (`await lite()`), never a static Firebase import (`lib/shopperBundle.test.ts`).
- Animate with `m.*` under `LazyMotion`, never `motion.*`; no CSS `transition-all`/`transform` on a motion-animated element. Every third-party tag (analytics, Clarity, ad pixels) loads through `lib/afterPageLoad.ts`.
- Ad pixels load only after `consentAllows("marketing")`, never in the Studio preview, share links, the owner's browser or for robots; purchase events only for paid orders, with amount, currency and order number only.
- The catalog file (`dist/storefront-data.json`) never carries a field the Firestore path lacks, and both share transforms. Catalog triggers never use `retry: true` (`functions/catalogVersion.test.js`).
- Preview and prerender never write, send or email; feature pages answer Studio's preview from their `*Preview.ts` samples. Clocks and countdowns start after mount.
- Members-only page words never go into the public snapshot or design; they come from the server for members.

### Feature pages (bookings, events, classes, support, membership, rentals)
- Each is its own Studio surface with token-only `*Style.ts`, pure `*Rules.ts`, `*Ask.ts` requests and regions per part; all words in Text & labels with French twins in `frenchCopy.ts`.
- Header/footer links follow the server-kept `settings/website.*Live` flags (`tellWebsite`), never an admin write. Buyer/manage views reached by `?id&key` are noindex. Extend `scripts/studio-e2e.mjs` and the Studio fixture's query flag for a new page.
- Only `/book` may be framed (`firebase.json` `frame-ancestors`, `hostingConfig.test.ts`); never frame it in Studio's preview.

### Photos and Storage
- Never render `photos[n].url` for a shopper: use `photoSrcSet`/`smallPhotoUrl`; new grids pass `gridPhotoSizes` with their real columns. Frame-filling `<img>`s spread `framingStyle` beside `<PhotoToneDefs>` (`photoFraming.test.ts`).
- Keep `storageImageSweep`'s ladder equal to `BOOK_PHOTO_WIDTHS`. Never upload to a path later overwritten. Book `<video>`s start muted with `controls`; samples use `preload="none"`.

### SEO and feeds
- Private pages (account, checkout, tracking, previews) are noindex and stay out of the sitemap and prerender. A failed catalog read is never `fresh`, so it never shows "not found" or noindex.
- Star ratings come from approved reviews only; never fabricate reviews or ratings. JSON-LD written in markup goes through `safeJson` (`r2Security.test.ts`).
- `merchantFeed.mjs` keeps its own kind list (checked against `productKind`) and creator names equal to `bookCreators`; the social CSV comes from the same `merchantFeedItems`. Hosting serves feeds and root `*.json` `no-cache`.
- Live money that changes on screen carries `translate="no"`; never a page-wide `notranslate`.

## Feature notes

Details of each feature live in [`docs/agent-notes/site.md`](../../../../docs/agent-notes/site.md) (read the section before changing that feature; Grep its heading). Sections:
- Public storefront readiness repairs (2 October 2026)
- Checkout order slip (22 October 2026)
- Checkout carrier delivery estimates
- Storefront bundle (9 October 2026)
- Prerendered page hand-over (15 October 2026)
- Storefront loading performance (4 October 2026)
- Stripe checkout payment section (4 October 2026)
- Book SEO pane (5 October 2026)
- Crawlable public HTML
- Collection indexing (7 October 2026)
- Automatic SEO refresh and catalog search controls
- Coming soon books (12 October 2026)
- Search drawer (21 October 2026)
- Pickup availability on book pages (21 October 2026)
- Free-shipping line on book pages (22 October 2026)
- Second photo on hover (22 October 2026)
- Formats on shop cards (22 October 2026)
- Author line on shop cards (23 October 2026)
- Shipping & returns tab on book pages (22 October 2026)
- Ships-by line on book pages (22 October 2026)
- Back to top button (22 October 2026)
- Footer currency picker (22 October 2026)
- Header hides on scroll down (22 October 2026)
- Sale countdown on book pages (22 October 2026)
- Added-to-bag notice (22 October 2026)
- Discount code box in the bag (22 October 2026)
- Order note in the bag (22 October 2026)
- Terms checkbox in the bag (22 October 2026)
- Save for later in the bag (22 October 2026)
- Announcement countdown (22 October 2026)
- Checkout experience + stock-hold tuning (10 October 2026)
- Checkout address finder (12 October 2026)
- High-quality photos (12 October 2026)
- Storage bandwidth (15 October 2026)
- Catalog file on Hosting (15 October 2026)
- Book videos (15 October 2026)
- Page translation (12 October 2026)
- Ask a question on book pages (22 October 2026)
- Pop-up trigger (22 October 2026)
- Sold-out books last (22 October 2026)
- Books load as shoppers scroll (22 October 2026)
- Zoom follows the mouse on book photos (22 October 2026)
- Already in your bag on book pages (23 October 2026)
- Sale savings in the bag (23 October 2026)
- Suggestions in an empty bag (23 October 2026)
- Tab reminder (23 October 2026)
- Release countdown on pre-orders (23 October 2026)
- Announcement bar close button (23 October 2026)
- Tax & shipping note on book pages (23 October 2026)
- Star ratings on shop cards (23 October 2026)
- Shop filters in the address (23 October 2026)
- Read more for long descriptions (23 October 2026)
- Ships-by line in the bag (23 October 2026)
- More by this artist on book pages (23 October 2026)
- Payment icons on book pages (23 October 2026)
- Analytics tags load after the page (27 October 2026)
- Shop profile read at page open (27 October 2026)
- Google Shopping and search data for products beyond books (plan 10.21, 29 October 2026)
- Bulk quote on book pages (2 November 2026, platform plan 14.8)
- Instagram, Facebook and Pinterest file (3 November 2026, platform plan 24.7)
- Product addresses follow what the shop sells (4 November 2026, platform plan 12.18 part 5)
- Help centre in the FAQ section (13 November 2026, gap list 29)
- Ad tracking tied to the cookie banner (13 November 2026, gap list 37)
- Book a time page (Bookings beta, 14 November 2026)
- Events page (Events and tickets beta, 17 November 2026)
- Pickup times at checkout (17 November 2026)
- Classes timetable page
- Newsletter tick on free downloads (Digital D2c, Beta, 17 November 2026)
- Listen and watch (Digital D3, Beta, 17 November 2026)
- Free samples on product pages (Digital D3b, Beta, 18 November 2026)
- Support page (Donations & tips beta, G1b, 18 November 2026)
- Tip at checkout (Donations & tips beta, G1c, 18 November 2026)
- Membership page and the account's membership card (Memberships beta, M1c, 18 November 2026)
- Members-only pages (Memberships beta, M2b, 18 November 2026)
- Rentals page (Rentals beta, R1b, 18 November 2026)
- Size, colour and scent filters (18 November 2026)
- Checkout fields, custom pages and footer (moved from the root guide)
