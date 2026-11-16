# Bookings: tips (Services phase 2, part 4)

Clients can add a tip when they pay what's left, or on its own from an "Add a tip" email after a paid visit. The
owner turns tips on in Bookings › Hours & rules and picks the choices (a share of the price). Tips at the desk come with
phase 3 (Take a payment).

## Plan
- [x] Shared rules: settings `tips` + `tipPercents` (`cleanTipPercents`), `tipTaken`, `tipChoices`, `tipLimitMinor`,
      `tipFits`, `tipOpen`. A tip is never part of the price, a refund or the shop's takings.
- [x] Server: `bookingPayRest` takes an optional `tipMinor`; new public `bookingTip`; one pay-page list for both
      (`refreshRest` keeps `rest` and/or `tip`); `sweepTips` sends one "Add a tip" email 2 hours after a kept, priced
      visit (own key `tipKeyHash`); receipts `tipPaid`, `restPaid` names the tip.
- [x] Admin: Tips tile in Hours & rules; "Tip" line in the booking drawer.
- [x] Booking page: tip choices (percents with amounts, No tip when paying the rest, Other with a typed amount), Add a tip
      button, "You added a tip" line; words in Text & labels (EN + FR); region `bookingsTip`.
- [x] Tests, release note, guide notes, screenshots.

## Verify
- Server tests: tip with the rest (and kept on refund), shop without tips, email + tip on its own, no email after a
  no-show or cancel. Shared, rules and preview tests. Full suites, typecheck, lint. Fixture screenshots.

## Review
- Built as planned. A tip never counts toward the price, the shop's takings or a refund; a tip paid with the rest shares
  one payment, and a refund of that payment is capped at the rest, so the tip stays with the shop.
- One pay-page list serves the rest and the tip, so a second page can't take either part twice.
- The tip email query reads only an `end` window (no new index); status is checked in code.
- Verified: functions tests (64 in bookings.test.js, tips 4), shared/rules/preview tests, root `npm test`, shop vitest,
  typecheck, lint; fixture screenshots of the Tips tile on desktop and phone with no sideways scroll.
- Not done here: tips at the desk (phase 3) and a real test payment on Test Studio.
