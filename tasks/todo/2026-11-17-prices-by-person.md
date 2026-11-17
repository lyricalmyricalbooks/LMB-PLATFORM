# Prices and lengths by person (Services plan 2, B3)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (part B3, approved 17 November 2026). Beta.

## Decisions
- A person's own length (5 to 480 minutes) and price per one-to-one service; empty = the service's own.
- It applies only when the client (or the owner) picks that person. "Anyone free" keeps the service's own.
- Never for a class or a course; a free service's rate changes the length only.
- Add-ons go on top of the person's rate. A booking keeps the length and price it was made at (moves too).

## Build
- [x] Shared rules: `PersonRate`, `cleanRates`, `forPerson` (src/shared/bookingTimes.ts, generated copy).
- [x] Server: every action that works out times or money uses `forPerson` with the picked `staffId`; `bookingInfo` lists rates.
- [x] Admin: "Their prices and lengths" on a person; New booking shows the person's own length and price.
- [x] Book a time page: each person's length and price on the With buttons when anyone has their own; the visit follows the person picked; codes and gift cards are tried for that price.
- [x] Studio preview (Ana) and Test Studio (Riya on the cut) sample rates.

## Verify
- [x] bookings.test.js › prices by person (cleaning, info, times and price, free service, owner create).
- [x] bookTimeRules.test.ts › prices by person.
- [x] Studio check "each person's own price and length show on the Book a time page…" with screenshot.
- [x] Typecheck, lint.
- [ ] Live booking with Riya on Test Studio (needs Julian's Chrome sign-in).

## Review
The page only sends the person's id; the server works the length and price out again from its own settings.
