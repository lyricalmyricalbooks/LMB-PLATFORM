# Bookings plan 4, step 3.3: Confirm requests

Clients tap "Yes, I'll be there" in the reminder email or on their booking page; the calendar shows who has and who hasn't.

## Plan
- [x] Setting `askToConfirm` (shared `bookingTimes.ts`: type, default, `cleanBookingSettings`) and `confirmState` (confirmed / waiting / none).
- [x] Server: reminder email gets the line and the button (`&confirm=1`) when the setting is on; public `bookingConfirm` (confirmed, still ahead, kept once); moves clear `clientConfirmedAt`; `publicBooking` sends `askConfirm` and `clientConfirmed`.
- [x] Booking page: confirm box in the actions, done line, and the email's link confirms by itself once. Words in Text & labels (English and French), Studio sample.
- [x] Admin: Hours & rules tile "Ask clients to confirm" (Beta); calendar tags Confirmed / Not confirmed on week and team day; drawer line.
- [x] Fixture (Cy waiting, Hal confirmed), help line, release note.

## Verify
- [x] `functions/bookings.test.js` › confirm requests (button in the reminder, tap kept once, wrong key / past / cancelled refused, move asks again).
- [x] `bookingTimes.test.ts` › confirm requests.
- [x] Typecheck, lint, admin + shared + site + functions tests, help test.
- [x] Screenshots 1440 and 390: calendar tags, drawer line, setting tile, booking page box.

## Review
Small, contained: one optional setting, one public action behind the usual key check and rate limit, one field on the booking.
No rule change (bookings are written only by the server). Text replies (3.4) can later set the same field.
