# Staff and rooms (Services plan, phase 4 part 1, 17 November 2026)

Goal: a services shop with more than one person books each client with someone who does that service, during that
person's own hours. A treatment room or chair can only be used by one booking at a time. Clients pick a person or
"anyone free". A shop with no team members listed works exactly as today.

Part 2 (next PR): the day view with one column per person, and staff seeing their own day and having their own calendar link.

## Plan
- [x] Shared rules (`src/shared/bookingTimes.ts`):
      - Settings gain `staff` (id, name, active, the services they do (none listed = all), their own hours or the
        shop's, their own days off) and `rooms` (id, name). A service gains `roomId`.
      - `Busy` gains `staffId` and `roomId`. A busy stretch with no person (older bookings) blocks everyone.
      - `freeTimes` takes an optional `staffId` and offers a time when someone who does the service is working and free
        and the room is free.
      - `whoIsFree` picks the person for a start: the one asked for, else someone already running that class at that
        time, else whoever has the fewest bookings that day, then list order. `isFreeTime` uses it.
      - `cleanBookingSettings`/`cleanService` clean the new fields; limits `MAX_STAFF` 20 and `MAX_ROOMS` 10.
- [x] Server (`functions/bookings.js`):
      - Day items keep `p` (person) and `r` (room), and `busyFrom` reads them back.
      - `takeTime` and `moveTime` assign the person inside the transaction. A booking stores `staffId`, `staffName` and
        `roomId`.
      - `bookingInfo` lists the active people (id, name, the services they do). `bookingTimes` and `bookingStart` take
        `staffId`. A move keeps the same person when they are free, and the owner may choose someone else.
      - Emails and the owner's feed name the person.
- [x] Admin:
      - Bookings › Team and rooms: add people (name, the services they do, their own hours and days off) and rooms.
      - A service's room.
      - The booking drawer and new-booking dialog show and set the person.
- [x] Book a time page: "With" picker (Anyone free or a person) when the shop lists people. Its words are in Studio
      Text & labels.
- [x] Fixture fakes, release note, notes in the area CLAUDE.md files.

## Verify
- Shared tests:
  - no staff means the same times as before
  - each person's own hours and days off
  - a person who doesn't do the service is never offered
  - a busy person is skipped and the other is offered
  - the room clash
  - a class is shared only with the same person
  - an older booking with no person blocks everyone
  - `whoIsFree` picks fairly
- Bookings tests:
  - booking with "anyone" assigns someone
  - asking for a busy person is refused
  - two bookings at once go to two people
  - the room stops a second booking
  - a move keeps the person
  - the owner moves a booking to someone else
- Shop vitest, typecheck, lint, vite build, root npm test, fixture screenshots.

## Review
- Built as planned. The shared rules decide who is free; the server picks the person inside the booking's own
  transaction, so two "anyone free" bookings at the same moment land on two people (tested).
- Admin: Team & rooms tab, a room per service, and the person in the drawer, new-booking and move dialogs. The owner
  books outside staff hours (`ownerBookingSettings`), as for the shop's own hours.
- Book a time page: a With row (Anyone free + names) above the times when the shop lists people; words in Text & labels
  with French twins; the Studio preview shows two sample people.
- A shop with nobody listed writes no new fields and offers exactly the same times (shared and server tests).
- Not in this part: one column per person in the calendar, each person's own day and calendar link (part 2).
