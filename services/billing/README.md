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
- **Change plan** is prorated. The shop's registry row gets the new `plan`, so the next shop maker run adds the app the
  plan brings; an app a plan drops is left in place, with its data.

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

Cancelling sends `subscription-cancelled`; changing plan sends `plan-changed`. Emails link to the platform's account
page (`<PLATFORM_URL>/account/billing?shop=<id>`), never to a Stripe page, since those expire.

Every change is kept in the billing store, copied to the shop's registry row (`billing: { plan, status, access, trialEnd,
currentPeriodEnd, cancelAtPeriodEnd, hasCard }`) and logged in the registry and the shop's audit log.

## Settings

`BILLING_MODE` (`test` by default, or `live`) and `STRIPE_BILLING_WEBHOOK_SECRET`, in this service's environment.

## Not yet

- Hosting (one function in the platform project) and the Stripe endpoint for the platform account's events.
- The real stores (Firestore in the platform project): `billingCustomers`, `billingSubscriptions`, `billingEvents`.
- Stripe's customer portal for past invoices (needs its settings made in Stripe first).
- Leaving the platform while paying as you sell (no subscription to cancel): the 6.8 closing timeline handles it.
- Pausing a shop's pages when its plan pauses or closes: the shop reads `billing.access` from the registry later (2.11).
