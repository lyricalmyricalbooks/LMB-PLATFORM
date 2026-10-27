# Cloud Functions, payments, email and server rules

Server side: Stripe/PayPal, webhooks, refunds, stock holds, gift cards, discounts, email, privacy and the anonymous-abuse limits. Never weaken payment, inventory or webhook authority. The repo-wide rules are in the root `CLAUDE.md`.

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

**Email sending:** `sendEmail` sends through Gmail SMTP (nodemailer, account `lyricalmyricalbooks@gmail.com`) first, because the shop has no Resend-verified domain. The Gmail app password is entered in Settings › Notifications › **Gmail sending** (`admin/GmailSendingCard.tsx`) and stored in the admin-only `adminSecrets/gmail` doc (never in public `settings/*`). If it is unset or Gmail fails, sending falls back to Resend (`onboarding@resend.dev` only reaches the account owner).

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
  use the free path (`completeFreeOrder`); manual payments refuse gift cards; hosted Stripe sessions refuse them.
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
