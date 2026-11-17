# Events and tickets, refunds (E3a, beta) (17 November 2026)

First part of phase E3 of the plan (https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK): give a ticket order's money
back from the guest list, all of it or some tickets, and put the places on sale again.

- [x] Shared rule for the amount (ticket prices plus their share of tax; the last tickets return every cent kept).
- [x] Server: owner op `refund`, money first through the shop's own payment account, then one transaction; a second tap
      never refunds twice; a refused refund changes nothing; a checked-in ticket is refused; cancel without money.
- [x] Email to the buyer, and their ticket page shows the refund (words in Text & labels, English and French).
- [x] Admin: Refund on each order, a dialog that names the amount, refunded orders marked at the end of the list.
- [x] Tests (shared rule, server, page helpers), fixture click-through on desktop and phone, screenshots.

## Verify

Root `npm test`; shop tests, type-check, lint, build; the fixture refund clicked through in Chromium on desktop and phone.

## Review

Built as planned. No rule changed: orders stay server-only and refunds go through the owner's `eventsAdmin`. Not proven
against a real payment account yet: that needs Events switched on for a test shop and one test-mode ticket. Left for the
rest of E3: cancel an event and refund everyone at once, moving an order, extras, a booking fee, discount codes.
