# Classes, step C1a: the Classes page in the admin (Beta)

Approved plan: Ways to sell › Classes & workshops (C1 Timetable). Bookings already has group classes (places, weekly
class times, waiting list, packs, deposits, reminders, check-in), so Classes is built **on that engine**, as the plan
says ("on top of Bookings classes"). No second places ledger, no new money path.

## What this step does
- [x] The Classes way turns the booking engine on for a shop (server `featureOn`, both calendar feeds, the admin's
      `useBookingsOn`): a shop with Classes on and Bookings off still gets hours, team, rooms and the Book a time page.
- [x] Shared rule `classStartsOn(day, service, zone)`: a class's own starts on one shop day (clock changes tested).
- [x] Admin › Classes (Beta): the week's timetable of every class session (booked or not), places taken, teacher and
      room; a session opens its class list (check in, add a person); New class and Edit reuse the Bookings service
      window; days off shown as closed.
- [x] Menu, route, Beta tag, fixture, release note, guides.
- [ ] Not in this step: `built` stays false, so no shop can switch Classes on yet. C1b adds the website's Timetable page
      and turns it on. Then C2 courses, C3 passes and intro offers, C4 minimum numbers and agreement.

## Checks
- [x] Shared tests on both copies, bookings server tests for the switch, view tests, nav tests.
- [x] Full shop tests, typecheck, lint, build; root tests.
- [x] Screenshots of the page on desktop and phone from the admin fixture.

## Review
Classes rides on the Bookings engine: one switch check (`engineOn` on the server, `useBookingsOn` in the admin), one
shared rule (`classStartsOn`), one page over data Bookings already keeps. No rules, indexes, scheduled jobs or money
paths changed. `built` is still false, so no shop can switch Classes on; the page was checked in the admin fixture
(`?ways=classes&page=classes`) on desktop and phone. Not tried on a real account. Left for later steps: an "until" date
for a repeating class, courses, passes, minimum numbers.
