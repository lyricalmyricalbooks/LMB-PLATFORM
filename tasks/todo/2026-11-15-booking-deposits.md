# Booking deposits and paying at the visit (Services plan, phase 2 part 1)

Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 (phase 2, "Money that fits services").

## Build
- [x] Shared rules: a service is paid `full`, by `deposit` (amount or 1 to 99 percent) or `atShop`; helpers `depositOf`,
      `cardAsk`, `cardTaken`, `moneyTaken`, `moneyKept`, `balanceDue` (`src/shared/bookingTimes.ts`, generated copy).
- [x] Server: the card page asks only for the deposit; the booking records `depositMinor`, `depositPaid`; refunds and the
      owner's "keep" cap on what the card took; "paid at the shop" settles the rest (`functions/bookings.js`).
- [x] Emails to client and owner say deposit paid and what is left for the visit.
- [x] Admin: service dialog "When they pay" with three choices; booking drawer, week figures, Figures tab, services Home.
- [x] Book a time page: deposit note, "Pay … deposit and book", deposit lines on the confirmation and cancel (EN + FR).
- [x] Test Studio's sample colour service takes a 25% deposit.

## Check
- [x] `functions/bookings.test.js` (deposit start, paid webhook, refund cap, keep, paid at shop refusals).
- [x] `bookingTimes.test.ts`, `bookingsView.test.ts`; full shop tests, typecheck, lint; root `npm test`.
- [x] Screens on desktop and phone from the admin fixture (service form, service tiles, booking drawer).

## Review
Deposits ride on the booking's existing card path, so a time is still held and confirmed by the same webhook; the only
new money rule is that the card amount is `depositOf(service)` rather than the price. The rest of the price is never
charged by card yet: the owner marks it paid at the visit. Kept general for later: `depositMinor`/`depositPercent` live on
the service, so a rental's deposit or a class place can reuse them. Not in this part: card on file, no-show fees, tips,
paying the rest by link (next parts of phase 2). Not proved here: a real test-mode deposit on Test Studio.
