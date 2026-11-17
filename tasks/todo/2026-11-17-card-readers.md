# Card readers at the desk (Services plan, phase 3 part 2, 17 November 2026)

Goal: a services shop on Stripe pays at the desk on a card reader that connects over the internet (Stripe's smart
readers, such as the WisePOS E and S700). The owner adds the reader once with the code it shows, then on Take a
payment presses Send to card reader; the client taps, inserts or swipes, and the booking is paid as if paid by link.

Square shops: not in this part (Square Terminal needs its own calls on the platform's Square side). The page says card
readers work with Stripe for now.

## Plan
- [x] Payment service (`services/payments/service.js`): allow the Terminal calls a shop needs on its own account:
      locations list/create, readers list/create/retrieve/delete, process a payment, cancel the action, and in test mode
      only Stripe's "present a test card". Ids checked (`tml_`, `tmr_`). The card-present payment is an ordinary
      `paymentIntents.create`, so the platform fee works as for any payment.
- [x] Shop's Stripe client through the platform (`payments/platform.js`): the same calls under Stripe's own names.
- [x] Stripe provider (`payments/stripe.js` `standaloneCheckout`): a `reader` part (find or make the shop's location
      from Settings › General › Location, list, add, remove, charge, read, cancel, test card). Square answers none.
- [x] Bookings server (`bookings.js`), admin ops: `readers`, `readerAdd`, `readerRemove`, `readerCharge`,
      `readerCheck`, `readerCancel`, `readerTest` (test mode only). A charge closes any open pay pages first, refuses a
      second charge while one is on a reader, and the QR/link page refuses while a reader charge is open. A paid reader
      charge is stored as `rest` (so refunds, figures and receipts are unchanged) with `reader: true`. The five-minute
      sweep checks reader charges the owner walked away from.
- [x] Take a payment page: a Card reader tile (readers with online/offline, Add a reader, Remove), and in the payment
      dialog Send to card reader (pick one when there are several), a waiting state with Cancel, a declined message
      with Try again, and Pay with a test card in test mode.
- [x] Fixture fakes, release note, notes in the area CLAUDE.md files.

## Verify
- Service tests: each new call allowed with the right path and params, bad ids and extra params refused, the test
  card refused in live mode.
- Bookings tests: add/remove a reader, charge → paid as rest with a test card, decline, cancel, double charge refused,
  QR page refused while the reader is busy, sweep settles a charge left open.
- Shop vitest, typecheck, lint, root npm test; fixture screenshots (desktop, phone, dialog states).

## Review
- Built as planned. The payment service allows nine Terminal calls on the shop's own account (the test card in test
  mode only); the Stripe provider gets a `reader` part; Bookings has seven reader ops; Take a payment has a Card readers
  tile and the dialog leads with Send to card reader, a waiting state, Cancel, a test card and Try again.
- Safety: one payment at a time (pay pages closed before a reader charge, the QR page and Paid another way refused while
  a reader is busy, a second charge refused), a retry never reuses a stopped payment, a tap just before Cancel still
  counts, and the five-minute sweep stops a charge left on a reader after 15 minutes.
- Proof: services/payments test (each call, bad ids, extra params, test card refused live), shop functions tests (add,
  remove, Square answer, charge → paid as rest → refund, decline, cancel, offline, sweep), shop vitest, typecheck, lint,
  vite build, root npm test; fixture screenshots of the tile, dialog, waiting, paid, declined (phone) and Add a reader.
- Not done: Square Terminal; on-reader tipping; Interac (Canadian debit) refunds must be made in person on the reader.
