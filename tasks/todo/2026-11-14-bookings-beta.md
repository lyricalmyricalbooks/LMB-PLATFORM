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

## Owner switch, own menu item and the designer (14 November 2026, Julian 17:44Z and 17:53Z)

- [x] One switch at the top of the Bookings page turns bookings on or off at once (server op `setLive`).
- [x] Bookings is its own item in the admin menu (website side), shown only in a shop that has Bookings.
- [x] Book a time is its own page in Studio (`bookingsPage`), with click-to-edit parts (`bookingsLayout`), sections
      under it, and sample services, times and a sample booking in the preview.
- [x] While bookings are on, the website links to the page: header calendar icon (with a hide switch), phone menu,
      footer. Menus' link picker offers Book a time.
- [x] Proof: shop tests 7,167 pass, platform tests 2,055 pass, typecheck and lint clean, new Studio browser check
      passes, screenshots of the designer (desktop and phone) and the admin switch (desktop and phone).

Review: the platform's per-shop switch in the control room still decides which shops have Bookings at all; the owner's
switch works inside that. Not yet done on a live test shop: flipping the switch after deploy and seeing the link appear.

## Questions on the booking form (14 November 2026, Julian 17:51Z "continue adding more features")

- [x] A service can ask up to five questions (short or long answer, must-answer or not), set in the service's dialog.
- [x] The booking form shows them, checks the must-answer ones, and the server checks again before taking the time.
- [x] Answers show on the booking in the admin, in the owner's new-booking email and in the calendar feed.
- [x] Proof: shared and server tests, typecheck, lint, screenshots of the dialog, the form and the booking (desktop
      and phone).

Review: answers are kept with the question's wording at the time, so renaming a question later never changes what an
old booking says. Not yet tried on a live test shop.

## Group classes with places (14 November 2026, Julian 18:08Z "do all 5 next moves")

- [x] A service can be a group class: places at each time, and the weekly times it runs.
- [x] Customers see how many places are left; the class closes by itself when full, also when two people ask at once.
- [x] A class and any other booking still never overlap; cancelling gives the place back.
- [x] In the admin week a class is one card with a count, a bar and everyone booked into it.
- [x] Proof: shared, server and view tests, typecheck, lint, screenshots (week, service dialog, time picker; desktop
      and phone).

Review: one booking is one place (no "book for three" yet). Bookings made before this carry no service on their day
record, so they count as another booking, which is the safe side. Not yet tried on a live test shop.

## Waiting list for full times (14 November 2026, Julian 18:08Z "do all 5 next moves")

- [x] Customers can ask to hear when a full class time or a booked-up day has room again (name and email).
- [x] Everyone waiting gets one email the moment a place opens (cancel, owner cancel or move, an unpaid hold running
      out), with a link that opens that service and day. Nothing is held.
- [x] Kept on the server only (no new rule): the owner sees counts per day and a list with Remove.
- [x] Proof: server tests (join, refuse when open or closed, cap, told once, sweep, owner ops), preview, view and link
      tests, typecheck, lint, screenshots (form, problems, done, admin week and list; desktop and phone).

Review: a closed day can't be waited for. People are told together and the first to book wins; no automatic booking.
Not yet tried on a live test shop.
