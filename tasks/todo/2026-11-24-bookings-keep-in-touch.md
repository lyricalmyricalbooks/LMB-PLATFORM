# Bookings plan 4, step 5.4: Keep in touch emails (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules: `cleanBirthday`, `birthdaysOn` (Feb 29 on Feb 28), `visitHappened`, `MISS_YOU_WEEKS`, new settings.
- [x] Messages: welcome, birthday, we miss you (English and French), editable in Messages.
- [x] Server: `sweepKeepInTouch` in the booking sweep, one claim per client in `clientMail`, unsubscribed skipped, 50 a sweep.
- [x] Booking form: optional birthday month and day (only when birthdays are on), Studio region and words.
- [x] Admin: Keep in touch tile in Hours & rules.
- [x] Tests, help line, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
Clients are matched by email, so one person under two addresses can get two welcomes. Birthdays come only from new bookings
made while the switch is on; there is no way yet to type one in on the client card.
