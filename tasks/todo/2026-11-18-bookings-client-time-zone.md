# Bookings plan 4, step 2.9: the client's time zone for online visits

- [x] Shared `cleanZone` (only zones the clock knows) and `zonesDiffer` (two clocks differ now); server copy rebuilt.
- [x] `bookingInfo` marks a video-call service `online`; `bookingStart` keeps `clientZone` only for a video call from a zone whose clock differs.
- [x] Emails add "(8:00 p.m. your time, London)"; `bookingView` sends `clientZone`.
- [x] Booking page: times on the client's own clock for an online visit, with a switch back to the shop's; a time on another day there shows its weekday. The booking page shows "Your time".
- [x] Words in Text & labels (English and French), help line, release note, tests.
- [x] Verify: typecheck, lint, vitest, help test, Studio Book a time checks; screenshots at 1440 and 390.

## Review
Days stay the shop's days (the server answers by shop day), so only the clock face changes. A time that falls on
another day for the client carries its weekday, which avoids building a second day grid. Toronto and New York share a
clock, so nobody there sees a switch.
