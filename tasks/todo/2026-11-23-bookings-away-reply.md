# Bookings plan 4, step 3.7: Away reply (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Settings: `awayReply` and `awayWords` (600 characters) in `cleanBookingSettings` (shared `bookingTimes.ts`), test data.
- [x] Shared `awayNow(settings, now, zone)`: open, or closed with the next opening within three weeks (hours, days off,
      holiday hours, lunch breaks). Tests run both copies.
- [x] Server: `functions/awayReply.js`; `onContactMessage` sends the away reply in place of "Message received" while
      closed, when the booking engine is on and the switch is on, under the same once-a-day budget. Owner words escaped,
      never the visitor's text. English and French.
- [x] Admin: Hours & rules › Away reply tile (switch, words, "right now" line).
- [x] Help line, release note, admin CLAUDE.md note, screenshots at 1440 and 390.

## Review
Handler tests load index.js with a fixed clock (noon Tuesday, Toronto): closed with owner words, standard words, open,
off, Bookings off, "Message received" off, once a day, and the return time. The confirmation still never echoes the
visitor's subject or message.
