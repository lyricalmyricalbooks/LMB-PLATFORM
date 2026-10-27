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

## Public storefront readiness repairs (2 October 2026)

Public product links retain unique slugs and use immutable book IDs when slugs collide; catalog records are never rewritten. The storefront reads the entire paginated catalog and the sitemap uses the same route resolver. Unknown URLs show editable recovery content. Custom pages share the support/policy footer, with **Show page footer** in Studio > Style > Custom pages.

Phone navigation (`MobileStorefrontNav`, shared by the homepage and standalone page/product header) defaults to a sideways-scrolling row of tabs (`mobileNavStyle: "tabs"`, size `mobileNavTabSize`); a category with sub-categories is a `NavDropdown` tab like the desktop header. Studio > Style > Header & announcement bar > **Phone navigation style** switches to the keyboard-accessible disclosure menu (`"menu"`, label Text & labels > Header > **Mobile menu**). **Show phone navigation** controls visibility; existing header visibility controls apply inside both. Missing-page visibility controls live in Style > Custom pages; words remain in Text & labels > Custom pages & 404.

Checkout rejects placeholder/wrong-mode publishable keys and disables payment until an inline Stripe Element is ready. Teardown is idempotent and exception-safe. Admin payment readiness reports invalid keys. Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged. A production payment is still unverified until the owner configures valid Stripe credentials and completes a sandbox order, webhook, refund, email and fulfillment walkthrough. Public placeholder content still needs owner review.


## Checkout order slip (22 October 2026)

**Checkout page files (27 October 2026):** `Checkout.tsx` is being split by section, moving code as is. The form fields
(`Field`, `RegionField`, `AddressField`, `FieldError`, `SectionHead`, the `LabelsAbove` context) are in
`features/site/CheckoutFields.tsx`; source-text tests (`checkoutWiring.test.ts`) read that file for field wiring.
The three steps draw in `CheckoutAddressStep.tsx` (contact and ship-to), `CheckoutDeliveryStep.tsx` (delivery choice and the
pickup billing region) and `CheckoutPaymentStep.tsx` (total, payment choices, notices, policy tick box, Pay button). They are
display only: every value and handler comes in as a prop, the state, checks and payment calls stay in `Checkout.tsx`, and the
card form (`StripeCardForm`, its express-wallet gate and retry) is built there and handed in as `stripeOption`. Their regions
are listed with `Checkout.tsx` in `checkoutLayout`'s files; `checkoutWiring.test.ts` reads them too. The order summary beside
the form (phone summary bar, lines, free gift, pre-order note, ledger, nudge, total, slip extras) draws in
`CheckoutOrderSummary.tsx` the same way: display only, every amount worked out in `Checkout.tsx`.

`Checkout.tsx` is concept A "Order slip" (Julian's pick): a ruled header (back link, wordmark with the last word in the accent,
Secure), a one-page form of lettered sections (`SectionHead`: Contact · Ship to · Delivery · Pay) and an outlined **Order slip**
aside (numbered lines with covers, discount/gift-card boxes, ledger, big total, footer strip). Every class is `fm-co-*`, all CSS
comes from `features/site/checkoutSlipStyle.ts` `checkoutSlipCss(design)` (token-only, scoped to `[data-fm-checkout].fm-co`; field
rules use `:not(#fm-studio)` + `!important` to beat the Riso dark field reset and fold in `checkoutFieldBg/Border/InputRadius`).
Labels sit above boxes (`checkoutLabelStyle`, "floating" = the old look; `CountryField` `stacked`). Payment methods are tabs or a
list (`checkoutPayTabs`; `StripePaymentSection` `tabs`, in tabs mode its panel wraps only the chosen method's body under the tab row). Below 1024px the slip folds into
a bar at the top (`.fm-co-slipbar`, `data-open`) and the code boxes render a second time inside Pay; on phones `checkoutPhonePayBar`
pins a Pay bar (`<button form="fm-checkout-form">`, region `checkoutPayBar`, required). Controls: Studio › Style › Checkout page ›
Header & sections / Fonts & form fields / Pay button & payment choices / Order slip; words Text & labels › Checkout (Steps & headings,
Order slip). Express wallets stay inside the Stripe payment section (they need the filled form); submission, pricing and payment
logic are unchanged.

## Checkout carrier delivery estimates

Live checkout shipping quotes preserve Shippo `estimated_days` and `duration_terms` for each
customer address, parcel and service. Missing carrier timing has no invented 3-7 day fallback.
Checkout displays carrier transit estimates after dispatch rather than calculating an arrival
promise from the order date; carrier terms stay separate from numeric days. Labels for transit
and unavailable timing are editable in Studio > Text & labels > Checkout. Static profile estimates
retain their existing Studio-controlled presentation. Deploy the updated `getShippoRates` Function
with the frontend. Live carrier response verification is separate from fixture-based tests.


## Storefront bundle (9 October 2026)

The shopper entry bundle must stay free of Firebase Auth, the full Firestore SDK and `admin/api.ts`.
Storefront reads/writes use **Firestore Lite** (`lib/firestoreLite.ts` `liteDb` + functions from
`firebase/firestore/lite` — never mix its refs/snapshots with the full SDK) via `lib/publicApi.ts`
(books, settings, pages, shipping profiles, visits; `adminApi` re-exports these). Admin, Checkout and
Account keep the full SDK from `lib/firebase.ts`. Shopper code that needs the signed-in user calls
`restoredUser()` / `loadAuth()` from `lib/authSession.ts`, which loads Auth only when the browser may hold a
saved sign-in. Storefront animations use `m.*` from `motion/react` under the `LazyMotion` +
`MotionConfig reducedMotion="user"` wrapper in `App.tsx` (engine in `lib/motionFeatures.ts`, domAnimation:
no layout/drag); don't put CSS `transition-all`/`transition-transform` on an element motion animates.
The prerender blocks Lite's REST writes (`documents:commit`). Check with `npx vite build`: the `index-*.js`
entry was ~205 KB gzipped after this change.
**Firebase loads on first use (15 October 2026):** shopper code gets Firestore Lite through `lib/lite.ts`
(`const { doc, getDoc, liteDb } = await lite()`), never a static import from `firebase/firestore/lite`,
`lib/firestoreLite` or `lib/firebaseApp`; `functionFetch` loads App Check the same way and `authState` lives in
`lib/authState.ts`. That keeps Firebase + App Check (~50 KB gzip) out of the entry (`index-*.js` ~176 KB gzip on Vite 6;
Vite 8 splits it, so measure everything `dist/index.html` loads up front: ~286 KB gzip with React 19, October 2026;
the header's search overlay and the shop toaster are `lazy`, and the theme toggle avoids ui/button's tailwind-merge);
`lib/shopperBundle.test.ts` fails on a static import in the shopper modules.

## Prerendered page hand-over (15 October 2026)

The landing page's server-rendered HTML stays on screen until the app can draw the same page with data
(`lib/prerenderedPage.ts`): `main.tsx` keeps `#root`'s HTML and starts `preloadSiteData()`; App's Suspense fallback
(`PageLoading`) re-shows that HTML instead of `BootSplash`; `MainSite`/`BookDetail`/`PageView` are wrapped in
`whenPrerenderedReady` (their code resolves once the shop data is in, max 5 s) and `useSiteData` starts from that read
(`preloadedSiteData`). Pages mounted during the hand-over skip their entrance animation (`arrivedPrerendered`: MainSite
cards, `SectionReveal`); the first navigation ends it. Never in the Studio preview or a share preview. The snapshot
(`captureDocument`) loads Google Fonts as preload+onload (deduped) and shows SkeletonImage photos (`data-fm-fade`,
`data-fm-skeleton` removed). The first shop cards load eagerly (`priority`, first two `fetchpriority="high"`).

## Storefront loading performance (4 October 2026)

Storefront components share one catalog/settings/published-pages bootstrap request, including
in-flight loads and route remounts. Successful display data is reused for 30 seconds; the next
mount after that refreshes it. Failed requests remain retryable and session-cached content
stays visible during refresh. The session cache is read only when a hook mounts, rather than
on every render. Studio snapshots still override backend data. Authoritative checkout prices,
stock validation and webhook payment handling are unchanged.


## Stripe checkout payment section (4 October 2026)

Checkout inserts `features/site/StripePaymentSection.tsx` with Stripe's actual
Payment Element fields inside the page. The method radio label is separate from
those interactive fields. Payment requires a valid mode-matched publishable key
and an Element-ready event. Missing/invalid keys block payment; they never route
to hosted Checkout. Legacy `stripeRedirect` design values are ignored and the
redirect control is removed from Studio. Failed/stalled loading offers an inline
Reload payment form action before a payment attempt; the form stays on checkout.
Studio > Style > Checkout · Stripe payment section owns responsive panel,
selector, card badges and recovery layout; required payment/recovery controls
cannot be hidden. Text & labels > Checkout owns all labels, badge text and retry
copy. Existing form background, padding, radius and fonts continue to apply.
Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged.
Checkout submission locks synchronously before asynchronous field validation,
disables payment-method switches while processing, and retains the lock during
provider navigation. Failed validation/service calls release it for correction.
The flow itself (form → paying → confirming) is one pure reducer, `features/site/checkoutFlow.ts` (`checkoutFlow`,
`confirmationView`, `readReturn`, tested in `checkoutFlow.test.ts`): add a new step or landing outcome there as an
event, never as another `useState` flag in `Checkout.tsx`. Only the order record's `paid` confirms an order.
Actual field display can be verified without submitting a payment; authenticated
sandbox payment, webhook, refund and email verification remain separate.

Stripe field appearance follows Studio checkout field background, text, border, font, accent and corner-radius controls inside the secure iframe. Riso defaults use square, visibly outlined idle fields with accent focus outlines and danger outlines for invalid fields; payment tabs share the same border treatment.


## Book SEO pane (5 October 2026)

Catalog > Edit book > Search (SEO) owns `metaTitle`, `metaDescription` and optional
HTTPS `seoImage`, saved with the book through the existing admin-only write path.
A custom search title is used exactly; blank fields use catalog content and the
published Studio Site & sharing defaults. The pane previews the effective title,
plain-text description, collision-safe canonical URL and sharing image, and offers
content checks, catalog-default reset and a deployed-URL Rich Results Test link.
Checks are guidance, not a ranking score. Catalog copy and URLs are never bulk rewritten.

`lib/bookSeo.ts` supplies book metadata and Product + Book JSON-LD. The public
PDP uses its displayed currency, price and selected-edition availability, including
backorders. No reviews/ratings are fabricated. `lib/seo.ts` updates canonical and
social URLs on router navigation, strips query/fragment parameters, clears stale
sharing images, and marks previews and private account/checkout/tracking pages noindex.
`index.html` has no fixed homepage canonical that conflicts with product routes.

`build:sitemap` lists published book/page routes, escapes URLs and removes personal
pages. Book/page fetch failures fail the build instead of silently dropping their
URLs; the optional legacy collections endpoint may be unavailable and is reported.
Robots paths follow the deployment sub-path; Google reads robots.txt at the origin
root, so a project-folder robots.txt alone is not an origin-wide crawl restriction.
Private pages also use noindex metadata. Rebuild/deploy the sitemap when catalog
routes change. No new Firestore collection, rule, index or Function is required.

Verification covers focused SEO regression tests, the complete Vitest suite,
production build with public catalog reads, and local desktop/phone fixture checks
for preview/edit/save/reset and rendered PDP metadata. Fixture save evidence is not
live Firestore persistence. Google rankings/indexing and a live Rich Results Test
remain external verification. Firebase Hosting answers prerendered product routes directly with 200 and unknown
URLs with a real 404 (the old GitHub Pages SPA 404 redirect is gone). After deployment submit the sitemap and inspect
URLs in Search Console.

## Crawlable public HTML

**Richer book listings (8 October 2026):** Book JSON-LD adds `bookFormat`, `numberOfPages`, `datePublished`, `bookEdition` (selected edition wins) and `gtin13` (only a check-digit-valid ISBN-13, `isbn13`) — blank fields are omitted. Fallback meta descriptions end on a word (`snippet`); custom ones stay exact. `useSEO` sets `max-image-preview:large` on indexable pages, drops empty `og:image`/`twitter:image` (card falls back to `summary`), adds `og:image:alt`, optional `product:price:*`/`product:availability` (PDP passes `product`), and removes index.html's no-JS fallback `#seo-jsonld-static`. PDP photos use each photo's Media alt text, falling back to Text & labels `bookPhotoAlt`.

**Creators and share image (12 October 2026):** the editor's "Author / contributors" box is `book.subtitle`; `bookCreators` (`lib/bookSeo.ts`) reads it (else legacy `authorName`), splits lists and drops group credits ("Various artists", "AA.VV.", "A x B"). Book JSON-LD `author` lists those Persons (a legacy `authorName` still wins), `autoBookSeo` uses them, and a book with no `metaTitle` gets `defaultBookTitle` — Text & labels › Site & sharing › `seoBookTitleByline` ("{title} by {author}") while that is ≤ 50 characters, else the plain title (BookDetail and the Search (SEO) pane preview agree). Home/collection `useSEO` images are `design.shareImageUrl`, else the first published book's cover — never `settings.assets.profileUrl` (the default settings' 100px stock photo). PDP thumbnail `<img>`s carry the same `bookPhotoAlt` fallback as the main photo (their buttons keep their aria-label).

**Artist links (18 October 2026):** Books › edit › Search (SEO) › **Artist links** saves `book.creatorLinks` (`[{ name, url }]`, public,
http(s) only, ≤10, cleaned by `creatorLinks` in `lib/bookSeo.ts`). `creatorPeople` gives each credited creator (`bookCreators`, else
`authorName`) `url`/`sameAs` from links with the same name (case-insensitive); links naming nobody in the credit become `contributor`.
The Details tab lists them as followed links (Style › Book page · photos & layout › `showPdpArtistLinks`, label Text & labels ›
Product page › `specArtistLinks`). `seoChecks` adds `creator` (listing names the artist) and `creatorLink` for books with a named creator.

**Google indexing + feed artists (18 October 2026):** Books › More catalog actions › **Google indexing** (`admin/GoogleIndexDialog.tsx`,
pure `admin/googleIndex.ts`) sends the home page and every sitemap-eligible book URL (≤30) to `searchConsole` `op: "inspect"` (URL
Inspection API, same metadata token; URLs must sit inside the property, `inSite`) and links each to Google's `inspectionResultLink`
(Request indexing exists only in Search Console's own UI). The Merchant feed titles add "by <artists>" and `g:product_detail` Author rows
(`creatorNames` in `merchantFeed.mjs`, kept equal to `bookCreators` by `merchantFeed.test.ts`).

**Press profile + llms.txt (18 October 2026):** `bookStructuredData` takes `shopUrl`: the offer's seller, and a `publisher` that
names the shop (`namesShop`), become the home page's `#organization` @id (`shopRef`); other publishers stay plain names. The home
BookStore adds `email`, a town-only `address` (never the street) and `sameAs` = Style social links + Text & labels › Site & sharing ›
`seoProfiles` (`profileLinks`, https only). `scripts/llmsTxt.mjs` (written by `generate-sitemap.mjs`, checked by `hosting-smoke.mjs`)
publishes `/llms.txt`: shop summary, live indexable books with artist/format/pages/language/ISBN (no prices), published pages, policies.

**Rich results (October 2026):** pages emit one JSON-LD `@graph` — home BookStore+WebSite, book Product/Book + breadcrumb + star rating from approved reviews only (`reviewsApi.listApproved`, shared with the reviews section), collection CollectionPage/ItemList, page breadcrumbs (`lib/bookSeo.ts`, `docs/SEO_CRAWLABILITY.md`). The sitemap lists book photos as `image:image`.

Production builds render the public sitemap into real HTML route documents via
`scripts/prerender-storefront.mjs` (see `docs/SEO_CRAWLABILITY.md`). Home, book,
custom-page and collection routes use the actual published storefront DOM;
account, wishlist, checkout, tracking and admin routes are excluded. Chromium is
installed by the storefront workflow. Snapshots update on deployment; rerun Deploy storefront
after publishing catalog or Studio changes. Browser storage and settings objects
are never serialized; render-time Firestore writes/analytics are blocked. Payment
and inventory authority remain live and unchanged. Install Chromium locally with
`pnpm exec playwright install chromium` before `npm run build`.

Public SEO/catalog pagination uses document IDs so records without `createdAt` are included consistently with the sitemap. Admin sorting is unchanged. HTML builds decline analytics/marketing consent and require completed custom-page content.

## Collection indexing (7 October 2026)

Collection pages with no published, released books receive `noindex, follow` and are
omitted from the sitemap. Empty visible Studio categories remain in the prerender
route list so their initial HTML carries the same instruction. Search, sort and stock
filters do not change indexing; sold-out books still count. Renamed category URLs
canonicalize to current names. `categoryMembership.mjs` shares alias, parent and
PUBLICATIONS membership between navigation and sitemap generation. Published and
activated scheduled Studio designs remain authoritative; draft categories stay private.

## Automatic SEO refresh and catalog search controls

The storefront workflow checks published Firestore catalog/pages/settings every 15 minutes,
compares the published-content SHA-256 marker, and rebuilds only on a change. Draft-only
Studio edits do not trigger refreshes; scheduled release visibility does. Push/manual
builds always run. Only successful deployments advance the public digest marker.
Studio visible categories (including visible children) own collection sitemap URLs and
collection SEO copy. Books > Search (SEO) exposes `seoNoindex`: excluded books remain
available to shoppers, receive noindex HTML, and are omitted from the sitemap.
Studio > Text & labels > Site & sharing owns the public Google Search Console verification
token. Google property verification/submission still requires the owner's Search Console access.

**Refund/dispute sync (7 October 2026):** `syncStripeReversal` in `functions/index.js` is the one place a Stripe
refund or dispute changes an order (full refund → refunded/cancelled, stock back, revenue reversed, once; partial
refund → `partiallyRefunded` + `refundedAmountMinor`, stays paid; dispute → `disputeStatus`). It is fed by the
`charge.refunded` / `charge.dispute.*` webhooks **and** by direct Stripe reads (`checkStripeReversal`): the status
action for paid orders (admin order open / **Sync with Stripe**) and `unpaidPaymentSweep`, which re-reads paid Stripe
orders (≤120 days) at most every 6 h (`ordersDueReversalCheck`, `stripeCheckedAt`).
**Cheaper sweep bookkeeping (15 October 2026):** the sweep's check times live in one server-only record,
`systemStatus/stripeReversalChecks` (`{ v, orders: { id: [paidMs, checkedMs, triedMs] }, scannedFrom, reconciledAt }`,
`functions/reversalSchedule.js`, pure with injected I/O), not on the orders: sweep checks pass `onChecked` and never write
the order (which woke `onOrderUpdated`/`onOrderInventoryPush`); the admin status check still stamps `stripeCheckedAt`
(its 60 s throttle), and an order's own stamp counts as a check. Each sweep scans (`paidOrderScanner`, `SCAN_FIELDS` only,
`PAID_STATUSES`) the orders paid since the last sweep minus 30 min; every 6 h, or with no/old record, after a short scan
filled its 500 page, or when `systemStatus/stripeReversalRecheck.at` is not older than the last re-read, it re-reads all paid
orders of 120 days (newest first, ≤5,000) and drops orders that left. `revertFailedRefund` writes that request
(`requestReversalRecheck`, straight after its transaction, before the revenue write: a retried webhook can't ask again), because a reverted refund is paid again with its old `paidAt`, which the short scan can't see.
Due orders (40 + 10 spare) are read whole with `getAll` (never with no ids); orders the admin just synced free their slots for
the next due ones (up to 3 rounds, `MAX_DUE_READS` 150). `onChecked` runs only after the sync applied, an unanswered order is
retried each sweep after the simply-due ones, the record (a copy) is saved by `stopBy` even if Stripe hangs, no check starts
after it, and a failed save stamps the checked orders instead. A record that can't be read skips that sweep's checks; a
backlog beyond 40 due is logged. Timing is unchanged (first sweep after payment, then every 6 h; 40 per sweep). The record's
`orders` map is exempt from indexing (`firestore.indexes.json`); `scripts/restore-json-backup.mjs` deletes the record after
restoring orders so they are re-checked at once.

## Coming soon books (12 October 2026)

Books › edit › Inventory › **Coming soon** (`comingSoon: true`) shows a published book that can't be bought yet. One rule,
`features/site/comingSoon.ts` `comingSoonActive` (server: `purchaseProblem` in `functions/paymentGuards.js` refuses it as
`unavailable`, so every checkout path refuses it). It wins over Pre-order (the editor switches the other off). `addToCart`
refuses it, `repriceCart` drops saved lines, `quickAddChoice` returns `{ inStock: false, comingSoon: true }`; it is never shown
as Sold out. Product page: stock line `pdpComingSoon` / `pdpComingSoonDate` (Publication date, `data-state="soon"`), the buy
button reads `comingSoonButton` and opens `BackInStockForm comingSoon` (`#pdp-coming-soon-signup`, same `stockAlerts` doc for
the whole book, variantId ""); no qty, Buy it now or sticky bar. Cards: `comingSoonBadge` (shop grid, wishlist, related);
section quick-add hides. Studio: Style › Badges › `showComingSoonBadge`, Product page › `showComingSoonSignup` (off = the button
is a disabled label). JSON-LD says OutOfStock. Turning the switch off fires `onBookRestocked` (`before.comingSoon === true`):
signups get an **Out now** email for editions with stock (`releasePending` carries the wording to `backInStockSweep`); while
it is on, no back-in-stock email is sent. Admin › Books has a Coming soon badge and status filter. Deploy Functions with the frontend.

## Search drawer (21 October 2026)

`features/site/SearchOverlay.tsx` is concept A "Catalogue index" (Julian's pick): a full-width drawer from the top, the typing
line in the heading font, and three columns. Before typing: New in the shop (`newestBooks`), Browse (`visibleCategoryCounts`,
shop categories passed from `StoreHeader` as `categories`), recent + popular searches. While typing: Books (cover, credit,
format, stock word `stockState`, price; arrow keys move the outlined row), Artists (`matchingArtists`, from `bookCreators`, link
to the search results page) and Categories (`matchingCategories`, link to `/collections/<slug>`), typed letters marked with
`markMatches` (pure helpers in `features/site/searchPanel.ts`). No results shows category chips (`searchTry`). Words: Text &
labels › Search & filters (`search*`); each part is a region in Style › Search · layout & elements. Phone input size comes from
the row (index.css floors phone inputs at max(16px, 1em)).

## Pickup availability on book pages (21 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Pickup availability** (`showPdpPickup`, off by default)
draws "Pickup available at <location>" under the buy buttons (`features/site/PickupAvailability.tsx`, region `productPickup`),
with the location's estimate and a **View pickup details** disclosure (town, fee, hours, nearby-only note). Locations come from
`settings.localFulfillment` (Settings › Shipping › Local pickup & delivery) through pure `pickupSpots` (`pickupAvailability.ts`):
nothing while pickup is off or fails `validateLocalFulfillment`, and only for physical copies by checkout's own rule
(`catalogFulfillmentItems`); hidden when sold out or Coming soon. Display only: checkout still decides pickup choices and prices.
Words: Text & labels › Product page (`pdpPickup*`).

## Free-shipping line on book pages (22 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Free-shipping line** (`showPdpFreeShipping`, off by default)
draws "Free shipping on orders over {threshold}" under the buy buttons (`features/site/extras/pdp-free-shipping/PdpFreeShipping.tsx`, region
`productFreeShipping`), switching to "Add {amount} more…" / "Your order ships free" from the printed books already in the bag.
Pure `pdpFreeShipping` (`pdpFreeShipping.ts`) uses the bag bar's rule (`shopFreeShipThreshold`, `shippableBagTotal`) and
checkout's physical rule (`isPickupItem`); hidden for e-books, gift cards, sold-out and Coming soon. Display only.
Words: Text & labels › Product page (`pdpFreeShip*`).

## Second photo on hover (22 October 2026)

Studio › Style › Book cards in the shop grid › Grid & columns › **Show the book's second photo when the mouse is over a card**
(`showCardHoverPhoto`, off by default) fades MainSite's shop-grid cards to the book's next plain photo (`cardHoverPhoto` in
`features/site/cardHoverPhoto.ts`: skips videos and non-http URLs; none = the cover stays). `features/site/CardHoverPhoto.tsx` fetches it
only after the card's first mouse `pointerenter` or `focusin` (Storage downloads are billed), shows it only with a fine pointer or focus,
uses the grid's `gridPhotoSizes`, `framingStyle` + `PhotoToneDefs` and the Zoom hover effect, has empty alt and is skipped on faded
sold-out cards. Shop grid only (not the Product grid sections). No words, no rules, no Functions.

## Formats on shop cards (22 October 2026)

Studio › Style › Book cards in the shop grid › Grid & columns › **List a book's formats under its card** (`showCardFormats`, off by
default) adds a `.fm-card-formats` line under MainSite's shop-grid card title/price ("Paperback · E-book"). Pure `cardFormats`
(`features/site/cardFormats.ts`) uses the format filter's `bookFormats` minus "other" and shows only 2+ formats. Format words are
Text & labels › Search & filters (`filterFormat_*`); the read-aloud lead is Catalog & empty states › `cardFormatsLead`. Display only.

## Author line on shop cards (23 October 2026)

Studio › Style › Book cards in the shop grid › Grid & columns › **Show the author or artist under each card's title**
(`showCardCreator`, off by default) adds a `.fm-card-creator` line under MainSite's shop-grid card title/price: the book's
Author / contributors credit as typed (`subtitle`, else `authorName`; pure `cardCreator` in `features/site/cardCreator.ts`, one
line, cut at a word near 120 characters). No credit = no line. Read-aloud lead Text & labels › Catalog & empty states ›
`cardCreatorLead`. Display only.

## Shipping & returns tab on book pages (22 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Shipping & returns tab** (`showPdpPolicyTab`, off by default)
adds a `policies` tab/accordion beside Description and Details (tabs and accordions layouts only) showing the shop's own
`settings.policies.shipping` / `.returns` text (`policyHtml`, escaped) with a link to `/page/policy-<key>`. Pure `pdpPolicyEntries`
(`pdpPolicyTab.ts`): shipping only for physical copies (`isPickupItem`), returns always, none when both are blank. Unlike the other
text tabs it is never kept hidden in the HTML (the same words on every book page aren't book content). Region `productPolicies`;
words Text & labels › Product page (`tabShippingReturns`, `pdpPolicyReadMore`); GA4 tab name `shipping_returns`.

## Ships-by line on book pages (22 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Ships-by line** (`showPdpShipBy`, off by default) +
`pdpShipByDays` (working days, default 2), `pdpShipByCutoff` (Toronto hour, default 14), `pdpShipByCountdownHours` (default 4,
0 = no countdown) and `pdpShipByClosedDays` (YYYY-MM-DD list): "Order now — ships by {date}" under the buy buttons
(`features/site/extras/pdp-ship-by/PdpShipBy.tsx`, region `productShipBy`), "Order within {hours}h {minutes}m" near the cut-off. Pure `shipBy.ts`
(Mon–Fri Toronto minus closed days). Drawn only after mount (never in the prerender), only for printed copies in stock (not
pre-orders, backorders, Coming soon, e-books, gift cards). Display only. Words: Text & labels › Product page (`pdpShipBy*`).

## Back to top button (22 October 2026)

Studio › Style › Footer & social links › What the footer shows › **Show a “Back to top” button once shoppers scroll down**
(`showBackToTop`, off by default) + **Back to top button corner** (`backToTopPosition`, right/left). `features/site/extras/footer-back-to-top/BackToTop.tsx`
is rendered by `StoreFooter` (so every page with the shop footer has it; Checkout doesn't), fixed to a bottom corner, shown after
1.5 screens (`backToTopShown`, pure rules + token-only CSS in `backToTop.ts`), moves above the book page's sticky add-to-bag bar,
scrolls up (instant under reduced motion) and moves focus to the header. Region `footerBackToTop`; words Text & labels › Footer ›
`backToTop` (phones show only the arrow). Display only.

## Footer currency picker (22 October 2026)

Studio › Style › Footer & social links › What the footer shows › **Currency picker in the footer** (`showFooterCurrency`, off by
default) draws `features/site/extras/footer-currency/FooterCurrency.tsx` in `StoreFooter`'s bottom bar: a labelled CAD/USD/EUR drop-down that calls the
same `useCurrency().setCurrency` as the header picker (mounted only while on, so footers without a `CurrencyProvider` still render).
Region `footerCurrency`; words Text & labels › Footer (`footerCurrencyLabel`, `footerCurrencyCAD/USD/EUR`). Display only.

## Header hides on scroll down (22 October 2026)

Studio › Style › Header & announcement bar › Header layout › **Hide the header while shoppers scroll down**
(`stickyHeaderHideOnScroll`, off by default; only while `stickyHeader` is on). `features/site/headerReveal.ts`
(`nextHeaderHidden` pure, `useHeaderReveal` hook, used by both layouts of `StoreHeader`) slides the header up past
its own `top` after an 8 px move down once the page has passed the header and back on any move up; never while focus or an
`aria-expanded="true"` control is inside it. It writes only the header's transform, `data-fm-header-hidden` and
`--fm-header-offset` (0px while hidden). No words, no rules, no Functions.

## Sale countdown on book pages (22 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Sale countdown** (`showPdpSaleCountdown`, off by default) +
`pdpSaleCountdownWithin` (hours, default 72): in a dated sale's last hours the "Sale ends {date}" line under the price
(`features/site/extras/pdp-sale-countdown/SaleEndsLine.tsx`, region `productSaleEnds`) counts down to the real end, midnight Toronto after `saleEndsAt`
(pure `saleCountdown.ts`), ticking every 30 s, and hides once the sale has ended. The clock starts after mount, so the prerender
keeps the date line. Display only (the server's `saleActive` still decides the price). Words: Text & labels › Product page
(`pdpSaleCountdownDays/Hours/Minutes`).

## Added-to-bag notice (22 October 2026)

Studio › Style › Cart drawer (shopping bag) › After adding a book › **After a shopper adds a book** (`cartAddAction`: `drawer`
default = open the bag as before, `notice`) + `cartAddNoticeSeconds` (default 6, 0 = until closed). `CartDrawer` (always mounted in
App) tells `CartContext` the mode (`setAddBehaviour`); in notice mode `addToCart` sets `lastAdded` instead of opening the bag (an
already open bag stays the place to see it). `features/site/AddedToBagNotice.tsx` (pure rules + token-only CSS in `addedNotice.ts`)
draws it on the bag's own CSS (`.fm-bag.fm-bag-notice`, `cartDrawerCss`), pauses on hover/focus, Escape closes, closes on any page
change and never shows on checkout. Words: Text & labels › Cart (`cartAdded*`). Display only.

## Discount code box in the bag (22 October 2026)

Studio › Style › Cart drawer (shopping bag) › Total & checkout button › **Discount code box** (`cartDrawerShowDiscountCode`,
off by default) draws `components/CartDiscountCode.tsx` above the bag total: "Have a discount code?" opens a field that saves
the code with `rememberDiscountCode` (`features/site/sharedDiscount.ts`, same tab storage and format rule as a `?discount=` link),
and a remembered code shows with Remove. Checkout's shared-code effect fills and checks it like a typed code; the bag never
validates or prices it (no server call, no saving shown). Words: Text & labels › Cart › Discount code box (`cartCode*`).

## Order note in the bag (22 October 2026)

Studio › Style › Cart drawer (shopping bag) › Total & checkout button › **Order note box** (`cartDrawerShowOrderNote`, off by
default) draws `components/CartOrderNote.tsx` above the bag total: "Add a note to your order" saves the text for the tab as typed
(`features/site/bagNote.ts`, ≤500 characters, blank removes). Checkout's order-note box shows when `orderNoteBoxOn(design)`
(`showOrderNote` or this switch), starts from the bag note and keeps it in step; only that box sends `orderNote` (same rules limit,
same retry key). `clearCart` forgets the note. Words: Text & labels › Cart › Order note box (`cartNote*`).

## Terms checkbox in the bag (22 October 2026)

Studio › Style › Cart drawer (shopping bag) › Total & checkout button › **Terms checkbox** (`cartDrawerShowTermsCheckbox`, off by
default) draws `components/CartTermsAgree.tsx` above the bag's checkout button: "I agree to the {terms}." with the terms title
(`policyTitle`) linked to `/page/policy-terms` only when `settings.policies.terms` has text (`hasTermsPage`). Pressing the button
unticked shows `cartTermsError` (role=alert) and focuses the box; the tick is kept for the tab (`features/site/bagTerms.ts`). It gates
only the bag's button (checkout reached another way is not blocked; nothing is recorded on the order). Words: Text & labels › Cart ›
Terms checkbox (`cartTerms*`).

## Save for later in the bag (22 October 2026)

Studio › Style › Cart drawer (shopping bag) › Book rows › **Save for later button** (`cartDrawerShowSaveForLater`, off by default)
adds "Save for later" beside each bag line's Remove (`saveForLaterOn` / `canSaveForLater` in `features/site/saveForLater.ts`; never on
gift-card lines): the line leaves the bag and the book joins the wishlist (`useWishlist`), with a toast Undo that puts the line back and
takes the book off the wishlist only if the button added it. No-op on the Studio preview's sample line. Words: Text & labels › Cart ›
Save for later (`cartSave*`; Undo reuses `cartRemovedUndo`). Display/bag only; no rules or Functions.

## Announcement countdown (22 October 2026)

Studio › Style › Header & announcement bar › Announcement bar › **Announcement countdown** (`announcementCountdown`, off by default) +
`announcementCountdownWithin` (hours, default 72): a message from Announcement messages with a **Show until** day gets "Ends in 5h 12m"
after it (`.fm-announce-countdown`, `translate="no"`) in its last hours, counting to midnight Toronto after that day (pure
`features/site/announcementCountdown.ts`, reusing `saleCountdown`; `activeAnnouncements` now passes `until`). Static, rotating and ticker
bars all show it; the clock starts after mount (never in the prerender) and ticks every 30 s. The single Announcement text has no end day,
so no countdown. Words: Text & labels › Header (`announceEnds*`). Display only.

## Checkout experience + stock-hold tuning (10 October 2026)

- **Field errors:** `features/site/checkoutDetails.ts` `checkoutDetailProblems` is the one rule for what Pay needs (email, name,
  country, street, city; state only where `regionsFor(country)` lists them; postal code unless `postalCodeOptional`; e-book-only bags
  need only country + listed province). The page is a `<form noValidate>`; each problem shows under its box (`aria-invalid`,
  `aria-describedby`, words `coErrField*`) and focus moves to the first. The same problems keep Apple/Google Pay off (`expressWalletEnabled`).
  Keep CLAUDE.md's submission-lock rules: `createCheckoutSubmission().reset()` runs only from `onPageRestored` (browser Back from PayPal).
- **Retry key:** `cardAttemptKey` (`cardAttempt.ts`) includes the order note and address-check result; add any new order field the shopper can edit to it.
- **Live rates:** `getShippoRates` answers are dropped unless they belong to the newest request (`createLatestGuard`) and give up after
  `RATES_TIMEOUT_MS`, falling back to profile rates. Exchange rates: the scheduled `refreshExchangeRates` Function (every 3 h, `functions/exchangeRates.js`)
  saves CAD→USD/EUR from open.er-api.com in public `settings/exchangeRates` (`usd`, `eur`, `fetchedAt`, `providerUpdatedAt`, `lastError`).
  Checkout charges through `createRateReader` (5 min instance cache; saved copy while < 36 h old, else a live fetch, else the last
  saved copy, `FALLBACK_RATES` only if nothing was ever saved; rates outside `SANE_RANGE` are never saved or used). The storefront's
  `exchangeRates.ts` `loadRates` reads the same doc first (`publicApi.getExchangeRates`), then the feed, then the stale copy
  (5 s timeout, 1 h tab cache; `CurrencyProvider` re-checks every 15 min). `ratesSource` = live | cached | fallback on
  `useCurrency()` and `<html data-rates-source>`. Keep the client/server freshness windows and sane bounds equal.
- **No third-party IP lookup:** checkout starts on `guessCountryName()` (browser language); address suggestions (Photon) stay. Do not re-add an IP-to-country call in the browser.
- **Starting currency by country (12 October 2026):** `CurrencyContext` starts on the shopper's saved `fm_currency`, else the
  time-zone guess, then `features/site/visitorCurrency.ts` asks the shop's own `validateDiscountCode` `{ action: "visitorCountry" }`
  (platform header via `serverGeoCountry`, no database, no third party; cached in localStorage `fm_geo_country` a week, unknown a day)
  and `currencyForCountry` switches CAD/USD/EUR unless the shopper picked one. Skipped in the Studio preview; the prerender pins CAD.
  If Cloud Run sends no country header the time-zone guess stays. Charges are unchanged (CAD × today's rate).
- **Stock holds:** `settings/website.stockHolds` `{ perBook, units, orders }` (Settings › General › **Checkout stock holds**, defaults 10 / 50 / 3)
  is read by the server (`holdLimitsFrom`, `loadHoldLimits`); connection caps are twice / 3x those, never below today's. The bag warns before Pay
  (`holdLimits.ts` `holdWarnings`, region `checkoutHoldWarning`, words `coHoldWarning*`). A payment-time renewal keeps the order's `holders`
  so releasing frees the shopper's count; IPv6 clients are counted by /64 (`rateLimit.js` `ipKey`, also used by `hitLimit`).
- Server `validateAddress` still requires state and ZIP; for countries without them it answers 400 and the order is taken as `verification_unavailable`.

## Checkout address finder (12 October 2026)

`features/site/addressSuggest.ts` feeds the street box's suggestions (`AddressField` in `features/site/CheckoutFields.tsx`). It first asks the
`validateAddress` Function (`action: "addressSuggest"`, then `"addressDetails"` on pick; Google Places (New) with a session
token, `functions/addressLookup.js`) and falls back to Photon/OpenStreetMap when the answer has `fallback: true` (no key, Google
error, rate limit; the browser then skips Google for 30 / 2 minutes). The Google key lives only in admin-only
`adminSecrets/addressLookup.googlePlacesKey` (Settings › Shipping › Carrier & labels › **Address finder at checkout**,
`admin/AddressFinderCard.tsx`, **Check key** = admin action `addressKeyCheck`); it is never sent to browsers. Limits:
`LIMITS.address` per connection and `LIMITS.addressShopDay` (300/day, inside Google's 10,000 free requests a month) for the whole shop. The Photon path parses units
(`parseTypedAddress`: "12-456 Main St" outside the US, Apt/Unit/Suite/#), spells out trailing St/Ave/W (`expandStreet`), ranks
the typed house number first, biases to the chosen province and fills a postal code only for a matched house. Picking goes
through `applySuggestion`, which never keeps a postal code/province from a different town and writes a parsed unit into the
unit box (or the street when Studio hides that box). Credit lines: Text & labels › Checkout › `coAddressAttribution` /
`coAddressAttributionGoogle`. Deploy Functions with the frontend; no rule or index change.

## High-quality photos (12 October 2026)

`admin/prepareImage.ts`: photos within `MAX_IMAGE_EDGE` (2400 px; Studio `MAX_STUDIO_IMAGE_EDGE` 2800) and under
`KEEP_ORIGINAL_BYTES` (2.5 MB) upload untouched; larger ones are re-saved at `PHOTO_QUALITY` 0.92. Library copies are
480/960/1600/2400 px at 0.88 (`MEDIA_WIDTHS`; the 2400 copy's weight budget is 450 KB). Book photos upload through
`admin/bookPhotoUpload.ts` `uploadBookPhoto`: copies 480/960/1600/2400/3200 px at 0.95 (`BOOK_PHOTO_WIDTHS`,
`BOOK_PHOTO_QUALITY`, 15 October 2026) under `products/`, saved on the photo as `url` (largest) + public
`srcset`/`width`/`height` (library picks carry theirs too), plus the untouched upload as `originalUrl` (`…-original.<ext>`,
never rendered; kept so copies can be remade). Storefront book images spread
`photoSrcSet(photo, CARD_PHOTO_SIZES | PDP_PHOTO_SIZES | THUMB_PHOTO_SIZES)` (`features/site/photoSources.ts`) — add it to
any new book-photo `<img>`; photos without `srcset` render as before. No rule or Function change.
**Crop & position (15 October 2026):** Books › edit › Images › **Crop & edit** (`admin/PhotoCropDialog.tsx`, frame shapes from
`admin/photoCrop.ts` `shopFrameShapes`) saves `framing: { x, y, zoom }` on the photo (the file is never changed; default = no key).
`features/site/photoFraming.ts` draws it: `framingStyle(photo, fallback?)` (object-position + `transform: scale` about that point; a
Tailwind `scale-*` hover still stacks) on every book-photo frame, `motionFraming(photo, hoverScale)` for `m.img` (`style` + `hover`). The
enlarged viewer shows the whole photo. Spread `framingStyle(...)` on any new book-photo `<img>` that fills a frame.
**Quick edits (16 October 2026):** the same dialog saves `adjust: { brightness, contrast, saturation, flipX, flipY }` (50–150 / 0–200,
100 = unchanged, no key when nothing changed). `framingStyle` adds the CSS `filter` and a flip about the frame's centre (object-position
mirrored, so the chosen point stays in view); the viewer uses `adjustStyle`. No rotation: a quarter turn can't fill frames of unknown shape in CSS.
**Lightroom-style edits (16 October 2026):** `adjust` also takes `highlights`, `shadows`, `warmth`, `tint` (−100…100, 0 = unchanged) and `sharpen` (0…100). CSS can't draw them, so `photoTone` builds an SVG filter (warmth/tint colour matrix, tone curve, sharpen kernel) that `adjustFilter` references as `url(#fm-tone-…)`; every element styled by `framingStyle`/`motionFraming` must render `<PhotoToneDefs photo={…} />` beside it (`photoFraming.test.ts` scans for it), and lightbox photos pass `source`. The dialog groups controls (Crop · Light · Colour · Detail & mirror), double-click resets a slider and **Hold to see the original** compares. No vignette (it would move with the hover zoom).
**Straighten, whole photo, clarity (20 October 2026):** `framing.rotate` (±10°, `[`/`]` in the stage) turns about the frame's centre in front of the crop, enlarged by `straightenScale` so frames up to `STRAIGHTEN_COVERS` (2:1) stay filled (wider strips may show a corner); motion images get it through `motionFraming(...).transformTemplate` (pass it on). `framing.fit: "contain"` (+ optional `background` #hex) shows the whole photo; photos shown whole are enlarged too (so coloured bars leave no bare corners). `adjust.clarity` (0–100) is its own SVG filter (`photoClarity`, objectBoundingBox blur) drawn by `PhotoToneDefs`. The enlarged viewer (`adjustStyle`) turns the photo too.

## Storage bandwidth (15 October 2026)

Storage is billed per download, so shoppers must never get an original photo where a copy will do.
- **Copies for old photos:** the scheduled `storageImageSweep` (hourly since 20 October 2026, 1 GiB, `functions/imageCopies.js`, sharp) gives
  every book photo with no `srcset` (the 10 October import) WebP copies beside the original (`<name>-<w>w.webp`, ladder
  480/640/960/1600/2400/3200 capped at the original width, q90 up to 960 (q82 until 15 October 2026 smoothed printed grain), q95 above; a copy heavier than the original is
  replaced by the original itself) and adds `srcset`/`width`/`height` in a transaction. It never deletes, overwrites or changes
  `url`. Progress and unreadable pictures: admin-only `systemStatus/imageCopies`. Keep its ladder equal to `BOOK_PHOTO_WIDTHS` /
  `bookPhotoQuality` (`admin/prepareImage.ts`), which new uploads use.
- **Caching:** every shop upload path is unique, so pictures/videos carry `Cache-Control: public, max-age=31536000, immutable`
  (`PUBLIC_FILE_CACHE` in `adminApi.uploadFile`, the video upload, server copies); the same sweep stamps it on older objects
  (skips `backups/`, `digital-assets/`). Never upload to a path that is later overwritten.
- **Small pictures:** fixed-size thumbnails (bag/checkout lines, search, bag suggestion, sticky bar, bundle covers) use
  `smallPhotoUrl(photo, minWidth)` (`features/site/photoSources.ts`); responsive ones spread `photoSrcSet` (`FEATURE_PHOTO_SIZES` for
  featured/spotlight sections). Never render `photos[n].url` directly for a shopper.
- **Book grids ask for their real width:** every book-card grid passes `gridPhotoSizes(steps, { photo, frame, cover, maxWidth })`
  (`photoSources.ts`) its actual column counts per breakpoint (same numbers as its CSS/Tailwind grid), frame shape and fit; a wide
  photo cropped by "cover" asks for proportionally more. `CARD_PHOTO_SIZES` (fixed 2/3/4 columns) is only its fallback: it made
  browsers pick a too-small copy and stretch it (soft covers, 15 October 2026). A new grid must do the same.
- **Book page gallery:** adaptive frames take each photo's shape from its saved `width`/`height` (`savedRatios` in `BookDetail`;
  a measured shape wins once loaded). Only photos without a saved size load ahead at once; the rest of the gallery loads when the
  shopper reaches for it (`warmGallery`: pointer, touch or focus on the photo column), the strip's neighbours stay eager. The main
  photo's `sizes` is `pdpPhotoSizes` (frame Max width + 10%, wider for photos cropped by "cover", never over 900px), computed from
  saved shapes only so it never changes while photos load; the loading-ahead `Image()` uses the same value.
- **Removed photos:** `adminApi.updateBook` deletes the `products/` files of photos a save took off (and `deleteBook` those of the
  book) through `removeBookFiles` (`admin/bookFileCleanup.ts`), unless another book, edition, sharing image or order line shows
  them; library pictures (assets/) are never deleted. A save keeps server-made copies (`keepPhotoCopies`).

## Catalog file on Hosting (15 October 2026)

`pnpm run build` runs `scripts/build-storefront-data.mjs` (before the prerender), which saves settings/website, published books and
published pages read at ONE Firestore snapshot (`readTime`, REST `batchGet` then `runQuery` with that `readTime`) as
`dist/storefront-data.json` (`scripts/storefrontDataFile.mjs`; same shapes as `publicApi`: books `{...data, id}`, pages `{id, ...data}`,
raw settings). A value JSON can't carry exactly (timestamp, reference, bytes, geo, NaN) or any read failure writes no file.
`useSiteData`'s `readSiteData` uses it (`features/site/storefrontDataFile.ts` `currentStorefrontData`) only when
`settings/catalogVersion.changedAt` (server time stamped by the `catalogVersionBooks/Pages/Settings` triggers after every write,
`functions/catalogVersion.js`) is not after the file's `readTime`; otherwise, or on any error, it reads Firestore exactly as before.
Settings/pages go through `publicApi.publicSettingsFrom` / `sortPages` on both paths. Book/page triggers bump only when the before or
after version is published (`touchesCatalogFile`; drafts aren't in the file). The 15-minute refresh rebuilds when the published fingerprint
changed **or** the marker is newer than the deployed file's `readTime` (`markerNewerThanFile` in `check-published-change.mjs`: a save that
changed nothing shoppers see still turns the file off), and is the backstop if a marker write fails. The triggers retry the write in-process
(`RETRY_DELAYS_MS`) and must not use `retry: true`: the deploy workflow never passes `--force`, which the CLI then requires
(`functions/catalogVersion.test.js` fails on any `retry: true` in `functions/index.js`). `firebase.json` serves root `*.json` `no-cache`. Never add a field to the file that the
Firestore path doesn't return, and keep both paths' transforms shared.
The file also carries `shippingProfiles` (optional; stamped by `catalogVersionShipping`; `check-published-change` compares them since
the fingerprint doesn't): `loadShippingProfiles` and Checkout's catalog/settings/profiles use it via `currentStorefrontData` (one check
shared for 30 s, a copy per reader; Checkout passes `fresh: true`), else Firestore.

## Book videos (15 October 2026)

Books › edit › Images › **Add video** (or drop a video on the images) adds MP4/WebM/MOV files (≤ `MAX_BOOK_VIDEO_BYTES` 50 MB,
`MAX_BOOK_VIDEOS` 5 per book) as entries in the book's `photos` list: `url`/`srcset` are a still frame captured in the browser and
uploaded through `uploadBookPhoto`, `videoUrl` (+ `videoType`, `videoBytes`, `videoDuration`) is the file in `products/videos/`
(`admin/bookVideoUpload.ts`; a file the admin's browser can't decode is refused). Everything that only knows photos (cards, search,
emails, JSON-LD) shows the still. `features/site/bookVideo.ts` `isVideoItem` (https only) decides; `BookDetail` plays it in the main
frame (`preload="metadata"`), thumbnails get a play mark, `PhotoLightbox` takes `videoUrl`. Every book `<video>` starts muted (`muted` + `ref={muteVideo}`, since React doesn't reflect `muted` reliably); keep `controls` so shoppers can unmute. Studio › Style › Product page ›
**Show book videos** (`showProductVideos`); words `bookVideoLabel`, `ariaGoToVideo`. Every play is Storage download traffic.

## Page translation (12 October 2026)

Shoppers may translate the storefront with the browser's Google Translate. `lib/translateSafeDom.ts` (installed first in
`main.tsx`) stops React crashing ("removeChild … not a child") when the translator has swapped its text nodes. Translated
text can't follow later React updates, so live money (card/PDP price, bag lines and totals, checkout summary/total) carries
`translate="no"` — put it on any new element whose number changes while the shopper watches. Never add
`<meta name="google" content="notranslate">` or a page-wide `translate="no"`.

## Ask a question on book pages (22 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Ask a question** (`showPdpAskQuestion`, off by default)
draws `features/site/extras/pdp-ask-question/PdpAskQuestion.tsx` under the buy buttons (region `productAskQuestion`, every book, sold out too): a folded
form (name, email, question, honeypot) that sends one `contactMessages` row through `submitContactMessage` (same path and rule as
the Contact form section, so Admin › Messages, the reply tool and `onContactMessage`'s budgeted emails all apply). Subject =
Text & labels › Product page › `pdpAskSubject` with the title (+ edition), rules in pure `askQuestion.ts`. Never sends from the
Studio preview (`inEditorPreview`). Words: Text & labels › Product page (`pdpAsk*`). No rule or Function change.

## Pop-up trigger (22 October 2026)

Studio › Style › Pop-up window › **When it opens** (`popupTrigger`: `delay` default = as before, `exit`, `scroll`) +
**How far down the page** (`popupScrollPercent`, 10–90, default 50). Pure rules in `features/site/sectionGroups.ts`
(`popupTriggerOf`, `scrolledPast`, `leavingThroughTop`), used by `PopupSections`: exit intent listens for the mouse leaving
through the top edge, only with a fine pointer (touch screens use the delay); scroll waits for that share of the scrollable
page. Still after the cookie answer, still governed by How often it shows, never in the Studio preview. No words, rules or Functions.

## Sold-out books last (22 October 2026)

Studio › Style › Shop page heading & filters › Book order › **Put sold-out books last in the shop grid** (`soldOutLast`, off by
default): `applyCatalogControls` (`features/site/CatalogControls.tsx`) moves books with nothing buyable (`bookSoldOut` = not
`bookInStock` and not Coming soon) after the rest with `soldOutToEnd`, keeping the shopper's sort inside each group. MainSite's shop
grid only (paging, search and filters follow it). Display only; no words, rules or Functions.

## Books load as shoppers scroll (22 October 2026)

Studio › Style › Shop page heading & filters › Show more button › **Load the next books by themselves when shoppers scroll down**
(`catalogAutoLoad`, off by default; only with `catalogPageSize` > 0). MainSite watches the Show more block (`IntersectionObserver`,
400 px ahead) and loads the next page like a press; after `AUTO_LOAD_ROUNDS` (4) automatic loads the button takes over so the footer
stays reachable (pure `catalogAutoLoadOn` / `shouldAutoLoad` in `features/site/catalogPaging.ts`). A new category, search, sort or
filter starts the count again. No words, rules or Functions.

## Zoom follows the mouse on book photos (22 October 2026)

Studio › Style › Book page · photos & layout › Photos › **Zoom follows the mouse** (`showPdpMagnifier`, off by default) +
`pdpMagnifierLevel` (1.5–4, default 2.5): `features/site/PhotoMagnifier.tsx` wraps each main-photo slide in `BookDetail` and,
only with a fine pointer that can hover, scales the photo from the point under the mouse (pure `photoMagnifier.ts`), writing the
style straight to the element (no re-render). Reset on leave or any button press, so the strip's mouse drag still swipes; videos,
thumbnails and the enlarged viewer are untouched. While on, the plain hover zoom (`productImageHoverScale`) is 1 so they never
stack. No words, rules or Functions.

## Already in your bag on book pages (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Already in your bag** (`showPdpInBag`, off by default)
draws `features/site/extras/pdp-in-bag/PdpInBag.tsx` under the buy buttons (region `productInBag`) once the bag holds the chosen edition: "2 copies
already in your bag · View bag" (BookDetail's `inBag` count; the link calls `setIsCartOpen`). Display only. Words: Text & labels ›
Product page (`pdpInBagOne`, `pdpInBagMany` with `{count}`, `pdpInBagView`; empty link = no link).

## Sale savings in the bag (23 October 2026)

Studio › Style › Cart drawer (shopping bag) › Book rows › **Sale savings** (`cartDrawerShowSavings`, off by default): a bag line
whose book is on a real sale (`showsSale`, so never an edition line or a gift card) and whose price is the sale price plus its
add-ons shows the regular line total struck through (`.fm-bag-was`), "You save {amount}" under it, and a "You save" row above the
total (`.fm-bag-saving`). Pure `features/site/bagSavings.ts` (`lineSavingPerCopy`, `bagSavings`); a stale saved price claims nothing.
Display only (the server prices the order). Words: Text & labels › Cart › Sale savings (`cartYouSave*`).

## Suggestions in an empty bag (23 October 2026)

Studio › Style › Cart drawer (shopping bag) › Empty bag › **Suggest books in an empty bag** (`cartDrawerEmptyPicks`, off by default)
+ `cartDrawerEmptyPicksCount` (1–4, default 3): an empty bag lists books under the empty message (region "Empty bag suggestions"),
each with photo, price, a title link to the book page and an add button. Books come from the bag suggestion's own buyable list
(`candidateBooks`: published, live, in stock, priced) ordered by pure `emptyBagPicks` (`features/site/emptyBagPicks.ts`: featured
first, then newest by `bookDateMs`, ties by id). The Studio preview shows a sample line, so it is seen only after removing it.
Words: Text & labels › Cart (`cartEmptyPicks*`). Display only.

## Tab reminder (23 October 2026)

Studio › Style › Cart drawer (shopping bag) › Total & checkout button › **Tab reminder** (`cartTabReminder`, off by default): while a
shopper with books in the bag is on another browser tab (`visibilitychange`), the tab title becomes Text & labels › Cart ›
`cartTabReminder` ("({count}) Your books are waiting"); the page's own title comes back on return unless something else changed it
meanwhile (`titleToRestore`). Hook in `CartDrawer` (always mounted), pure rules in `features/site/extras/cart-tab-reminder/tabReminder.ts`: never with an empty
bag, on `/admin` or in the Studio preview. Display only; no rules or Functions.

## Release countdown on pre-orders (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Release countdown** (`showPdpReleaseCountdown`, off by
default) + `pdpReleaseCountdownWithin` (hours, default 72): a pre-order book with a Publication date swaps its stock line for
"Pre-order · out in 2d 5h" in the last hours before midnight Toronto on that date (pure `extras/pdp-release-countdown/releaseCountdown.ts`,
`ReleaseCountdownText.tsx`), ticking every 30 s; release day brings the usual words back. The clock starts after mount, so the
prerender keeps "Pre-order · ships {date}". Display only. Words: Text & labels › Product page (`pdpReleaseCountdown*`).

## Announcement bar close button (23 October 2026)

Studio › Style › Header & announcement bar › Announcement bar › **Close button on the announcement bar** (`announcementDismissible`,
off by default) adds a × (`.fm-announce-close`) to every bar layout (static, rotating, ticker; shop and page headers). Closing hides the
bar in that browser until its messages change: `features/site/announcementDismiss.ts` stores a fingerprint of today's messages
(`announcementSignature`, text + link) in localStorage `lm:announce-closed` (never read or written in the Studio preview; a storage
failure closes it for the page view). The shop header's offset reads the same state, so it moves up when the bar is closed. The
prerender always shows the bar. Words: Text & labels › Header › `announceClose`. Display only.

## Tax & shipping note on book pages (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Tax & shipping note** (`showPdpTaxNote`, off by default)
draws `features/site/extras/pdp-tax-note/PdpTaxNote.tsx` under the price (region `productTaxNote`, priced books only): printed copies
(`isPickupItem`) "Taxes and [shipping] calculated at checkout.", tax switched off (`taxCollectionOn`) `pdpTaxNoteShippingOnly`,
downloads `pdpTaxNoteTaxOnly`, gift cards nothing (pure `taxNoteKey` / `taxNoteParts` in `pdpTaxNote.ts`). The first [bracketed]
words link to `/page/policy-shipping` when `settings.policies.shipping` has text, else the brackets are dropped. Display only.
Words: Text & labels › Product page (`pdpTaxNote*`).

## Star ratings on shop cards (23 October 2026)

Studio › Style › Book cards in the shop grid › Grid & columns › **Show star ratings under each card** (`showCardRating`, off by
default) adds a `.fm-card-rating` line (five stars in the accent colour + "(12)") under MainSite's shop-grid card title/price.
`features/site/CardRatingStars.tsx` asks `reviewsApi.cardSummary` (Firestore count/average aggregate only, one read per book,
cached 5 min) once the card is within 300 px of the screen; pure `cardRating` / `starStates` (`cardRating.ts`) draw nothing for
books without approved reviews. Words: Text & labels › Catalog & empty states (`cardRatingLabel` read aloud, `cardRatingCount`).
Uses the existing `reviews (bookId, status, rating)` aggregate index. Display only; no rules or Functions.

## Shop filters in the address (23 October 2026)

Studio › Style › Shop page heading & filters › Book order › **Keep the shopper's search, sort and filters in the page address**
(`catalogStateInUrl`, off by default). MainSite reads `?q`, `sort`, `stock=1`, `sale=1`, `format=a,b`, `min`, `max` once when the
switch is on (pure `readCatalogUrl` in `features/site/catalogUrlState.ts`, malformed values fall back to defaults) and then rewrites
them in place with `history.replaceState` (keeping the router's own history state, so no new entries and Back from a book returns
to the same view; `catalogUrlSearch` keeps every other parameter). Never in the Studio preview. Canonical URLs already drop the
query. No words, rules or Functions.

## Read more for long descriptions (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **“Read more” for long descriptions** (`pdpDescriptionFold`,
off by default) + `pdpDescriptionFoldLines` (3–40, default 8): `features/site/DescriptionFold.tsx` wraps the book description
(tabs/accordions and the sections layout) and, for a text pure `mightOverflow` (`descriptionFold.ts`, phone-width guess) calls long,
limits it to that many lines (`calc(N * 1lh)`, token-only fade mask) with a Read more / Show less button (`aria-expanded`). After
drawing, a box that turns out to fit drops the fold (`overflows`; a hidden tab/accordion is re-measured when shown). The whole text
stays in the HTML. Off = the children exactly. Words: Text & labels › Product page (`pdpDescriptionMore`, `pdpDescriptionLess`).

## Ships-by line in the bag (23 October 2026)

Studio › Style › Cart drawer (shopping bag) › Total & checkout button › **Ships-by line** (`cartDrawerShowShipBy`, off by default)
draws `components/CartShipBy.tsx` at the top of the bag total: "Order now — ships by {date}", with the countdown near the cut-off. Its
rules are the book page's Ships-by settings (`pdpShipByDays`, `pdpShipByCutoff`, `pdpShipByCountdownHours`, `pdpShipByClosedDays`,
read from the bag's root design; `shipBy.ts`). Pure `bagShipsOnSchedule` (`features/site/bagShipBy.ts`) shows it only when the bag holds
a printed book and every printed line is in stock for its copies (no pre-order, backorder, Coming soon or box set; e-books/gift cards
ignored). Drawn after mount only. Display only. Words: Text & labels › Cart (`cartShipBy`, `cartShipByCountdown`).

## More by this artist on book pages (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **More by this artist** (`relatedByArtist`, off by default):
the related-books row shows only other published books sharing a credited artist (pure `relatedRow` in
`features/site/relatedArtist.ts`, names from `bookCreators`, compared case-insensitively; at most 4) under Text & labels › Product
page › `relatedArtistHeading` ("More by {artist}"). A curated `relatedBookIds` selection always wins, and a book whose artists have
nothing else keeps the usual row and heading. Kept out of `merchandising.ts` so sections don't pull in `lib/bookSeo`. Display only.

## Payment icons on book pages (23 October 2026)

Studio › Style › Book page · photos & layout › Extras on the page › **Payment icons under the buy buttons**
(`showPdpPaymentIcons`, off by default) draws `features/site/extras/pdp-payment-icons/PdpPaymentIcons.tsx` (its controls, words and region are in that folder's `feature.ts`) under the buy buttons (region
`productPaymentIcons`): the footer's card/wallet logos (`resolveFooterBadges`, picked in Style › Payment icons; the SVGs live in
`features/site/paymentIcons.tsx`, shared with `StoreFooter`), unknown ids and repeats dropped (`pdpPaymentBadges`), hidden while
sold out or Coming soon. One `role="img"` label, Text & labels › Product page › `pdpPaymentIconsLabel` ("Ways to pay: {methods}").
Display only — checkout still decides which methods are offered.

## Analytics tags load after the page (27 October 2026)

Google Analytics (`lib/ga4.ts`) and Clarity (`lib/clarity.ts`) add their third-party `<script>` through `afterPageLoad`
(`lib/afterPageLoad.ts`: window `load`, then idle, 4 s at most), so they no longer compete with the first photos and shop code.
Both queue their calls until the script arrives, so no event is lost; consent and path checks are unchanged. Keep any new
third-party tag behind the same helper.

## Shop profile read at page open (27 October 2026)

First step of making the shop anyone's (code plan item 1.2 in LMB-PLATFORM `docs/code-plan.md`). `src/lib/shopProfile.ts`
is the only door to this shop's Firebase web settings, functions project/region and bot-check site key. `index.html` loads
`/shop-profile.js` with `defer` just before the app script (defer and module scripts run in page order, after parsing), and
that file sets `window.__SHOP_PROFILE__`; `firebaseApp.ts`, `functionsBase.ts` and `appCheck.ts` read `shopProfile`. The
profile's site key wins over `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, which stays the fallback. No file, or a broken one, means
`DEFAULT_SHOP_PROFILE` (today's values), all or nothing so two projects never mix. `public/shop-profile.js` must equal
`DEFAULT_SHOP_PROFILE` (tested); Hosting serves it `no-cache`. The format's master copy is `profile/` in LMB-PLATFORM; never
put plan, test mode, Stripe account or emails in it (they are server-only).
