# Card on file and the missed-booking fee (Services plan, phase 2 part 2)

Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 (phase 2, "Money that fits services").

## Build
- [x] Shared rules: a service's `holdCard` + `lateFeeMinor` (at least 0.50, at most the price; never with paid in full);
      `feeTaken`, `feeChargeable` (a saved card, no fee yet, and the booking started or the shop cancelled it).
- [x] Payment service: `checkout.sessions.retrieve` may expand the setup or payment intent's card; the shop's Stripe
      `standaloneCheckout` gains `savedCard(id)` and `chargeSaved(card, key)` (an off-session payment).
- [x] Server: a service with a card hold opens a setup page (nothing to pay now) or the deposit page with
      `setup_future_usage`; the confirmed booking keeps `card` { customer, paymentMethod, brand, last4, mode }; admin op
      `chargeFee` charges once (claim in a transaction, key `booking-fee-<id>-<amount>`), plain words for a declined card,
      receipt email; card line on booking emails. Square shops book without a card.
- [x] Admin: Missed bookings in the service dialog (switch + fee), tile line, booking drawer card/fee rows, Charge fee dialog.
- [x] Book a time page: card note on the service, the agreement under the form, "Save a card and book", card and fee lines
      on the booking (EN + FR, Text & labels), Studio sample.

## Check
- [x] `functions/bookings.test.js` (setup page, deposit page saving, fee once, too soon, customer's cancel, declined, Square).
- [x] `payments/payments.test.js` (saved card read, off-session charge), services/payments expand rule.
- [x] `bookingTimes.test.ts`; shop tests, typecheck, lint; root `npm test`.
- [x] Screens from the admin fixture (service dialog, drawer with Charge fee, fee dialog).

## Review
The card rides on the page bookings already use, so holds, the sweep and the customer link are unchanged; a page that only
saves a card confirms on `status: complete` in setup mode. The fee is the only off-session charge and is capped at what the
customer saw before booking. Deploy order: the payment service (expand rule) before shops. Saved cards are general enough
for rental deposits later (`card` on the record, `chargeSaved` on the provider). Not proved here: a real test-mode card on
Test Studio (needs Chrome).
