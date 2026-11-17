# Events and tickets, part one (E1, beta) (17 November 2026)

The first way to sell to be built (plan https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK, phase E1: event pages and
tickets). A shop makes an event with a date, a place and ticket kinds; shoppers buy tickets on the shop's site and pay
through the shop's own Stripe or Square; each ticket gets a code by email. Marked Beta everywhere. On only while the
platform allows it for the shop and the owner switched it on (`waysOn`).

Two pull requests, so each stays readable:

## E1a: the server and the admin page (this pull request)

- [x] `apps/shop/src/shared/eventTickets.ts` (copied to `functions/shared/`): what an event and a ticket kind are
      (`cleanEvent`), places left (`placesLeft`), an order's lines and total (`orderLines`), ticket codes.
- [x] `apps/shop/functions/events.js`, modelled on `bookings.js`:
      records `events/{id}`, `eventOrders/{id}`, `eventPlaces/{eventId}` (sold and held counts, read and written in the
      same transaction as the order, so the last ticket can't be sold twice);
      public actions `eventsInfo`, `eventStart`, `eventView`; owner ops `saveEvent`, `deleteEvent`, `resendTickets`;
      a paid order holds its places for 10 minutes while the customer pays on the shop's own card page
      (`payments.standaloneCheckout`); the sweep confirms a paid hold or frees an expired one; free tickets confirm at once.
- [x] Every action checks both switches (`platform/features` › `ways.events` and `firstWeek/start` › `ways.events`).
- [x] Rules: the three collections are server-only (no rule opens them; the admin asks the server, so the page never
      shows a count the server would refuse). Emulator checks for owner, shopper, anonymous and the two-shop one.
- [x] Admin › Events (Beta): list, make and edit an event, see orders and who is coming. In the menu only while on.
- [x] Ticket email with the codes, English and French.
- [x] Control room: a shop's record shows its events and tickets sold.
- [x] Tests for the shared rules, the server (holds, last ticket, paid and unpaid, free), and the page's helpers.

## E1b: the website (next pull request)

- [ ] `/events` on the shop's site: the list, an event's page, buying tickets, the "you're going" page.
- [ ] Words in Studio › Text & labels, colours from the theme; header and footer link while events are live.
- [ ] `events` set to built in `shared/ways/ways.js`, turned on for the test shops, a test purchase in Stripe test mode.

## Not in E1 (later phases of the plan)

Door scanner and check-in (E2); refunds, moving an order, ticket extras, the optional booking fee, discount codes (E3).

## Verify

Root `npm test`; shop tests, type-check, lint, build; rules emulator; desktop and phone screenshots of the admin page.

## Review

**E1a (17 November 2026).** Built as planned, with four choices made on the way:

- The records are server-only instead of admin-readable. The admin page reads through `eventsAdmin`, so there is one
  place that works out places left and money taken, and no rule to get wrong.
- No new scheduled job: held places are confirmed or freed inside the five-minute `bookingSweep`.
- The card page takes one line for the exact amount (tickets plus tax), like Bookings, so what is charged always
  equals what the order says. Stripe's shortest page life is 30 minutes; the sweep closes it when the 10-minute hold ends.
- Free tickets confirm at once, under the shop's email budget (6 an hour per address), so the form can't be used to
  send mail to strangers.

Also: privacy export and erase cover ticket orders; the menu shows a small "Beta" beside Events; the control room's
shop record shows events, coming ones and tickets sold. Events stays `built: false` until E1b, so no shop sees it yet.

Checks: shared rules 14 tests (shop and server copies), server 15, page helpers 10, menu and tour tests, control room
9; rules emulator ALL OK with the new server-only and two-shop checks; type-check, lint and build clean; desktop and
phone screenshots of the page, the editor and the guest list from the admin fixture
(`admin-fixture.html?ways=events&page=events`).
