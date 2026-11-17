# Events and tickets, cancel an event and refund everyone (E3b, beta) (17 November 2026)

Second part of phase E3 of the plan (https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK).

- [x] Server: owner op `cancelEvent` marks the event cancelled and gives every paid order back, ten per call, through
      the same code as a single refund; safe to press twice; a failed refund leaves its order as it was and is named.
- [x] Email: "Cancelled: <event>" with the refund amount; the buyer's page says cancelled and that money is coming.
- [x] Admin: Cancel event in the guest list, with a progress count, the total sent and any orders that failed.
- [x] Tests (server), fixture click-through on desktop and phone, screenshots.

## Verify

Root `npm test`; shop tests, type-check, lint, build; the fixture cancel clicked through in Chromium on desktop and phone.

## Review

Built as planned, with the single-refund code reused so there is one money path. No rule changed. Not proven against a
real payment account yet (Events is still off on the test shops). An event with more than 1,000 orders would need more
than one press. Left for the rest of E3: moving an order, extras, a booking fee, discount codes.
