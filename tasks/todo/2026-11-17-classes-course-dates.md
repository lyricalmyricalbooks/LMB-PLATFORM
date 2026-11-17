# Classes (Beta), C2b part 1: every course date gets its reminders and calendar entries

Follows `2026-11-17-classes-courses.md`. A course is one booking; until now only its first date was reminded and shown in calendars.

## Plan

- [x] `sweepReminders` also runs for a shop with only the short reminder on, and calls `remindCourseDates` for each confirmed course booking.
- [x] Each later date gets the day-before and the short reminder once (`course.reminded`, `course.reminded2`), marked before sending; email and text name that date.
- [x] Owner's and each person's calendar feed list every date, with the stand-in's name; the customer's file holds every date.
- [x] Tests: reminders once per date and none after a cancel; calendars with two dates.
- [x] No new scheduled job, rule or index.

## Verification

- [x] `functions/bookings.test.js`, `functions/bookingsCalendar.test.js`.
- [x] Full shop tests, type check, lint, build; root `npm test`.

## Review

Small and contained: the reminder rules for the first date are untouched (same windows, same marks), and later dates reuse
`tellCustomer` and `textReminder` with a dated copy of the booking, so wording and unsubscribe behaviour match. A later
reminder replaces the earlier reminder link's key (the booking's own link keeps working). Left for later: Google Calendar
entries per date, thank-you and tip emails after the last date, check-in per date, a waiting list for a full course,
joining late, a minimum number to run.
