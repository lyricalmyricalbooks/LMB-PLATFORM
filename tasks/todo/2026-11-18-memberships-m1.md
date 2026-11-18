# Memberships & subscriptions, part one: plans and repeating payments (M1, Beta)

From the approved plan "Four more ways to sell" (https://claude.ai/artifact/AJtw9ihHaKAg4B7EtBva9N), Memberships M1.
Members pay every month or year on the shop's own Stripe account. Square comes in M4, perks in M2, boxes in M3, gifts
and patrons in M5. Split in four pull requests so each is small enough to check.

## Decisions
- **Our own screens, not Stripe's billing page.** The customer updates their card on a Stripe setup page we open, and
  cancels or resumes from the account's Membership tab. Nothing needs switching on in Stripe's settings, and the look
  matches the shop. (The plan said Julian would switch on the billing page; this removes that step.)
- **Events help, the sweep decides.** Subscription and invoice events are handled when they arrive (they need ticking on
  the platform's Connect events address), and the sweep re-reads any membership whose paid period ended or whose payment
  failed, plus a full nightly check, so a missed event never leaves a member wrong.
- **Records:** `membershipPlans/{id}` and `memberships/{id}`, server-only (`members` is the Team list). The customer is
  known by their verified sign-in email.
- **Cancel** = at the end of the paid period (perks last until then); the owner can also end one at once.
- **Platform fee:** a subscription carries the shop's fee as `application_fee_percent` (0% today). Pay as you sell takes
  no fee on subscriptions yet and logs it.

## M1a: the payment service and the shop's payments module
- [x] services/payments: `checkout.sessions.create` in `mode: "subscription"` (fee as `subscription_data.application_fee_percent`,
      never `payment_intent_data`); new ops `subscriptions.retrieve`, `subscriptions.update` (only `cancel_at_period_end`,
      `default_payment_method`, `metadata`), `subscriptions.cancel`, `invoices.list` (by subscription); ids checked.
- [x] Shop `payments/platform.js` and `payments/stripe.js` `standaloneCheckout(mode).subscriptions`: `read`, `cancelAtEnd`,
      `resume`, `endNow`, `setCard`, `invoices`. Square answers "not yet" (M4).
- [x] Tests on both sides; control room launch list gains the subscription and invoice events.

## M1b: the shop's server
- [x] `src/shared/membershipRules.ts`: a plan (name, description, perks list, monthly or yearly, price, free trial days),
      cleaning, the member's state from Stripe's status, the next payment day.
- [x] `functions/memberships.js`: switch check (platform + owner, like giving), owner ops (plans, members, end one),
      public actions (plans, join with sign-in, my membership, cancel, resume, new card), the sweep and the events.
- [x] Emails: welcome, payment failed with a link to update the card, cancelled, ended.
- [x] Rules emulator: both collections closed to browsers, two-shop check. Tests for every money rule.
- [x] Privacy: memberships in the export (no provider ids); the erase is refused while one runs, then clears name and card.

## M1c: the screens
- [x] Admin › Members: plans (make, edit, hide) and the member list with state, next payment and End now; Beta badge;
      the 0.7% note in plain words.
- [x] Storefront: a Membership page listing the plans with Join, the account's Membership tab (state, next payment,
      card, Cancel/Resume, Update card). Words in Studio Text & labels, regions for each box.
- [x] Screenshots desktop and phone, self-review.

## M1d: bookkeeping, the nightly check, the switch
- [ ] Membership payments in Bookkeeping and the Tax centre apart from sales.
- [ ] Nightly check of every active membership against Stripe.
- [ ] Control room: memberships built, members per shop on the Ways to sell line.

## Review
