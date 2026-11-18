# Cloud Functions, payments, email and server rules

Server side: Stripe/PayPal, webhooks, refunds, stock holds, gift cards, discounts, email, privacy and the anonymous-abuse limits. Never weaken payment, inventory or webhook authority. The repo-wide rules are in the root `CLAUDE.md`.

## One server for every shop (10 November 2026, the shared system)

One deploy of this code runs every shop (LMB-PLATFORM `docs/shared-system.md`). `shopScope.js` is the wall: index.js's
`admin` is `scopedAdmin(sdk)`, so `admin.firestore()` / `db` reach only `shops/<id>/…` of the shop the code runs for,
`admin.storage()` only its file folder, and `admin.auth()` its own sign-in list. `shopEntry.js` finds the shop: triggers
are made with `onDocument*` from `shopEntry.trigger` (the path you write, e.g. `"orders/{orderId}"`, is moved under
`shops/{shopId}/`), `onRequest` from `shopEntry.request` reads `?shop=<id>`, and the tick runs once per shop.
- **Never read the database, a file or a sign-in at load time** (a module-level `db.collection(...)`): outside a shop it
  throws `outside_shop`. Make it a function (`SHIPPO_CONFIG_DOC()`). `sharedLoad.test.js` loads index.js with the folders on.
- **Never keep a shop setting in a module constant.** Read `shopConfig.<key>` when the code runs (it is a live view of
  the current shop's settings); a value passed into a module factory is a function (`ADMIN_TO`, `CARD`, `platformShopId`,
  `testShop`, `siteUrl`) that the module calls. A service built from settings is `perShop(() => create…())`.
- **Every address the server writes** (emails, webhooks, payment pages) comes from `functionLink(shopConfig, name,
  params)`, which adds `?shop=`. The shop's pages use `functionUrl(name, params)`.
- No collection-group reads (the scoped Firestore refuses them). A sub-collection read across parents is one read per
  parent (`backupJson.js` `SUBCOLLECTION_PARENTS`). Paths saved or shown go through `shopRelative`.
- **The front door** (`frontDoor.js`, export `frontDoor`): the one Hosting site sends each shop's profile, published
  files and storefront pages here; it finds the shop by the typed address (`addresses/{host}`, read at the database
  root, never written here) and answers only from that shop (record profile, bucket `shops/<id>/site/`). Its slug rule
  is the prerender's (`safeSlug`, parity-tested); a new published file goes in `SITE_FILES` and in
  `scripts/deployConfig.mjs` `PER_SHOP_FILES`.
- **The front door's SEO answers (17 November 2026):** a storefront page asked for on another of the shop's addresses
  (its free address once it has a main domain, a `www` twin) gets a 301 to the same path on the main address (`siteUrl`,
  only when that address points at the same shop; never for `?preview=` or a frame, so Studio keeps working). A page with
  no drawn copy is checked by `frontDoorRoutes.js` (`routeCheck`, products, pages, policies and URL redirects read inside
  `shops/<id>/`, five minutes per shop): missing → 404 with noindex, or the owner's redirect as a 301; live or unsure →
  the shell made the shop's own (`shopShell`). Its slug and redirect rules mirror `findProduct` and `redirects.ts`
  (parity-tested in `frontDoorRoutes.test.js`); change them together. The fallback robots.txt names the sitemap. A
  storefront page with a trailing slash 301s to the one without. Hosting passes this function's answers on unsqueezed,
  so `send` compresses text bodies of 1 KB or more itself (`squeeze`: brotli, else gzip, by `Accept-Encoding`; `Vary`
  set); the usage meter counts the bytes sent.
- The older handler tests run one shop with the folders off (`SHOP_FOLDERS: "off"`, `vite.config.ts`). New tests of
  shop-crossing behaviour turn them on (`shopScope.test.js`, `shopEntry.test.js`).

## Cloud Functions (`functions/index.js`)

- `createStripeCheckoutSession` — secure Stripe session creation.
  With `paymentElement: true` it creates a server-priced PaymentIntent instead, for the card form
  shown directly on the checkout page (`features/site/StripeCardForm.tsx`, Stripe Payment Element,
  deferred intent); `stripeWebhook` marks those paid on `payment_intent.succeeded` (metadata
  `checkout: "payment_element"`). `body.action` = `status` / `registerPaymentDomain` serve the
  return-page check and the wallet-domain button (no new public functions: the CI deploy account
  can't set IAM on them). Storefront card payment always uses the inline Payment Element;
  older saved redirect settings no longer move the shopper to hosted Checkout.
- **Action table (25 October 2026):** `createStripeCheckoutSession` routes `body.action` through `CHECKOUT_FUNCTION_ACTIONS`
  (own keys only, string actions only) before its checkout rate limit; payment creation, `createManualLocalOrder`,
  `unsubscribe` and `completeFreeOrder` run below the limit, from `checkoutPayment.js` (`checkoutPaymentActions`,
  built just above the endpoint; the endpoint itself is now only CORS, the action table, the limit and the dispatch). The admin report actions (`backups`, `aiWrite`,
  `ga4Report`, `searchConsole`, `bigQueryJourneys`, `resetTraffic`) live in `functions/adminReports.js`, which gets
  `db`, `admin`, `requireAdmin`, `readAdminSecret`, `hitLimit` and `LIMITS` passed in rather than requiring them, so the
  vm-based handler tests' fakes reach it. Add a new pre-limit action as one line in the table; move further groups the
  same way (a module exporting a factory that takes index.js's guards).
  **27 October 2026:** the side actions moved the same way: `checkoutAdmin.js` (`checkoutAdminActions`: Stripe key test,
  webhook health, payment domains, gift card admin, inventory link), `orderRequests.js` (`orderRequestActions`: status,
  track, tracking link, order request, cancel unpaid, resolve mismatch) and `privacyRequests.js` (`privacyActions`:
  newsletter signup/confirm, privacy request/export/erase). index.js builds them just above `CHECKOUT_FUNCTION_ACTIONS`,
  so every dependency passed in must exist by then: a `const` defined further down is still uninitialised there (use a
  function declaration, as `siteLink` and `escapeHtml` now are). Handler tests reassign `sendEmail` after loading index.js,
  so it is passed as `lateSendEmail`; pass any other name a test reassigns the same way.
  Whole endpoints move the same way: `shippoEndpoints.js` (`shippoEndpoints`, built as `shippo` just above
  `exports.getShippoConfig`) holds the Shippo config, dynamic rates, saved key, checkout rates, address check and
  tracking webhook; index.js keeps each `exports.<name> = shippo.<name>;` line where it was.
  `scheduledJobs.js` (`scheduledJobs`, built as `jobs` just above `exports.dailyOrderDigest`) holds the daily digest,
  weekly summary, abandoned bag sweep, photo sweep and back-in-stock sweep; the requires and `RESTOCK_BUDGET_MS` they
  need sit above that call, since a `const` must exist before the factory runs.
  `digitalDownloadEndpoint.js` (`downloads`) holds `downloadDigitalAsset`, and `shopEmails.js` (`shopMail`) holds
  `onContactMessage`, `onCustomerCreated` and `sendTestEmail`. The order emails (`onOrderCreated`, `onOrderUpdated`) and
  `unpaidPaymentSweep` stay in index.js: they share gift card, stock and payment helpers with the webhook.
- **Shipping labels (26 October 2026):** `createShippingLabel` lives in `functions/shippingLabels.js` the same way:
  `shippingLabelEndpoints({ onBrowserRequest, SHIPPO_API_TOKEN, applyCors, admin, requireAdmin, db, getShippoToken,
  callShippo, IS_EMULATOR, originAddress, getStateCode, getCountryCode })`, and index.js keeps the
  `exports.createShippingLabel =` line (tests slice index.js between export lines). Pass in everything index.js defines,
  and copy require lines exactly: several are renamed on import (`terminal: terminalOrder`, `isSoldRate: isSoldRateName`).
- `stripeWebhook` — the **only** path that marks Stripe orders paid; it also
  decrements stock, counts discount redemptions, and records revenue. Orders are
  created `unpaid` first.
- Checkout **order note / gift message** (`orderNote` on the order, max 500 chars, enforced in `firestore.rules`): Studio › Style › Checkout page › **Order note / gift message box at checkout** (`showOrderNote`, off by default); words in Text & labels › Checkout; shown to admins in Order detail › Customer.
- `downloadDigitalAsset` — gated digital ebook downloads.
- `onOrderPaid` / `onOrderShipped` — Firestore triggers that send customer/admin
  emails (Resend).
- `abandonedCartSweep` — scheduled recovery email after ~1h.
- **Email retry queue:** `sendEmail({ …, queue: "<kind>" })` parks an email both senders refused in server-only
  `emailOutbox` (rules deny every browser; holds the HTML, so gift codes/download links never reach the client) and
  throws with `err.queued`. `runEmailOutbox` (inside `unpaidPaymentSweep`) retries due entries under a transactional
  lease on a 15 min → 12 h schedule (8 tries, `functions/emailOutbox.js`), then gives up (`status: "failed"`). Order
  emails (`sendOrderEmailOnce`) keep their `email-claims` claim while queued so a re-run trigger never duplicates.
  Recipients/subjects are validated (no CR/LF; a bad address is permanent, never queued); `emailLog` rows older than
  90 days and given-up entries older than 30 are pruned. Admin: Settings › Notifications › **Waiting to send**
  (Retry now / Stop via `sendTestEmail` actions `emailQueue`/`retryEmail`/`cancelEmail`, summary only). Don't queue
  sends that already retry themselves (webhook-missed alert, abandoned cart, daily digest); back-in-stock is
  queued (`backInStock`) because its trigger only runs on a restock.
  Each try is bounded (nodemailer 15–20 s timeouts, Resend raced at 20 s with an idempotency key `<queueId>:<from>`),
  the sweep runs the queue after the payment checks with a 30 s budget (`timeoutSeconds: 300`), and a delivered entry is
  marked `status: "sent"` before it is deleted, so a failed cleanup never resends. Entries carry `orderId`/`giftCardId`
  and `toLower`: `staleOrderEmailReason` drops an order email whose order was refunded/cancelled/paid since, a disabled
  gift card's code is never sent, a retried gift card stamps `emailedAt`, and privacy export/erase include the queue
  and that address's `emailLog` rows. Stop refuses (409) while a send holds the lease. `currentRows` (newest row per
  `outboxId`) feeds Needs attention and the admin alerts.
  Templates: unknown `{{placeholders}}` send as blank, `{{items_table}}` only fills the body, the gift-card `{{code}}` line is re-added if removed
  (`REQUIRED_PLACEHOLDERS`, mirrored in `admin/emailTemplateChecks.ts`), buttons need an http(s) link. Send test uses
  the editor's unsaved words and branding.
- **Shop alerts & Gmail check:** `loadNotificationSettings` returns `shopAlerts { newOrder, shipped }` (on unless
  `settings/notifications.shopAlerts` turns them off; an older `new_order_admin.enabled` is honoured) — Settings ›
  Notifications › **Emails to the shop**. Gmail sending › **Check connection** = `sendTestEmail` action `verifyGmail`
  (nodemailer `verify()`, nothing sent). Email branding goes through `risoAccent` (#hex only) and `safeLogoUrl` (https,
  escaped) in `emailTheme.js` and its admin mirror. Customer and shop emails are gated separately (pausing
  "Order Paid"/"Order Shipped" never stops the shop copy). Shipped (carrier) parcels send only the shipping email; "out for delivery" and "delivered" (admin buttons or
  Shippo tracking) send nothing (owner's request). Pickup (`ready_for_pickup`) and local delivery
  (`out_for_delivery`, `delivered`) send the Delivery template without carrier lines (`localMethodOf` reads
  `fulfillment.method`, then `fulfillmentSelection.method`). Refund emails use `refundEmailFacts` (`emailMoney.js`):
  none for a lost dispute, gift-card refunds named, manual refunds in the charged currency; a partial refund
  (`refundedAmountMinor` rising while paid) sends `partialRefund_<minor>`. Sandbox gift-card purchases email only
  the shop (`[TEST]`, one copy).
- **Email delivery log:** every `sendEmail` attempt (sent or failed, with a plain-English reason from
  `functions/emailErrors.js`) is written to the admin-only `emailLog` collection and listed in
  Settings › Notifications › **Recent deliveries**. Customer and shop-copy sends are attempted
  separately, so a rejected customer address never suppresses the admin notification.
- `onBookRestocked` — emails shoppers in `stockAlerts` (created from the sold-out product page's
  "Notify me when back in stock" box, `features/site/BackInStockForm.tsx`) when a book/variant goes
  0 → available. Studio › Style › Book page · photos & layout › **Notify me when back in stock** toggles the box;
  its words are in Text & labels › Product page.

- `unpaidPaymentSweep` (every 15 minutes) — records pending reconciliation and emails the shop when Stripe
  shows a successful payment but the order is still unpaid 10 min–7 days later (`functions/paymentSweep.js`);
  stamps `paymentAlertSentAt`. Never marks Stripe orders paid — resend the verified webhook event from Stripe.
  It reads the Stripe mode/keys once per sweep (`readStripeKeys`, passed as `keys` to `retrieveOrderPayment` /
  `checkStripeReversal`; sweep clients time out after 20 s; a failed read falls back to per-call reads).
- `nightlyFirestoreBackup` (03:17 Toronto) and Settings › General › Backups & export › **Back up now**
  (`createStripeCheckoutSession` action `backupNow`, admin) share `runFirestoreBackup`: (1) the managed export to
  `backups/YYYY-MM-DD/export` (needs **Cloud Datastore Import Export Admin** on the Functions service account; refused =
  PERMISSION_DENIED) and (2) the Functions' own copy of every document (`functions/backupJson.js`, `backups/<day>/json/`
  `<collection>.ndjson.gz` + `_group_private` + `manifest.json` last; no extra role; skips `rate-limits`). Either one = a
  good backup; the next run checks the previous export's operation. A `runningSince` lock stops overlapping runs; manual
  runs are 5 min apart and limited to 45 s. Restore the copy with `scripts/restore-json-backup.mjs` (dry run first),
  the export with `gcloud firestore import`. A new sub-collection name goes in `SUBCOLLECTION_GROUPS`.
  Each copy also writes `backup.json` (every document in one file, stored gzip-encoded so browsers save plain JSON);
  the card's **Daily backups** list and **Download** use action `backups` (`op: list | download`, `functions/backupAdmin.js`,
  15-minute signed link). The restore script accepts that downloaded file too.

**Email sending:** `sendEmail` sends through Gmail SMTP (nodemailer, account `owner@example.com`) first, because the shop has no Resend-verified domain. The Gmail app password is entered in Settings › Notifications › **Gmail sending** (`admin/GmailSendingCard.tsx`) and stored in the admin-only `adminSecrets/gmail` doc (never in public `settings/*`). If it is unset or Gmail fails, sending falls back to Resend (`onboarding@resend.dev` only reaches the account owner).

**The press's name (plan 5.8, 28 October 2026):** server code never types the placeholder name. It names the press with
`pressName(settings, shopConfig.senderName)` from `shared/shopIdentity` (generated from `src/shared/shopIdentity.ts`):
Text & labels › Site name in the published design, else Settings › General › Store name (the starting placeholder
there counts as unset), else `SHOP_SENDER_NAME`; the placeholder only for a shop with no name at all. Emails prefer
Settings › Email sender › Sender name, then `pressName`: the From line and frame (`email/index.js`), `{{shop_name}}`
(`loadNotificationSettings`), newsletter confirmation and consent, message replies, gift cards issued in the admin, the
label sender and customs signer (`shopOrigin`), the Monday PDF and the Stripe webhook's label. The build's Google feed
and `llms.txt` use `feedShopName` in `features/site/merchantFeed.mjs` (same order; `merchantFeed.mjs` can't import TS).
`functions/pressName.test.js` renders each one for a named shop and fails on the placeholder.

Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`SHIPPO_API_TOKEN`) are stored as Firebase Functions secrets, not in the repo.

## Shipping engine

`src/shared/shippingEngine.ts` (with `shippingZones.ts` and `weightGrams.ts` beside it) turns profiles → zones → rates
into checkout quotes, once for both sides since 26 October 2026: the Functions run its generated copy
`functions/shared/shippingEngine.js` (authoritative) and the shop runs the same code to display quotes. Change only the
`src/shared` files and run `pnpm run build:shared` (src/shared/CLAUDE.md). Rate `type`: flat | order | weight | percent | free |
pickup, plus conditions (order total / cart grams / item count), `freeOver`, `handlingFee`; profiles
add `freeShippingOver`, `handlingFee`, `defaultItemWeightG`. The server charges the quote matching
the customer's `shippingMethod` (else cheapest) and rejects unservable destinations; profiles with no
zones fall back to legacy flat `calculateShipping`. Live Shippo quotes can be enabled for an explicit
country allowlist in Settings › Shipping › Carrier & labels; all other countries use the regular
profile/zone path. Selected live quotes are fetched and validated again server-side so the charged
amount matches checkout. Carrier & labels › **Add an extra amount to every live rate** (`liveRateExtra { enabled, amount }` on the
Shippo config doc, ≤ $50, `functions/liveRateExtra.js`) adds one amount to every live quote in both `getShippoRates` and
`resolveShipping`; label purchases keep the carrier price. Create profile is one dialog (`NewShippingProfileDialog.tsx`,
pure starters/duplicate in `shippingProfileStarters.ts`). The profile editor is Masthead-style (title, sub tabs Zones & prices · Rules · Books · Test,
figures strip; `shippingProfileEditor.test.tsx`); never add kicker/subcopy headings or numbered steps back. Admin UI: Settings › Shipping › profile editor (Profile rules, Test this
profile, rate dialog).

**States and provinces (14 November 2026):** a zone may list `regions` (ISO codes like `US-AK`, `CA-ON`). Matching picks
region > country > continent > rest of world (`matchShippingZone(country, zones, region, postal)` in `shippingZones.ts`);
a blank state is read from the postal/ZIP code (`shared/postalRegion.ts`). Checkout, the cart preview, `orderMath.js` and
`resolveShipping` all pass the address's state and postal code. Admin: zone editor › States and provinces
(`admin/shipping/ZoneRegionPicker.tsx`, rules `zoneRegions.ts`); `shippingHealth.ts` flags a state in two zones.

**Connect Shippo (14 November 2026):** a Colophon shop connects the press's own Shippo account (Julian's choice: no
label money through Colophon). `shippoLink.js` (action `shippoLink`, steps `status | connect | finish | disconnect`;
owner for all but status) asks the platform through the app store door (`PLATFORM_APPS_URL`, ops `shippo.*`, LMB-PLATFORM
`services/shippo/link.js`, which holds Colophon's Shippo partner codes and the GET return `/api/shippo/oauth`). Shippo
sends the press back with a one-use `shippoTicket`; `finish` swaps it for the token, checks it with Shippo and saves it
as the Shippo record's `apiToken` with `authType: "oauth"`, so every Shippo path works unchanged. `callShippo` sends
such a token (`oauth.…`) as `Bearer` with `Shippo-API-Version` (`shippoAuthHeaders`); pasted keys keep `ShippoToken`.
Disconnect blanks the token and turns live rates off. Platform shops never fall back to a shared Shippo secret
(`ownSecret` reads ""). Admin: `admin/shipping/ShippoConnectCard.tsx` (Opens soon until the platform has the codes).

**Weights are metric (18 October 2026).** Book/edition weights are entered in g or kg only (`WEIGHT_UNITS`); older
"1 lb"/"8 oz" values still parse identically (`parseWeightGrams`), open in grams (`splitWeight`) and are saved as whole
grams by the book editor (`withMetricWeights`) and CSV import (`metricWeightValue`). Shoppers see `metricWeight`
(`features/site/metricWeight.ts`). Every Shippo parcel, order line and customs item is sent in grams
(`functions/parcelWeight.js`, fallback 680 g a copy); the label dialog asks for grams (`suggestedParcelWeightGrams`).

## Discount codes: start date and one-use-per-customer (6 October 2026)

Discounts › New/Edit has an optional **Start date** (code is refused server-side until that day; a **Scheduled**
tab lists them). **One use per customer** is now enforced by `assertDiscountNotUsedByCustomer` in
`functions/index.js` (paid orders with the same code + email; checkout lower-cases `customer.email`
on the order). Both checks run in `fetchValidDiscount` / both checkout paths; totals and webhook authority are unchanged.

## Customer bug sweep (6 October 2026)

- **Prices:** USD/EUR shoppers see the CAD price × today's rate everywhere (`CurrencyContext`), which is what the
  server charges. Stored `usdPrice`/`eurPrice` are reference-only (Books › edit › Pricing says so). `catalogUnitPrice`
  in `CartContext.tsx` mirrors the server's unit-price rule. A sale price counts only when it is above 0, and a variant
  with no price can't be added. One-click adds (wishlist, bag suggestion, "Add both") pick an in-stock edition via
  `features/site/buyable.ts`.
- **Checkout shipping:** until the shopper picks a rate, the best current quote stays selected, including after the
  address changes the quotes. With no option selected, the summary shows Text & labels › Checkout › `coShipChoose`
  instead of "Free". The IP country lookup only fills a form nobody has touched yet. BOGO "% off" uses `bogoPercent`
  (client `checkoutFulfillment.ts`, shared `src/shared/discountMath.ts`): missing means 100.
- **Abandoned carts:** `firestore.rules` limits browser writes to the cart fields and blocks `notified*`, and a
  recovered cart can't be reopened. `abandonedCartSweep` rebuilds items and prices from `books`, escapes the text,
  skips carts older than 7 days and sends one reminder per address ever (`abandoned-cart-throttle`, no TTL on those records,
  server-only), plus a shop-wide cap of 25 reminders per Toronto day (`abandoned-cart-throttle/_daily`,
  `nextDailyCount`); the email uses only a plain first name from the cart (`reminderFirstName`, else "there"). Deploy rules and functions together.
- Order tracking accepts `#`/spaces in order numbers (`features/site/orderNumber.ts`).

## Bug sweep #2 (6 October 2026)

- **Payment integrity:** checkout accepts only CAD/USD/EUR (`functions/paymentGuards.js`). Stripe and PayPal store
  `expectedAmountMinor`/`expectedCurrency` when the payment is created, and the webhook/capture marks an order paid
  only on an exact match. A mismatch sets `paymentMismatch` and the order shows in Orders › Needs attention.
- **Stock** changes go through `functions/inventory.js` (`readBooks`/`writeStock`), one write per book, so two
  editions in one order both count. Oversells set `oversold: true`.
- **Buyable books:** the server refuses draft, archived and future-dated books, and bare lines for books sold in
  editions (`purchaseProblem`). The storefront shows only `isLiveBook` books (`features/site/liveBook.ts`, also used by
  the sitemap) outside a real Studio preview. Order item names come from the catalog.
- **Emails:** `compileEmailTemplate` HTML-escapes every value except `items_table`. Manual-payment instructions come from
  settings, not the order.
- **Checkout:** tax uses `features/site/taxRate.ts` (same matching as the server). E-book-only carts ask only
  country/province. A server-refused discount is removed with its reason (`coDiscountRejected`). PayPal has its own
  option (`coPaypalOption`). A failed PayPal capture returns to checkout. Discount dates follow the Toronto calendar day.
- **Consent:** `lib/consent.ts` `consentAllows()`. Declined analytics stops funnel/visit/referral tracking and custom code.
  Declined marketing stops abandoned-cart capture.
- Section links typed as `/path` get the site sub-path (`siteHref`). Category nav memoises on content. Untracked
  inventory never shows SOLD OUT.

## Paid-but-unpaid recovery + Riso order tracking (6 October 2026)

- `markStripeOrderPaid` (functions/index.js) applies Stripe paid-order mutations only when called by
  `stripeWebhook` after signature verification (stock, discount usage, downloads, analytics and amount checks,
  idempotently). Status requests require an authorized customer/admin identity or the order's private access key;
  they retrieve that order's saved Stripe payment and record `reconciliationPending` when provider evidence
  indicates payment. The 15-minute `unpaidPaymentSweep` records the same evidence and alerts the owner.
  Neither path marks a Stripe order paid or changes stock, discount usage or revenue. Review webhook health
  and resend the signed Stripe event before fulfillment. PayPal, manual/offline and free-order paths remain available.
- Order tracking (`features/site/OrderTracking.tsx`) is a Riso order slip (`features/site/trackingStyle.ts`,
  `fm-track-*`, token-only). An unpaid Stripe order re-checks automatically and offers **Check payment again**
  (Text & labels › Order tracking › `trackRecheck`, `trackRechecking`, `trackStillUnpaid`).

## Stripe ↔ shop payment sync hardening (6 October 2026)

- `functions/stripeRecovery.js` (pure, tested): `modesToTry` looks up an order's payment in the Stripe account it
  was created in (`order.stripeMode`) and then the other one — sandbox orders used to be checked with the live key
  and silently stayed unpaid. `retrieveOrderPayment` in `index.js` is used by the status check and the sweep.
- `stripeWebhook` verifies against the Functions secret **and** endpoint secrets saved in admin-only
  `adminSecrets/stripeWebhook` (`live`/`test`), and settles any `payment_intent.succeeded` carrying
  `metadata.order_id` (either checkout path). It records `adminSecrets/stripeWebhookStatus` (last event / last signature failure).
- `unpaidPaymentSweep` runs every 15 minutes (orders 10 min–7 days old), records pending Stripe reconciliation
  and alerts the owner; only a verified webhook settles the order.
- Settings › Payments › Stripe › **Webhook health** (`admin/StripeWebhookHealth.tsx`, action `webhookHealth`) checks the
  endpoint, **Fix webhook** adds missing events / re-enables / creates it, **Reset webhook signing** recreates it when
  signatures fail. Opening an unpaid Stripe order in Orders asks Stripe automatically; **Check payment with Stripe**
  repeats the evidence check without marking it paid.

**Admin alerts:** `admin/adminAlerts.ts` (pure, tested) turns the orders feed + `adminSecrets/stripeWebhookStatus`
into banners shown above every admin page (`AdminAlerts.tsx`, rendered in `Dashboard.tsx`, refreshed with the
Orders badge every 5 minutes): payment/amount mismatch, unpaid after a started Stripe payment (>10 min), disputes,
rejected webhooks, oversold, paid orders waiting >3 days to ship, manual payments pending >2 days. Test orders are
ignored. Dismiss hides one for the browser session until a new order joins it.

## Payments & shipping panel repair (7 October 2026)

- **Sandbox payments** (`session.livemode === false` / `stripeMode: "test"`, PayPal `paypalMode: "test"`) mark the
  order `isTest: true, sandboxPayment: true` and never touch stock, discount usage or revenue — on payment or refund
  (`functions/sandboxPayment.test.js`). `onOrderUpdated` still emails sandbox orders so the rehearsal covers email.
  A sandbox checkout holds no stock, except on the platform's test shop (`SHOP_TEST_SHOP="true"` →
  `shopConfig.testShop`, plan 1.31, `docs/test-shop.md` in the platform repo): there it holds stock like a live
  checkout (same limits and sold-out answer), still without gift-card holds (`functions/testShopHolds.test.js`). Its
  sandbox payments also take stock (`createSettlement({ testShop })`, stamped `inventoryDecrementedAt`), and full,
  partial and later "put the books back" refunds return it, only when that stamp is there (`sandboxStockTaken`);
  discount use, gift cards and revenue stay untouched (`functions/sandboxPayment.test.js`, plan 1.31b). Its sandbox
  payments (Stripe and PayPal) also get the at-payment stock check (`reserveForConfirmedPayment` and its Stripe/PayPal
  call sites): one whose hold lapsed while the book sold out is not marked paid and records `inventoryConflict`, like a
  live one. Other shops' sandbox payments still skip it. The stockroom link sends its paid sandbox orders as real
  orders (`pushKind({ testShop })`, `deps.testShop` in the jobs), so the stockroom counts them and their refunds; other
  shops send them only as rehearsals (`web.test`), which it never counts.
- **Stripe keys:** `SecretField` passes every edit up (clearing cancels), refuses wrong-slot keys
  (`stripeSecretKeyProblem`), and offers **Remove stored key** (`adminApi.removeStripeSecretKey`). Saves return
  true/false (`Dashboard.saveSection`), and saved secrets are scrubbed from screen state (`scrubSavedSecrets`).
  The "secret in public settings" blocker only fires on a real leak (`publicSecretLeak`). Test mode without a test
  secret key blocks; live without a stored key warns.
- **Test connection** (action `verifyStripeKeys`) and **Webhook health** (`webhookHealth`, verdicts in
  `admin/stripeChecks.ts`): per-mode delivery status, signing-secret presence (`STRIPE_WEBHOOK_SECRET` is declared
  on `createStripeCheckoutSession`), processing failures, signature failures recorded only for real Stripe-signed
  requests, reset clears old failures and asks first. Checkout refuses a payment whose server `stripeMode` differs
  from the card form's publishable key.
- **Shipping:** zones store ISO codes (`toCountryCodes`); both engines match names too. Geography is
  `src/shared/shippingZones.ts` (`resolveCountry`, `matchShippingZone`), one copy for both sides. Profile rules persist. Quote ids are
  unique per option. A zone-less profile offers nothing once any profile has zones. Live rates resolve countries
  with `resolveCountry` and fall back to profile rates when Shippo has none; `SHIPPO_API_TOKEN` is declared on both
  checkout functions. Product assignment sends explicit removals; the panel reads the whole catalog (`getAllBooks`).

**Order emails (7 October 2026):** one order = one customer email ("Order confirmed", `order_confirmation`, on paid)
and one shop email (`[NEW ORDER] <id> · paid …`, `new_order_admin`, on paid, `[TEST]` prefix for sandbox) with a
**Fulfil this order** button to `/admin#orders/<id>`. `onOrderCreated` emails the shop only for manual-payment
(`pending`) orders. Card payments send no Stripe receipt (`receipt_email` removed); Stripe's own "successful payments"
customer email must also be off in the Stripe dashboard. `functions/orderEmails.test.js` pins this.

**Orders desk = Ship station (18 October 2026, design A):** Admin › Orders always opens on **All orders** › Open, newest first, as covers (owner's choice; the layout/tab are no longer remembered), and a `#orders/<id>` link opens the **Ship station** (`admin/OrdersDesk.tsx`,
pure rules in `shipStation.ts` + `ordersDesk.ts`, tested): a header (To ship · Labels today on the Toronto day from
`operations.labelBoughtAt` · Oldest, **Print pick list** for orders still to pack, **All orders · completed**), the numbered queue
(`stationQueue` = the old Needs me: problems, packing, then labels, oldest first in each; `stationStep` pill) with **Not in this
queue** links (pre-orders, e-Transfer/cash waiting, on the way) and the full `OrderDetail` on the right — so Stripe sync, refunds,
disputes, labels and dispatch are unchanged — with the oldest order opened automatically and finishing an order moving to the next
(`goToNext`). The workbench shows a three-step strip (`fw-strip`) and step 3 draws `admin/LabelBuyer.tsx` inline (saved parcels as chips,
size/weight, **Find label rates**, the rates with the customer's service pre-selected, **Buy label · $x**, **Ship without a label**);
changing the parcel forgets the rates, the purchase is still `buyCanadaPostLabel` and never dispatches or emails. **All orders**
(`orders-desk-layout` = `grid`) is a covers grid with **Open** (anything not yet with the customer + manual payments due), **Completed**
(delivered/collected/digital, never cancelled or refunded) and **All orders** (archived and abandoned too) via `gridTabOf`, search,
sort, 40 per page; a card opens the order in the station. **Table** / **Export orders** open the previous `Orders` table (bulk
packing, pick lists, CSV). `OrderDetail` reports reloads via `onChanged` so the list refreshes. Refunded cards are tinted red
(`refundState`); covers come from `rowCover` (catalog read once via `loadOrderBooks`). Phones show queue *or* order. Email links
`/admin#orders/<id>` still open that order.
The packing checklist shows each book's current cover and **Shelf location** (Books › edit › Inventory, `shelfLocation`,
per edition when set; `packingInfo` in `fulfillment.ts`). Shelf codes live in the admin-only private book document (see *Round-2 security*), merged back by `adminApi.getAllBooks` / `getBook`.

## reCAPTCHA / App Check

Invisible reCAPTCHA Enterprise initializes before Firestore/Auth in src/lib/firebaseApp.ts.
Use functionFetch from src/app/lib/functionsBase.ts for every browser HTTP Function
request and onBrowserRequest in functions/index.js for its server handler. Keep signed
provider webhooks and emailed digital-download links outside browser attestation.
APP_CHECK_MODE defaults to monitor; enforce only after registering the public site key,
verifying traffic, and completing the rollout in docs/RECAPTCHA.md. Direct Firestore
protection requires separate Firebase App Check console enforcement. Verification
failure copy lives in Studio > Text & labels > Site & sharing. Tokens, debug credentials
and provider diagnostics must never be logged or saved to public settings.

**Maximum discount cap (7 October 2026):** Discounts › New/Edit › **Maximum discount (CA$)** (`maxDiscountAmount`, blank = no cap)
limits what one code can take off an order ("20% off, up to $15"). The server enforces it in `computeDiscountAmount`
(`capDiscountAmount`, `functions/index.js`); `Checkout.tsx` mirrors it for display only. Shown as a **Max … off** badge in the list.

## Bug sweep #3 — ready for sales (7 October 2026)

- **Refunds:** `applyOrderRefund` (functions/index.js) is the one place an order becomes refunded — admin refunds
  (Stripe, PayPal captures API, or manual via `refundProviderOf`), Stripe Dashboard refunds, lost disputes and PayPal
  `PAYMENT.CAPTURE.REFUNDED/REVERSED` webhooks. Stock (admin's `refundRequest.restock`), discount use and revenue are
  reversed once; `refund_pending` completes later via the reversal sweep.
  The refund window's **Restock items** starts ticked unless the books left the shop (`defaultRestockOnRefund` ↔ server
  `leftTheShop`, `functions/refundRestock.js`, parity-tested). A refund that left printed books out shows Order detail ›
  **Books not back in stock** › **Put the books back in stock** (`createStripeCheckoutSession` `action: "restockRefunded"`,
  `restockRefundedOrder`): once, the same stock change and `restockedItems` record a restocking refund writes, so the inventory
  app link turns that order's gratuity into a void sale.
- **Payments:** PayPal request ids include amount+currency; a late `async_payment_failed` can't undo a paid order;
  a second Stripe payment is kept in `duplicatePayments` and alerted (Orders shows "Paid twice"); a card retry
  cancels the order's previous unfinished PaymentIntent; hosted sessions save `stripeCheckoutSessionId` at creation.
- **Orders from browsers:** `firestore.rules` lets guests create only unpaid Stripe/PayPal/Free orders with a fixed
  key list. Every manual-payment order is priced and created by `createManualLocalOrder`. $0 orders use
  `action: "completeFreeOrder"` (server completes only when its own total is 0; `completeOrderWithoutCard`).
- **Checkout:** the bag is repriced against the live catalog (`repriceCart`), Pay waits for the catalog, server
  refusals and card declines are shown, the server total is compared before charging, 99 copies max per line,
  email format checked on both sides. Policy links sit under Pay (Style › `hideCheckoutPolicyLinks`).
- **Email:** customer emails use the paid currency (`functions/emailMoney.js`); manual orders get
  `order_pending_payment`; footers add Settings › General › Location; abandoned-cart reminders honour their switch
  and a signed unsubscribe (`functions/marketingOptOut.js`, `marketing-optout`, `/track?unsubscribe=1`).
- **Other:** ebook downloads need the digital edition; Shippo webhook re-reads status from Shippo; policy pages are in
  the sitemap/prerender; Orders CSV has tax/payment/currency/refund columns (paid/refunded only for whole lists).
- **Not changed on purpose:** rate-limit IP source (verify the real X-Forwarded-For shape first), sales-tax model
  (shipping tax / printed-book rebate need the owner's accountant).

## Email abuse budget and proof of owner (10 October 2026)

- **One shop-wide budget:** `claimEmailSend` / `claimEmailSendDetailed` (`functions/emailThrottle.js`) take one send from a
  per-address counter (where the purpose has one) **and** from `contact-email-throttle/_global_hour` + `_global_day`
  (`GLOBAL_EMAIL_BUDGET`: 40/hour, 150/day) in one transaction. Every anonymous-triggered email must claim it:
  contact owner notice + visitor reply, privacy-request notice (also once per address per day; the record is still kept),
  cancel/return request notice, abandoned-cart reminder and back-in-stock alert. Past the budget the message waits in
  Messages / the request stays recorded; nothing is mailed. A new anonymous email path needs a `CONTACT_LIMITS` purpose.
- **No proof of owner needed (14 October 2026, owner's choice):** abandoned-cart reminders go to any address typed at checkout
  (with marketing consent), bounded by one reminder per address ever, the 25/day cap and the shop-wide budget.
  `functions/emailProof.js` (`hasOwnershipProof`) is no longer called by the sweep. Back-in-stock alerts need no proof
  either, but each send takes from the shop-wide budget; over it the signup keeps `waiting`.
- **One recipient:** `sendEmail` refuses any `to` that is not a single plain address (`cleanRecipients`); the
  `contactMessages` rule matches the same shape. Abandoned-cart reminders are skipped, and Ready to sell shows a blocker
  (`mailing-address`), until Settings > General > Location has a postal address. `sendEmail` falls back to the Functions
  `RESEND_API_KEY` itself and `stripeWebhook` declares it. Tests: `functions/emailAbuse.test.js`.

## Anonymous-abuse hardening (9 October 2026)

- **Contact form isn't a relay:** `onContactMessage` sends the visitor's "Message received" copy at most once per
  address per 24 h and never echoes their subject/message (name only, escaped; old templates' `{{subject}}`/`{{message}}`
  render blank). The shop notification is capped at 5 per sender per hour (the rest stay in Messages). Counters:
  server-only `contact-email-throttle/{purpose}_<sha256(email)>` (`functions/emailThrottle.js`).
- **Welcome email:** `onCustomerCreated` sends only when `admin.auth().getUser(uid)` has that same email, verified.
  `customers/{uid}` rules allow only `uid,email,name,phone,defaultAddress`, bounded, with `email` = the token email.
- **Stock-hold caps** (`functions/stockHolds.js` `HOLD_LIMITS`): a checkout start (`reserveCheckout`, manual path) may
  not push one shopper past 10 copies of a held book, 50 held units or 3 open unpaid checkouts (email hash), or one
  connection past 20 / 100 / 10 (IP hash, `clientIpOf`). Counted in server-only `stock-hold-owners/{e_|ip_<hash>}`;
  a shopper's own retry replaces the earlier attempt; payment-time renewals are never capped. Refusal =
  `HoldLimitError` (code `hold_limit`) → Text & labels › Checkout › `coHoldLimit`.
- **Rules:** public `pages` reads need `status == "published"` (`publicStorefrontData.mjs` uses a runQuery filter);
  `analytics/{YYYY-MM-DD}` writes only for that day (±1 day) with `date` = id; `reviewContacts` only in the same batch
  as their new pending review; guest orders bound `customer`, `metadata`, `referralSource`, `addressError` sizes
  (per-line quantity stays the server's 1–99 clamp: rules can't loop). Check rules changes with
  `scripts/firestore-rules-emulator.mjs` (header says how). Deploy rules + Functions with the frontend.

## Bug sweep #4 (7 October 2026)

- **Reviews:** public reads only `status == "approved"`; reviewer emails live in admin-only `reviewContacts/{reviewId}`
  (`reviewsApi.create` writes both; `contactsFor` moves older public emails once per admin session).
- **Signups:** `stockAlerts` ids are `<email>__<bookId>__<variantId>` and `newsletter` ids are the email (both enforced
  in `firestore.rules`), so repeats are refused. `onBookRestocked` sends once per address, skips draft/archived books,
  reclaims sends stuck >15 min and deletes the alert after sending.
- **Emails:** refund amount in the currency refunded (`refundAmountText`); no "won't be charged" email for paid orders;
  shipped email without tracking drops those lines (`withoutTrackingLines`), none for pickup/local delivery.
- **Storefront:** search/wishlist use `isLiveBook`; Canadian time zones start in CAD (`currencyForTimeZone`).
- Signed-in order reads need `email_verified`. Analytics visits can't decrease.

## Readiness fixes from the 5-agent audit (7 October 2026)

- **Payments:** `markOrderPaid` refuses card/PayPal and cancelled orders (`manualPaidRefusal`); checkout refuses cancelled
  orders (`checkoutRefusal`); a payment arriving for a cancelled order is recorded but **not** marked paid
  (`paymentMismatch.paidAfterCancel`, Orders › Needs attention). PaymentIntents use `stripeIntentKey` and hosted sessions a
  per-minute idempotency key, so a double click can't open two live payments. "Paid" is set by the Stripe webhook, the
  server-verified status check / sweep (`markStripeOrderPaid`), the verified PayPal capture, or `completeOrderWithoutCard`
  for manual/$0 orders — never by the browser.
- **Stock holds:** `functions/stockHolds.js` transactionally holds tracked stock for 30 min per order (server-only `stock-holds/{bookId}`)
  before Stripe, PayPal, manual-payment, or free checkout can settle; payment revalidates/renews the hold. Reservation-store failures fail closed;
  expected stock conflicts after a provider capture stay unpaid and raise an inventory-reconciliation alert. Holds release on payment or cancel and expire automatically.
- **Tax gaps:** Overview › Ready to sell lists provinces/states with no matching rate (`uncoveredTaxRegions`).
- **Tax switch (14 October 2026):** Settings › Taxes › **Collect sales tax at checkout** saves `settings.taxes.collect` (missing = on).
  `false` = no tax on any order: server `authoritativeTax` returns 0 (`taxCollectionOn`, mirrored in `features/site/taxRate.ts`),
  checkout uses `activeTaxRates`, readiness skips the tax checks. Rates stay saved. Deploy Functions with the frontend.
- **Customer requests:** order tracking has *Ask to cancel* only, until the order ships (no shopper return requests since
  13 October 2026; `ORDER_REQUEST_TYPES` = cancel; open returns still show) (`action: "orderRequest"`, `order.customerRequest`,
  Needs attention + Order detail › Mark request handled) and *Your data* (`action: "privacyRequest"` →
  admin-only `privacyRequests`; Settings › General › **Privacy requests** exports JSON or erases, keeping orders).
  Words: Text & labels › Order tracking (`trackReq*`, `trackPrivacy*`); boxes: Style regions `trackingRequests`/`trackingPrivacy`.
- **Rate limits:** `clientIpOf` takes the right-most non-proxy `X-Forwarded-For` hop (Google appends the real client);
  Shippo rate/address and PayPal create/capture have their own buckets. Deploy rules + functions before the frontend.

## Commerce access, navigation and merchandising (7 October 2026)

Stripe paid-order authority belongs only to the signature-verified webhook. Authenticated or private-key
payment status checks and the payment sweep record pending reconciliation; provider success alone does not
release an unpaid Stripe order for fulfillment. PayPal capture, manual/offline payment and server-validated
free orders remain supported through their existing contracts. Guest order access requires the private order
key; an order number or payment ID alone is not authorization.

Studio > Navigation > Header bar order chooses each published page's Main shopping bar or Publisher navigation
row (`secondaryNavKeys`). Initially, exact Submissions, History, Our history and Open call(s) page titles use the
publisher row; an explicit selection, including an empty list, overrides that grouping. Categories remain in
shopping navigation. Style > Header layout > Show publisher navigation row controls visibility; Text & labels >
Header owns its accessible name. Both header layouts and standalone page/product headers share this hierarchy,
including phones, where search stays directly available under the existing search visibility control.

Books > Categories & tags > Curated recommendations offers automatic category matches or up to four chosen
books in editable display order, with full-catalog search and removal. Saving the book applies the choice; an
empty publisher selection hides recommendations. Public rendering excludes missing, current and unpublished
books without filling a curator's selection with automatic results. Studio's existing related-books visibility
and heading controls still apply. Product details show supplied edition, positive page count, publisher and
publication date; a selected variant's name takes precedence for edition. Show edition details and the four
spec labels live in Studio. Existing contributor display, genuine photo upload, cover order and alt-text fields
remain the content source; owner-supplied photographs and editorial facts are required, never fabricated.

Checkout adds a separate optional apartment/unit field, eligible Stripe express-wallet presentation and a total
beside payment. Studio > Checkout controls their optional visibility and Text & labels owns their words. Wallet
availability depends on Stripe, browser, account and domain eligibility; this change does not prove live wallet
activation. Required payment, validation and server-priced totals remain intact.

Readiness distinguishes payment configuration, contributor/edition metadata and possible test titles from
verified deployment, hosting and email delivery. Admin alerts cover pending payment reconciliation, unresolved
label purchases and recent failed/bounced/complained email attempts, with links to the relevant workspace.
Provider acceptance is distinct from inbox delivery. Local tests and builds do not verify deployment or live
Stripe/PayPal payments, wallet eligibility, webhook delivery, email, refunds or carrier purchases.


## Cart estimates, returns and catalog review (7 October 2026)

The cart offers country/postal-code shipping previews from current server catalog prices,
edition weights and configured shipping profiles. These are preliminary profile estimates;
live carrier prices and eligibility require the full checkout address. They exclude discounts
and tax, never authorize a charge and reset when the cart/destination changes. Session storage
carries the destination into checkout. Matching saved addresses may fill street details;
other saved/recovered destinations cannot overwrite or mix with the selected destination.
Studio > Style > Cart drawer > Total & checkout button owns Show shipping cost preview;
Text & labels > Cart owns its words. Inputs use the shared cart palette and typography.

Orders > Customer return progresses through approval/decline with customer-visible instructions,
parcel receipt, full-order inspection and an explicitly confirmed full-order refund. Mixed-condition
lines record a resellable quantity. Only eligible physical copies restock, once, through the existing
provider/admin-authorized refund path. Approval and receipt never change money or inventory.
Full-order refunds include shipping, tax and digital items; partial financial refunds remain a
separate provider workflow. Cash/e-Transfer refunds must be sent externally before recording them.
Private inspection/actor/history data live in admin-only order-operations.returnCase. A limited
returnProgress summary appears in secure customer tracking with Studio-owned status words and the
existing trackingRequests region controls. Open returns block dispatch/local fulfillment and label
purchases. Stripe paid-order authority remains webhook-only; supported PayPal/manual authority is
unchanged. New endpoints cartShippingPreview and manageReturn use functionFetch and App Check.

Books loads the full catalog. Show books needing publish review flags cover/interior images,
contributor credits, base/sale/edition prices, format/edition/page count, shipping weight, publisher
copy and possible placeholders. Single-book saves to Published and bulk Publish open a reviewed
selection; invalid title/prices block publishing, other warnings require explicit acknowledgement.
Bulk Move to draft previews the chosen records and preserves their content, inventory and order
history. Failed updates remain selected for retry. Publication status controls public routes,
lists, recommendations and sitemap: titles never automatically hide products. Owners must review
and draft currently published test/duplicate records before releasing this visibility change.

Deploy the Functions bundle with the frontend so cart estimates, return transitions and refund
completion agree (including Stripe/PayPal webhooks and reconciliation). Existing books/orders/
order-operations access patterns require no new rules or composite indexes; inspection remains
private. Local handler tests and provider-isolated browser fixtures prove workflow behavior,
not deployed functions, real payment/refund acceptance, carrier rates or email delivery.

## Bug sweep #5 (8 October 2026)

- **Cancelling:** Orders › **Cancel unpaid order** is server-side (`createStripeCheckoutSession` action `cancelOrder`,
  `cancelRefusal` in `functions/paymentGuards.js`): refused once paid, and it stops the Stripe PaymentIntent / Checkout
  session and releases stock holds. It asks Stripe first and refuses (recording `reconciliationPending`) when Stripe
  already has the money (`stripePaymentTaken`); the sweep keeps checking cancelled orders with a Stripe payment. PayPal capture and `completeFreeOrder` refuse cancelled orders; the PayPal capture
  request id includes the PayPal order id and a matching `paypalOrderId` is the proof (shoppers may return in a new tab).
- **Paid after cancelling / mismatched payments** clear once refunded: a full Stripe refund sets
  `paymentMismatch.resolvedAt`, or the admin presses **Mark refunded** on the order (action `resolvePaymentMismatch`).
  Queues, alerts and the Orders desk ignore resolved mismatches.
- **Disputes:** an open `disputeStatus` puts a paid, not-yet-sent order in Needs attention; dispatch, label purchase and
  local handover refuse it. Sent parcels stay In transit so delivery can still be recorded.
- Manual **Mark paid** after the 30-min hold no longer fails (`completeOrderWithoutCard(…, { reserve: false })`).
  Sweeps read bounded, ordered windows (new `orders` indexes); the "webhook missed" alert skips cancelled/mismatched orders.
- **Discounts** can't exceed the qualifying subtotal; tier percentages are 0–100 (admin refuses > 100%).
  An edition with an empty price can't be saved. Address correction can't change country/province on carrier orders.
- **Checkout:** a retry (card, PayPal, manual or free) releases the shopper's own previous unpaid attempt's hold
  (`previousOrderId`, `releaseSupersededAttempt`: unpaid, same email, and Stripe shows no payment in progress). Pickup choices stay picked. An address-checker outage continues as
  unverified (`addressError: "verification_unavailable"`, shown in the address step of the order). Tax shows its real
  amount (CA$0.00 too) once country and a recognised province are known; unrecognised saved provinces are cleared.
- **Bag free-shipping bar** follows Settings › Shipping (`features/site/freeShipThreshold.ts`): only a rule that makes
  every option free everywhere counts (profile `freeShippingOver` / `freeThreshold`, or `freeOver` on every rate); highest
  across profiles; hidden otherwise or for an e-book-only bag. The Studio
  "Free shipping over" number was removed — Studio keeps the on/off and look.
- Download buttons appear only for digital lines (`features/site/digitalLine.ts`). Review inputs carry the rules' length
  limits. A page missing from the cached site shows Loading until the fresh read (`useSiteData().fresh`), not a 404.
- **Deploy** Firestore indexes + Functions + frontend together. Owner decisions still open: should free-shipping codes
  cover express/live rates, a "change cookie choice" link, and the sales-tax model.
## Bug sweep #6 + shop filters (8 October 2026)

- **Shop filters:** `features/site/CatalogControls.tsx` adds Shopify-style **Format** chips (paperback, hardcover,
  e-book, audiobook, other — from the book's and every edition's format, `bookFormats`), **Price** Min/Max boxes
  (typed in the shopper's currency, `priceRangeFor`) and **Clear filters**. Chips show only when the current view has
  2+ formats and the price boxes only with 2+ prices (`filterView`); a hidden filter never applies (`appliedFilters`).
  "In stock" counts editions and backorders (`bookInStock`); search also matches ISBN. Each piece is a Studio region
  (`catalogFormat`, `catalogPrice`, `catalogClear` — show/hide + layout in Theme settings › Fine-tune single elements › Catalog & shared content · layout);
  words are Text & labels › Search & filters (`filterFormat*`, `filterPrice*`, `filterClear`). The bar itself still
  follows Style › Shop page heading & filters › **Show search, sort & in-stock bar**.
- **Display price:** `features/site/displayPrice.ts` — a book sold only in editions shows its cheapest edition
  (CurrencyContext `getBookPrice`, shop cards, search, showcase grid, filters/sort) instead of CA$ 0.00.
- **Server prices:** `functions/catalogPrice.js` `catalogUnitPrice` mirrors `CartContext.catalogUnitPrice` everywhere
  (a `"0"`/negative sale price is ignored; an edition with no price is refused, never charged $0).
- **Discounts:** `validateDiscountCode` returns `maxDiscountAmount` (checkout showed the uncapped amount);
  `functions/discountPayload.test.js` fails if checkout reads a field the server doesn't send. Every discount is clamped
  to 0…items value on both sides; percent tiers over 100 are refused in the editor. The card-retry key includes the code.
- **Stock holds:** holds carry `owner` (sha256 of the email, `holdOwner`); a shopper's own earlier attempt never blocks
  their retry, other shoppers are still held off.
- **Digital vs physical:** one rule (`isPhysicalItem` / admin `isDigitalItem`) in the cart estimate, returns, label guard
  and publish review — audiobooks/EPUBs/format-only e-books are never shipped, returned or weight-checked.
- **Returns:** a return request the shop hasn't approved can be refunded directly (only approved/received block refunds);
  the workbench offers **Close request without a return**; a closed request can't be reopened; a refund that never reached
  the provider clears its `refundRequest` claim; a lost dispute doesn't show the customer "refund complete"; refunding an
  undispatched order follows the admin's restock choice.
- **Storefront:** `lib/ScrollToTop.tsx` opens each newly clicked page at the top; account data is cleared on sign-out /
  user change (no address carry-over) and order rows/fields are keyboard + screen-reader accessible; product views count
  once; product **Back** goes home when the shopper landed directly; the quantity stepper counts copies already in the bag
  and `addToCart` returns false when nothing was added; Recently viewed updates between books; search overlay traps focus;
  footer icon links have labels (Text & labels › Footer); the grouped legal row hides with no policies; wishlist badges
  count only live books; the cart estimate guesses the country and hands its destination to checkout only after **Estimate**.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Bug sweep #7 (8 October 2026)

- **Stock on book save:** `adminApi.updateBook(id, form, loaded)` re-reads the book in a transaction and keeps the live
  `stockLevel` / edition stock for any count the owner didn't change (`admin/bookStockMerge.ts` `keepLiveStock`), so a
  sale made while the editor was open is never undone. **Discount edits** never write `usageCount`/`createdAt`
  (server-owned). Duplicate codes are refused in the editor (`validateDiscountDraft(…, otherCodes)`); the server trims
  codes and uses the usable copy when old duplicates exist (`fetchValidDiscount` / `discountProblem`).
- **Display price:** a book sold in editions shows its cheapest edition and never a SALE badge (`displayPrice`,
  `showsSale` in `features/site/displayPrice.ts`) — it's always charged an edition's price. Search/wishlist/sections use it.
- **Backorders:** `backorderable(book)` (CartContext, book-level `allowBackorder` like the server) — no stock cap in
  `addToCart` or the product page quantity. The bag drawer reprices saved lines once the live catalog loads (never in
  preview; lines that can't be bought are left for checkout's notice).
- **Release dates:** a plain `scheduleDate` opens at midnight Toronto (`releaseArrived` in `liveBook.ts`, mirrored in
  `functions/paymentGuards.js` and `scripts/publicStorefrontData.mjs`); admin discount "today" and Expires use the shop day.
- **PayPal:** partial refunds accumulate (`paypalRefundedTotalMinor`, `paypalRefundIds`) and a full total refunds the
  order; capture uses the order's own `paypalMode`. Order emails list download links for every non-physical line
  (`isPhysicalItem`); the shop's paid-order email escapes the address.
- **Admin:** bulk Feature (bulk bar ⋯ › Feature on the homepage) writes `isFeatured`; Approve/Reject selected acts only on visible reviews and the queue loads
  every pending review; Orders CSV includes partial refunds; Overview stock skips `trackInventory: false` books and the
  format mix uses each line's sold edition.
- **Account:** email-link sign-in survives blocked storage; order rows count copies.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Pre-orders (8 October 2026)

Books › edit › Inventory › **Pre-order** (`preorder: true`) sells a published book before its **Publication date**
(`publishDate`, YYYY-MM-DD, Toronto calendar; empty = "date to be announced"). On release day it becomes an ordinary
book by itself. One rule, `src/shared/preorder.ts` (the Functions run its generated copy `functions/shared/preorder.js`; src/shared/CLAUDE.md). Stock,
prices, holds and payment authority are unchanged: pre-orders use the book's normal inventory settings (stock caps
pre-orders; backorders or untracked stock = unlimited). Both checkout item builders stamp each line with
`preorder`/`releaseDate` from the catalog (`preorderLine`, a browser flag never sticks). Paid orders with a physical
pre-order line wait in the **Awaiting release** queue (`queueOf`, Orders desk **Pre-orders** tab) until the latest
release date, or until **Ready to ship now** (`fulfillmentAction("release_preorder")` → public `order.preorderReleasedAt` +
`operations.preorderReleased`). Saving a book whose pre-order switch or date changed re-stamps the release date on its
paid, unsent pre-order lines (`restampPreorderItems`, `adminApi.syncPreorderOrders`; switched off = released today);
`dispatchProblem`, local handover and the server `labelProblem` refuse until then. The 3-day ship-late alert and the
daily digest start counting when the printed pre-orders were released (`preorderClockStart`). E-books bought as a
pre-order unlock on release (`downloadDigitalAsset` checks the line and the live book). Order emails get a Pre-order block (`preorderEmailLines`); the shop email subject says `[NEW PRE-ORDER]`.
Storefront: product page stock line + **Pre-order** button, shop-card badge, bag/checkout line notes, a checkout
summary notice (region `checkoutPreorder`), order-tracking note (region `trackingPreorder`), and `PreOrder` +
`availabilityStarts` JSON-LD. Studio: Style › Badges & shop labels › **Pre-order badge** (`showPreorderBadge`), Cart
drawer › **Pre-order note** (`cartDrawerShowPreorder`); words in Text & labels › Product page (`pdpPreorder*`,
`preorderButton`, `preorderBadge`), Cart (`cartPreorder*`), Checkout (`coPreorderNotice*`), Order tracking
(`trackPreorder*`). Mixed bags ship together on the latest release. Deploy Functions with the frontend.

## Gift cards, box sets, automatic discounts, add-ons and scheduled sales (9 October 2026)

All five are priced on the server by **`priceOrder`** (`functions/index.js`), the one price builder every checkout
path uses (card, PayPal, manual, free); `recalculateOrder` and the Stripe handler both call it. Pure rules live in
`functions/shared/promotions.js` (sale windows, add-ons, box sets, gift-card products) and
`functions/shared/discountMath.js` (discount arithmetic, automatic choice, free gift), both generated from `src/shared/` and
one copy with the shop, and `functions/giftCards.js` (codes, holds, debit/credit). Handler tests:
`functions/promotionsCheckout.test.js`, `functions/giftCardSettlement.test.js`.

- **Scheduled sales:** `saleStartsAt` / `saleEndsAt` (plain Toronto dates, inclusive) bound `isOnSale`/`salePrice`
  (`saleActive`); `catalogUnitPrice` on both sides uses it, so badges and charges agree.
- **Paid add-ons:** book `addOns` (≤6: `{id,label,price,kind:"option"|"text",maxLength}`), priced per copy. Cart lines
  carry `addOns` and a line key (different inscriptions = different lines); the server re-prices from the catalog and
  saves `basePrice` + `addOns` (label, price, text) on the line. Never on gift cards or box sets.
- **Box sets:** a book with `bundleItems` (≤20 parts `{bookId,variantId,quantity}`) sells at its own price with no stock
  of its own. Order lines store `components`; `promotions.stockLines` expands them inside `stockChanges`,
  `readBooks` and `linesByBook`, so holds, sales, refunds and inspected returns (`returnRestockItems`) move the real
  books. Available sets = `bundleAvailable` (the storefront derives box-set stock the same way).
- **Automatic discounts:** `discounts` with `method: "automatic"`, `code: ""` and a shopper-facing `title`, loaded by
  `loadAutomaticDiscounts` and never redeemable by code. **One discount per order:** a code replaces automatic offers;
  otherwise the biggest saving wins and free shipping applies only when no money-off offer does
  (`pickAutomaticDiscount`). `type: "gift"` (free gift with purchase: `giftBookId`/`giftVariantId`) adds a
  `promoGift` line from the catalog whose price is the discount; browser-sent gift lines are always dropped. Saved as
  `appliedDiscount { id, code: null, automatic: true, title }`, counted like codes. Checkout reads offers via
  `validateDiscountCode` `{ action: "automaticDiscounts" }`.
- **Gift cards:** a book with `productType: "giftCard"` (editions = amounts) is digital, never discounted or taxed and
  can't be paid with another gift card. Paid lines issue one card per copy in `onOrderUpdated`
  (`issueGiftCardsForOrder`, once via `giftCardsIssuedAt`) and email it (template `gift_card`). Cards live in
  admin-read/server-write `giftCards/{sha256(code)}` with `balanceMinor` (CAD cents) and 30-minute `holds`.
  Checkout's code list goes on the order as `giftCards` (rules allow ≤5); `priceOrder` writes `giftCardAmount` +
  `giftCardRedemptions`, and **`total` is what the card/PayPal pays after gift cards**. Holds are taken with stock
  (`reserveCheckout`); the balance is debited only inside the paid transaction (`settleGiftCards`: Stripe webhook,
  verified PayPal capture, `completeOrderWithoutCard`), once (`giftCardsDebitedAt`); a short balance records
  `giftCardConflict` and leaves the order unpaid (Needs attention). A full refund credits it back once
  (`giftCardsRestoredAt`) and disables cards the order bought (`giftCardsVoidedAt`). Orders a gift card fully covers
  use the free path (`completeFreeOrder`); manual payments refuse gift cards; hosted Stripe sessions refuse them
  (Square's page takes them: *Gift card plus card on Square shops*, code plan 5.3).
  Shopper balance check: `validateDiscountCode` `{ action: "giftCardBalance" }` (rate limited). Admin actions:
  `createStripeCheckoutSession` `{ action: "giftCardAdmin", op: issue|setEnabled|adjust|resend }` (`requireAdmin`).
  Deploy `firestore.rules` and Functions with the frontend.
- **Gift-card safety (follow-up):** the amounts a live payment was created for are saved as `chargedGiftCards` with
  `expectedAmountMinor`; settlement, refunds and releases use them (`chargedRedemptions`), so a later re-pricing can't
  change what is debited. Holds carry `owner` (`holdOwner`), so a shopper's own earlier attempt never blocks them.
  Test-mode cards (`isTest`) can't complete a no-card order. `giftCardConflict` clears on a full Stripe refund or
  Order detail › **Mark resolved** (`resolvePaymentMismatch`). `refundOrder` refuses a full refund once a gift card the
  order bought has been spent. Admin alert `gift-cards-not-issued` flags paid gift-card orders with no card after 10 min.
  A box set's pre-order state follows the latest pre-order book inside it (`combinedPreorder`).

## Shop errors (25 October 2026)

Shopper-side crashes reach the admin. `src/app/lib/errorReport.ts` (`installErrorReporting`, first in `main.tsx`;
`reportClientError` from the route `ErrorBoundary` and `SectionBoundary`) sends `validateDiscountCode`
`{ action: "clientError", report }` only from a production build, never in the Studio preview, a frame, `/admin` or for
`looksAutomated()`; noise (network/extension errors, cross-origin scripts) is dropped, at most 5 per page. The server
(`functions/clientErrors.js`, `LIMITS.clientError`) scrubs emails, long numbers, queries and fragments and counts one
admin-only `clientErrors/{signature}` per distinct error (≤100 new a Toronto day, `systemStatus/clientErrorBudget`;
TTL 30 days on `expiresAt`). Admin: Settings › General › Tools & records › **Shop errors** (`ShopErrorsCard.tsx`) and the
`shop-errors` alert (`shopErrors.ts`, errors seen in the last day). Deploy rules, indexes and Functions with the frontend.

## Payment-integrity audit fixes (9 October 2026)

- **Exact card amount:** `StripeCardForm` exposes `setAmount(minor, currency)` / `releaseAmount()`. Checkout pins the
  Elements amount to the server PaymentIntent's `amount`/`currency` before every `confirm` (a reused intent too); the
  screen-total effect can't overwrite it during the attempt, and a changed amount is re-submitted before confirming.
- **Reused intents age out:** the remembered card attempt (`features/site/cardAttempt.ts`, `reusableCardOrder`) keeps its
  PaymentIntent for 25 minutes (holds last 30); after that Pay asks the server again on the same order (re-price, renew
  holds, cancel the old intent). A non-card confirm error on a reused intent asks `action: "status"` and opens the
  success page when Stripe says complete/processing.
- **No paying twice:** `releaseSupersededAttempt` returns `{ paidOrderId }` when the shopper's own earlier attempt is paid,
  PayPal-captured, `reconciliationPending` or Stripe-taken (`previousAttemptPaid`, `paymentGuards.js`); card, hosted,
  PayPal, free and manual checkout then refuse with 409 `previous_attempt_paid` + `previousOrderId` before touching the
  new order. Checkout opens that order's confirmation (`?previous_paid=true`) with Text & labels › Checkout ›
  **Earlier attempt already paid** (`coPreviousPaid`). The success landing forgets the tab's attempt once it is bought.
  A `payment_in_progress` refusal is now decided before the order is re-priced, so it never rewrites gift cards.
- **Gift cards:** paid transactions read the cards in `chargedRedemptions(order)` (what the live payment was created for).
- **Failed refunds:** `charge.refund.updated` (in `REQUIRED_WEBHOOK_EVENTS`) with status failed/canceled, and the reversal
  sweep (refund_pending, `amount_refunded` 0, `failedRefundId`), call `revertFailedRefund`: back to paid (status from
  `preRefund`, saved by `applyOrderRefund`), restocked copies taken back, discount use and revenue re-counted, restored
  gift-card amounts re-debited, `refundRequest` cleared, timeline note — once. Run **Fix webhook** after deploying.
- **Totals:** `totalNeedsConfirming(server, shown, currency)` allows 5¢ in CAD and max(5¢, 1%) in USD/EUR. Customer
  emails' Total (`chargedTotalFmt`) and the Orders CSV `ChargedAmount` use `expectedAmountMinor`/`expectedCurrency` when set.

## Round-2 payment fixes (10 October 2026)

- **Manual orders** (`createManualLocalOrder`) pass `addOns` / `giftCardDetails` through to `priceOrder` and hold the
  *priced* lines (`trusted.items`: box-set parts, free gift), like the card/PayPal paths.
- **Failed refunds:** `revertFailedRefund` also undoes a Stripe `refunded` order (refund id match, or the caller read the
  charge as unrefunded: `chargeUnrefunded`); the 15-minute sweep re-reads Stripe refunds ≤45 days old. A reverted order has
  `refund.status: "failed"` → Orders **Needs attention** (`refundFailed`), an admin alert (`refund-failed`) and an email
  (`onOrderUpdated`). A retry uses `refundRetrySuffix` in the Stripe/PayPal idempotency key. `applyOrderRefund` without an
  explicit/saved restock choice does not restock dispatched orders. The `status` action on a paid order calls `checkStripeReversal`.
- **Discount claims:** `functions/discountClaims.js` — one-use / usage-limit checks (`assertDiscountNotUsedByCustomer`) match the
  mailbox (`emailIdentity`: `+tag`, Gmail dots) and count paid, manual `pending` and live (≤35 min) card/PayPal orders.
- **Duplicate-order guard:** `previous_attempt_paid` only when the new order's lines equal the paid one (`sameOrderLines`,
  server `paymentGuards.js` / client `features/site/orderLines.ts`). `createPayPalOrder` also returns `amount`/`currency`
  and checkout confirms a changed total. Shop-facing totals use `orderChargedTotal` (`expectedAmountMinor` is a public order field).
- **Shipping:** live carrier selection can't be satisfied by a profile rate while live rates exist; a carrier outage says
  "temporarily unavailable". Box-set weight = parts at their edition weights (`bundleWeightGrams` client, `priceOrder` /
  `getShippoRates` / `cartShippingPreview` server). The bag's free-shipping bar counts printed books only (`shippableBagTotal`).
- Gift-card `adjust` history stores the applied change (`requestedMinor` kept when clamped). `createPayPalOrder` binds `STRIPE_SECRET_KEY`.

## Orders, returns and Shippo labels (round 2, PR 8, 10 October 2026)

- **Returns:** `returnTransition` accepts `closed` from approved/received/inspected (ReturnWorkbench › *Close return without a refund*); the request becomes `handled`, nothing is refunded or restocked, `returnProgress.state` is `closed` (customer words `trackReturn_closed`).
- **Shipped means shipped:** a bought label puts `trackingNumber` on the order while the parcel is still in the shop, so `orderRequestProblem`, `dispatched()` (returns), the refund restock default and the shopper's request options use `fulfillmentStatus`/`status` only, never `trackingNumber`.
- **Label purchase (`createShippingLabel`):** `callShippo` has a 15 s timeout (45 s for the purchase) and sets `error.shippoStatus`. HTTP 4xx (except 408) is a definite refusal (`shippoDefiniteRefusal`): the lock is released with a history entry; 5xx/timeouts/network keep it. Every purchase is linked to a Shippo Order (`linkedShippoOrder`: reused while `order-operations.shippoOrderAddress` matches, else created; best-effort, and a 4xx on the linked purchase retries once unlinked) because unlinked API labels can't be refunded from Shippo's dashboard. `buyRate` saves `shippoTransactionId` (+ status/rate) in `order-operations` BEFORE the order write; `recordLabel` writes the order and releases the lock in one transaction; transactions and shipments carry `metadata: "Order <id>"`. A test key (`shippo_test_`) may rehearse a purchase: the label is stored with `order-operations.labelTest: true` and the workbench shows a TEST label badge. `mode: "voidLabel"` (admin) refunds the label with Shippo (`refunds/`) or, with `confirmedElsewhere`, just drops it; the old label goes to `order-operations.labelHistory`. Rules in `functions/labelVoid.js` ↔ `admin/labelRefunds.ts` (`labelVoid.parity.test.ts`): a label is voidable until the parcel is handed over (`labelHandedOver`: `shippedAt`, a sent fulfillment status or `completed`), so a cancelled/refunded order's unused label can be refunded (workbench **Unused label › Void label for a refund**). The server finds a label with no saved transaction id by tracking number (last 90 days), reads the transaction first (never refunds twice, refuses a tracking mismatch or an earlier rejection), then records `order-operations.labelRefunds` + `labelRefundOpen`; `checkLabelRefunds` (inside `unpaidPaymentSweep`, hourly per row) follows each refund to refunded/rejected, and `adminAlerts` shows rejected or 30-day-pending refunds. After dispatch, `edit_tracking` with `replaceLabel: true` records a replacement carrier/number.
- **Customs:** parcels whose destination country differs from the shop's origin get Shippo customs items + a declaration (`functions/customs.js`, per physical line; value = what was paid in CAD, discount shared out). Per-book answers `customsDescription`, `hsTariffNumber`, `customsOriginCountry` (Books › edit › Details; blank = Printed books / 4901.99 / shipping-from country; `admin/customsFields.ts`).
- **Label rates:** `labelRatesFor` offers the cheapest quote of the service checkout sold (`order.shippingMethod`, any carrier) first, then Canada Post; `isPurchasableRate` is the purchase check.
- **Shippo key:** `saveShippoConfig` requires a `shippo_live_`/`shippo_test_` prefix and a successful Shippo call (401/403 = not saved); stores `mode`/`verifiedAt`; Settings › Shipping › Carrier & labels shows LIVE/TEST.
- **Tracking never moves back:** `advancesTracking` (fulfillmentGuard.js); the Shippo webhook updates inside a transaction and emails only when it advanced.
- **Paid-order trigger:** `onOrderUpdated` sends its emails first; `checkAddressAfterPayment` (the Shippo address check) runs afterwards in a `finally`.
- **Address rules:** `src/shared/addressRules.ts` (one copy; the server requires `functions/shared/addressRules.js`, and the checkout form takes its no-postcode list from it): street, city, country always; province/state only for CA/US; postal code unless the country has none (same no-postcode list as the checkout form). Used by `validateAddress`, `autoApproveShippingAddress`, label purchase and `addressIssues`.
- **Orders list:** `ordersTable.ts` is the one filter behind the table rows and tab counts. Orders can be **archived** (`archivedAt`, `adminApi.archiveOrders`): they leave the work queues/badge but stay in *All orders*. Delete is also refused (client `deleteRefusal` + `firestore.rules`) for unpaid orders with a started card/PayPal payment unless cancelled. The desk's *Shipped* tab excludes terminal (cancelled/refunded/refund-pending) orders. The ship-late alert counts printed orders only.
- Deploy `firestore.rules` + Functions with the frontend.

## Privacy and newsletter (10 October 2026)

- **Owner decision (closed, don't re-raise in audits):** analytics/marketing tracking keeps its default of running before the
  cookie banner is answered. Do not change the consent defaults in `lib/consent.ts`.
- **Privacy and bookings (15 November 2026):** export and erase also read `bookings` (by `customer.email`) and
  `bookingWaitlist`. Export leaves out link keys and payment ids. Erase deletes waiting-list rows and writes
  `redactedBookingFields` (`privacyData.js`): a card-paid or refunded booking (`bookingPaid`) keeps name and email and loses
  phone, note and answers; any other loses every detail (name becomes "Details removed"). Both lose their link keys and get
  `reminderSentAt`, so no link works and no reminder goes. The time is never freed: the owner keeps or cancels it. Tests:
  `privacyBookings.test.js`.
- **Privacy and visit notes (17 November 2026):** the owner's export lists `clientVisitNotes` (`clientVisits` by `email`);
  erase deletes those records and their photos (`admin.storage()` scoped to the shop, only `client-photos/<64 hex>/<name>`
  paths, a file already gone counts; one that won't delete is listed in `photosNotDeleted`). The shopper's own copy
  (`scan: false`) never reads them: they are the team's notes. Tests: `privacyBookings.test.js`.
- **Privacy export/erase** (`functions/privacyData.js`, `personalDataFor` / `handlePrivacyAdmin`): addresses match in any
  capitalisation (exact lower-case query plus a bounded field-only scan for older mixed-case rows); browser writes of contact
  messages, review contacts and saved carts now lower-case the email. Export and erase also cover `giftCards` (purchaser/recipient;
  erase blanks names, emails, message but keeps the balance), `emailLog` (`to` may list several recipients), and admin-only
  `order-operations` for the person's orders. Erase blanks the customer block of never-paid orders (`neverPaid`), deletes their
  order-operations, blanks private notes on kept paid orders, and takes `reviewAction` (`anonymize` | `unpublish` | `remove-text`,
  Settings › General › Privacy requests › *When deleting, their reviews*). `emailLog` rows are pruned after 90 days in `runEmailOutbox`.
- **Newsletter double opt-in** (`functions/newsletter.js`, actions `newsletterSignup` / `newsletterConfirm` on
  `createStripeCheckoutSession`): signup stores `newsletter/<email>` as `status: "pending"` with `consentText`, `requestedAt`, and mails
  a signed confirm link (`purposeToken`, budget `claimEmailSend("newsletterConfirm")`); the link sets `status: "confirmed"`. Browsers
  can no longer write `newsletter` (`firestore.rules`). Older rows with no `status` count as subscribed. `action: "unsubscribe"`
  (the shared signed link, `/track?unsubscribe=1`) now also deletes the newsletter row. Pending rows older than 30 days are pruned.
  Anything that mails or counts subscribers must skip `status === "pending"` (`mayMail`). The confirmation email text is fixed in code
  (not an editable template) so its consent wording can't be edited away; storefront words are Text & labels › Newsletter / Order tracking.
- **Email-link sign-in** (`features/site/emailLinkSignIn.ts`): a failed attempt forgets the saved address and keeps the "confirm your email" card.

## Round-2 security: private book fields, public endpoints, rules (10 October 2026)

- **`books` is public for published books only.** `firestore.rules`: `allow read: if isAdmin() || resource.data.status == "published"`.
  A shopper list query must say so: `publicApi.getStorefrontBooks` filters `where("status", "==", "published")`, and
  `scripts/publicStorefrontData.mjs` (sitemap, prerender, the 15-minute change check) uses a `runQuery` with the same filter
  (`readPublishedBooks`). `publicApi.getBook` returns `null` for a book the rules refuse (draft/archived). Account and Order
  tracking therefore treat an unreadable book as `UNREADABLE_BOOK` (`digitalLine.ts`) and let the server decide on a download.
  A book with no `status` is unreadable to the public: `scripts/migrate-book-private-fields.mjs` stamps `published` on those
  (the storefront already treated a missing status as published). Scheduled/future-dated books are `published` with a
  `scheduleDate`, so they remain readable by the rule (the storefront hides them with `isLiveBook`) — the rule cannot compare dates.
- **Private book fields** (`costPrice`, `usdCostPrice`, `eurCostPrice`, `shelfLocation` and each edition's shelf code, `legacyInventoryKey`,
  `digitalFileUrl`/`digitalFilePath`) live in admin-only `books/{id}/private/admin` (`variantShelf: { editionId: code }` for editions).
  `admin/bookPrivate.ts` (pure) splits a book on every write and merges on every read; `adminApi` does it in `createBook`, `updateBook`
  (inside its transaction), `duplicateBook`, `deleteBook` and the legacy inventory sync, and `getAllBooks` / `getBook` merge the private
  documents back (one `collectionGroup("private")` read; `getAllBooks({ includePrivate: false })` skips it). Readers take the private
  value, else a leftover public one, so the admin works before and after the migration; a save moves the fields it touches. Rules:
  `match /private/{docId}` under `books` plus `match /{path=**}/private/{docId}` (admin read) for the collection-group read.
  Functions never read cost fields (no change needed). Add any new owner-only book field to `PRIVATE_BOOK_KEYS` in **both**
  `bookPrivate.ts` and the migration script (`scripts/migrateBookPrivate.test.ts` keeps them equal). `digitalFileName` stays public
  (the shop uses it to show a Download button; the bucket path is `read: false`).
- **Deploy order for the books change:** (1) deploy the frontend/code that reads both locations (this PR's admin code does), (2) run
  `GOOGLE_APPLICATION_CREDENTIALS=… node scripts/migrate-book-private-fields.mjs` (dry run) then `--apply`, (3) only then deploy
  `firestore.rules`, indexes and Functions. Rules before the migration hide status-less books from shoppers.
- **Digital uploads** store the Storage path: `adminApi.uploadStoragePath` (no `getDownloadURL` on the read-denied `digital-assets/`
  folder); the editor saves `digitalFileName` (what `downloadDigitalAsset` opens) and `digitalFilePath`.
- **Public endpoint hygiene** (`functions/`): `setGlobalOptions({ maxInstances: 10 })`; `action: "status"` has its own rate limit
  (`LIMITS.status`) and only looks up payment ids saved on the order; `automaticDiscounts` has `LIMITS.autoDiscount` and a 30 s shared
  read; `getShippoRates` refuses more than 50 lines or non-plain ids; anonymous handlers answer upstream/database failures with a
  fixed sentence (`publicErrors.js` `publicErrorMessage`; admin endpoints keep detail); the checkout location signal uses
  `clientIpOf` and the platform's `X-AppEngine-Country` (`serverGeoCountry`) — no third-party IP lookup, and no signal when the
  platform sends none. Admin emails encode the order id in links.
- **TTL:** `rate-limits`, `contact-email-throttle`, `abandoned-cart-throttle`, `email-claims` and `payment-webhook-events` carry a top-level
  `expiresAt` (`retainFor()` / the limiters) and `firestore.indexes.json` `fieldOverrides` expire them. Deploy indexes to turn TTL on.
- **Rules:** analytics counters (`analyticsStepsOk`): visits >= 0, funnel/device maps are fixed-key and +1 per write, free-key maps
  change one entry per write and never lose one (values of free keys can't be bounded in rules). Guest orders: money fields are numbers
  in range, `customer` has only its five keys, `activity`/`appliedDiscount`/`fulfillmentSelection` are small, `testMode` is a bool (per-line
  content still can't be checked — `priceOrder` rebuilds lines). `scripts/firestore-rules-emulator.mjs` covers all of it.
- **Studio/storefront:** imported theme files drop `customHeadHtml`/`customFooterScripts` (`stripImportedCustomCode`; Studio says so);
  connected details are escaped inside HTML-drawing fields (`HTML_SETTING_KEYS`, a test fails when `SectionComponents` gains another
  `dangerouslySetInnerHTML` field); the newsletter box, review form and back-in-stock box write nothing in the Studio preview
  (`inEditorPreview()` inside `subscribeNewsletter`, `saveStockAlert`, `reviewsApi.create`); the book page's review count/average come
  from Firestore aggregation (`reviewsApi.summary`, also the JSON-LD `aggregateRating`) with a **Show more reviews** button
  (Text & labels › Reviews › `reviewsMore`; Style › Reviews · layout & elements › Show more reviews button); Admin › Reviews loads
  50 pending reviews at a time with a server-side total and fetches a reviewer's email only on **Show email** (`admin/reviewQueue.ts`;
  needs the `reviews (status, createdAt desc)` index). All CSV exports guard leading tab/CR as well as `= + - @`.

## Round-2 digital downloads (10 October 2026)

`downloadDigitalAsset` rules live in `functions/digitalDelivery.js` (pure, `digitalDownloads.test.js`); the endpoint and the
order-confirmation email both use them. Emailed download links stay outside browser App Check.
- **Limits:** each book + edition on an order may be fetched `DOWNLOAD_LIMIT` (10) times, counted in a transaction on
  `orders/{id}.downloadCounts` (`countKey`); the 11th click answers 429. Orders › More order actions › **Reset download limits**
  clears the map (`adminApi.updateOrder`). `downloadToken` itself is unchanged (still per order, never expires); every click mints
  a 15-minute signed URL. `publicOrderView` never sends `downloadCounts`. The email wording is `DEFAULT_DOWNLOAD_NOTE`
  (overridable with an optional `order_confirmation.downloadNote` in `settings/notifications`); nothing says "24 hours" any more.
- **Pre-orders:** `emailDigitalEntries` gives a not-yet-released e-book no link ("Available from <date>" / "once the book is
  released"); Account and Order tracking keep their buttons (the server answers with the release date until then).
- **Box sets:** a request may name a box set's part (`deliveryCandidates` matches `components[].id`); the email, Account and
  tracking list the digital parts (`digitalLine.ts` `digitalEntries`, `downloadBookIds`). The catalog decides whether a part is digital.
- **One file per edition:** Books › edit › **Editions** › *Digital edition* toggle + **Upload this edition's file** sets the edition's
  `digital`, `digitalFileName` (public, like the book's) and `digitalFilePath` (private: `books/{id}/private/admin.variantFiles`,
  split/merged by `bookPrivate.ts`). `pickFileName` takes the edition's file, else the book's. Download links carry `&variantId=`
  and the pages show one button per edition ordered.
- **Refused:** unpaid (402), cancelled orders and open disputes (403; `won/lost/warning_closed/closed/charge_refunded` don't block).
- **File:** signed URL has `responseDisposition: attachment; filename="<title>.<ext>"` (the upload's epoch prefix dropped) and
  `responseType` from the extension (pdf, epub, mp3, m4a, zip).
- Deploy Functions with the frontend. No rule or index change (`downloadCounts` is written by Functions and by the admin).
- **Several files, every shop (Digital D1, Beta, 17 November 2026):** `src/shared/digitalFiles.ts` (server copy
  `shared/digitalFiles.js`) is the one rule. A product or edition holds `digitalFiles: [{ file, name, size }]` (≤20, ≤5 GB each,
  storage.rules refuses bigger); the admin keeps `digitalFileName` = the first file, and `filesOf` still reads a lone
  `digitalFileName`. `filesFor`: the edition's own files, else the product's. Links take `&file=<n>` (0 when left out);
  each file has its own count key (`fileCountKey`: the first file keeps `countKey`, so older counts carry on). The email,
  Account and tracking list one button per file when there are several (`emailDigitalEntries` adds `files`). Any product turns
  digital with Books › edit › **Digital product (Beta)** (`digital: true`), in every kind of shop. `priceOrder` refuses
  downloads to a buyer outside `settings/website.digitalDownloads.countries` (default CA and US, `"*"` = every other country)
  with `digital_country`; payment links skip it. D1b adds the account Library.
- **Pay what you want and used-up downloads (Digital D2, Beta, 17 November 2026):** `src/shared/payWhatYouWant.ts` (server
  copy `shared/payWhatYouWant.js`). A product with `payWhatYouWant: true`, no edition, not a gift card or box set: its price
  is the lowest, the buyer's `chosenPrice` on the line (shop currency, ≤ max(1000, price)) is what `priceOrder` charges and
  keeps on the line; anything lower, higher or not a number is refused with `pay_what_you_want`, a typed nothing charges the
  price. Product page box: `extras/pdp-pay-what-you-want` (region `productPayWhatYouWant`; the buyer types in the shown
  currency, `readAmount` converts back). A refused download notes `downloadLimitReached.<countKey>` once on the order; the
  Alerts page shows `downloads-used-up` for paid orders, and Reset download limits clears it with the counts.
- **Stamped PDFs, new versions, Tell buyers (Digital D2b, Beta, 17 November 2026):** `stampPdf: true` on a product makes
  `downloadDigitalAsset` hand out a copy of a PDF (≤ `MAX_STAMP_BYTES` 50 MB, `pdfStamp.js`, pdf-lib) with the buyer's name,
  email and order number at the foot of each page, kept at `digital-stamped/<order>/<file>`; any failure sends the original.
  **New version** (Books › edit, `DigitalFilesEditor`) swaps a file's stored name and size for a new upload and keeps its name
  and place, with `version` (2+) and `updated` (shop day) (`newVersionOf`); the first file's count key gains `__v<n>`, so
  buyers get fresh downloads. **Tell buyers** (`DigitalUpdateCard`, admin action `digitalUpdate`: `status`, `send`, `cancel`,
  `resume`; `functions/digitalUpdates.js`) queues `digitalUpdates/{id}` (server only, no rule: browsers can't read it), one
  active per product. The sweep (`runDigitalUpdates` in `unpaidPaymentSweep`) walks orders by id (200 a page, 150 emails a
  run, a 10-minute lease), emails each paid, live, non-test order holding a downloading line of the product
  (`updateLines`: the order email's own rule, box-set parts by the catalog) its download links, claimed first in
  `digitalUpdates/{id}/sent/{orderId}`, so nothing goes twice. Emails are `bulk` (never the press's Gmail).

**Play mode (Digital D3, Beta, 17 November 2026):** `downloadDigitalAsset?…&play=1` (CORS through `applyCors`) checks the
order, token and file like a download, then refuses a file that isn't audio or video (`mediaKind`, 400 `not_media`), adds
one to today's count in `orders/{id}/plays/counts` (`nextPlayCount`, key = the file's download-count key, `MAX_PLAYS` a
day, 429 `play_limit`) in a transaction and answers JSON `{ url, kind, expiresAt }`: a signed link with inline
disposition and the file's type, `PLAY_LINK_MINUTES` long, `Cache-Control: no-store`. It never touches `downloadCounts`.
The sub-document is server-only (no rule opens it). Tests: `digitalDownloads.test.js` › Digital D3.
**Download meter (Digital D3b):** every download link, and an order file's first play link of the day, writes a usage
line `{ shop, kind: "file", bytes }` (`usageLog.js`, through `fileUsage` from index.js, only inside a shop) with the
file's size (the stored `size`, else storage metadata). The platform's `shop_file_bytes` metric counts it into the
shop's web traffic (`egressGb`, kept apart as `fileGb`). Tests: `digitalFileMeter.test.js`.

## Payments module (27 October 2026, code plans 1.11–1.12)

`functions/payments/` is the one door to the shop's card payment provider. `index.js` (`createPayments`) lists the
provider interface in its header comment, picks the shop's provider (`shopConfig.paymentProvider`, from
`SHOP_PAYMENT_PROVIDER` in `functions/.env.<project id>`; unset or unknown keeps `stripe`, the only provider so far) and
hands callers exactly that interface, frozen. `stripe.js` (`createStripeProvider`) is the Stripe implementation: the
code that used to live in index.js and the checkout files, moved as is. Interface: `testMode`, `readKeys` (once per
sweep), `clientForMode` (an opaque account), `findOrderPayment`, `readAttempt` (writes into `found` as it reads, so a
failed second read keeps the first), `stopAttempt`, `checkReversal` (hands the charge, dispute and a lazy `listRefunds`
to the caller's `apply`), `refund` (`onCalling` fires just before the provider is asked), `webhookClient`,
`verifyWebhookEvent`, `forCheckout(settings)` (`settlePreviousIntent` → `"in_progress"`/`"cleared"` or throws when
unsure, `createCardIntent`, `createCheckoutSession`), and for Settings › Payments `deployedLiveKey`, `checkKey`,
`webhookEndpoints()` (`{ mode, endpoints }`, null without a key) and `registerPaymentDomain`.
- index.js builds it once (`payments`) and passes in its lazy `Stripe`, so the vm handler tests' fake Stripe still
  applies; the module never requires `stripe` itself. index.js, `orderRequests.js`, `checkoutPayment.js` and
  `checkoutAdmin.js` use it; none receives `Stripe` or `STRIPE_SECRET_KEY`. Order bookkeeping (what a payment, refund or
  reversal means for an order) stays with the callers.
- `payments/payments.test.js` (fake Firestore and Stripe) pins every call, the provider choice, and two "one door"
  checks: no other functions file calls Stripe's API or makes a client, or uses the Stripe provider's own helper names.
- Still Stripe-named outside the module (Phase 2, plan 2.2): stored order fields (`stripePaymentIntentId`,
  `stripeMode`, …), the `stripeWebhook` endpoint, order-record functions the handler tests pin (`checkStripeReversal`,
  `markStripeOrderPaid`, `syncStripeReversal`) and the Stripe-shaped guards in `paymentGuards.js`/`stripeRecovery.js`.
- A new provider is one file beside `stripe.js` with the same names, added to `PROVIDERS` in `index.js`.
- `SHOP_PAYMENT_PROVIDER` unset or empty means `stripe`; any name not in `PROVIDERS` (a typo, or `square` before it is
  built) makes `shopConfig.js` throw a plain message, so the functions refuse to load instead of quietly taking
  payments through Stripe (`paymentProviderOf`; payments.test.js loads index.js with `square` to prove it).

**Platform mode (28 October 2026, code plan 2.2).** `SHOP_PAYMENT_MODE` (`own`, the default, or `platform`; anything
else makes `shopConfig.js` throw) picks how the provider reaches Stripe. In `platform` mode the shop holds no Stripe key:
`payments/platform.js` gives `stripe.js` a Stripe-shaped client whose calls go to the platform's payment service
(`SHOP_PAYMENTS_SERVICE_URL`, https, required) with `X-Shop-Id` and `Authorization: Bearer <PLATFORM_SERVICE_KEY>`. The
service makes them on the press's own connected account. Key checks, webhook endpoint lists and payment-domain
registration are the platform's job there. `verifyWebhookEvent` is async in both modes: in platform mode it reads only
the forwarded event's id and fetches the event again through the service, so an unsigned forwarded body can't change an
order (tested). `platformKey.js` holds the secret: `withPlatformKey([...])` adds `PLATFORM_SERVICE_KEY` to every
function's `secrets` list (and the global options) on a shop that uses a platform service, and to none otherwise;
`platformKey.test.js` fails when a functions file declares a bare `secrets: [` list. The card form gets the platform's
publishable key and the press's account from the shop profile's `payments` (`platformStripe` in `src/lib/shopProfile.ts`).

**Memberships (18 November 2026, M1).** Stripe's `standaloneCheckout(mode).subscriptions` reads and changes a member's subscription (`read`, `cancelAtEnd`, `resume`, `setCard`, `endNow`, `invoices`), answering `memberSubscription` (stripe.js: a plain shape; the period is read from the item on newer API versions). The page itself is `open` with `mode: "subscription"`; in platform mode the service adds the fee as a share of each invoice. Square has no `subscriptions` until M4: callers check for it.
The records and actions are in `memberships.js` (`membershipDesk` in index.js): plans and memberships are server-only;
public `membership*` actions go through validateDiscountCode (`identify` = a verified sign-in email), owner ops through
`membershipsAdmin`. The subscription page carries no `client_reference_id` (that names an order and would reach
`markStripeOrderPaid`); the membership id rides in `metadata.membership` instead. `apply` writes the provider's state and
sends each email once (`welcomedAt`, `failedEmailedFor`/`endingEmailedFor` per period, `endedEmailedAt`). The webhook calls
`onEvent` best effort before marking the event done; `bookingSweep` calls `sweep()` (reads `checkAfter <= now`, closes
unfinished pages after 60 minutes as `neverStarted`). The privacy erase refuses while a membership is running. **Payments for the books (M1d):** `recordPayments` keeps each membership's paid invoices as `payments` (id, amount, currency, paid and period end; at most 120, `mergePayments`), re-read from the provider at most every 20 hours by the sweep, at once on an `invoice.*` event and when a page settles. The owner op `payments` lists them for the money pages, with no email. **Member prices (M2a):** a plan's `memberPercent` (0 to 50, `cleanPlan`). Checkout calls `membershipPricing` (index.js `handleMembershipPricing`, verified sign-in plus the order's key or sign-in, like `stockistPricing`), which keeps the best membership's id as `memberId` on the order. `priceOrder` asks `membershipDesk.priceFor(memberId, testMode)` every time it prices: perks state, same mode, Memberships on, plan percent. Each product at the shop's price (not a gift card, not a chosen price, not a payment link) pays `memberUnitPrice`; the lower of trade and member price wins, and the line carries `memberPrice: true` (never taken from the browser). Codes and automatic offers apply on top. **Members-only pages (M2b):** a page with `status: "members"` (no rule lets a shopper read it) is served by the public action `membershipPage` {slug}: its title to anyone, its words only to a signed-in customer with a perks membership in the shop's current mode (`hasMembership`), and nothing while Memberships is off. **Members book first (M2c):** an event's optional `publicFrom` (before `start`, `cleanEvent`) gives members a head start. `salesStage(event, now, membersOn)` is `members` until then, but only while Memberships is on (off: everyone books, so an event never locks everyone out). `eventsInfo` sends `membersUntil`; `eventStart` asks `membersFirst.isMember(req)` (index.js: verified sign-in plus `membershipDesk.hasMembership`) once and keeps the answer for the transaction's own check, refusing with 403 `members`. Discount-code checks (`eventCode`) don't sell, so they stay open. Classes and courses don't have a head start yet. **Free for members (M2b downloads):** a product with `memberFree: true` (Products › edit › Digital product, shown while Memberships is on) costs a member nothing: `priceOrder` sets the line to 0 when `memberFreeProduct(book, variant)` (shared `membershipRules.ts`: the chosen edition is digital, or with none the product) and the order's `memberId` counts. `priceFor` now counts a plan with no percent too. Checkout claims member prices on the card attempt; when the server then finds nothing to charge, it says `coMemberPriceFree` and the free path claims again on its own new order before `completeFreeOrder`. **Box plans (M3a):** a plan's optional `box` {items: up to 10 {bookId, variantId?, quantity 1-10}, duplicates merged; cutoffDay 1-28} (`cleanBox` in `cleanPlan`, shared `membershipRules.ts`). Joining a box plan marks the membership `box: true` and the card page collects a Canada or US address (`shipping_address_collection`); `fromSessions` keeps it as `address` (`sessionAddress`, cleaned by `cleanBoxAddress`) only when none is saved. Public action `membershipAddress` {id, address} changes it (400 `address`, 409 `state` when the membership sends no boxes or has ended). Adding a box to a plan marks its running memberships `box: true` with no address, so the account card asks for one. `boxMonth`, `shopDayOfMonth` and `getsBox` (active or ending) are ready for M3b's orders. **Box orders (M3b):** the sweep's `sweepBoxes` runs on or after the plan's cut-off day (shop time, `zone`): for each box membership with `getsBox`, an address, no `lastBoxMonth` for this month and `paidByCutoff` (not still in a trial on the cut-off), index.js `makeMembershipBoxOrder` makes order `BOX-<membershipId>-<YYYY-MM>` (fixed id, so never twice) priced through `priceOrder` with a payment-link deal at 0 (refused unless the total is 0), `paymentMethod: "Membership"`, `source: "membership_box"`, `membershipBox`, then `settlePayment` (stock, emails, oversold as usual). Success stamps `lastBoxMonth`/`lastBoxOrder`; a refusal is kept as `boxProblem` and retried hourly, at most 40 tries a run. `boxWarnings` (from three days before the cut-off, `inStockWarning`/`boxShortfall`: untracked or backorder products are never short) goes to the admin `list` op and, from 8 a.m. shop time, one `[STOCK]` email per plan and month (`boxWarnedFor` on the plan), sent by the sweep rather than inside the 8 a.m. digest. **Skip and pause (M3c):** member actions `membershipSkip`/`membershipUnskip` (box memberships, `active` only) set `skipMonth` to `nextBoxMonth` (this month before its cut-off, else next); on a monthly plan the provider holds payments (`subscriptions.pause(id, periodEnd + 1 day)`, Stripe `pause_collection` void, so the held payment is never taken later), and the sweep makes no box that month. `membershipPause`/`membershipUnpause` hold payments with no end date: `memberState(status, cancel, pausedForever)` gives `paused`, which has no perks, no boxes and no member prices (`hasPerks`, `getsBox`), keeps `pausedAt`; resuming also clears a skip. Both are rate-limited per member (`CHANGES_PER_HOUR` 10). The admin row shows Paused and the skipped month.
**Square (28 October 2026, code plan 2.2b).** `SHOP_PAYMENT_PROVIDER="square"` works only with `SHOP_PAYMENT_MODE=
"platform"` (`providerModeOf` throws otherwise). `payments/square.js` answers the same interface in Stripe's words, so
the callers stay as they are: Square objects are mapped to intent, session, charge, refund and dispute shapes, and the
ids it saves carry our prefixes (`sqpay_`, `sqlink_`; `payments/ids.js`, used by every "is this a saved payment id"
check instead of `pi_`/`cs_`). Checkout is Square's hosted page (a payment link): `createCardIntent` and the embedded
form refuse with `card_form_unavailable`; the page sends the shopper there and back with `?square=1`, and the status
check reads the order's own saved payment. Square events come to `stripeWebhook` from the platform with
`X-Platform-Event: square`; `verifyWebhookEvent` fetches the payment, refund or dispute again before believing it.
Card orders keep `paymentMethod: "Stripe"` (the rules and the server know cards by that name); `paymentGuards.js` also
treats "square" as a provider. The admin's **Card payments** card (`PlatformPaymentsCard.tsx`, action
`platformPayments` with `step: "status" | "connect"` in `checkoutAdmin.js`) replaces the Stripe keys card on every
platform shop: connect Square (or finish Stripe onboarding), the account's state and Colophon's fee next to payouts.
**Switched providers (9 November 2026, code plan 27.6b).** A platform shop that moved from Stripe to Square or back is
deployed with the new `SHOP_PAYMENT_PROVIDER` and `SHOP_PAYMENT_EARLIER` naming the old one (platform mode only, never
the current provider; `shopConfig.earlierPaymentProvider`). `createPayments({ earlier })` then builds both
(`bothProviders` in `payments/index.js`): new sales and everything else go to the current one, and each call about an
existing order goes to the provider its saved id belongs to (`findOrderPayment`, `readAttempt`, `stopAttempt`,
`checkReversal`, `refund`, `paymentMoney`). `stripeWebhook` passes `X-Platform-Event` to `verifyWebhookEvent`, which
picks the provider the platform names and stamps `event.provider`; `payout.paid` hands it on to `payoutMoney`
(`recordPayout({ provider })`), since Stripe and Square payout ids look alike. `paymentPageSweep` also runs after a
switch away from Square, for the pages opened before it. Test: `switchProviders.test.js` (both directions, through the
real payment service).
**Your web address (28 October 2026, code plan 2.9).** `customDomains.js` (action `customDomains`, `step: "list" |
"add" | "check"`) passes the admin's request to the platform's domain service (`PLATFORM_DOMAINS_URL`, https; unset: 409
`not_available` and the admin shows the older "for your records" field) with the service key, which `withPlatformKey`
now declares when that address is set. The service adds the address to `SHOP_EXTRA_ORIGINS` and redeploys the server
code before Hosting serves it. In platform mode `payments.registerPaymentDomain` goes through the service
(`account.paymentDomain`) instead of refusing. Plan 5.9 adds `step: "makeMain" | "remove"` (`domains.makeMain`,
`domains.remove`): the main address becomes `SHOP_SITE_URL` (emails, order links) and the profile's `siteUrl`, written and
redeployed by the service; the service refuses removing the main address or the shop's own web.app one.
**Bookkeeping (28 October 2026, code plan 7.16).** `quickbooksLink.js` (action `bookkeeping`, `step: "status" | "connect" |
"options" | "save" | "resend" | "disconnect"`) passes Settings › Bookkeeping to the platform's bookkeeping service
(`PLATFORM_ACCOUNTING_URL`, https, LMB-PLATFORM services/accounting; `withPlatformKey` declares the key when set). Unset:
`status` answers `{ enabled: false }` and the page and its menu entry stay hidden; other steps 409 `not_available`. The
currency sent is always the shop's (CAD). `resend` sends `buildDay(date)`: index.js reads every order (a refund can land
on an older one) and `dayFromOrders` picks the day from `shared/bookkeeping`'s `dailyBookkeeping` (Toronto days, zeros
on a quiet day); without `buildDay`, 409 `not_ready`. The nightly push of days and payouts is not wired yet (needs 7.10).
**Practice orders (28 October 2026, code plan 7.6).** `practiceCheckout.js` (action `practiceCheckout`, `step: "status" |
"start" | "stop"`) lets the owner of a private platform shop (`shopPrivate`: maintenance on or the wall up) start one hour of
practice; the flag is the server-only `systemStatus/practiceCheckout` (`{ uid, until }`). `handleStripeCheckout` asks
`practiceFor(req)`: only the owner's own verified sign-in, while the flag runs and the shop is still private, gets settings
with checkout open and test mode on for that request, so the payment goes through the service in test mode (Stripe or
Square). The order gets `practiceOrder: true`, holds stock, and settles as a sandbox payment that takes stock and can be
restocked on refund (`sandboxTakesStock` in settlePayment.js, as on the test shop). A checkout that expected practice
(`body.practice` or an earlier practice attempt) gets 409 `practice_ended` rather than a live charge. Exports also skip
unpaid practice orders. The storefront's hint (`src/app/lib/practiceHint.ts`) only lets the owner's browser past the
store-status page; it decides nothing. Tested in `practiceCheckout.test.js` with a fake service for both providers.
**Gift card plus card on Square shops (28 October 2026, code plan 5.3).** As on a Stripe shop's card form, the gift card
pays first and the card the rest. Square's checkout object says `giftCardsOnHostedPage: true`, so `handleStripeCheckout`
lets gift cards through on the hosted path and sends their share as `gift_card_minor`. The order's `expectedAmountMinor`
is the card's share only (`chargeMinor`: the lines less the gift cards; every line on Stripe's hosted page, which still
refuses gift cards). `services/payments` adds the share to Square's order as one `ORDER`-scope `FIXED_AMOUNT` discount
named "Gift card", and takes the platform fee on the rest (a pay-as-you-sell fee's books are capped by it, as Stripe's
`lmb_books_minor` is). Nothing else changed: the paid event settles only that amount and debits the gift card once;
`refundPlan` stops partial refunds at the card payment; a full refund refunds the card, then restores the gift card
(`applyOrderRefund`). Tested in `squareGiftCards.test.js` (index.js loaded as a Square shop against a fake service).
**The provider's own name (28 October 2026, code plan 5.2).** A Square shop never says "Stripe" to the press or the
shopper. The server names the provider with `providerName(payments.provider)` from `payments/index.js`, kept as `CARD`
in index.js and orderRequests.js. That covers order activity lines, refund, dispute and alert messages, and the admin's
new-order emails (a card order's stored `paymentMethod: "Stripe"` shows as `paymentMethodLabel`). `fulfillmentGuard.js`
reads the provider from shopConfig. The admin and storefront use the same rule, `providerName()` in
`src/lib/shopProfile.ts`, read from the profile's `payments`. On a Stripe shop every word is unchanged.
`src/app/admin/providerWording.test.ts` checks two things:
- **A Square profile.** The order list, alerts, Ready to sell, payment checks and test-sale steps say Square.
- **Every shown word.** It reads each string in the admin screens and in these server files. A remaining "Stripe" must
  sit on a line marked `Stripe shops only`, or be the stored value compared or listed.
**Square pages close with the stock hold (28 October 2026, code plan 5.1).** `paymentPages.js`. When a Square link opens,
checkoutPayment.js saves `openedPage(order, session)` on the order: `paymentPages` (each page's `id`, `closesAt`, later
`closedAt`/`closed`), `paymentPageClosesAt` (the latest) and `paymentPageCloseDue` (the earliest still open; null when
none is open). The page closes when a Stripe session would expire: `square.js` passes the caller's `expires_at` back on the
session. The scheduled `paymentPageSweep` runs every 5 minutes on Square shops only. It queries
`paymentPageCloseDue <= now` and closes each due page through the payments module (`readAttempt`, then `stopAttempt`,
which is the platform's `square.checkout.delete`). It leaves a page alone when it was paid on; the event settles that.
A page that won't close is tried again, then left with a note after a day. Once the order's last page closes unpaid,
its hold is released.
- **Late payments.** Square's paid event now carries `paid_at`, Square's own payment time. Before anything else,
  `markStripeOrderPaid` asks `paidAfterHold(order, session)`: was this paid after `paymentPageClosesAt`, on an unpaid,
  uncancelled order? A slow event for a payment made in time is not late.
- **What happens to a late payment** (`refundLatePayment`): it is never marked paid and never touches stock, discounts or
  gift cards. It is recorded like Stripe's paid-after-cancel: the receipt ids (unless the order already names a payment),
  `paymentMismatch.paidAfterHold`, `latePayments[<payment id>]` and an activity line. Then it is refunded in full
  (`payments.refund`, no amount, key `late-<order>-<payment>`), and the shopper gets the press's "Order refunded" email
  with one paragraph on why (`sendLateRefundEmail`, claimed once per payment).
- **A failed refund** keeps `lateRefundPending: true` and the error. The webhook answers 500, so the event comes again,
  and the sweep retries too.
- **Clearing the problem.** The refund's own `charge.refunded` clears the mismatch, as for a Stripe refund.
- **Tests:** `paymentPages.test.js` (fake platform service and Firestore) and the service's `square.test.js` (5.1 case).
**Card fees and payouts (28 October 2026, code plan 7.10).** Every paid card order keeps `fee`, `net`, `platformFee`,
`payoutId`, `payoutDate` and `moneyParts` (`orderMoney.js`; cents in the order's currency; the bookkeeping of 7.11 to
7.15 reads these names). Providers answer `paymentMoney(orderId, order)` (Stripe: the charge's balance transaction and
each refund's; Square: the payment's and refunds' processing and app fees) and `payoutMoney({ mode, payoutId })`
(Stripe: the payout's balance transactions with `expand: ["data.source"]`, 100 a page; Square: the payout's entries).
`stripeWebhook` reads the payment after it marks an order paid and after `charge.refunded` (best effort), and on
`payout.paid` writes the payout onto every order in it (a failure answers 500, so it comes again). Parts are kept by
`charge` and refund id, so re-reading changes nothing and a payout read first is never lost. A Stripe amount in another
currency is converted back with Stripe's own rate. Own-keys shops get `payout.paid` only if their webhook sends it
(it isn't in `REQUIRED_WEBHOOK_EVENTS`, so no shop is told its webhook is broken).

## Email module (27 October 2026, code plan 1.13)

`functions/email/index.js` (`createEmail`) is the one door for every email the server sends, built like the payments
module: index.js builds it once (`mailer`) and passes in its db, lazy `Resend` and `nodemailer`, the owner and default
sender (shopConfig), `readAdminSecret`, `resendSecretValue` (read at send time: it is a `const` further down) and
`escapeHtml`, so the vm handler tests' fakes still apply. Interface: `send(message)` (Gmail first when an app password is
saved, then Resend with the sandbox retry; logs every attempt; parks a failed `queue` email in `emailOutbox`),
`logEmailAttempt`, `enqueueEmail` and `checkGmail()` (Settings › Email sender › Check connection, used by
`shopEmails.js`, which now receives `mailer` instead of `nodemailer`). The code moved as is. index.js keeps
`sendEmail(message)` as a thin wrapper, because handler tests reassign it, and keeps the retry queue's runner
(`sendQueuedEmail`), the claims (`sendOrderEmailOnce`) and every template. `email/email.test.js` (fake Firestore, Gmail
and Resend) pins the send paths and fails when another functions file opens a mail transport, makes a Resend client,
sends through one or writes `emailLog` itself.

**Platform shared sender (28 October 2026, code plan 2.3b).** When the shop's functions env has `PLATFORM_EMAIL_URL`
(`shopConfig.platformEmailUrl`, written by platform setup step 8), the backup after Gmail is the platform's email service
(`email/platformSender.js`, POST with `X-Shop-Id` and `Authorization: Bearer $PLATFORM_SERVICE_KEY`, read at send time),
never the shop's own Resend key. It makes one request per recipient, with the idempotency key `<key>:<address>`, where the key is the queue id, or for an unqueued email a hash of its recipients, subject, kind, order, words and the hour, so a retry after a partial send never doubles an email (tested).
A `retryable: false` refusal is logged once and never queued; anything else is queued as before. Gmail (the press's own
address) still goes first, and a shop whose Gmail works never reaches the platform (tested). The shared sender sends no
attachments, and the log says so. `senderStatus()` (`sendTestEmail` action `senderStatus`) tells Settings › Email sender
the Gmail address and the backup. The card is "Send from your own Gmail" and hides the Resend fields when the backup is
the platform (`src/app/admin/senderStatus.ts`). With `PLATFORM_EMAIL_URL` unset, everything works as before.

**Team in the platform's account switcher (28 October 2026, code plan 5.11).** With `PLATFORM_ACCOUNTS_URL`
(`shopConfig.platformAccountsUrl`, setup step 8) set, the `syncMemberRole` trigger, after updating the sign-in pass,
POSTs `<url>/team-changed` with `X-Shop-Id` and the service key and an empty body (`teamNotice.js`). The platform then
re-reads this shop's `members` itself (LMB-PLATFORM `accounts/teamSync.js`), so the notice carries no team data. It
never throws; a missed notice is caught up by the platform's own sync. Unset: nothing is sent.

## Data changes (28 October 2026, platform plan 4.2)

`functions/migrations/`: numbered data changes, each run once per shop. `list.js` holds them in order
(`0001-short-name`, no gaps; `listProblems` and the tests refuse a gap or a bad name). `runner.js` `runMigrations`
runs the pending ones in order under a lock, and stops at the first failure; the next run starts there. What ran is
kept in `systemStatus/migrations` (`applied`, `running`, `failed`; admin-readable, no browser writes), and each change
adds a plain-words Activity logs entry (type `settings`, actor "Shop updates"; the error stays in a field, not the
message). `run.js --project <id> [--release <v>] [--dry-run]` runs them with application default credentials; the
platform's release runner calls it before it deploys new server code. A change must be safe to run twice (look before
writing), is only ever appended and never edited after release, and must leave data the previous release's code can
still use, since a failed release is rolled back by putting the old code back. The test runs every listed change twice
on an empty shop and expects the same result. The list is empty today.

## Platform support visits (28 October 2026, code plan 2.8)

"Act as this shop" in the platform's control room logs the visit in this shop's `auditLog` first. It then opens
`/admin/#support=<custom sign-in token>`. The platform's service account makes the token for uid `colophon-support`,
with the claim `support: { by, reason, until }` (`until` in seconds, at most an hour).

- **One check, four copies:** `roles.js` `supportOf`, `isSupport()` in `firestore.rules` and `storage.rules`, and
  `admin/supportSession.ts`. Each requires all of these:
  - the pass came from a custom sign-in;
  - the claim is there;
  - `until` is a number and still in the future.
- **Access:** support is staff (`adminRole`), never owner, so it never sees the Team, billing or secret keys.
  `refreshMyRole` answers `staff` for support without touching the Team list.
- **In the admin:** it signs in, takes the token out of the address, and shows the Platform support banner
  (`SupportBanner.tsx`: who, why, until when, Sign out). It signs out by itself at `until`. The rules refuse it from
  then on even if a tab stays open.
- **Tests:** `scripts/firestore-rules-emulator.mjs` covers support, an expired visit and a Google pass claiming support.


## Swap for another size (plan 10.22)

- `manageReturn` with `action: "exchange"` and `swaps: [{ index, toVariantId, quantity }]` swaps an inspected return for another version of the same product. The rules are in `exchanges.js` (`planExchange`, pure): the order is paid with no refund request, the return is inspected, one swap per line, up to the copies that came back, the new version has the same price and enough stock, never a box set. The resellable copies go back and the new version comes off in one write per product (stock is never written twice from one snapshot).
- It ends the return as `completed` (no new customer words), sets the request to handled, keeps `order.exchanges[]` and adds an activity line. No money moves; a price difference is refused (refund the return instead). A second swap is refused because the return is no longer `inspected`.

## Your data in the shopper's account (2 November 2026, platform plan 14.7)

- `myDataExport` / `myDataErase` on `createStripeCheckoutSession` (`privacyRequests.js` `handleMyData`): the shopper's Firebase ID token
  with a verified email is the proof of whose data it is, so a copy downloads at once (`exportBody`, the same file the admin gets) and a
  deletion request is recorded in `privacyRequests` with `verified: true, source: "account", uid`. Nothing is erased until the owner presses
  *Approve and delete their data* in Settings › General › Privacy requests (`handlePrivacyAdmin`, unchanged). A second request while one is open adds nothing.
- Storefront: `features/site/YourDataCard.tsx` on the account page (region `accountYourData`, words `yourData*` in Text & labels › Customer account › Your data).

## Payment links: orders the owner makes (3 November 2026, platform plan 21.1-21.5)
- Orders › **New order to pay** (`admin/PaymentLinkDialog.tsx`) calls `paymentLink` / `op: "create"` on `createStripeCheckoutSession`
  (`paymentLinks.js`, admin only). It makes an ordinary unpaid order (`source: "payment_link"`, `paymentLink: { expiresAt, note }`, which
  `publicOrderView` shows) and `paymentLinks/{orderId}` (admin-read, Functions-write rules): the frozen line prices (blank = the shop's price
  that day), the shipping amount or `null` for nothing to ship, the expiry and `keyHash` (sha256 of the order's `trackingKey`).
- **Every payment path prices through `priceOrder`, which reads that record** (`paymentLinkFor`) and, when present: refuses an expired or closed
  link and changed lines (`payment_link_closed`), uses the agreed prices, no discount or stockist pricing, the agreed shipping, tax as usual.
  A record whose `keyHash` doesn't match the order's key is ignored (an order made later at a deleted order's id is priced normally). There is
  no new payment code: the link is the order page (`/track?orderId&key`), whose **Pay now** (`features/site/PaymentLinkPay.tsx`) opens the
  normal hosted card page and returns to the order page (not the bag); the order's own Cancel closes the link.
- Link orders carry `paymentMethod: "Stripe"` like every card order (refund wording, test-mode stock), skip the per-shopper hold caps (the
  owner set the quantity), must total at least $0.50, are swept for missed webhooks by `updatedAt` (`paymentSweep.js`), and an erase
  blanks their note. Tests: `r2Payments.test.js` › payment links.
- **From a bulk-price request (21.4):** a Messages row the product page's bulk-quote form sent ("Quantity: N" / "Book: <title>" lines, sent
  from `/books/<slug>`) shows **Make a payment link**; `quoteRequestOf` / `linkFormFromQuote` (`admin/paymentLinks.ts`) start the dialog with
  the customer, that product (by slug, else exact title), its edition (subject brackets) and the copies, capped at 99 per line (the server's
  line limit; stock holds clamp at 99 too). The test builds the request with the form's own `quoteMessage`, so changing the words breaks it.
- **Reminder (21.5):** `unpaidPaymentSweep` passes its unpaid orders to `sendLinkReminders`: one `payment_link_reminder` email (Settings ›
  Notifications, on by default, `enabled: false` stops it) when an open, unpaid, un-cancelled link has 48 hours or less left and is a day
  old. It stamps `paymentLinks/{id}.reminderSentAt` (never the order, so order triggers stay quiet), skips orders the same sweep found paid in
  Stripe, and `sendOrderEmailOnce` stops a second copy. Never when Stripe has a payment the shop hasn't recorded (`reconciliationPending`,
  `paymentAlertSentAt`) or the card page was opened in the last hour (`updatedAt`); a queued copy is dropped by `staleOrderEmailReason`
  once the order is paid, cancelled or its link closed. The total is `chargedTotalFmt`, and every place naming the closing day (history line,
  the owner's email text, the reminder) uses `closingDay` (Toronto day; client copy parity-tested). Tests: `paymentLinkReminders.test.js`.

## Two-step backup codes (3 November 2026, platform plan 22.9)

`twoStepBackup` (`twoStepBackup.js`): `status` / `make` for a signed-in admin, `use` from the sign-in page before there
is a sign-in. Only SHA-256 hashes are kept, in server-only `twoStepBackup/{uid}` (rules deny the browser). `make` needs a
sign-in finished with the app's code (`firebase.sign_in_second_factor`) or a setup and sign-in both under 15 minutes old.
`use` needs Google's own token (checked by Google's tokeninfo: verified address, Google issuer) for the same address as
the Firebase user, spends the code in a transaction, then removes only the TOTP factor (phone factors stay) and writes
the audit log. Rate-limited (`LIMITS.twoStepBackup`). The token's audience isn't checked, so the code is still needed:
never let `use` work on Google's token alone. Each use is emailed to the person and the owner (`backupUsedEmail`,
queue `twoStepBackupUsed`; a failed send never undoes the sign-in). The function declares `RESEND_API_KEY`, so its
`exports.` line sits after that secret is defined. Tests: `twoStepBackup.test.js`.

## Newsletter sending (3 November 2026)

- **Customers › Newsletter** (`admin/NewsletterCard.tsx`) writes a newsletter (subject, plain-text message, optional
  button) and calls action `newsletterAdmin` (`functions/newsletterSend.js`): `audience` counts the list, `test` mails the
  signed-in person only, `send` queues `newsletterIssues/{id}` (one active at a time; the browser never sends), `cancel` /
  `resume`. `newsletterIssues` is admin-read, server-write only (`firestore.rules`).
- **The sweep sends** (`runNewsletterIssues` in `unpaidPaymentSweep`): one issue under a 10-minute lease, pages of 100 by
  document id from `cursor`, at most 250 per run. Recipients are `mayMail` rows not in `marketing-optout`. Each address is
  claimed first (`newsletterIssues/{id}/sent/{optOutId}`, `create()`), so a rerun or an older cursor never mails twice.
  A bad address keeps its claim (counted `failed`); any other failure frees the claim and stops the run (5 failed runs in a
  row → `paused`, owner resumes); the platform's newsletter pause (`services/email/reputation.js`) → `paused` at once.
  Cancelling during a run wins (the final write re-reads the status).
- **Never through Gmail, never the outbox:** `sendEmail({ bulk: true, kind: "newsletter" })`. `bulk` skips the press's
  Gmail (low daily cap, account risk); `kind` puts it on the platform's newsletter stream without `queue`, because the
  emailOutbox retrying it would double-send alongside the run's own retry. Owner words are escaped (text, not HTML);
  `{{shop_name}}` works; every email has the signed unsubscribe link.

## Running low in the 8am email (3 November 2026)

- The 8am `dailyOrderDigest` (`scheduledJobs.js`) also lists products, one row per edition, whose shelf count is at or
  below Inventory's low-stock line (`settings/website.inventory.lowStockThreshold`, default 5), using
  `functions/lowStockAlert.js`. It counts only what Inventory counts: `trackInventory` on, never drafts, archived,
  digital editions (`isDigitalEdition`), box sets or gift cards. It is not a new schedule job (`tick.test.js` counts them).
- **Once per dip:** marks in `systemStatus/lowStockAlerts.items` (`key → "low" | "out"`). A row is reported when it has no
  mark or goes from low to out. Marks keep only today's low rows, so a restocked item loses its mark. Marks are saved
  only after the email went out (or on a day with nothing to send), so a failed send retries tomorrow.
- Its own switch: Notifications › Shop alerts › Running low (`shopAlerts.lowStock`, on unless off). It runs with the
  orders switch off, and sends a `[STOCK] …` email on a day with no orders to chase.

## Ship part of an order now (3 November 2026, platform plan 24.5)

- Orders › order › Shipping & dispatch › **Send part now, the rest later** (`admin/PartShipmentDialog.tsx`) calls
  `fulfillmentAction("ship_part", { picks: { [itemIndex]: qty }, trackingCarrier, trackingNumber, trackingUrl })`. The rules
  live in `admin/partShipments.ts` (`partShipmentProblem`). Like dispatch, it needs a paid, active, carrier-shipped order
  with a reviewed address and no hold, dispute, open request or risky-payment check. Unlike dispatch, it is allowed
  before packing and while a pre-order awaits release. It must leave something unsent: sending everything is dispatch.
- It appends to the public `partShipments` (`{ id: "pN", lines: [{ line, title, quantity }], tracking…, shippedAt }`) and
  never changes `fulfillmentStatus`/`status`. The order becomes shipped only through the normal dispatch of the rest.
  `orderAccess.js` exposes `partShipments`, and the tracking page lists each parcel (region `trackingParts`, words
  Text & labels › Order tracking `trackPartsTitle`/`trackPartsText`/`trackPartTrack`).
- `onOrderUpdated` sends the editable `part_shipped` email once per new part (claim `shippedPart_<id>`, so the outbox
  drops it after a refund or cancel like `shipped`). It sits under its own switch in Notifications › Part Shipped, and
  `{{items_list}}` is one line per item.
- **Take items off before shipping (plan 24.6, part A):** Orders › order › ⋯ › **Take items off this order** opens the
  refund dialog in a take-off mode: pick copies per line (at most `copiesToSend`), the amount fills from
  `linePricing(item).unit` × copies (typing turns that off), restock is on, and the normal partial refund path saves
  `partialRestockedItems`. `fulfillment.copiesToSend(o, index)` = ordered − sent in parts − taken off; `itemsToPack(o)`
  drives the packing checklist, pick list, packing slip and suggested label weight, so the rest's label weighs only what
  is left. `packingKey` adds the count only for a changed line, so orders packed before this keep their key.
  The amount fills from `copiesValueMinor` (payment currency, like returns). Take-off is always a partial refund: no
  ticked line, a blank amount or everything left is refused (`takeOffProblem`), since those mean the full refund that
  cancels the order. `refundPlan` refuses past orders brought over (`source: "import"`): they are refunded in the old shop.
- **Add items to a paid order (plan 24.6, part B):** Orders › order › ⋯ › **Add items to this order** opens the payment-link
  dialog (`PaymentLinkDialog` `addTo`) filled from the order (`linkFormForAddOn`: customer, address, shipping 0, 14 days,
  a note). The request carries `shipsWith`; `paymentLinks.js` checks the first order with `addOnParentProblem` (paid,
  active, not left; the admin's `addItemsProblem` matches it) and stamps `shipsWith` on the new order only, so the
  first order's triggers never fire. Payment, tax and stock run through the normal payment-link path. `AddedItemsCard`
  lists the added orders on the first one (`getOrdersShippingWith`) and points the added order back to it.
- **Guards (3 November 2026):** `priceOrder` refuses to price an added order whose first order is gone, cancelled or
  fully refunded (`addOnParentClosed`, message `LINK_MESSAGES.parentClosed`), so its link takes no payment. A partially
  refunded first order (items taken off) can still take more. Before the rest is dispatched, a refund's restock skips
  copies sent ahead in a part (`returns.unsentItems`, used by `returnRestockItems`), so they never go back on the shelf.
- **Customers add items themselves (plan 24.6):** the tracking page's **Add something to this order** (region
  `trackingAddItems`, `features/site/AddToOrderBox.tsx`, words Text & labels › Order tracking › Parcels & adding to an
  order) posts `action: "addToOrder"` with the order's access headers. `handleCustomerAddOn` (paymentLinks.js) checks the
  key or signed-in email (`canViewOrder`), `addOnParentProblem`, 1 to 10 lines of 1 to 20 copies, no gift cards, and at
  most 3 unpaid added orders, then makes the same linked order as the owner's Add items (`createLinkOrder`): shop prices
  only (browser prices are ignored), shipping 0 or nothing to ship for pickup, 3 days to pay, `addedByCustomer: true`,
  source still `payment_link` so the sweep, reminder and stock holds follow it. The page then opens the new order to pay.
  Owners who don't want it hide the region in Studio.
- **One line everywhere (plan 24.9):** Overview › Running low (`OverviewStock` `lowLine`), the Books list badges
  (`catalogList.stockInfo(book, getBook, line)`) and the book editor read the same `lowStockThreshold(settings)`. Before
  this they used a fixed 5.

## Social posts (4 November 2026, platform plan 27.4)

`socialLink.js` passes the admin's Sales channels / Social posts steps to the platform social service
(`shopConfig.platformSocialUrl`) with the shop's service key. Posts live in `socialPosts` (rules: server only; indexes
on status + sendAt and status + claimedAt). `socialPostSweep` (every 5 minutes, in the tick registry) claims due posts
in a transaction (stale after 15 minutes) and publishes each once per place; product links carry `utm_source`.
Round two (plan 27.11-27.12): `savePost` makes a square JPEG copy through `makeSquare` (`socialPicture.js`, sharp,
`social/<postId>.jpg`; the original stays in `photoUrl`); `runDuePosts` calls `onFailed` for a scheduled post that ends
failed or partly, which emails the owner (`failedPostEmail`, queue `socialPostFailed`) unless `shopAlerts.socialPostFailed` is false.

## Receipts by email (beta, 12 November 2026)

`receiptInbox.js` (action `receiptInbox`, steps `status | start | stop | newAddress | check | file | done | codeSeen`,
admin only) and the 15-minute `receiptInboxSweep` collect the receipts a shop forwards to its own receipts address from
the platform's receipts door (`PLATFORM_RECEIPTS_URL`, LMB-PLATFORM `services/receipts`; unset: `available: false` and
the page says "Opening soon"). Each new email is read once by the shop's AI (`aiWriter.js` task `receiptEmail`, under
the spending gate) and kept in server-only `receiptInbox/{messageId}` until the owner adds it or says it isn't a
receipt; state is `receiptInboxState/main`. No rule opens either to the browser.
- **Nothing here writes an expense.** The admin's Log expense page does, after the owner has checked the figures. Step
  `file` hands the browser the attachment, or the email's words as a PDF (`emailPdf.js`), for the normal receipt upload.
- `done` bins the email on the platform; when that fails the entry stays hidden (`state: "done"`) so it is never
  collected twice, and the next check bins it. Gmail's forwarding-confirmation email becomes `gmailCode` for the setup steps.
- Tests: `receiptInbox.test.js` (fake door and Firestore).

## Bank feed (beta, a paid add-on, 13 November 2026)

`bankFeed.js` (action `bankFeed`, steps `status | linkToken | connect | signedIn | check | decide | disconnect`) and the
3-hourly `bankFeedSweep` bring the shop's bank transactions from the platform's bank door (`PLATFORM_BANK_FEED_URL`,
LMB-PLATFORM `services/bankfeed`, Plaid, read-only; unset: `available: false` and the page says "Opening soon"). The
bank's sign-in and the key that reads it never reach the shop. `status` is open to the bookkeeper
(`requireBooksReader`); every other step is the admin's.
- Kept server-only (no rule opens them): `bankFeedState/main` (`cursors` per bank, `checkedAt`) and `bankFeed/{lineId}`
  (`state: "waiting"` until decided, then `payout | expense | added | skipped` with `ref`). Lines are saved before the
  cursor, so a failed save is read again; a decided line keeps its decision when the bank re-sends it and is let go
  after half a year. A pending line can't be decided; when it settles under a new id the pending one is removed.
- **Nothing here writes an expense or moves money.** The page adds the expense (after the owner looked), then `decide`
  marks the line `added` with that expense's id.
- The add-on itself (on, off, price, the bill) is the platform's: Settings › Plan calls the billing door's `add-on`.
  With the add-on off the platform answers no banks, and `view` shows no lines.
- Tests: `bankFeed.test.js` (fake door and Firestore).

## Licence keys (13 November 2026, gap list 38)

`licenceKeys.js`: a digital product's keys wait in admin-only `licenceKeys/{bookId}` (`available`, `givenCount`; Books ›
edit › Licence keys, `admin/LicenceKeysCard.tsx`, added in a transaction). `assignLicenceKeys` gives a paid, uncancelled,
unheld order its keys in one transaction (`licenceKeysAt`, never twice), skipping gift cards, box sets and free gifts;
sandbox orders get `TEST-KEY-…` stand-ins. A short pool leaves `licenceKeysShort`; `onLicenceKeysAdded` tops those orders
up (oldest first, 100 a run) when keys are added and emails the buyer. `onOrderReviewCleared` assigns held orders. Keys
show in the confirmation email (`licenceKeysEmailSection`) and on the tracking page (region `trackingKeys`, words
`trackKeysTitle`/`trackKeysWaiting`). Tests: `licenceKeys.test.js`, `digitalDownloads.test.js`.

## Bookings (beta, 14 November 2026)

`functions/bookings.js` (plan: LMB-PLATFORM `tasks/todo/2026-11-14-bookings-beta.md`). Off until the platform's control
room writes `platform/features { bookings: true }` (`control-room/bookingsBeta.js`); every action checks it first.
Records: `bookingServices`, `bookingSettings/main`, `bookings`, `bookingDays/{day}` (what is taken that shop day; read
and written in the booking's own transaction, so a time is never sold twice). Times come from the shared rules
(`src/shared/bookingTimes.ts`, generated copy `functions/shared/bookingTimes.js`). Public actions (`PUBLIC_BOOKING_ACTIONS`,
through `validateDiscountCode`, rate limited): `bookingInfo`, `bookingTimes`, `bookingStart`, `bookingView`,
`bookingCancel`, `bookingMove`; the customer's link carries a key whose hash is kept (`manageKeyHash`). Owner actions go
through `createStripeCheckoutSession` `action: "bookingsAdmin"`. A card booking holds its time for `HOLD_MINUTES` on the
shop's own standalone pay page (no shop order, the webhook ignores it); `bookingSweep` (every 5 min) confirms a paid hold
or frees the time. Cancelling a paid booking refunds it. A new action needs a rate limit and the switch check. **Reminders:** the same sweep emails each confirmed customer once about a day ahead (`sweepReminders`, `reminderSentAt`, cleared by a move; skipped for bookings made under 6 hours before). **Slower ways to pay:** a hold whose page is finished but still clearing (`status: "complete"`, `payment_status: "unpaid"`) keeps its time until the booking starts; a card-only page (`payment_method_types`) made every start fail on 14 November, cause unread, so don't add it back without the Stripe log. **Follow-ups (14 November):** `reminderHours` in settings (`REMINDER_HOURS`, 0 = off) sets the reminder; each reminder mints its own key (`reminderKeyHash`, accepted by `loadBooking` beside `manageKeyHash`). The owner's cancel takes `refundMinor` (0 to the price; `refund: true` still means all; a part uses the key `booking-refund-<id>-<minor>`). A clearing hold is stamped `clearing: true` (shown as Payment clearing); if it is freed at the start, `notCleared` emails the customer and the owner. **Calendars:** the owner's private feed is `/calendar/<token>.ics` (token in server-only `bookingFeed/main`, op `calendarFeed`, `renew` makes a new one) and a customer's single booking `/calendar/b/<id>/<key>.ics` (manage or reminder key). Both are answered by `frontDoor.js` (`CALENDAR_PATH`, `BOOKING_CALENDAR_PATH`) through `bookingsFeed` / `customerBookingIcs`, reading only `shops/<id>/…`, with Hosting's `FRONT_DOOR_CALENDAR` rewrite (`scripts/deployConfig.mjs`). Tests: `bookingsCalendar.test.js`. **Second reminder and morning list (16 November):** `secondReminderHours` (`SECOND_REMINDER_HOURS`, 0 = off, always under `reminderHours`; `cleanBookingSettings` drops it otherwise) sends the `soon` email once (`sweepSecondReminders`, `reminder2SentAt`, its own `reminder2KeyHash` in `keyFits`), never for a booking made inside those hours or under 15 minutes away. `dailySummary` emails the owner the day's confirmed and held bookings from 7:00 shop time (`sweepSummary`, `summaryDue`), claimed per day in `bookingSettings/summary` so two sweeps never send twice; an empty day sends nothing. Both query by `start` alone (no new index) and run in `bookingSweep`. **Google Calendar and Meet (16 November):** with `googleCalendar` on, `syncCalendar` puts each confirmed booking into the shop's Colophon calendar through the platform (`googleConnect.js` `googleCalendarSync`, ops `google.bookingEvent` / `google.bookingEventRemove`, 8 s timeout, answers null on any failure so a booking never waits on Google) at every confirm, move and cancel, and stamps `calendarAt` and `meetUrl`. A one-to-one service with `meet` gets a Meet link (classes don't: each person would get their own call). Switching it on fills the coming 200 bookings (`fillCalendar`) and answers `googleCalendar { available, filled }`. The link is in the customer's emails, `publicBooking.meetUrl` and the owner's feed. Tests: "bookings straight into Google Calendar" in `bookings.test.js`; the platform side in `google/google.test.js`.
**The owner's switch (14 November 2026):** admin op `setLive` flips `bookingSettings/main.live` alone (the Bookings
page's top tile; Hours & rules no longer holds it and saves the hours with the current `live`). `setLive` and
`saveSettings` call `tellWebsite`, which merges `bookingsLive` into the public `settings/website` when that record
exists, so the storefront's header, phone menu and footer links follow the switch with no extra request; the admin's
`updateSettings` never writes that key back. It is a hint for links only: every public action still reads the real
switch. Off stops `bookingInfo` / `bookingTimes` / `bookingStart`; customers still open, move and cancel bookings made.
**Questions on the form (14 November 2026):** a service holds `questions` (up to `MAX_QUESTIONS`, each `{ id, label, long,
required }`, cleaned by `cleanQuestions` in the shared rules). `bookingInfo` sends them; `bookingStart` runs
`cleanAnswers` and refuses a missing must-answer one (400, code `answers`); the owner's own `create` never enforces.
A booking keeps `answers` as `{ label, answer }` pairs (the wording at the time), shown in the owner's email and feed.
**Group classes (14 November 2026):** a service with `places` above 1 is a class (`isClass`), with optional weekly
`classTimes` (`{ weekday, time }`; set, the class runs only then, outside the opening hours too, days off still closed).
Each day item carries its service (`s`), so `busyFrom` gives `serviceId` and the shared `placesLeft` lets a class share a
time only with its own bookings at the very same start, up to its places; anything else overlapping is a clash, both
ways. One booking is one place. `bookingTimes` adds `places` and `left` (per time) for a class. The owner's `create`
ignores `classTimes` but never the places; the owner's `move` looks the service up so a person can join another start.
**Waiting list (14 November 2026):** `bookingWaitlist/{id}` (`{ serviceId, serviceName, day, start | null, name, email,
createdAt }`; id = hash of service, time-or-day and email, so asking twice is one entry) is server-only: no rule, no
browser read. Public `bookingWait` takes a class's full start (in `bookingTimes`' `full`) or a booked-up day (in
`fullDays`: free with nothing booked, none now); it answers 409 `open` when there is room and `wait_full` at 30 a day
per service. `tellWaitlist(days)` runs after every freed time (`freeTime`, and `moveTime` for the days left): each
waiting person whose time or day has room gets one email (the `bookingEmail` budget) linking `/book?service=&day=`,
and the entry is deleted. `bookingSweep` forgets past days (`sweepWaitlist`). Admin ops: `waitlist`
(`{ from, to }`) and `removeWaiting`.
**Held places (16 November 2026):** a freed place is no longer a race. `tellWaitlist` walks the day's entries oldest
first (`createdAt`, then id) and gives each one whose time has room a hold (`holdForWaiting`, one transaction): an
`offer_<wid>` item on `bookingDays` (`held: true`, `offer: true`, `until`; `busyFrom` hides it from everyone and drops
it `OFFER_GRACE_MS` after `until` if the sweep fails) plus `offerStart`/`offerUntil`/`offerKeyHash` on the entry, for
the shop's `waitHoldMinutes` (Hours & rules › "Hold a freed place for", `WAIT_HOLD_MINUTES` 15 min to 12 h, default 60;
never past the start; a day waiter is held the first free time). The email links
`/book?service=&day=&offer=<wid>&offerKey=<key>`; `offerFor` checks the key, service and end, `bookingTimes` then leaves
the hold out of busy (and answers `held`) and `bookingStart` passes it to `takeTime`, which ignores and removes the
item and deletes the entry in the same transaction. An entry with `offerUntil` is never offered again: the sweep
(`offerUntil <=` now) drops the item, deletes the entry and calls `tellWaitlist` for its day, so the next person gets
it, and emails the lapsed person once (`tellHoldEnded`, `bookingEmail` budget); `removeWaiting` does the same. Asking `bookingWait` again while holding keeps the hold. Op `waitlist` answers
`heldUntil`.
**Deposits and paying at the visit (15 November 2026):** a service's `payment` is `free`, `full`, `deposit`
(`depositMinor`, or `depositPercent` 1 to 99; an amount wins) or `atShop`; a booking's is `free`, `card`, `deposit` or
`atShop`, with `priceMinor` always the whole price. Money questions go through the shared helpers in `bookingTimes`
(`depositOf`, `cardAsk`, `cardTaken`, `moneyTaken`, `moneyKept`, `balanceDue`); never read `paid` alone. The card page
asks for `depositOf(service)`; `confirmPaid` sets `depositPaid` (and leaves `paid` false) for a deposit; refunds and the
owner's keep amount are capped at `cardTaken`; `paidAtShop` is refused unless the booking is `atShop` or a deposit whose
deposit is paid. The rest of a deposit booking is never charged by card yet.
**Card on file and the missed-booking fee (16 November 2026):** a service with `holdCard` (Stripe shops only,
`canHoldCard()`; never for paid-in-full) keeps the client's card. Free and at-the-visit services open a Stripe `mode:
"setup"` page; deposit services add `setup_future_usage: "off_session"`. `refreshHeld` confirms a setup page on
`status === "complete"`, reads the card with `checkout.savedCard` (the platform payment service lets
`checkout.sessions.retrieve` expand only the two payment-method paths) and `confirmPaid` stores `card {customer,
paymentMethod, brand, last4, mode}`. Admin op `chargeFee` charges up to `lateFeeMinor` once (`feeChargeable` in
`bookingTimes`: no-show after the start, or a shop/owner cancel; never a customer's own cancel inside the rule or a
hold that ran out) through `chargeSaved` (off-session PaymentIntent, idempotency key `booking-fee-<id>-<amount>`), with
a `feeCharging` claim against double taps. A decline returns 402 in plain words; success stores `fee` and emails a
receipt (`tellCustomer` kind `fee`). `moneyTaken` includes `feeTaken`. Deploy the payment service before shops.
**Pay the rest (16 November 2026, `tasks/todo/2026-11-16-booking-pay-rest.md`):** `restPayable` (shared: confirmed and
`balanceDue` ≥ `MIN_CARD_MINOR` 50) lets the customer pay what is left. Public action `bookingPayRest` opens a 60-minute
standalone `mode: "payment"` page (`metadata { booking, rest: "1" }`, key `booking-rest-<id>-<amount>-<n>`), reuses an open
one with 15+ minutes left, and lists it in `restPages` with `restOpen: true`. `refreshRest` (from `bookingView`, `payLink`
and the five-minute `sweepHolds`) keeps the first page paid for its exact amount as `rest { amountMinor, paymentIntent,
session, at }` in a transaction, closes the others and emails kind `restPaid` (owner too). `settleRest` (close, then read
once more) runs before a cancel and before `paidAtShop`, which refuses `paid_by_card` once the rest came in; the sweep
settles a booking whose pages all ran out. `cardTaken` = `bookedCardTaken` + `restTaken`, so caps include it;
`refundBooking` refunds the rest's intent first (`booking-refund-<id>-rest[-<amount>]`), then the booking's own, and stores
`refundIds` when both. Admin op `payLink` returns `/book?booking=<id>&key=<payKey>` (`payKey` kept in the booking, admin-only
readable, so a printed QR code keeps working; `keyFits` accepts it beside the manage and reminder keys, also in
`customerBookingIcs`) and with `send: true` emails kind `payRest`.

**Payments at the desk (16 November 2026, Services plan phase 3):** admin op `walkIn` (service, name, optional email,
`priceMinor` 0.50 to `WALK_IN_MAX_MINOR` 10,000, else the service's price) writes a confirmed `payment: "atShop"` booking
starting now with `walkIn: true`, `source: "desk"`, `gapAfter: 0` and both reminders stamped, and answers its pay link
(`payKey` kept). It takes no `bookingDays` time (the client is already there), sends no email and never holds a card;
the client pays and tips from the usual pay-the-rest page.

**Card readers at the desk (17 November 2026, phase 3 part 2):** Stripe smart readers (server-driven Terminal). The
provider's `checkout.reader` (`payments/stripe.js` `cardReader`; no card payments → "Card readers need card payments
connected") makes one Terminal location per mode from `settings/website.location` (kept in `bookingReaders/main`
`place_<mode>`; no street/city/country → `readerCode: "address"`). Admin ops `readers`/`readerAdd`/`readerRemove`; booking
ops `readerCharge` (closes open pay pages first, refuses `reader_busy`/`nothing_due`, counts `readerTries` before asking
so a retry never reuses a stopped payment), `readerCheck`, `readerCancel` (reads once more: a tap just before still
counts), `readerTest` (test mode only). A paid reader charge is saved as `rest` with `reader: true` (refunds, figures and
receipts unchanged); `payPage` and `paidAtShop` refuse while `readerOpen`. `sweepHolds` stops a charge left on a reader
after `READER_MINUTES` (15). Platform shops reach Terminal through services/payments SHOP_OPS (`terminal.*`, the test
card `testOnly`). Known gap: Interac (Canadian debit) payments refund only in person on the reader.
**Square Terminals and tips on the reader (17 November 2026, Services plan 2, A4).** `payments/square.js` `terminalReader`
answers the same interface through the platform (`square.terminal.*` in services/payments/square.js; scope
`DEVICE_CREDENTIAL_MANAGEMENT`, a connection made before it answers `reconnect`). It `pairsWithCode`: `readerAdd` answers
`pairing { code, pairBy }` for the owner to type on the Terminal; `fixedPlace` (the Square location) skips the address;
ids are `sqdev_<device>`, charges `sqterm_<checkout>`, and `payment()` answers `paymentIntent: sqpay_…` (what refunds use).
Remove only hides (`bookingReaders/square.hidden_<mode>`: Square can't unpair). Test mode lists Square's Sandbox test
device as "Test reader". **Tips:** `readerCharge` passes `tipPercents` when Hours & rules asks for tips and none was
given; Stripe sets them on the place's Terminal configuration once per choice (`readerTips`, `bookingReaders/main.tips_<mode>`,
a failure charges without the tip screen), Square per checkout. A tip comes back on `payment().tipMinor` and is saved as
`tip { reader: true }` beside `rest`. Not tried with a real reader.

**Discount codes (16 November 2026, plan phase 3).** Pure `bookingDiscount.js`: a code works on bookings only with
`forBookings: true` (Discounts › **Works on bookings too**, shown while Bookings is on), not automatic, type percentage or
fixed, `appliesTo` all (`worksOnBookings`); `bookingDiscountMinor` never takes more than the price, applies
`minOrderAmount` / `maxDiscountAmount`, and `tooSmallForCard` refuses a code that leaves 1 to 49 cents for the card page.
The shop's own checks come in as dep `findDiscount` (index.js: `fetchValidDiscount`, `validateDiscountCustomer`,
`assertDiscountNotUsedByCustomer`); its plain Errors are the customer's words, an error with a `code` is a database failure
and is rethrown. `codeFor` also counts the customer's own bookings for one-use-per-customer (`discount.id` + `emailIdentity`).
Public action `bookingCode` tries a code (400 `code`); `bookingStart` takes `code`, stores `priceMinor` after it,
`listPriceMinor` and `discount { id, code, amountMinor }`, and works the deposit out on the lower price. `takeTime` adds one
to `usageCount` in the same transaction (409 `code` at the limit); `freeTime` gives it back once on any cancel, the hold
running out included (`discount.returned`). `bookingInfo.codes` says whether any code works on bookings. Emails show
"Discount (CODE)". Tests: `bookingDiscount.test.js`, bookings.test.js › discount codes on bookings.

**Gift cards on bookings (16 November 2026):** a gift card pays part or all of what is paid when booked (the price or the
deposit, after any code), never a pay-at-the-visit price. Money rules in `src/shared/bookingTimes.ts`: `giftCard
{ amountMinor }` comes off `cardAsk` and `bookedCardTaken`, `giftTaken` counts it once the booking's payment went through,
`moneyKept` takes off a part put back (`giftReturned`), and `giftCardPart` never leaves the card page 1 to 49 cents. Public
action `bookingGiftCard` tries one (`giftFor`: `giftCardProblem` with `shopTestMode`, `availableMinor` so order holds count;
400 `gift` with `GIFT_CARD_MESSAGES`); `bookingStart` takes `giftCard` (the code) and stores `giftCard { id, last4,
amountMinor }`. `takeTime` re-checks and debits the card in the same transaction as the time (409 `gift` when it fell
short), history `redeemed` with `bookingId`. Covered in full with no card to save: confirmed and `paid`/`depositPaid` at
once, no card page; otherwise the page asks for the rest and `confirmPaid` marks it paid with or without card money.
`freeTime(…, { giftBack })` puts the part back once on any cancel (hold running out included; history `refunded` with
`bookingId`, `giftCard.returned`, decided on the booking's own copy inside the transaction) and returns what it wrote; the
admin `cancel` op takes `giftBack: false` to keep it. `bookingInfo.giftCards` says whether the shop has any gift card. `bookingInfo.hours` is the shop's week (7 lists of `{start,end}`, Sunday first) for the website's Hours section.
Tests: bookings.test.js › gift cards on bookings, bookingTimes.test.ts › gift cards on bookings.

**Packs of visits (16 November 2026, `tasks/todo/2026-11-14-bookings-beta.md` › Packs of visits):** a paid service may sell
`packVisits` (2 to `MAX_PACK_VISITS`) visits for `packPriceMinor`, to book within `packDays` (0: no end; `cleanService`
checks them, `offersPack`). Packs live in the server-only `bookingPacks` (no rule opens it): id = `hash("booking-pack:" +
code).slice(0, 40)`, so the 12-character code (`XXXX-XXXX-XXXX`, `newPackCode`) is never stored except as `pendingCode`
until it is emailed. Public `bookingPackBuy` makes a `held` pack and opens a card page (`metadata.pack`, back to
`/book?pack=CODE`); `refreshPack` (page open) or `sweepPacks` (start of `sweepHolds`) activates it only when the session
paid the pack's price, sets `expiresOn` (`packEndsOn`) and runs `tellPack` (customer code + owner `[PACK] New`); an
unpaid hold is deleted. `bookingPackView` answers the pack's page, `bookingPack` tries one (400 `pack`, `packProblem` /
`PACK_MESSAGES`). `bookingStart` with `pack`: no code or gift card with it, nothing to pay (`payment: "pack"`,
`priceMinor` 0, `listPriceMinor`); `takeTime` re-checks the pack and appends the use in the same transaction (409
`pack`), and the booking keeps `pack { id, last4, visit, visits }`. `freeTime(…, { packBack })` puts the visit back once
(`pack.returned`); the admin `cancel` op takes `packBack: false` for a late cancel. A move past `expiresOn` is refused.
Admin ops `packs` (newest first, no held ones) and `packClose { id, refundMinor }` (refund through `payments.refund`, key
`pack-refund-<id>-<amount>`, then `status: "closed"`). Privacy: export by `customer.email` without `pendingCode` or
payment ids; erase deletes held packs and keeps paid ones. Tests: bookings.test.js › packs of visits,
bookingTimes.test.ts › packs of visits, privacyBookings.test.js.

**Tips (16 November 2026, `tasks/todo/2026-11-16-booking-tips.md`):** settings `tips` / `tipPercents` (shared
`cleanTipPercents`). `bookingPayRest` takes `tipMinor` (`tipFits`: whole cents, ≥ 50, ≤ `tipLimitMinor` = the price or
100.00) and the new public `bookingTip` a tip on its own (`tipOpen`: kept, priced, started visit, no tip yet, within 14
days of its end, and nothing left to pay). Both go through `payPage`: one `restPages` list whose entries carry
`amountMinor` (the rest) and `tipMinor`; `refreshRest` stores `rest` and/or `tip` `{ amountMinor, paymentIntent, session,
at }` from the same paid page and sends `restPaid` (naming the tip) or `tipPaid`. `sweepTips` (in `bookingSweep`) emails
kind `tip` once, `TIP_ASK_HOURS` (2) after a visit ends, with its own key (`tipKeyHash` in `keyFits`); it queries only the
`end` range (no extra index) and checks the rest in code. `tipTaken` is never in `cardTaken`/`moneyTaken`, so refunds
leave a tip alone (the rest's refund is capped at `restTaken` even when the same payment carried the tip).

**Pickup times at checkout (17 November 2026, Bookings plan phase 4).** Settings `pickupTimes`, `pickupSlotMinutes`
(`PICKUP_SLOT_MINUTES`), `pickupPerSlot` (1 to `MAX_PICKUP_PER_SLOT`) and `pickupReadyHours` (0 to 72) in
`bookingSettings/main` (Bookings › Hours & rules › Pickup times); they work only with the `platform/features.bookings`
switch on, and need no `live`. Slots come from the opening hours and days off (`pickupSlots` / `pickupTimeProblem` in the
shared `bookingTimes`, `PICKUP_DAYS_AHEAD` days). Public action `pickupTimes` lists the open ones; a slot is full when
`pickupPerSlot` orders hold it: paid, uncancelled, unrefunded orders, and unpaid ones created in the last
`PICKUP_UNPAID_HOURS` (`pickupTaken`, two range filters on `fulfillment.pickupAt`, no new index). `resolveShipping`
calls `bookingDesk.pickupCheck(selection, orderId)` for pickup on every price, skipping the order itself, and throws a
`PickupTimeProblem` (`pickup_time`, `pickup_closed`, `pickup_too_soon`, `pickup_full`, `pickup_too_far`), which
`priceOrder` and `checkoutPayment.js` pass through with its code. The time is saved as `fulfillment.pickupAt` (ISO) and
shown in the order emails (`pickupTimeLine`, shop time zone), the workbench and the tracking page. No rule change: it
rides in `fulfillmentSelection.pickupAt`. Tests: bookings.test.js › pickup times at checkout, r2Payments.test.js.

**Staff and rooms (17 November 2026, Services plan phase 4 part 1, `tasks/todo/2026-11-17-staff-and-rooms.md`):**
`bookingSettings/main` holds `staff` (id, name, active, `serviceIds` (none = all), `ownHours` + `hours`, `daysOff`) and
`rooms`; a service may name a `roomId`. Day items keep `p` (person) and `r` (room) and `busyFrom` reads them back; an
older item with no `p` blocks everyone. `takeTime` and `moveTime` pick the person inside the transaction with the shared
`whoIsFree` (the one asked for, else whoever already runs that class at that start, else the fewest bookings that day,
then list order), so two "anyone" bookings at once go to two people. A booking stores `staffId`, `staffName`, `roomId`,
`roomName`. `bookingInfo` lists the active people; `bookingTimes`, `bookingStart` and the owner's `times`, `create` and
`move` take `staffId` (`keptPerson` checks it; a wrong one is 400 code `staff`). A move keeps the person when they still do
the service and are free; the owner may name another. The owner books with `ownerBookingSettings` (any hour, no days off).
Emails say "With: <name>" and the owner's feed puts the name in the title. No people listed: no `p`/`r`, no staff fields,
times as before. Tests: bookings.test.js › staff and rooms.

**Each person's Google Calendar (Beta, 17 November 2026, B6, `tasks/todo/2026-11-17-team-google-calendars.md`):** admin op
`teamCalendar` (status, link, unlink) asks the platform through `googleCalendarSync` (`personLink`, `peopleStatus`,
`peopleBusy`, `personDisconnect`; only free/busy is read). `sweepTeamCalendars` (in `bookingSweep`, at most every 15
minutes, 60 days ahead; the status step forces one when the last is over a minute old) writes each busy span into
`bookingDays/<day>` as item `gcal~<person>~<start>~<end>` `{ start, end, p, g: true }`, so `busyFrom`, `freeTimes`,
`whoIsFree` and the booking transactions block it for that person only. State `bookingSettings/googleBusy` `{ at, spans }`;
only changed days are written, and a calendar that couldn't be read keeps its old spans. `saveSettings` calls
`personDisconnect` (best effort) for each person taken off the team. The platform only forgets a person's tokens
(never revokes at Google: the account may be linked in another shop) and reads at most 5 calendars at once. Tests:
bookings.test.js.

**Each person's day (17 November 2026, Services plan phase 4 part 2, `tasks/todo/2026-11-17-team-day.md`):** op
`calendarFeed` with `staffId` makes that person's private link (`bookingFeed/p-<id>` with `staffId`, `staffName`; the
owner's stays `main`). `bookingsFeed` reads the `bookingFeed` docs (limit 200), compares every token with `sameHash`, and
for a person's link lists only bookings with their `staffId` (room as the place, the calendar named "… · <name>").
`sweepStaffDays` (in `bookingSweep`) emails each active person with an email their own day from DAILY_SUMMARY_HOUR,
claimed per person per day in `bookingSettings/staffSummary.days`, only on days they have bookings; no switch (an email
on the person is the choice). The owner's list and theirs share `dayBookings` / `sendDayList`. Tests: bookings.test.js ›
staff and rooms, bookingsCalendar.test.js › each person's own calendar link.

**Check-in at the desk (17 November 2026, Bookings plan phase 4).** A confirmed booking gets `checkInCode` (8 letters
from `CHECK_IN_ALPHABET`, shown `XXXX-XXXX`; `withCheckInCode` sets it lazily from `crypto.randomBytes`) the first time
an email (booked, moved, reminders) or the booking page needs it. `publicBooking` shows it only while confirmed and not
yet over, plus `checkedIn`. Admin op `checkIn` takes `{ code }` (cleaned by the shared `cleanCheckInCode`, so spaces,
lower case and a missing dash pass; looked up by `checkInCode`, no new index) or `{ id }`, and `value: false` takes it
off. It sets `checkedInAt`, `noShow: false` and a history line, and answers `arrivalCard` (name, service, time, what is
left to pay). Refusals: `bad_code`, `no_code`, `unknown_code` (404), and 409 with the booking for cancelled, held and
`not_today`; a second scan answers `already`. A walk-in is saved checked in. Tests: bookings.test.js › check-in at the till.

**Sales tax on a service (17 November 2026, Bookings plan phase 4).** A paid service may set `chargeTax` (`cleanService`
keeps it only when the service isn't free). `bookingActions` gets `shopTax` from index.js: `settings/website` with
`taxCollectionOn` not false, the general rates (no `kinds`) and `matchTaxRate` on `location` country/state; no rate or 0
means no tax. Tax goes on top of the price after any discount code (`taxOn` in bookings.js), and the booking's
`priceMinor` is then the price with tax, `taxMinor` the tax in it and `taxLines` `[{ name, cents }]`, so deposits, card
asks, balances and refunds work unchanged. The tax in any part paid or kept is `taxIn(b, amount)` (shared/bookingTimes),
the same share as of the price. bookingInfo shows `taxMinor` per service, bookingCode answers it, walk-ins add it to the
typed amount, and the emails say "Includes tax (HST ON)". A pack of a taxed service (17 November 2026) is charged `packPriceMinor` plus
`taxOn` of it: the pack's `priceMinor` holds the total with `taxMinor`/`taxLines`, so activation, refunds and `packClose`'s cap
work unchanged; op `packs` and the pack email show the tax. Tests: bookings.test.js ›
"sales tax on a service".

**Thank-you email after the visit (17 November 2026, Bookings plan phase 4).** Hours & rules › After the visit saves
`thankYou` and `reviewUrl` (https only, ≤500, `reviewLink` in `shared/bookingTimes`). The five-minute `bookingSweep` calls
`sweepThanks`: visits that ended `TIP_ASK_HOURS` to a day ago and pass `thanksDue` (confirmed, not a no-show, started, no
`thanksSentAt` or `tipAskedAt`, and not getting the tip email by `tipOpen`) are marked `thanksSentAt`, then sent the `thanks`
email (Book again → `/book?service=<id>`, Leave a review when a link is set). The tip email carries the review link too
while `thankYou` is on, so one visit never gets both.

**Rebook reminders (17 November 2026, Services plan phase 7).** A service's `rebookWeeks` (0–52, 0 = off; Bookings ›
Services › edit › **Remind them to come back**) sends one "Time for your next <service>?" email that many weeks after a
visit. `bookingSweep` calls `sweepRebook`: per service, visits that started `rebookWeeks` to `rebookWeeks` + 2 weeks ago
(`REBOOK_WINDOW_DAYS`, so switching it on never mails old clients) and pass `rebookDue` (confirmed, not a no-show, has an
email, no `rebookSentAt`). A client with any later booking that isn't cancelled is skipped (`rebookSkipped: "booked"`), and so
is one in `marketing-optout` (`"unsubscribed"`); both are still marked `rebookSentAt`. It is marketing mail: index.js passes
`optedOut` and `unsubscribeUrl` (the review requests' signed `/track?unsubscribe=1` link) and without them nothing is sent.
Book again opens `/book?service=<id>&with=<staffId>`. At most 50 a sweep.
**Reviews of visits (17 November 2026, Services plan phase 7).** Bookings › Hours & rules › After the visit ›
**Collect reviews for your website** saves `siteReviews`. With it on, `reviewOpen` (shared) lets a confirmed, started visit
that wasn't a no-show be reviewed once from its booking page (`publicBooking.canReview` / `reviewed`). The thank-you and
tip emails' Leave a review then goes to `/book?booking=<id>&key=<reviewKey>#review` (`reviewKeyHash`, in `keyFits`) and the
`reviewUrl` link is not used. Public action `bookingReview` (`cleanVisitReview`: 1–5 whole stars, 3–2,000 characters, the
name shortened to "Ada R.") writes, in one transaction, `reviews/{id}` (`source: "booking"`, `bookId: ""`, `serviceName`,
`staffName`, `status: "pending"`, `verified: true`), admin-only `reviewContacts/{id}` and the booking's `reviewId`; a second
try is 409 `reviewed`. The owner gets a `[REVIEW]` email and approves it in Reviews. `bookingInfo.reviews` lists the newest 12
approved ones (`visitReviews`: one `source ==` query, no index) only while `siteReviews` is on, for the Client reviews section.

**Standing appointments (17 November 2026, Services plan 2 B1, `tasks/todo/2026-11-17-standing-appointments.md`).** A
one-to-one service may set `repeats` (`cleanService`: never a class or course; Bookings › Services › edit › **Clients can book a
standing appointment**). Clients can book a run only when `runsOnline` (shared: repeats, free or paid at the visit, no card on
file): `bookingInfo` lists `repeats: true` then. `cleanRun` allows 2–12 visits, every 1–12 weeks, all within 364 days;
`runStarts` keeps the same shop-clock time across clock changes. Public `bookingRunCheck` and admin op `runCheck` answer each
date `{ start, free }` (`runPlan`; the shop's own check uses owner rules, any hour). `bookingStart` / admin `create` with `run`
take the first visit as usual (record `series: { id: "run_<firstId>", everyWeeks, visits, visit: 1 }`), then `bookRun` takes
each later date as its own booking (same manage key, full price, paid at the visit, no discount, gift card or pack, same person
else anyone free); if any date fails, every visit made and the first are dropped and the answer is 409 `run_taken` with
`taken`. One booked email lists every date (`tellCustomer` `run`). Each visit is a normal booking: its own reminders, moves
alone, rebook reminders skip it while later visits exist. `bookingView` / `bookingCancel` add `runVisits` (`runOf`, only with
the manage key); `bookingCancel` and admin `cancel` with `andLater: true` also cancel later confirmed visits (`cancelLater`;
one with card money, a tip or an open payment is left, admin answer `laterSkipped`). A pack can't pay for a run (400 `pack`).
Tests: bookings.test.js › standing appointments.

**Add-ons and options (17 November 2026, Services plan 2 B2, `tasks/todo/2026-11-17-booking-extras.md`).** A one-to-one
service may hold `extras` (`{ id, name, minutes, priceMinor }`, at most `MAX_EXTRAS` 8, minutes 0 to `MAX_EXTRA_MINUTES`;
`cleanExtras` in the shared rules: none on a class or course, no money on a free service). Every public action that
works out times or money (`bookingTimes`, `bookingRunCheck`, `bookingCode`, `bookingGiftCard`, `bookingStart`) and the
owner's `times`, `runCheck` and `create` take `extras` (ids) and run `withExtras(service, ids)` first: unknown ids are
ignored, the minutes and price are added, past 8 hours it answers 400 code `extras`. Never trust a length or price
from the page. `bookingStart` refuses a pack with priced extras (400 `pack`). The booking keeps `extras` and the total
`minutes`/`priceMinor`, so moves, runs and refunds need nothing more. Emails, the calendar entry and the owner's feed
say "Extras: …" (`extrasWords`). Tests: bookings.test.js › add-ons and options.

**Prices by person (17 November 2026, Services plan 2 B3, `tasks/todo/2026-11-17-prices-by-person.md`).** A team member's
`rates` (`cleanRates`: one per service, minutes 5–480 or null, priceMinor or null) give their own length and price for a
one-to-one service. `forPerson(service, settings, staffId)` applies it only when that person is picked (never a class, a
course or a free service's money); every action calls `withExtras(forPerson(…), extras)`, so add-ons go on top and the
booking stores the result. `bookingInfo` lists each person's `rates`. Tests: bookings.test.js › prices by person.

**Tell me if an earlier time opens (17 November 2026, Services plan 2 B5, `tasks/todo/2026-11-17-earlier-times.md`).**
`bookingEarlier/{bookingId}` (server-only) lists clients who asked (`bookingEarlier` action, booking key; `earlierWanted`
on the booking). `tellWaitlist(days, opened)` now takes the starts that opened and, after the day waiting list, calls
`tellEarlier(opened)`: each opened start goes to the first who asked whose booking is later and who fits it (their booked
length, `keptPerson`), held `EARLIER_HOLD_MINUTES` (30) through `holdOffer` (item `offer_e_<id>`), emailed (and texted)
with `/book?earlier=<id>&ekey=<key>`. `bookingEarlierView`/`bookingEarlierTake` check the hold's key hash; taking calls
`moveTime(..., { alsoFree })`, which ignores and drops the hold in the same transaction. `sweepWaitlist` forgets past
visits and passes lapsed holds on (the time joins `passed`). Cancelling drops the wish. Privacy export/erase include it.

**A form before the first visit (17 November 2026, Services plan 2 B4, `tasks/todo/2026-11-17-first-visit-form.md`).**
Settings `intakeForm` (`cleanIntakeForm`, left out with no words or questions; `formFor` picks it per service). Signed
forms live in server-only `bookingForms/{sha256(email)[0..40]}` with the words signed and `version` (`formVersion`; new
words ask again). `bookingView` adds `form` (unsigned) or `formSigned`; `bookingForm` needs `signedName`, `agree: true`
and the required answers. Confirmation, move and reminder emails carry a "Before your visit" note until signed. Admin op
`clientForm` reads one for the drawer and client card. Privacy export/erase include `bookingForms`.

**Text reminders (17 November 2026, Services plan phase 7, `tasks/todo/2026-11-17-text-reminders.md`).** Settings
`textReminders` (Hours & rules › Text reminders, off by default). With `PLATFORM_TEXTS_URL` set (`shopConfig.platformTextsUrl`,
written by the release runner), index.js gives `bookingActions` a `texts` sender (`textSender.js`: `status()` cached five
minutes per shop, `send()`; never throws). `bookingInfo.texts` is true only when the switch is on and the platform answers
`available`. A client ticks "Text me reminders" with a phone of 7+ digits (`cleanCustomer` keeps `textOk`). After the
reminder and second-reminder emails, `textReminder` sends the short text (service, shop, time, person, the manage link,
"Reply STOP"), key `booking-<id>-<kind>-<hash>` so a rerun never texts twice, and stamps `reminderTextAt` /
`reminder2TextAt`; `optedOut` sets `customer.textOk = false`. Admin op `textStatus` answers the price for the tile. The
platform bills the texts at cost (LMB-PLATFORM `services/texts`). Tests: bookings.test.js › text-message reminders,
textSender.test.js.


## Events and tickets (beta, 17 November 2026)

`functions/events.js` (`eventActions`, plan `tasks/todo/2026-11-17-events-tickets-e1.md`). On only while both switches
are (`waysOn`: `platform/features.ways.events` from the control room and `firstWeek/start.ways.events` from the owner);
every action checks first. Records, all server-only (no rule opens them; `scripts/firestore-rules-emulator.mjs` checks):
`events/{id}`, `eventPlaces/{eventId}` (`sold`, `held`, `paidMinor`; read and written in the order's own transaction, so
the last ticket is never sold twice) and `eventOrders/{id}` (status `held | paid | cancelled`, `keyHashes` for the
customer's link, `tickets` with a code each). Rules shared with the page: `shared/eventTickets`.
- Public actions (`PUBLIC_EVENT_ACTIONS`, through `validateDiscountCode`, `LIMITS.event`): `eventsInfo` (live coming
  events; never the online link), `eventStart`, `eventView` (works after Events is switched off, so tickets bought stay
  readable). A paid order holds its places `HOLD_MINUTES` (10) on a standalone card page (one line for the exact
  amount, metadata `eventOrder`, key `event-order-<id>`; the webhook ignores it). Free tickets confirm at once after
  claiming the `eventEmail` budget.
- `eventDesk.sweep()` runs inside `bookingSweep` (no new scheduled job): it confirms a hold whose page was paid for the
  exact amount and frees one that ran out, whatever the switches say.
- Owner ops (`eventsAdmin`): `list`, `saveEvent` (a ticket kind people bought can't go or shrink below what sold),
  `deleteEvent` (refused once sold or while someone is paying), `orders`, `resendTickets` (a fresh link; the last five
  keep working). Ticket emails are English or French by the buyer's browser; the owner gets `[TICKETS] …`.
- Tax: `chargeTax` on an event adds the shop's rate on top through the same `serviceTax()` as Bookings.
- Privacy: export and erase cover `eventOrders` (`redactedTicketOrderFields`: a card-paid order keeps name and email).
- Not built yet: the website page (E1b), check-in at the door (E2), refunds, moves, extras and codes (E3).
- Tests: `events.test.js`, `src/shared/eventTickets.test.ts`, `privacyBookings.test.js`.

**The website's Events link (17 November 2026):** `tellWebsite()` in `events.js` writes `settings/website.eventsLive`
(Events on and a live event still to come) after `saveEvent` and `deleteEvent` and on admin op `hint` (asked by Ways to
sell when the owner flips Events; answered even while Events is off, so the link goes away). It only writes when the
record exists and the value differs, never throws into the caller, and is a hint for showing a link: every public action
still checks the real switches. `adminApi.updateSettings` strips `eventsLive` like `bookingsLive`. No sweep keeps it:
after the last event ends the link stays until the next save, and the page then says nothing is coming up.

**At the door (E2, 17 November 2026, `tasks/todo/2026-11-17-events-door.md`):** admin op `checkIn` (`{ code, eventId?,
value? }`) finds the paid order by `ticketCodes` (array-contains, one field, no index), and in one transaction stamps
`usedAt`/`usedBy` on that ticket and adds one to `eventPlaces/{eventId}.arrived` (`placesDoc` carries `arrived` through
later sales). A second scan answers `already: true` and changes nothing; `value: false` takes it back. Refusals:
`bad_code` (400), `unknown_code` (404), `wrong_event` and `cancelled` (409). `publicOrder` shows each ticket's `used`
and never `usedBy`. `tellWebsite` also writes `eventsLiveUntil` (the end of the last coming event), which the pages use
to take the Events link down by themselves (`eventsLive.ts` `eventsLiveNow`): still no scheduled job.

**Refunds (E3a, 17 November 2026, `tasks/todo/2026-11-17-events-refunds.md`):** admin op `refund` (`{ orderId, codes?,
money? }`) gives a paid order's tickets back, all or the ones named; a checked-in ticket is refused (`used`). The amount
is the shared `refundMinorFor` (ticket prices plus their share of tax; the last tickets return everything still kept),
sent through `payments.refund` with a key made from the order and its codes, so a second tap is the same refund. Only
after the money moves does one transaction drop the tickets and `ticketCodes`, free the places (`withReturned`), lower
`paidMinor` and add to `refunds[]` / `refundedMinor`; with no tickets left the order becomes `refunded` (still listed
by `orders`, last). A refused refund changes nothing (`refund_failed`); `money: false` cancels without sending money.
The buyer gets one email (`tellRefund`) and their page shows the refund.

**Calling an event off (E3b, `tasks/todo/2026-11-17-events-cancel.md`):** admin op `cancelEvent` (`{ id, money?, skip? }`)
marks the event cancelled, then gives back up to `CANCEL_BATCH` (10) paid orders per call through the same `giveBack`
the `refund` op uses (`called: true`: checked-in tickets go back too, the arrived count follows, the email says the
event is cancelled). It answers `{ done, amountMinor, failed, left }`; the admin calls again while `left > 0`, passing
failed order ids as `skip`. Safe to repeat: given-back orders are skipped and a failed refund leaves its order paid.

**Moving an order (E3c, `tasks/todo/2026-11-17-events-move.md`):** admin op `moveOrder` (`{ orderId, toEventId, kinds? }`)
puts a paid order's tickets on another event that isn't cancelled or over (a draft is fine). No money moves and no
provider is called. `kinds` maps each old ticket kind to a new one; without it the shared `moveKinds` takes the kind
with the same name, or the only kind (400 `kind` otherwise). One transaction reads the order and both `eventPlaces`,
refuses 409 `full` (naming the kind and what is left) or `changed`, gives the old places back (`withReturned`, with the
order's kept money, order count and arrivals), takes the new ones (`withArrived`) and rewrites the order's event
details, `tickets` (same codes, check-ins cleared), `lines` (`movedLines`: what was paid per ticket is kept, so later
refunds stay right) and `moves[]`. A fresh key is added (old links keep working) and the buyer gets the tickets email
with "Your tickets have moved" wording (`tellTickets` `movedFrom`).

**Discount codes on tickets (E3d, `tasks/todo/2026-11-17-events-codes.md`):** a code works on tickets only when it is a
plain code (`plainCode` in `bookingDiscount.js`: no free shipping, buy-X, automatic or product-bound codes) and the owner
ticked `forTickets` on it (`eventDiscount.js`: `worksOnTickets`, `ticketDiscountMinor`, refusal 400 code `code`).
`eventsInfo` returns `codes: true` when the shop has such a code, so the box only shows where it can work. Public action
`eventCode` (`{ eventId, tickets, code, email }`) prices the picks with the code and writes nothing. `eventStart` takes
`code`: the code comes off before tax (`priceOf`), the order keeps `listMinor` (before the code) and
`discount { id, code, amountMinor }`, and the code's `usageCount` goes up in the same transaction as the places (409 when
used up). One use per customer counts held and paid `eventOrders` with that `discount.id` and the buyer's email. A total
of zero after the code is a free order; a total under the card minimum is refused (`tooSmallForCard`). The use goes back
once (`discount.returned`) when a held order is freed or the whole order is given back, and is counted again if a freed
order turns out paid. Refunds use `refundMinorFor`, which gives back the share really paid. `eventDesk` gets the checkout's
own code checks through dep `findDiscount` (`index.js`), so a code's dates, limits and customer rules have one source.

**Ticket extras (E3e, `tasks/todo/2026-11-17-events-extras.md`):** an event may hold up to `MAX_EXTRAS` `extras`
(`{ id, name, priceMinor ≥ 50, maxPerOrder }`, `cleanExtra`; the key is left off an event with none). They take no place
and have no stock. `publicEvent` lists them (with `taxMinor` when the event adds tax). `askedOf(event, body, left)` is the
one reader of what a buyer asked for in `eventCode` and both reads of `eventStart`: tickets (`orderLines`) plus
`body.extras` (`extraLines`, refusal 409 code `extras`); an order needs a ticket, extras alone are code `tickets`. The
order keeps `extras` (`{ extraId, name, qty, priceMinor }`) and `extrasMinor`; `totalMinor` includes them, tax is worked
out on the whole, and a discount code comes off the tickets only (`ticketsMinor`). Refunds: `refundMinorFor` leaves extras
out of a ticket's share, and the last tickets return everything kept. A moved order keeps its extras as bought. The ticket
email, the card page's description and the owner's email name them.

**The shop's booking fee (E3f, `tasks/todo/2026-11-17-events-fee.md`):** an event may set `feeMinor` (0 to
`MAX_FEE_MINOR`, left off when 0): the shop's own fee, added once for each paid ticket (`bookingFeeMinor`; free tickets
never carry it). It is the shop's money, not a platform fee. `askedOf` adds it to the total, tax is worked out on the
whole, and `priceOf` returns the `feeMinor` really asked for: a code that makes every ticket free takes the fee with it.
The order keeps `feeMinor`; `publicEvent`, `eventCode`, both order views and the ticket email show it. It is part of the
tickets' share in `refundMinorFor`, so it goes back with the tickets it was paid for.

## Classes (beta, 17 November 2026)

Classes (a way to sell, `tasks/todo/2026-11-17-classes-timetable-admin.md`) has no server module of its own: a class is a
Bookings service with more than one place, so places, waiting lists, packs, deposits, reminders and money all stay in
`bookings.js`. `engineOn(shop)` there is the one switch check: true when `platform/features.bookings` is on, or when
Classes is allowed by the platform and switched on by the owner (`waysAllowed` / `waysOn`). `featureOn()` and both
calendar feeds read it. Never add a second places ledger or payment path for classes; add to the booking engine.
`built` stays false in `shared/ways/ways.js` until the website's Timetable page ships (C1b).

**The website's Timetable (C1b, `tasks/todo/2026-11-17-classes-timetable-website.md`):** public action `classTimetable`
(`{ from }`, always seven days) answers `{ on, zone, currency, today, from, lastDay, classes, sessions }`; `on` is false
unless the shop takes bookings (`settings.live`) and `classesOn(shop)` (both Classes switches). Only classes that are
active and have weekly times are listed (`onTimetable`); a full time stays listed with `left: 0` for the waiting list.
It only reads: signing up is still `bookingStart`. `tellWebsite(live)` now also keeps `settings/website.classesLive`
(Classes on, bookings live, a class on the timetable) and runs after `saveService`, `deleteService`, the on/off switch
and admin op `hint`, which Settings › Ways to sell sends when the owner flips Classes and which answers even while the
engine is off. Classes is `built: true` in `shared/ways/ways.js`.

**Courses (17 November 2026, `tasks/todo/2026-11-17-classes-courses.md`):** a class with `courseDates` (shop-clock
"YYYY-MM-DDTHH:MM", 2 to `MAX_COURSE_DATES`; `isCourse`, `courseStarts`) is sold as a whole. `freeTimes` offers it on
its first date only (any hour, past `maxDaysAhead`). `takeTime` checks and takes a place on every date in the one
transaction: ledger items `<id>` (first date) and `<id>~<n>` (later ones, checked with `ownerBookingSettings` so the
course's own dates decide), and the booking keeps `course { starts, days }`. `spansOf(id, b)` lists a booking's ledger
items; `freeTime` and `confirmPaid` go through it, so every date is freed or confirmed together. Money is unchanged: one
booking, one price. Refused: a pack with a course, `bookingMove` and the owner's `move` (code `course`), signing up once
the first date has started (code `started`). `classTimetable` answers `courses` (open ones, with `coursePlacesLeft`), and
`classesLive` counts an open course. Emails list all dates. A stand-in on a later date is `course.staff[n]` (set only
when the people differ). `classTimetable` counts whole courses only (200 days in all, soonest first; no `left` otherwise).
**Every date (17 November):** `sweepReminders` reads when either reminder is on and calls `remindCourseDates`: both
reminders for each later date, once (`course.reminded` / `course.reminded2` list the dates told; marked before sending),
with the email and text speaking of that date. `bookingsFeed` and `customerBookingIcs` list every date (`datesOf`, no
tidy-up time; UIDs `<id>-<n>`). Not yet per date: the linked Google Calendar, thank-you and tip emails, check-in and the
waiting list (they follow the first date).

**Joining a course late (17 November 2026, Ways to sell plan, Classes).** A course service may set `lateJoin`. Every
public booking action reads the service through `publicService`, which runs the shared `joinableCourse`: before the first
date the course as it is; after it, while `lateJoin` is on and `MIN_LATE_DATES` (2) dates are still to come, a shorter
course of the dates left priced at their share of the whole price (a set deposit never above that) with `joining
{ missed, of, fullPriceMinor }`; otherwise the whole course, so `bookingStart` answers `started`. `takeTime` saves that as
`course.joined`. The Timetable (`courseOpen`) and `bookingInfo` list the joined-now course; the owner's `create` uses it too.

**Classes: minimum number to run (17 November 2026, `tasks/todo/2026-11-17-classes-minimum.md`).** A weekly class or a
course may have `minPlaces` (2 to its places) and `decideHours` (1 to 168, default 24). `sweepMinimum` (in `bookingSweep`)
decides each class time once, `runDecisionDue` hours before it starts, and records it in `bookingRuns/<serviceId>~<startMs>`
before acting. Too few confirmed: a `closed` item goes on the time's day (every date of a course), which closes that
class then and nothing else (`placesLeft`, `fullClassTimes`); each confirmed sign-up is cancelled through `shopCancel`
(shared with the admin's cancel: full refund, gift card and pack visit back, calendar, email saying too few signed up,
`cancelledFor: "minimum"`), and the owner gets one email. A time with a sign-up still paying waits for the next sweep.
The run doc keeps `left` (sign-ups still to cancel), `retryAt` and `closed`; the first write is `closed: false` with
`retryAt` set, so a sweep cut short anywhere is picked up by the next one, which closes the time first and then cancels.

**Class passes and first-visit prices (17 November 2026, `tasks/todo/2026-11-17-classes-pass-intro.md`).** A weekly
class's pack can be a class pass (`packAnyClass`, kept only for a group that isn't a course): the pack is saved with
`anyClass: true` and "Any class", and `packProblem`'s fourth argument (`weeklyClass(service)`) lets it book any weekly
class; courses still refuse packs. A priced service may have `introPriceMinor` (0.50 up to below the price): `introFor`
gives it to an email with no held or confirmed booking, at `bookingStart` and `bookingCode` (a code comes off it), and
the booking keeps `intro: true` with `listPriceMinor` the usual price. Not with a pack. The claim is `bookingIntros/<sha256 of email>`
(`claimIntro`; a failed booking gives it back with `releaseIntro`); privacy export lists it and erase deletes it.


**Repeat-booking fixes (17 November 2026, review of #889):** `zonedTime` (shared `bookingTimes.ts`) puts a wall time the
clocks skip in spring after the jump (2:30 is 3:30), so `runStarts`, classes and free times never land an hour early; a
time that happens twice in autumn is the first one. `cancelLater` passes `still: untouched` to `freeTime`, which checks
the booking again inside its transaction and writes nothing (returns null) when it was paid for since it was read; that
visit counts as skipped.

## Donations & tips (beta, 18 November 2026)

`giving.js` (G1a; LMB-PLATFORM `tasks/todo/2026-11-18-giving-g1.md`): gifts from the website's Support page, paid on the
shop's own card page like tickets (`payments.standaloneCheckout`, no shop order, the order webhook ignores it) for the
gift plus the card fee when the giver covers it (`shared/givingRules` `giftCharge`), never sales tax. On only while both
switches are (`ways.giving`). Server-only records: `gifts/{id}` (held, paid, cancelled, refunded), `givingSettings/main`,
`givingBlocked/{day}` and `givingSecret/key`. Public actions `givingInfo`, `giftStart`, `giftView` (validateDiscountCode,
bucket `giving`); owner ops through `givingAdmin` (`hint`, `list`, `saveSettings`, `resendThanks`, `refund`); `sweep()` in
bookingSweep confirms paid pages and closes unpaid ones after 31 minutes. **Card-testing guard:** $5 lowest gift, 5 card
pages an hour per visitor (`giftPage`) and 3 per email (`giftEmail`), a signed form token from `givingInfo` that must be
3 seconds to 6 hours old, and a hidden `website` field that must stay empty. Every refusal is counted in `givingBlocked`
(`tooSmall`, `tooMany`, `bot`). Privacy export and erase cover gifts (`redactedTicketOrderFields`: a card-paid gift keeps
its name as a payment record).
**Tips at checkout (G1c):** `givingSettings.checkoutTip` + `tipPercents` (`cleanTipPercents`: 1 to 4 whole percents, 1 to
50). `tipsTaken()` is both switches plus `checkoutTip`; `tellWebsite` keeps `settings/website.givingTips`. `priceOrder`
reads the order's `tipMinor` through `checkoutTipFor`: refused (`tip_rejected`) when tips aren't taken, out of $1 to
$1,000, or on a payment link; never taxed or discounted, added before gift cards (a gift card may cover it), saved as `tip`
(public order field). The card page has a Tip line; both order emails a Tip row (French "Pourboire"). Bookkeeping's
`tipsCents` keeps it out of sales.
**Fundraisers (G2a, `tasks/todo/2026-11-18-giving-g2.md`):** `fundraisers/{id}` (server only; rules shared in
`shared/fundraiserRules`). One runs at a time (`saveFundraiser` with `start`, 409 `one_at_a_time`); an ended one can't be
edited; `endFundraiser` deletes a draft. `giftStart` takes `fundraiserId`, accepted only for the one running on the shop's
day (`liveFundraiser`), else 409 `fundraiser_ended`, and `wall` (never for an anonymous giver). The total, supporter count
and wall line change only inside `confirmPaid`'s paid transaction, and a refund takes them back off, so a browser can't
move them. `givingInfo` sends `fundraiser` (`publicFundraiser`: no gift ids or emails) and `today`.
**Rewards (G2b):** a fundraiser's `rewards` (`cleanRewards`, at most 8; each keeps the server's `taken`, can't be removed
once taken or set below it; cleaned inside `saveFundraiser`'s transaction against what is stored). `giftStart` takes
`rewardId` (+ `shipTo` when it ships, `cleanShipTo`): checked first, then claimed in one transaction with the gift's
creation (409 `reward_gone` / `reward_min` / `reward_unknown`, 400 `address`). The gift keeps `reward {id,title,ships,when}`,
`shipTo` and `rewardHeld`; `cancelGift` and a refund give the reward back, a closed page that turns out paid takes it
again (past the limit if need be). Op `rewardSent` (`sent: false` undoes). The thank-you emails name it. Privacy erase
blanks `shipTo`, turns `wall` off and takes the giver's line off the fundraiser's wall.
**Updates to supporters (G2c):** `fundraiserUpdates.js`, passed to `givingActions` as `updates`; owner ops `updateCount`,
`updateTest`, `updateSend`, `updateCancel`, `updateResume` (`list` adds `updates` by fundraiser). `fundraiserUpdates/{id}`
(server only) is sent by `runFundraiserUpdates` in `unpaidPaymentSweep` like the newsletter: gifts of that fundraiser by
id (`listFundraiserGifts`, one equality filter, no index), paid only, 150 a run, a 10-minute lease, each address claimed in
`sent/{optOutId}` first (so two gifts by one person get one email), `marketing-optout` skipped, the unsubscribe link in
every email. `bulk` with kind `campaign-fundraiser-update` (the platform's newsletter stream); its pause → `paused` at once.
One active update per fundraiser (checked again inside the queuing transaction). Ended fundraisers can send too.
**Tax receipts (G3a):** `shared/charityReceipts.ts`; the owner's charity is `givingSettings.charity` (refused by field in
`saveSettings`). A gift asks with `receipt`/`receiptAddress` (`receiptAsked`); `confirmPaid` reads `givingReceipts/{year}`
(`test-<year>` for test gifts) in the paid transaction when `receiptEligibleMinor` > 0, writes `receipt` and raises the
counter, so numbers never repeat. A reward means no receipt. Refund → `receipt.status: "cancelled"`; op `reissueReceipt`
cancels into `receiptHistory` (last 10) and issues the next number with `replaces`, then emails it. The number takes the
year it was issued; `year` is the year the gift was received. A privacy erase keeps the receipt (a charity keeps copies)
and clears `receiptAddress`.
**Yearly summary (G3b):** `givingYearly.js` `runYearlySummary`, in `unpaidPaymentSweep`. In January (shop day), with
`charity` set and `yearlySummary` not false, it starts `givingYearly/{lastYear}` once and walks gifts by `receipt.year`
(single-field index, `listYearlyGifts`) under a 10-minute lease; each new address is claimed in
`givingYearly/{year}/sent/{optOutId}` and gets one email of that giver's issued, non-test receipts for the year
(`yearlyGiverGifts`, by `customer.email`) with the total. `bulk: true`, kind `giving-yearly-summary` (orders stream: the
giver needs it). Unsubscribed givers are skipped. A failed send frees the claim and the next sweep carries on; February
stops it. Both records are server-only (rules emulator checks them). Tests: `givingYearly.test.js`.

**Monthly giving (Memberships M3d, Beta, 18 November 2026).** `giftStart` with `monthly: true` (refused for a fundraiser,
409 `monthly_fundraiser`, or without provider subscriptions, `monthly_unavailable`) makes `givingPledges/{id}` (server only,
`manageKey` hashed) and a `mode: "subscription"` page (`metadata.pledge`). `refreshPledge` turns a held pledge active and
records each paid invoice once as a gift (fixed id `monthGiftId`, `pledgeId`, `monthly: true`), then `confirmPaid` (thank-you
email with a manage link). It runs from `onEvent` (index.js calls it for `invoice.*` and `customer.subscription.*`) and the
sweep (every `PLEDGE_CHECK_HOURS`, 40 a run; held pledges close as `cancelled` after the page time). Public `pledgeView` /
`pledgeEnd` (key-checked, `/support?pledge=&key=`) work even with Giving off; admin `endPledge`; `list` adds `pledges` and
`monthlyTotals`. Square has no subscriptions until M4, so the toggle stays hidden there (`givingInfo.monthly`).

## Memberships on Square (M4, 18 November 2026)

Square subscriptions come through the platform's `square.subscriptions.*` ops (`services/payments/square.js`). A
subscription page is a quick-pay payment link on a plan variation; `standaloneCheckout().open` with mode `subscription`
keeps `{subscriptionPage, planVariationId, metadata}` in `fairCardPayments/sqlink_*` and `read` finds the subscription
through the order's customer. Square takes no app fee on them, so the platform refuses pay-as-you-sell shops
(`monthly_plan_only`, Julian's pick); memberships.js and giving.js answer that and `reconnect` (old scopes) as 409
`not_available`. `subscriptions.cardChange` is false on Square: no New card button (`noNewCard`), setup mode refused, and
`endNow` ends at the period end. The Members page shows a note for Square shops (`square: true`).

## Gift memberships (M5a, 18 November 2026)

A plan with `gifts: true` (never with a box; `cleanPlan` drops it) lists `gifts: [{months, priceMinor}]` publicly
(`giftPriceMinor`: monthly price × months, a yearly plan by twelfths). `membershipGift` (signed in) keeps
`membershipGifts/{id}` (server-only) and opens a one-off `mode: "payment"` page with `metadata.gift_membership` (no order
reference, so the order webhook ignores it; Square's adapter keeps it beside the link). `settleGift` (sweep and
`membershipGiftStatus`) makes `memberships/g<id>` once paid: state active, `gift {id, months, from}`, `periodEnd` from
`giftEnd`, one `payments` entry for the books, no subscription. `refresh` sends gift memberships to `giftTick`, which ends
them at `periodEnd` with one email. Member actions answer 409 `gift`; the owner's End now ends a gift at once.

**Members' posts (M5b, 18 November 2026):** `memberPosts` (server only) holds the owner's posts (`MAX_POSTS` 100, `cleanPost`/`postFor` in `membershipRules.ts`: every plan or listed plans). Admin ops `posts`, `savePost` (emails live members of those plans once, up to 500, only when the post is new and Email is ticked), `deletePost`. Public `membershipPosts` answers `{ member, posts }` for a signed-in member with perks. Admin `MemberPosts.tsx`; account `MemberPostsPart` (`?posts=1`).

## Rentals (beta, R1, 18 November 2026)

`functions/rentals.js` (`rentalActions`), mirroring `events.js`. Rules in `shared/rentalRules` (`cleanRentalItem`,
`rentalPrice` cheapest of hourly/day cap or daily/weekly, `rentalWhen`, `freeUnit`). Records, all server-only:
`rentalItems/{id}`, `rentalCalendar/{itemId}` `{ spans: [{ id, unit, from, until (end + cleaning), held?, holdUntil? }] }`
(read and written inside the rental's own transaction, spent holds and old spans dropped on each write, so one unit is
never rented twice) and `rentals/{id}` (`held` → `paid` → `out` → `returned`, or `cancelled`). Public actions through
`validateDiscountCode`: `rentalsInfo` (no unit counts), `rentalTimes`, `rentalStart` (hold 10 min, card page metadata
`rentalOrder`), `rentalView` (id + key). Owner ops through `createStripeCheckoutSession` `rentalsAdmin`: `hint` (keeps
`settings/website.rentalsLive`), `list`, `saveItem` (refuses fewer units than have rentals coming), `deleteItem`,
`pickedUp`, `returned` (frees the unit from now plus cleaning), `cancel` (refunds first, key `rental-refund-<id>`). The
sweep runs inside `bookingSweep`. Rate limit bucket `rental`. Not yet: privacy export/erase of `rentals`, the shop page.

**Rentals R2: deposits, fees and pay links (18 November 2026).** An item's `depositMinor` (≤ `MAX_DEPOSIT_MINOR`) keeps the card at checkout (`cardHold`, Stripe only; Square shops use pay links). Admin ops `chargeFee` (≤ `feeRoom`, `feeCharging` claim, key `rental-fee-<id>-<n>`, 402 on decline) and `payLink` (23-hour card page, key `rental-extra-<id>-<n>`, ≤ 3 open); `refreshExtras` moves paid links into `extrasPaid` once each. Late fee suggestion: `lateFeeFor` in `shared/rentalRules.ts` (grace 15 min / 60 min). Never charged without the owner's tap.
**Rentals R3: units (18 November 2026).** Admin op `unitState` {itemId, unit, state ok|repair|gone, why writtenOff|sold, cancelStuck}: in one transaction it sets the item's `repair`/`gone` (+ `goneWhy`) and moves each not-yet-started span on that unit to another free unit (`freeUnit`, which skips `unitOff`). Spans that can't move answer 409 `stuck` with the rentals and change nothing; with `cancelStuck` they are cancelled through `cancelPaid` (refund first) or freed (holds). A gone unit never comes back. `saveItem` keeps the stored `repair`/`gone`, so an older form can't undo them. The control room's Ways to sell line reads `rentalsUse` (LMB-PLATFORM control-room/waysBeta.js).
**Privacy and rentals (18 November 2026):** export lists `rentals` (by `customer.email`) without keys, card ids or pay pages (card brand and last four kept). Erase is refused (409 `rental_open`) while one is held, paid or out; then a card-paid rental keeps its name and email, any other loses them, and all lose the kept card and links. Tests: `privacyBookings.test.js`.
