# Services plan phase 5: client records (17 November 2026)

Julian: "keep going". Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 (phase 5: a client card with visits, money
spent, no-shows, booking answers, the saved card and packs left; private notes for the team; Book again in one tap;
bring a client list over from another booking tool). Builds on the Customers page ("Clients" in a services shop).

## Plan
- [x] Pure rules `clientCard(bookings, packs, nowMs)` in `customerInsights.ts`: visits (confirmed, past, not missed),
      next visit, no-shows, spent on bookings (`moneyKept`, tips left out), the newest saved card, open packs with
      visits left, the newest booking answers, phone, and the last visit's service and person for Book again. Tested.
- [x] Client window › Summary: a client card (tiles: Visits, Spent on bookings, No-shows, Next visit; rows: Phone,
      Saved card, Packs left, Their answers) whenever they have bookings. Packs read through op `packs` once per page
      visit (only when Bookings is on). Colophon bento, tokens only.
- [x] **Book again**: opens the New booking dialog over the client window, prefilled with the last service, the same
      person and the client's name, email and phone (lazy-loaded, so Customers stays light).
- [x] Notes tab in a services shop: "Private notes" for the team (colour formulas, session notes), never shown to the
      client.
- [x] Phone kept with the client: `customerNotes.phone` (≤ 40 chars; rules + rule test + emulator check including a
      two-shop check), written by the import, shown on the card.
- [x] Bring clients over from a booking tool: `readCustomerExport` reads client/mobile/visits/no-shows/last visit
      columns; the note says "12 visits there · 1 no-show · last visit …". Dialog says clients in a services shop.
- [x] Fixture `?sells=hair&page=customers`: a client with visits, a no-show, answers, a saved card and a pack.
- [x] Release note, CLAUDE notes.

## Verification
- [x] customerInsights tests (client card), shopMove tests (booking-tool export, phone), rules test.
- [x] Full shop vitest, typecheck, lint, build; root `npm test`.
- [x] Screenshots: client card desktop + phone, Book again dialog prefilled.

## Review
Done as planned. Book again closes the client window and opens the New booking window filled in, rather than
stacking one window on another. Packs are read through the server's `packs` op once per page visit, because no browser
may read them. Checks: shop vitest 7,643 passed; root tests 2,081 passed; typecheck, lint and build are clean.
Screenshots: client card on desktop and phone (no sideways page scroll), Book again filled in, Private notes.
Not done: the live Test Studio has no sample client history (only the fixture does).
