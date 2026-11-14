# Setting up a services shop (14 November 2026)

Services plan, phase 1, part 3 (https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8). Before this a services shop could
not open: Get started asked it for products and shipping, and the check before opening blocked on "No published books"
and on shipping.

## Plan
- [x] `servicesSetup.ts`: `servicesOnly`, `bookable`, `hasHours`; `launchCheck.readBookingsFacts` reads Bookings only for
      a services shop.
- [x] Ready to sell: services, opening hours and booking page instead of books, shipping, catalogue review and the
      practice order; privacy and terms only. Every other shop's rows unchanged.
- [x] Get started: details, Your services, look, Get paid, open (no products or shipping step).
- [x] Setup guide: its own order and words, from the first service to the first booking.
- [x] The verb "book" survives the services words in the shop, the platform and the help twins.
- [x] Help answer "How do I take bookings?" for the new steps; trial tips for them.
- [x] Tests (`servicesShop.test.ts`, platform `sells.test.js`), release note, admin guide note.
- [x] Home for a services shop: today's appointments, who is next, the next seven days and Coming up; To do is
      appointments to mark paid, messages, privacy requests and payments to chase (`overview/HomeServices.tsx`).
- [x] Screens checked on desktop and phone in the admin fixture (`?sells=hair&bookings=new&start=1`, `?sells=hair`).

## Review
- Shop tests, typecheck, lint and root `npm test` pass.
- The menu and Home still show the product shop's for a moment while the shop's kind is read.
