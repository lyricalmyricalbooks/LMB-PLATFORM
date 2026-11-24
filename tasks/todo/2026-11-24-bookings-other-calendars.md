# Bookings plan 4, step 5.7: Outlook and Apple busy times (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared reading (`shared/calendarFeeds.ts`): link check with an allowed-hosts list, and busy times from a calendar
      file (time zones including Windows names, all-day, repeats with exceptions, free and cancelled skipped).
- [x] Server: op `otherCalendars` (list, add after one test read, remove, refresh), `bookingCalendars/main` kept server
      only, safe fetch (redirects re-checked, timeout, size cap), sweep every 15 minutes in `bookingSweep`.
- [x] Busy times block the whole shop or one person and never count towards the daily cap; a failed read keeps the last
      busy times; removing a calendar frees its times.
- [x] Admin: Other calendars tile in Hours & rules with add, how-to steps, status, Remove and Check now.
- [x] Tests (shared reading on both copies, server add/sweep/remove), help line, release note, CLAUDE.md notes,
      screenshots at 1440 and 390.

## Review
Links stay on the server and are never sent back to the page. Reading is limited to known calendar companies so the
server can't be pointed at other addresses. Two-way sync (writing bookings into Outlook) is out of scope: the owner's
own calendar link (Your calendar) already shows bookings there.
