# Bookings (beta), phase 1 (14 November 2026)

Julian (13:34Z): "okay go forward with the plan and all your suggestions. make sure everything is designed to a very
high quality". Plan: https://claude.ai/artifact/GP6DoXZm8Hj35va4Pijoaz. Decisions: named Bookings, free during the
beta, test shops first, no text-message reminders, 24-hour cancel rule by default, a request to Google for busy-time
access drafted for Julian.

- [x] Shared rules `apps/shop/src/shared/bookingTimes.ts` (free times, opening hours, days off, gaps, notice, how far
      ahead, the cancel rule), generated server copy, tested (time zones included)
- [x] Server `apps/shop/functions/bookings.js`: public actions (info, times, start, view, cancel, move) behind the
      per-shop switch, one transaction per day record so two customers never take one time, card holds paid on the
      shop's own Stripe or Square page and confirmed or freed by the five-minute sweep, refunds on cancel, emails;
      owner actions through `bookingsAdmin`; rate limits
- [x] Rules: team reads services, hours and bookings, nobody writes from a browser, nobody reads the day records,
      `platform/features` admin-read only; emulator checks include two-shop walls
- [x] Admin Orders › Bookings: Calendar (week), Services, Hours & rules; new, move, cancel, no-show, paid at the shop
- [x] Storefront /book: choose a service, a time, your details; the booking link to see, move, cancel or add to a
      calendar. Words in Text & labels (English and French), colours from the theme. Checked on desktop and phone.
- [x] Control room: shop record › Bookings (beta) with a plain yes/no switch and the shop's use
      (`control-room/bookingsBeta.js`), logged in the registry, the shop's audit log and the activity log
- [x] Release note, guide notes
- [ ] Google busy-time sync: waits on Google's yes (request drafted for Julian)
- [ ] Text-message reminders: left out of the beta on purpose

## Review
The switch is off for every shop, so merging changes nothing a press sees until the control room turns it on. Card
bookings reuse the stockroom's standalone pay page, so no shop order is made and the payment webhook is untouched.
Not tried against a live shop: the first real run is turning it on for a test shop in the control room after the
deploy, then booking a free and a test-card time.
