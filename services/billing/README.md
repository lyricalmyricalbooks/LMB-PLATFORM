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
  `cardExpiryReminders` sweep emails `card-expiring` a month before the end of its expiry month, once per card.
- **Tax** (6.12): `BILLING_TAX=on` turns on Stripe Tax. Prices are made "plus tax" (`tax_behavior: exclusive`; an older
  price is marked once), and the subscription gets `automatic_tax` once a card is added, from the card's billing
  address copied onto the customer (the trial needs no card, so it needs no address). Off by default: nothing about
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

Cancelling sends `subscription-cancelled`; changing plan sends `plan-changed` (with what closes and when); the card sweep sends `card-expiring`; the closing sweep sends `shop-closed`, `shop-deletion-warning` and `shop-deleted`. Emails link to the platform's account
page (`<PLATFORM_URL>/account/billing?shop=<id>`), never to a Stripe page, since those expire.

Every change is kept in the billing store, copied to the shop's registry row (`billing: { plan, status, access, trialEnd,
currentPeriodEnd, cancelAtPeriodEnd, hasCard }`) and logged in the registry and the shop's audit log.

## Settings

`BILLING_MODE` (`test` by default, or `live`), `STRIPE_BILLING_WEBHOOK_SECRET` and `BILLING_TAX` (`off` by default, or
`on`), in this service's environment.

The Plan & billing page and its calls (`/api/billing/*`, owner only) live in `accounts/` (code plan 6.4, 6.5).

## Not yet

- Hosting (one function in the platform project) and the Stripe endpoint for the platform account's events.
- The real stores (Firestore in the platform project): `billingCustomers`, `billingSubscriptions`, `billingEvents`.
- Stripe's customer portal for past invoices (needs its settings made in Stripe first).
- Leaving the platform while paying as you sell (no subscription to cancel): the closing sweep closes a shop once its
  access is `closed`, but nothing sets that for a press paying as it sells yet.
- The scheduled function that runs `closeDroppedApps` and `cardExpiryReminders` daily, and a real `closeApp`.
- The scheduled function that runs the closing sweep daily, the real `projects` client, and the shop maker calling
  `publishPlan` once a new shop's database exists.
