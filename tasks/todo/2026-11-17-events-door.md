# Events and tickets, the door (E2, beta) (17 November 2026)

Phase E2 of the plan (https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK): check tickets in at the door, so one ticket
gets one person in. Plus the small fix left from E1b: the website's Events link comes down by itself after the last event.

- [x] Server: owner op `checkIn` by ticket code, once (a second scan says "already used"), with undo; an arrived count
      per event kept in the same transaction; the buyer's page never learns who scanned.
- [x] Admin: **At the door** on an event (the guest list drawer): type or scan a code, a clear answer, the arrived
      count, Check in / Undo per ticket, find a guest, "Arrived" in the downloaded list.
- [x] Website: a QR code per ticket on the buyer's page; a used ticket is marked.
- [x] The Events link ends with the last event (`eventsLiveUntil`), with no scheduled job.
- [x] Tests (server, page helpers), fixture click-through on desktop and phone, screenshots.

## Verify

Root `npm test`; shop tests, type-check, lint, build; the fixture door clicked through in Chromium on desktop and phone.

## Review

Built as planned. No rule changed: the records stay server-only and the door goes through the owner's `eventsAdmin`.
The scanner is the one Bookings check-in already uses, so iPhones work too. Staff with admin access can use the door;
a door-only helper link (no sign-in) is left for later, with refunds and extras (E3). The ticket email still shows
letters only; its button opens the page with the QR codes.
