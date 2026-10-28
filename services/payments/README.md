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
Stripe's sign-up link. Ids and parameters are checked; anything that would move money elsewhere (`transfer_data`,
`on_behalf_of`, an application fee…) is refused, and the idempotency key is scoped to the shop.

Passed-on events carry no signature. The shop believes nothing in them: it fetches the event again through `/shop`
(`events.retrieve`), which only reaches its own account. So a forged post to a shop's webhook gets nowhere, and no
secret has to be shared with the shop beyond its service key.

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
`account.updated`: charges, payouts, details submitted; `disconnectedAt` when a press disconnects) and its own record of
the accounts it made (`accounts`). Each change is logged in the registry (`recordEvent`) and the shop's audit log, with
stable ids.

## Files

- `service.js`: `createPaymentService(...)`: the three doors.
- `stripeApi.js`: the Stripe REST client (form encoding, `Stripe-Account`, `Idempotency-Key`, errors kept as Stripe's).
- `stripeSignature.js`: Stripe's webhook signature, checked with `node:crypto`.
- `fees.js`: the fee settings and sums. `config.js`: the environment.
- `http.js`: `handlePayments(request, { service })` routes the two web doors. `index.js`: `createPaymentsFromEnv`.
- `fakes.js`: pretend Stripe, account record and shop webhook, for tests.

## Settings

`STRIPE_PLATFORM_LIVE_KEY`, `STRIPE_PLATFORM_TEST_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE`,
`STRIPE_CONNECT_WEBHOOK_SECRET_TEST` (comma-separated while rolling a secret) and the fee settings above, in this
service's environment only. A key in the wrong slot stops the service. A test fails if any code outside this folder
names the platform key.

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
