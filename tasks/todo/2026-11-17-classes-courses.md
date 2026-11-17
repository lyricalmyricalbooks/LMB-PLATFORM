# Classes, step C2a: courses, one price for several dates (Beta)

Approved plan: Ways to sell › Classes & workshops (C2 Courses). Classes run on the Bookings engine, so a course is a
group class with its own dated sessions and still one booking, one price and one payment.

## What this step does
- [x] Shared rules (`src/shared/bookingTimes.ts`): `courseDates` on a service (shop-clock dates, 2 to 30, cleaned and
      sorted), `isCourse`, `courseStarts`, `coursePlacesLeft`; a course is offered on its first date only, whatever the
      opening hours and however far ahead; no weekly times or packs with it.
- [x] Server (`functions/bookings.js`): one sign-up takes a place on every date in the same transaction that takes the
      first (ledger items `<id>` and `<id>~<n>`), `course { starts, days }` on the booking; paying confirms them all,
      cancelling or a hold running out frees them all; a course can't be moved; the emails list every date; the
      Timetable answers `courses` with the fewest places left; the owner's "book someone in" signs up for all dates.
- [x] Admin: class editor › When it runs › A course with set dates (date and time rows); the Classes week shows each
      date with everyone on the course (`readCourseRows`, one query by the week's days); the class card says "Course".
- [x] Website: Book a time shows a course's dates instead of the time picker and on the booking page; the Timetable
      page lists courses in their own block. Words in Text & labels (English and French).
- [x] Release note, guides.

## Not in this step (C2b and later)
Joining after the first date at a lower price, a deposit balance reminder, a minimum number to run with refunds after
the owner's yes, reminders and calendar entries for the later dates, check-in on later dates, the waiting list for a
full course, moving someone to another course.

## Checks
- [x] Shared tests (dates cleaned, first date only, fewest places left), server tests (hold, pay, cancel, full, blocked
      date, owner sign-up, Timetable, started), admin view tests.
- [x] Full shop tests, typecheck, lint, build; root tests.
- [x] Screenshots: admin editor and week, Timetable page.

## Review
A course is still one booking, one price and one payment on the Bookings engine; only the places ledger gained
several items for one booking (`spansOf`), taken, confirmed and freed together. No rules, indexes or scheduled jobs
changed (the admin's `course.days` query uses the automatic single-field index). Checked with tests and with sample data
in the admin fixture and Studio's preview; not tried on a real account. Known gaps, named in the release note: late
joining, minimum numbers, reminders, calendar entries and check-in for the later dates, the waiting list for a course.

## Follow-up: three review findings (same day)

- [x] Course rows on the Classes week are followed live (`followCourseRows`), not read once.
- [x] A stand-in on a later date is kept on the booking (`course.staff`) and shown on that date.
- [x] The Timetable counts whole courses only (200 days in all, soonest first); a course that didn't fit goes out with no count.
- [x] Tests for each; full checks before pushing (shop 7828 tests, root tests, type check, lint, build).
