# Payments: one central payment service

**Decision (27 October 2026):** one platform payment service, in `services/payments/`, holds the Stripe platform key and
makes every Stripe call for every shop. Shops never hold the platform key.

## Why

Under Stripe Connect every outgoing call (checkout, refunds, checking a payment, reversals) needs the platform key plus
the press's connected account ID. If each shop made those calls itself, the key would sit in every shop project, and
one compromised shop would expose every press's money. A central service keeps the key in one place. Stripe also
sends every connected account's events to one platform address, which only a central service can receive.

## How it works

| Job | Today (in the shop's functions) | With the service |
| --- | --- | --- |
| Start checkout | `createStripeCheckoutSession` calls Stripe with the shop's own key | The shop's function checks the cart and stock, then asks the payment service to create the session on the press's connected account |
| Payment finished | `stripeWebhook` in the shop checks events against the shop's own secret | One Connect webhook in the service checks the event, reads its `account` field, finds the shop in the registry and calls that shop's "order paid" function |
| Refund | `refundOrder` calls Stripe directly | The shop asks the service; the service refunds on the connected account |
| Checks (is it paid, was it reversed) | shop calls Stripe | shop asks the service |
| The platform's own subscription fee | — | Stripe Billing on the platform account, with the press as customer |

Rules:

- The shop stays in charge of its own orders and stock: the service never writes a shop's database directly. It calls
  one signed endpoint on the shop, and the shop decides.
- Calls from a shop to the service carry that shop's service key (`X-Shop-Id` + `Authorization: Bearer …`, the same
  proof as the email service; the registry keeps only its hash). The service only ever acts on the account the
  registry lists for that shop.
- Events passed on to a shop carry no signature; the shop fetches each one again through the service before believing
  it (built in 2.1, `services/payments/README.md`).
- The platform's per-order fee is a percentage taken as Stripe's application fee: 0% unless set, per shop or as a
  platform default, given back in proportion when a press refunds unless that setting is off.
- Anything triggered by a shop's own database (order to stockroom, catalog markers) stays in the shop's functions.
  Database triggers can't fire across projects.
- Email works the same way, in `services/email/`, holding the sender key.
- A press may choose Square instead (2.2b): the same service holds the platform's Square applications and each press's
  sealed tokens, takes Square's events at one address per Square environment, and answers a Square shop's calls on that
  press's own Square account. The fee is Square's application fee, with the same settings.

## What changes in the shop repo

Move the Stripe calls behind one small module (for example `functions/payments/`), so it can call Stripe directly
today and call the platform service later without touching checkout logic. Lyricalmyrical keeps its own key until it
moves onto the platform.

## Risks

- **The service becomes a single point of failure for checkout.** Keep it small, give it its own update ring, and alert
  on errors.
- **Extra cost for the extra hop:** about 100–300 ms added to starting a checkout. Acceptable.
