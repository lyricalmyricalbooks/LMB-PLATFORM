# Bookings: clients pay the rest by link or QR code (Services phase 2, part 3)

What's left after a deposit (or the whole price of a pay-at-the-visit booking) can be paid by card from the
client's own booking page. The owner hands that page over as a link, an email or a QR code at the desk.

## Plan
- [x] Shared rules: `rest` on a booking, `restTaken`, `restPayable`; `cardTaken` counts the rest (so refunds and
      figures see it), `balanceDue` drops to 0.
- [x] Server: public `bookingPayRest` opens a payment page for `balanceDue` (60 min); `bookingView` and the 5-minute
      sweep confirm a paid page (`refreshRest`, amount must match), close the others and email a receipt.
- [x] Server: refunds split across the deposit payment and the rest payment (rest first).
- [x] Server: admin op `payLink` returns the client's page (a pay key kept on the booking) and can email it;
      paid-at-the-shop and cancel close open rest pages.
- [x] Admin drawer: "left to pay" panel with Copy link, Email it, Show QR code.
- [x] Booking page: Pay the rest button and "Paid in full" line; words in Text & labels (EN + FR).
- [x] Tests (shared, server), screenshots, release note, guide notes.

## Verify
- shared + bookings tests, root `npm test`, shop vitest, typecheck, lint; fixture screenshots of drawer + QR dialog.

## Review
- Built as planned. `cardTaken` now includes the later payment, so every refund cap, the figures and the cancel dialog see
  it without their own changes. Refunds take the later payment back first, then the deposit.
- Double payment guarded three ways: the page view reuses an open page, `paidAtShop` and cancel close the pages and read
  them once more (`settleRest`), and a payment that still lands after "paid at the shop" is kept and named in the history.
- Verified: 5 new server tests (pay after deposit, owner link + email + sweep, paid at shop closes the page, split
  refund, page running out), shared/admin/preview tests, shop vitest 7504 passing, root 2072 passing, typecheck and lint
  clean. Fixture screenshots of the drawer panel (desktop) and the QR dialog (phone), no sideways scroll.
- Not yet proven: a real test-mode payment on Test Studio (needs Julian's Chrome).
