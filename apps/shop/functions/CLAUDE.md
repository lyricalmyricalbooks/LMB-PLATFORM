# Cloud Functions, payments, email and server rules

Server side: Stripe/PayPal, webhooks, refunds, stock holds, gift cards, discounts, email, privacy and the anonymous-abuse limits. Never weaken payment, inventory or webhook authority. The repo-wide rules are in the root `CLAUDE.md`.

## Standing rules

### One server for every shop
- `shopScope.js` is the wall: `admin`/`db` reach only `shops/<id>/…` of the current shop. Never read the database, a file or a sign-in at load time (it throws `outside_shop`; make it a function). Never keep a shop setting in a module constant: read `shopConfig.<key>` at run time; values passed into factories are functions; services built from settings are `perShop(() => …)`.
- Triggers come from `shopEntry.trigger`, requests from `shopEntry.request` (`?shop=`). Every address the server writes comes from `functionLink(shopConfig, …)`; never hand-write a `cloudfunctions.net`/`web.app` address.
- No collection-group reads; read sub-collections per parent (`SUBCOLLECTION_PARENTS`). Paths saved or shown go through `shopRelative`.
- Front door (`frontDoor.js`) answers only from the shop found by `addresses/{host}`. A new published file goes in `SITE_FILES` and `scripts/deployConfig.mjs` `PER_SHOP_FILES`. Its slug/redirect rules mirror the prerender, `findProduct` and `redirects.ts` (parity tests): change them together.
- Shop-crossing tests turn folders on (`shopScope.test.js`, `shopEntry.test.js`); `sharedLoad.test.js` loads index.js with folders on.
- Server code never types the placeholder press name: use `pressName(settings, shopConfig.senderName)` (`pressName.test.js`).

### Payment authority
- Orders are created `unpaid`. Only the verified webhook (`markStripeOrderPaid`), verified PayPal capture or `completeOrderWithoutCard` mark paid; status checks and sweeps only record `reconciliationPending`. Never the browser.
- Paid only on an exact `expectedAmountMinor`/`expectedCurrency` match; mismatches, payments after cancel and late Square payments (`paidAfterHold` → refunded in full) never become paid.
- Sandbox payments never touch stock, discounts or revenue, except on the test shop and practice orders (`sandboxTakesStock`, stamped `inventoryDecrementedAt`; refunds return stock only with that stamp) (`sandboxPayment.test.js`, `testShopHolds.test.js`).
- `applyOrderRefund` / `revertFailedRefund` are the only places refunds apply or revert, each once.
- Guest access needs the private order key.

### Payments module
- `functions/payments/` is the one door to the card provider: no other file calls Stripe or makes a client (`payments/payments.test.js`). A new provider is one file beside `stripe.js` added to `PROVIDERS`. Order bookkeeping stays with callers.
- Unknown `SHOP_PAYMENT_PROVIDER`/`SHOP_PAYMENT_MODE` must throw at load, never fall back to Stripe. Square needs platform mode. In platform mode the shop holds no Stripe key and re-fetches every forwarded event before believing it.
- Every functions file declares secrets through `withPlatformKey([...])`, never a bare `secrets: [` (`platformKey.test.js`).
- After a provider switch, calls about an existing order go to the provider its saved id belongs to (`payments/ids.js`, never `pi_`/`cs_` checks).
- A Square shop never says "Stripe": name the provider with `providerName()`; any remaining "Stripe" string sits on a line marked `Stripe shops only` (`admin/providerWording.test.ts`). Card orders keep stored `paymentMethod: "Stripe"`.
- Standalone pages (bookings, tickets, gifts, rentals, memberships) carry no `client_reference_id`; the order webhook must ignore them.

### Pricing and checkout
- `priceOrder` is the one server price builder for every path, including payment links, members, tips and add-ons; client mirrors are display only. Line flags like `memberPrice` or `preorder` are never taken from the browser.
- Gift cards debit only in the paid transaction from `chargedRedemptions`, once. `validateDiscountCode` sends every field checkout reads (`discountPayload.test.js`).
- Stock moves through `functions/inventory.js`, one write per product; holds before settling, fail closed. Shipped means `fulfillmentStatus`/`status`, never `trackingNumber`; part shipments never change them.
- Shared rules (shipping, discounts, promotions, pre-orders, addresses, shop identity, booking times, event tickets, digital files…) live in `src/shared/`; edit there and run `pnpm run build:shared`.

### Email
- `functions/email/` is the one door: no other file opens a transport, makes a Resend client or writes `emailLog` (`email/email.test.js`). Keep `sendEmail` as the thin wrapper tests reassign.
- Every anonymous-triggered email claims the shop-wide budget (`claimEmailSend`; new path = `CONTACT_LIMITS` purpose). One plain recipient per send.
- Bulk mail (newsletters, fundraiser updates, digital updates, yearly summaries) uses `bulk: true` with a `kind`, never Gmail and never the outbox `queue`; claim each address in a `sent/{id}` doc first, skip `marketing-optout`, add the signed unsubscribe link, run under a lease from `unpaidPaymentSweep`. Mail/count only `mayMail` subscribers.
- Don't queue sends that already retry themselves. Order emails go once via `sendOrderEmailOnce`.

### Module layout and jobs
- New `createStripeCheckoutSession` actions: one line in `CHECKOUT_FUNCTION_ACTIONS`; groups live in factory modules taking index.js's guards; keep `exports.<name> =` lines in index.js. Pass function declarations and late-reassigned names (`lateSendEmail`).
- New periodic work runs inside an existing sweep (`bookingSweep`, `unpaidPaymentSweep`, the 8am digest), not a new schedule job (`tick.test.js` counts them).
- Data changes go in `functions/migrations/` (`list.js`, numbered, no gaps): safe to run twice, appended only, never edited after release, and leaving data the previous release can still use.

### Bookings, classes, events, giving, rentals
- Places are sold only inside the transaction that reads the ledger (`bookingDays`, `eventPlaces`, `rentalCalendar`), so nothing sells twice. Classes and courses are Bookings services: never add a second places ledger or payment path.
- Every public action checks its switch first (`engineOn`/`waysOn`/`platform/features`) and has a rate limit. The `*Live` hints in `settings/website` are for links only; `adminApi.updateSettings` never writes them back.
- Money questions use the shared helpers (`depositOf`, `cardTaken`, `moneyTaken`, `balanceDue`, `refundMinorFor`…); never read `paid` alone. Never trust a length, price or extras from the page (`withExtras(forPerson(…))`). Fees and saved cards are charged only on the owner's tap.
- These records are server-only (no rule opens them; the rules emulator checks). Privacy export/erase must cover every new collection holding personal data (`privacyData.js`, `privacyBookings.test.js`).

### Security and data
- Secrets only in admin-only `adminSecrets/*`, Functions secrets or the platform services; platform shops never fall back to a shared Shippo or Stripe secret.
- Browser HTTP calls use `functionFetch` / `onBrowserRequest` (App Check); signed webhooks and emailed links stay outside it. Anonymous handlers return `publicErrorMessage`.
- `books` is public only when published; owner-only fields go in `PRIVATE_BOOK_KEYS` (`bookPrivate.ts` + migration script).
- Support visits: one check in four copies (`roles.js` `supportOf`, `isSupport()` in both rules files, `admin/supportSession.ts`); support is staff, never owner.
- Two-step backup `use` must never work on Google's token alone.
- Check every rules change with `scripts/firestore-rules-emulator.mjs`. Don't change consent defaults in `lib/consent.ts`.

### Deploy
- Rules, indexes and Functions deploy with or before the frontend; platform services (payments, email) before shops that need them. Local tests never prove live payments, webhooks, email or carrier purchases.

## Feature notes

Details of each feature live in [`docs/agent-notes/functions.md`](../docs/agent-notes/functions.md) (read the section before changing that feature; Grep its heading). Sections:
- One server for every shop (10 November 2026, the shared system)
- Cloud Functions (`functions/index.js`)
- Shipping engine
- Discount codes: start date and one-use-per-customer (6 October 2026)
- Customer bug sweep (6 October 2026)
- Bug sweep #2 (6 October 2026)
- Paid-but-unpaid recovery + Riso order tracking (6 October 2026)
- Stripe ↔ shop payment sync hardening (6 October 2026)
- Payments & shipping panel repair (7 October 2026)
- reCAPTCHA / App Check
- Bug sweep #3 — ready for sales (7 October 2026)
- Email abuse budget and proof of owner (10 October 2026)
- Anonymous-abuse hardening (9 October 2026)
- Bug sweep #4 (7 October 2026)
- Readiness fixes from the 5-agent audit (7 October 2026)
- Commerce access, navigation and merchandising (7 October 2026)
- Cart estimates, returns and catalog review (7 October 2026)
- Bug sweep #5 (8 October 2026)
- Bug sweep #6 + shop filters (8 October 2026)
- Bug sweep #7 (8 October 2026)
- Pre-orders (8 October 2026)
- Gift cards, box sets, automatic discounts, add-ons and scheduled sales (9 October 2026)
- Shop errors (25 October 2026)
- Payment-integrity audit fixes (9 October 2026)
- Round-2 payment fixes (10 October 2026)
- Orders, returns and Shippo labels (round 2, PR 8, 10 October 2026)
- Privacy and newsletter (10 October 2026)
- Round-2 security: private book fields, public endpoints, rules (10 October 2026)
- Round-2 digital downloads (10 October 2026)
- Payments module (27 October 2026, code plans 1.11–1.12)
- Email module (27 October 2026, code plan 1.13)
- Data changes (28 October 2026, platform plan 4.2)
- Platform support visits (28 October 2026, code plan 2.8)
- Swap for another size (plan 10.22)
- Your data in the shopper's account (2 November 2026, platform plan 14.7)
- Payment links: orders the owner makes (3 November 2026, platform plan 21.1-21.5)
- Two-step backup codes (3 November 2026, platform plan 22.9)
- Newsletter sending (3 November 2026)
- Running low in the 8am email (3 November 2026)
- Ship part of an order now (3 November 2026, platform plan 24.5)
- Social posts (4 November 2026, platform plan 27.4)
- Receipts by email (beta, 12 November 2026)
- Bank feed (beta, a paid add-on, 13 November 2026)
- Licence keys (13 November 2026, gap list 38)
- Bookings (beta, 14 November 2026)
- Events and tickets (beta, 17 November 2026)
- Classes (beta, 17 November 2026)
- Donations & tips (beta, 18 November 2026)
- Memberships on Square (M4, 18 November 2026)
- Gift memberships (M5a, 18 November 2026)
- Rentals (beta, R1, 18 November 2026)
- Live carrier choices (moved from the root guide)
