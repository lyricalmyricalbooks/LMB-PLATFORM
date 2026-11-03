# Billing

Each press's Colophon plan, on the platform's own Stripe account (Stripe Billing, not Connect): code plan 2.4. Plain
Node 22 ES modules, no packages. The Stripe key is read only by `services/payments` (`platformBillingStripe`); tests
use a pretend Stripe (`fakes.js`).

## Plans

| Plan | Opens | Price (default) |
| --- | --- | --- |
| `shop` | the shop | $29 CAD a month |
| `stockroom` | the stockroom | $19 CAD a month |
| `both` | the shop and the stockroom | $39 CAD a month |

Prices, currency and the trial (14 days) are settings (`services/settings.js`: `PLAN_PRICE_SHOP`, `PLAN_PRICE_STOCKROOM`,
`PLAN_PRICE_BOTH`, `PLATFORM_CURRENCY`, `TRIAL_DAYS`). Each price lives in Stripe under a lookup key naming the plan,
currency and amount (`colophon_both_cad_3900_monthly`), made the first time it is needed. A new price in the settings
makes a new Stripe price; presses on the old one stay there until moved on purpose.

## How a plan runs

- **One customer per platform account** (the person who pays), **one subscription per shop**.
- **Trial with no card.** A press's first plan starts with the free trial and no card. If the trial ends with no card,
  Stripe pauses the plan: the shop pauses, nothing is deleted, and adding a card opens it again (billed from that day).
  A later plan on the same account (a second shop, or starting again) has no second trial and waits for a card.
- **Card.** `cardLink` makes a Stripe Checkout page in setup mode; it only sends people back to the platform's own
  pages. When it completes, the card becomes the default for the customer and the plan, a paused plan resumes and a plan
  waiting for its first payment is paid.
- **Cancel** happens at the end of the period already paid for (or the trial), and can be undone until then (`keep`).
- **Change plan** (code plan 6.11). A plan that opens an app the shop doesn't have, for more money, is prorated at once.
  A plan that drops an app keeps it open to the end of the month already paid for (`billing.appsClosing { apps, at,
  downloadUntil }` on the registry row), then the daily `closeDroppedApps` sweep closes it: the registry's `plan` becomes
  the new one, `closedApps.<app> { closedAt, downloadUntil }` is written (download kept 90 days), the optional `closeApp`
  client takes the pages down, and it is logged. The new price starts with the next month (no proration). During the
  trial, or while nothing is paid, the change, dropped app included, happens at once. The registry's `plan` always says
  what is open, so the shop maker adds the app a new plan brings. `changePlan({ preview: true })` changes nothing and
  answers what would change, when, and the prorated amount (Stripe's preview invoice).
- **Invoices** (6.12): `invoices(shopId)`, newest first, with Stripe's own PDF and page links (https only), fetched fresh
  each time because Stripe's links don't last forever.
- **Card on file**: when a card is added, its brand, last four digits and expiry are kept (never the number). The daily
  `cardExpiryReminders` sweep emails `card-expiring` a month before the end of its expiry month, once per card and
  expiry (see "Failed plan payments, recovered" below).
- **Tax** (6.12): `BILLING_TAX=on` turns on Stripe Tax. Prices are made "plus tax" (`tax_behavior: exclusive`; an older
  price is marked once), and the subscription gets `automatic_tax` once a card is added, from the card's billing
  address copied onto the customer (the trial needs no card, so it needs no address). A plan change asks for tax only
  when the customer has an address (a card added while tax was off has none, and Stripe would refuse the change). Off by default: nothing about
  tax is sent to Stripe. The Plan & billing page says "plus tax" while it is on.

What each Stripe status means for the shop (`ACCESS`): trialing, active and past_due (Stripe retrying a declined
payment) keep it **open**; paused, incomplete and unpaid **pause** it; canceled and incomplete_expired **close** it.

## Two ways to pay (6.19)

`paymentWay.js`: **monthly** (the plan's price) or **pay as you sell** (a share of each website sale, taken with the sale
by services/payments, never more in a billing month than the plan's monthly price; no card needed). For the Shop and
Shop-and-stockroom plans; the stockroom alone stays monthly, refused in plain words.

| Switch | When | What happens in Stripe |
| --- | --- | --- |
| to pay as you sell, in the trial | at once; fees start when the trial ends | cancelled at the trial's end |
| to pay as you sell, paying monthly | from the end of the month already paid for | cancelled at the period end |
| to pay as you sell, paused for a card | at once, and the shop opens | the waiting plan ends now |
| to monthly, before pay as you sell started | at once | the cancel is undone |
| to monthly, paying as they sell | from the next billing month | a new plan, free until then, that asks for a card then and pauses without one |

The billing record keeps `paymentWay`, `paymentWayFrom` and the terms; the registry row gets `payAsYouSell: { basisPoints,
capMinor, currency, from, until }` (what services/payments reads), fixed when the press chooses. A shop that pays as it
sells stays open with no subscription (`paymentWayState.js`, used by `save()`), and its subscription ending sends no
ending, trial or card email. `status()` adds `paymentWay` (the way in force now).

Stripe's cancel of a pay-as-you-sell press's subscription is the switch, not the press leaving: `status()`, the
registry's `billing` copy and the shop's own copy say "cancelled" only from the press's own cancel (`planEnding`), and
`keep()` refuses (409) rather than undo Stripe's cancel, which would bill monthly on top of the fees. **Cancelling while
paying as they sell** sets `payAsYouSell.until` to the end of the current billing month (or the day fees start, if they
haven't), on the billing record and the registry; the shop stays open until then and `keep()` takes the date away. The
daily `closeDroppedApps` sweep then closes the shop (`access: "closed"`), and the closing sweep (closing.js) takes over.
`status().cancelEndsAt` is the day a cancel (asked for, or asked for now) closes the shop.

The card and billing details are on the paying account's Stripe customer, shared by every shop it pays for, so only that
account's holder may change them (`paidBy`, checked by both billing doors); a co-owner is refused.

Settings: `liveSettings().payAsYouSell.basisPoints` (200 = 2%; 0 closes the option to new choices) and the founding
offer (`foundingOffer.percentOff`, 25), which takes its share off both the percentage and the cap for a founding press
(`founding: true` on the registry row or billing record). Both are read through services/settings.js `liveSettings`.

For the Plan & billing page's `payment-way` section: `paymentWayView(status, settings)` gives the words and the button
("Switch to pay as you sell" / "Switch to monthly"), and `paymentWayRoutes({ paymentWay, settings, ownerOnly })` the two
calls (`POST /api/billing/payment-way`, `POST /api/billing/payment-way/switch`).

## The shop's own copy of its plan (6.6, 6.7)

`shopPlan.js`. Pass `shopPlan: shopPlanCopies({ shopData, stockroomData, registry })` to `createBilling` (or
`createBillingFromEnv`) and every saved change writes, into the shop's own database:

| Document | Who reads it | What it holds |
| --- | --- | --- |
| `platform/plan` | the shop's admins only | `plan`, `state` (trial, active, payment-problem, paused, closed), `access`, `trialEnd`, `nextPaymentAt`, `hasCard`, `cancelAtPeriodEnd`, `endsAt`, `paymentWay` (the way in force now), `link` (this shop's Plan & billing page), `closing` (`stage`, `closedAt`, `downloadUntil`, `deleteAfter`) |
| `platform/status` | everyone | `access` only: the storefront's break page and the order refusal read it |

A plan with the stockroom gets the same `platform/plan` in the stockroom's database once `stockroomData.ready(shopId)`.
The shops' rules let no browser write either one. Nothing is written before the shop's database exists
(`auditLog.ready`); the shop maker calls `billing.publishPlan(shopId)` once it does (not wired yet).

What each app does with it:

- **Shop admin**: the trial banner ("Free trial: 9 days left. Add a card"), the payment-problem banner and Settings ›
  Plan, all linking to the Plan & billing page. Paused or closed, the admin opens on Plan & billing only (with the
  downloads).
- **Storefront**: paused or closed, a fixed "taking a short break" page the owner can't turn off or reword.
- **Shop server**: `priceOrder`, which every checkout goes through, refuses orders while `platform/status` isn't open.
- **Stockroom**: paused or closed, it opens read-only (its rules refuse every change, and the app says so first).

A card added to a paused plan resumes it in Stripe; the event saves the row, which rewrites both copies at once, so the
shop opens again within a minute.

## Closing a shop (6.8)

`closing.js`: `createClosingSweep({ registry, auditLog, billing, email, projects, hooks, settings, now }).sweep()`, run
daily. Fakes for tests: `closingFakes.js` (`fakeProjects`, `fakeStockroomData`).

1. **Paused** (`access: "paused"`): the sweep marks the day. A card in the next 60 days opens the shop again and clears
   the timeline.
2. **Closed** after 60 days paused, or at once when the plan ended (`access: "closed"`): `billing.endPlan` ends the
   Stripe plan (so no card can bill a closed shop), `shop-closed` is emailed with the last download day, the plan copy is
   rewritten (closed page, admin on Plan & billing with "Download everything", stockroom read-only), then the `onClose`
   hooks run. Download for 90 days.
3. **Warnings**: `shop-deletion-warning` 30 and 7 days before `deleteAfter`, one a run. A warning sent late pushes
   `deleteAfter` back, so the press always gets its full notice.
4. **Deleted** on `deleteAfter`, only with both warnings sent at least 30 and 7 days earlier (`deletionAllowed`, checked
   again right before the call): the `beforeDelete` hooks, then `projects.deleteProject(projectId)` (the injected client;
   the registry row's `projectId`, else its `shopId`), then `shop-deleted`.

The registry row's `closing`: `{ stage: "paused" | "closed" | "deleted", pausedAt, closedAt, downloadUntil, deleteAfter,
warned30At, warned7At, hooks: { onClose, beforeDelete }, deletedAt, problem }`. Every step is recorded there and in the
registry's events (and the shop's audit log while its database exists), and is safe to run twice. A deleted shop is never
touched again.

**Hooks**, for the Google teardown (6.20): `hooks: { onClose: [fn], beforeDelete: [fn] }`, none by default. Each `fn(shop,
{ at })` gets the registry row with its `closing`. They run until all have succeeded (each must be safe to run twice).
A `beforeDelete` that throws or answers `{ refused: true }` stops the deletion; the reason goes in `closing.problem`
and the next run tries again.

## Events and emails

`handleEvent` takes the platform account's own Stripe events (a separate endpoint from the Connect one), checks the
signature (`STRIPE_BILLING_WEBHOOK_SECRET`), ignores the other mode, and handles each event once. A failure answers 500
so Stripe sends it again.

| Event | What happens | Email (from services/email, signed Colophon) |
| --- | --- | --- |
| `customer.subscription.trial_will_end` | state kept | `trial-ending`: asks for a card, or says when the first charge is |
| `customer.subscription.paused` | shop paused | `card-needed` |
| `customer.subscription.deleted` | shop closed | `subscription-ended` |
| `customer.subscription.created/updated/resumed` | state kept | none |
| `invoice.payment_failed` | logged, shop stays open | `payment-failed`, with the amount and the next try |
| `checkout.session.completed` (setup) | card attached, plan resumed or paid | none |
| `payment_method.automatically_updated` | the card's new expiry (or number) kept (19.9) | none |

Cancelling sends `subscription-cancelled`; changing plan sends `plan-changed` (with what closes and when); the card sweep sends `card-expiring`; the closing sweep sends `shop-closed`, `shop-deletion-warning` and `shop-deleted`. Emails link to the platform's account
page (`<PLATFORM_URL>/account/billing?shop=<id>`), never to a Stripe page, since those expire.

Every change is kept in the billing store, copied to the shop's registry row (`billing: { plan, status, access, trialEnd,
currentPeriodEnd, cancelAtPeriodEnd, hasCard, percentOff, appsClosing, appDrops, leaving, troubleSince, language, province }`;
`language` and `province` choose the language of the closing emails, services/email/templatesFr.js) and logged in the registry and the shop's audit log.

### Each event exactly once (`eventClaims.js`, plan 19.4)

Stripe can send the same event twice at the same moment. Before handling one, `handleEvent` **claims** its id in the
events store (`claim(eventId, { at, holdMs })`, create-if-absent: only one caller wins). The winner handles it and
`mark`s it done; a failure `release`s the claim and answers 500, so Stripe's next try is handled. A copy that arrives
while another is being handled answers **409** ("in progress"): Stripe resends anything that isn't 2xx, so it comes
back later and finds the event done (200, duplicate). A claim older than 5 minutes (`CLAIM_HOLD_MS`, a handler that
crashed) is taken over by the next delivery. `seen` still answers "handled?" for older callers, and a store with no
`claim` falls back to it. The real `billingEvents` store makes the claim with Firestore's `create()` (or a
transaction for the take-over). Tests: `eventClaims.test.js`.

The same check on the other event doors: `services/payments` `stripeEvent` / `squareEvent` keep no event list, and
need none: every step they take is already keyed (the account's state is written as it is, its log entry by the event
id, the past-due email by an idempotency key the email service sends once, pay-as-you-sell fees by payment id inside a
transaction), and the shop itself handles each event once. Resend's events (`services/email/webhook.js`) are counted
through `addEvent`, which already adds an event id only if it isn't there. So no claim was added to either.

## Settings

`BILLING_MODE` (`test` by default, or `live`), `STRIPE_BILLING_WEBHOOK_SECRET` and `BILLING_TAX` (`off` by default, or
`on`), in this service's environment.

The Plan & billing page and its calls (`/api/billing/*`, owner only) live in `accounts/` (code plan 6.4, 6.5).

## Why presses leave (19.8)

`leaving.js`: cancelling takes an optional answer, `cancel({ shopId, reason, words })`. `reason` is one of
`LEAVING_REASONS` (`price`, `missing-feature`, `closed-press`, `moving`, `other`); `words` is plain text, trimmed, at most
500 characters (words alone count as `other`). The answer is checked before anything reaches Stripe: a reason off the list
is refused with "Choose one of the reasons on the list, or leave the question blank." (400). It is kept on the billing
row and the registry's copy as `leaving: { reason, words, at }` and in the `cancel-requested` log entry; `keep` marks it
`keptAt`. No answer cancels exactly as before. The Plan & billing page asks the question on its cancel confirmation
(`accounts/`); the control room reads the answers (`control-room/leaving.js`).

## Failed plan payments, recovered (19.9)

- **Card-expiry warning** (`cardExpiry.js`): `cardExpiryReminders()` emails `card-expiring` (to the person who pays, with
  the Plan & billing link) a month before the card runs out, once per card id and expiry (`cardWarned:
  "pm_…@2027-02"`), and logs `card-expiring-sent`. Only for a plan still running (trial, paid month or a payment being
  retried) and not cancelled. When Stripe's card updater gives the same card a new expiry
  (`payment_method.automatically_updated`), the kept card follows, so the next warning is for the new date. Run nightly
  by `control-room/nightly.js`.
- **When the trouble began**: every save keeps `troubleSince` while the plan is past due, unpaid, waiting for a first
  payment or paused (cleared once it's fixed), copied to the registry row. The control room's failed-payments list
  (`control-room/paymentTrouble.js`) counts days from it, and the days left from the closing sweep's own `PAUSED_DAYS`
  and `DOWNLOAD_DAYS` (`closing.js`).
- **Julian's own step, in the Stripe platform account** (not done in code; Dashboard › Settings › Billing):
  1. **Subscriptions and emails › Manage failed payments**: turn on **Smart Retries** (Stripe picks the best times to try
     a failed card again; the recommended 8 tries within 2 weeks), and choose what happens after the last try: **mark
     the subscription as unpaid**, so the shop pauses and the 60 days of the closing sweep start (cancelling straight
     away would skip them).
  2. **Card account updater**: check that Stripe's automatic card updates are on for the platform account (Stripe
     usually turns them on itself for the card networks that offer them; its support can confirm), so renewed cards
     keep working and the expiry warning follows the new date.
  3. Add `payment_method.automatically_updated` to the platform account's events address, next to the subscription,
     invoice and checkout events.

## Not yet

- Hosting (one function in the platform project) and the Stripe endpoint for the platform account's events.
- The real stores (Firestore in the platform project): `billingCustomers`, `billingSubscriptions`, `billingEvents`.
- Stripe's customer portal for past invoices (needs its settings made in Stripe first).
- Leaving the platform while paying as you sell (no subscription to cancel): the closing sweep closes a shop once its
  access is `closed`, but nothing sets that for a press paying as it sells yet.
- The scheduled function that runs `closeDroppedApps` and `cardExpiryReminders` daily, and a real `closeApp`.
- The scheduled function that runs the closing sweep daily, the real `projects` client, and the shop maker calling
  `publishPlan` once a new shop's database exists.

## The billing hub in the shop admin (22.1-22.5)

- **Founding offer** (`founding.js`): the first `foundingOffer.presses` paying presses (first card saved, or pay as you
  sell chosen) each take a place (`foundingSeats.claim`, one transaction) and get the coupon `colophon_founding_<percent>`
  (duration forever) on their subscription. `status()` answers `founding: { percentOff, price }`.
- **Hub calls** (`hub.js`, composed into `createBilling`): `paymentMethods`, `makePrimary`, `removeCard` (never the
  card paying a running plan, here or on another shop of the account), `billingDetails`, `saveBillingDetails` (name,
  email for bills, address, GST/HST `ca_gst_hst` or QST `ca_qst`), `upcomingBill`, `payNow`.
- **Retries** (`stripeRetry.js`): see the file; a POST without an idempotency key is never sent twice.
- **Events**: `invoice.payment_action_required` keeps `paymentProblem: { kind: "confirm", pageUrl }`; `invoice.payment_failed`
  keeps `{ kind: "declined", amount, nextTry }`; `invoice.paid` clears the one it settles and emails `payment-received`.
- **Doors**: `/api/billing/*` (platform account page) and `/api/shop-billing/*` (the shop admin, accounts/shopBillingDoor.js)
  serve the same list, `billingCalls()` in accounts/billingRoutes.js. The card page may come back to the shop's own
  `/admin` at its main address. The shop's `platform/plan` carries `hub`, `shopId` and `founding`.
