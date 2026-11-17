# Add-ons and options on bookings (Services plan 2, B2)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (part B2, approved 17 November 2026). Beta.

## Decisions
- One-to-one services only (not classes or courses): a class's places would need a length per person.
- Each extra adds minutes (0 to 240) and, on a paid service, money. A free service's extras add time only.
- At most 8 extras; the whole visit with them is at most 8 hours.
- A deposit given as an amount stays fixed; a percent follows the new price.
- A pack can't pay for extras that cost money (refused on the server, the pack box hides on the page).
- The booking keeps the extras it was booked with, plus the total minutes and price; moves and standing appointments carry them.

## Build
- [x] Shared rules: `cleanExtras`, `withExtras` (src/shared/bookingTimes.ts, generated copy).
- [x] Server: every public action that works out times or money takes `extras`; owner `times`, `runCheck`, `create`.
- [x] Emails, calendar entry and owner feed say "Extras: …"; the booking page lists them.
- [x] Admin: Add-ons and options on the service, tick boxes on New booking, the drawer line.
- [x] Book a time page: tick boxes on the time step (region `bookingsExtras`), length and price follow, summary row.
- [x] Words in Text & labels › Bookings page › Add-ons (English and French).
- [x] Studio preview and Test Studio sample extras.

## Verify
- [x] bookings.test.js › add-ons and options (cleaning, shorter last times, booked record and email, too long, pack, owner).
- [x] Typecheck, lint, storefront and Studio vitest, root tests.
- [ ] Live booking with an add-on on Test Studio (needs Julian's Chrome sign-in).

## Review
Server is the authority: the page sends only ids, and every action works the length and price out again with
`withExtras`. Times shown already reflect the longer visit, so a client can't pick a start that runs past closing.
