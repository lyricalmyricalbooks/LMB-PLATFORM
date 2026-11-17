# Events E3f: the shop's own booking fee (Beta)

From the approved ways-to-sell plan (Events, phase E3; decision: no Colophon fee, an optional ticket booking fee that
goes to the shop). The last piece of E3.

## Plan
- [x] Shared rules: `feeMinor` on an event (0 to `MAX_FEE_MINOR`), `bookingFeeMinor` (+ generated copy, tests).
- [x] Server: fee in `askedOf` and `priceOf`, kept on the order, shown on the page, the views and the email.
- [x] Admin: fee field in the event editor, fee on Who's coming; fixture.
- [x] Events page: fee beside each paid ticket's price and as a money row; Studio words (English and French).
- [x] Tests: server (three), shared rules, page rules. Guides, release note, screenshots.

## Verification
- `npx vitest run` in apps/shop, root `npm test`, typecheck, lint, build.
- Screenshots: `/mnt/project-files/ways-to-sell/events-fee-*.png`.

## Review
- The fee is the shop's own money in the shop's own payment account; nothing goes to the platform.
- Shown before paying, on the ticket and in the total, so the price is never a surprise at the card page.
- A code that makes every ticket free takes the fee with it; a part-off code keeps it.
- Refunds need no new rule: the fee sits in the tickets' share of the total.
- No rule, index or scheduled job changed. Not yet tried on a real test shop.
