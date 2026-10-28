# Payments service

The only place the Stripe platform key lives (code plan 2.1, `docs/payments.md`). It makes every Stripe call for every
shop on that press's own connected Stripe account (Stripe Connect, Standard accounts, direct charges), and it is the one
Stripe events address for all of them. Plain Node 22 ES modules, no packages: Stripe is called over its REST API with
an injected `fetch`, and tests use a pretend Stripe (`fakes.js`).

## Doors

| Door | Who knocks | What it checks |
| --- | --- | --- |
| `POST /shop` | a shop's own server code, for one Stripe call on its account | `X-Shop-Id` plus `Authorization: Bearer <shop service key>`, the same proof as the email service (the registry keeps only the key's SHA-256, `serviceKeyHash`); the registry row's `payments` names the account, and the call is made on that account only |
| `POST /stripe/events` | Stripe, for every connected account | Stripe's signature (live and test secrets); the event's `account` finds the shop in the registry; the event is passed on to that shop's `stripeWebhook` |
| `findAccount` / `createAccount` | the shop maker's step 13 (`setup/payments.js`) | the shop is in the registry with the same owner |

A shop asks for one of a fixed list of calls (`SHOP_OP_NAMES` in `service.js`): card payments and Checkout Sessions
(create, read, cancel/expire), refunds (create, list), disputes (list), an event (read again), the account's state and
Stripe's sign-up link, and for each order's real fee and payout (7.10): a payment's charge and refunds with their
balance transactions (`expand`), and a payout's balance transactions (`balanceTransactions.list`, by `payout`, paged).
Square shops get the same through `square.payouts.retrieve` / `square.payouts.entries` and the processing fees on
`square.payments.retrieve` and refunds; Square's `payout.paid` is passed on (permissions `PAYOUTS_READ`,
`SETTLEMENTS_READ`). Ids and parameters are checked; anything that would move money elsewhere (`transfer_data`,
`on_behalf_of`, an application fee…) is refused, and the idempotency key is scoped to the shop.

Passed-on events carry no signature. The shop believes nothing in them: it fetches the event again through `/shop`
(`events.retrieve`), which only reaches its own account. So a forged post to a shop's webhook gets nowhere, and no
secret has to be shared with the shop beyond its service key.

## Square (2.2b)

A press can take payments through their own Square account instead (`payments.provider: "square"` in the registry).
The service holds the platform's Square applications and each press's tokens; the shop holds neither. Built against
Square's API reference, version `2026-09-16` (`squareApi.js` lists every path).

| Door | Who knocks | What it checks |
| --- | --- | --- |
| `POST /shop`, `account.connectLink` | the shop's admin, for its Connect Square button | the return address is one of the shop's own; the link carries a one-use state that lasts 15 minutes |
| `GET /square/oauth` | Square, sending the press back with `code` and `state` | the state; one Square account per shop and one shop per Square account (otherwise `?square=in_use` or `other_account` for a person to sort out). It takes the token, reads the press's main location, and records `payments: { accountId (merchant id), locationId, currency, country, connectedAt }` |
| `POST /shop`, `square.*` | a Square shop's server code | as for Stripe; the calls are hosted checkout (payment links: create, read, delete), payments (read, cancel), refunds (create, read, list for a payment) and disputes for a payment, answered in a small provider-neutral shape (`square.js`) |
| `POST /square/events/live`, `/square/events/test` | Square, one webhook subscription per environment | Square's signature (the configured notification address plus the raw body); the merchant id finds the shop; `oauth.authorization.revoked` marks the shop disconnected and drops its tokens; anything else goes on to the shop, which looks the object up again |

- **One environment per shop.** A shop in test mode is connected to Square's Sandbox and is refused live calls; a live
  shop is connected to production and has no Sandbox to test with.
- **Tokens** are sealed with AES-256-GCM (`SQUARE_TOKEN_KEY`), bound to the shop and mode, and renewed a week before
  they end (Square's last 30 days). Renewals are logged; tokens never are.
- **The fee** is Square's `app_fee_money` on the payment link, within Square's cap (90% of the payment, 60% under its
  small-payment threshold). A refund gives back the same share of the fee (`app_fee_money` on the refund) unless the
  refund setting is off.
- **Idempotency keys** are hashed with the shop id into 40 characters (Square allows 45 on refunds).

## New accounts (7.8)

`createAccount` makes each press's account with Standard's behaviour written as Stripe's controller settings
(`controller`: losses `stripe`, fees paid by the `account`, requirements collected by `stripe`, the `full` Dashboard),
not the deprecated `type: "standard"` ([Stripe's guide](https://docs.stripe.com/connect/migrate-to-controller-properties)).
It fills in what the platform knows, because on these accounts that can only happen before the press's first visit:
the country from sign-up, the shop's web address (`siteUrl`, else `https://<projectId>.web.app`), merchant category
5942 "Book Stores" and "Books and printed matter". Accounts made earlier keep working untouched: Stripe gave them the
same controller settings.

## Modes

The registry row keeps `payments: { provider, accountId, mode }`, where `mode` is the mode the account was made in. An
account made in test mode (the test shop, a press in test mode) is refused every live call, whatever the shop asks; a
row with no mode counts as test. Live events for a test-only shop are dropped.

## The platform fee

A percentage of each payment, taken as Stripe's application fee. **0% unless set** (owner, 28 October 2026).

| Setting | Where | Default |
| --- | --- | --- |
| `PLATFORM_FEE_BASIS_POINTS` | service environment; hundredths of a percent (250 = 2.5%) | 0 |
| `PLATFORM_FEE_REFUNDED` | service environment; `true` gives the fee back when a press refunds, in proportion on a partial refund (`refund_application_fee`) | `true` |
| `platformFee: { basisPoints?, refunded? }` | the shop's registry row; replaces either default for that shop | none |

The press sees the fee with their payout state (`account.status` returns `platformFee: { percent, refundedWithRefunds }`).

## What it keeps

The service never writes a shop's database. It writes the registry row's `payments` (the account's state from
`account.updated`: charges, payouts, details submitted, `pastDue`; `disconnectedAt` when a press disconnects) and its own record of
the accounts it made (`accounts`). Each change is logged in the registry (`recordEvent`) and the shop's audit log, with
stable ids.

## What Stripe still needs (7.9)

`account.status` adds `needs: [{ words, pastDue }]` (Stripe's `requirements.past_due` and `currently_due` in plain
words, `requirements.js`, past due first, each once), `deadline` (`current_deadline`, ISO) and `pastDue`. When an
`account.updated` turns past due, the row gets `pastDueSince`, and with the `email` client (services/email
`sendPlatform`) the owner gets one `payments-past-due` email linking to their admin's Payments page, never Stripe's own
link; then `pastDueEmailedAt`. Both clear once nothing is past due. A failed send answers 502, so Stripe sends the event
again; the email's idempotency key holds `pastDueSince`, so a retry never sends twice.

## Files

- `service.js`: `createPaymentService(...)`: the three doors.
- `stripeApi.js`: the Stripe REST client (form encoding, `Stripe-Account`, `Idempotency-Key`, errors kept as Stripe's).
- `stripeSignature.js`: Stripe's webhook signature, checked with `node:crypto`.
- `fees.js`: the fee settings and sums. `config.js`: the environment.
- `http.js`: `handlePayments(request, { service })` routes the two web doors. `index.js`: `createPaymentsFromEnv`.
- `fakes.js`: pretend Stripe, account record and shop webhook, for tests.
- `square.js`: the Square part (Connect Square, `square.*` calls, Square events). `squareApi.js`: the Square REST client.
  `squareSignature.js`: Square's webhook signature. `tokenSeal.js`: sealing the presses' tokens. `squareFakes.js`:
  pretend Square, token store and states, for `square.test.js`.

## Settings

`STRIPE_PLATFORM_LIVE_KEY`, `STRIPE_PLATFORM_TEST_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE`,
`STRIPE_CONNECT_WEBHOOK_SECRET_TEST` (comma-separated while rolling a secret) and the fee settings above, in this
service's environment only. A key in the wrong slot stops the service. A test fails if any code outside this folder
names the platform key.

Square: `SQUARE_APPLICATION_ID_LIVE` / `_SECRET_LIVE` (production) and `_TEST` (Sandbox, values starting `sandbox-`),
`SQUARE_WEBHOOK_URL_LIVE` / `_TEST` and `SQUARE_WEBHOOK_SIGNATURE_KEY_LIVE` / `_TEST` (comma-separated while rolling),
and `SQUARE_TOKEN_KEY`. All optional; without an environment's application its Square shops are told Square isn't
ready (503). The token store and the states (`squareTokens`, `squareStates`) are platform-project collections.

## The shop side (2.2)

A shop in platform mode (`SHOP_PAYMENT_MODE="platform"` and `SHOP_PAYMENTS_SERVICE_URL` in its functions env, both
written by setup step 8) holds no Stripe key. `apps/shop/functions/payments/platform.js` sends each Stripe call here
with the shop's key (the Functions secret `PLATFORM_SERVICE_KEY`, made by step 8 through `setup/serviceKey.js`; the
registry keeps only its hash). The shop's webhook takes the forwarded event's id only and fetches the event again
through `events.retrieve`; an event this service can't fetch changes nothing. The card form loads Stripe with the
platform's publishable key and the press's account (`payments` in the shop profile, written by step 13).

## Not yet

- Hosting: the handler runs nowhere yet. It becomes one function in the platform project, with the Connect webhook
  endpoint (`connect: true`) pointed at `/stripe/events`.
- The real registry, audit log and account record (Firestore in the platform project and the shop's `audit-log`).
- Square: the platform's Square applications (Julian: a Square developer account, production and Sandbox apps with the
  redirect address `/square/oauth`, and the two webhook subscriptions), the Firestore token and state stores, and the
  shop side (`functions/payments/square.js` and the admin's Connect Square button).
