# Tell me if an earlier time opens (Services plan 2, B5)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (part B5, approved 17 November 2026). Beta.

## Decisions
- One-to-one visits only (not classes or courses); the client ticks it on their booking page.
- Only a time that just opened is offered (a cancel, a move, a hold that ran out), never just any free time.
- First asked, first offered; one opened time goes to one client, whose booking must be later and who fits it
  (same length, same person). The day's waiting list is told first.
- Held 30 minutes (never past the time itself). Email, and a text when the client and the shop have texts on.
- Doing nothing keeps the booking; the time passes on and is never offered to them again.

## Build
- [x] Server: `bookingEarlier/{bookingId}`, `tellEarlier` (called by `tellWaitlist` with the opened starts),
      `holdOffer` shared by both lists, `bookingEarlier` / `bookingEarlierView` / `bookingEarlierTake`,
      `moveTime(..., { alsoFree })`, sweep passes on lapsed holds, cancel drops the wish, privacy export/erase.
- [x] Booking page: tick box (region `bookingsEarlier`), offer page `/book?earlier=…&ekey=…` (region `bookingsEarlierOffer`).
- [x] Words in Text & labels › Bookings page › Earlier times (`bookTimeSooner*`, French twins).
- [x] Admin drawer line "Wants an earlier time".
- [x] Studio preview answers.

## Verify
- [x] bookings.test.js › tell me if an earlier time opens (offer, hold, wrong key, take; lapse passes on; off, cancel, class).
- [x] privacyBookings.test.js covers the new list.
- [x] Studio check with screenshots (tick box, offer page, take).
- [ ] Live on Test Studio with two client emails (needs Julian's Chrome sign-in).

## Review
The link carries only the booking id and a fresh hold key (its hash stored); the server checks the hold and moves the
booking inside one transaction that also drops the hold, so nobody else can take the time meanwhile.
