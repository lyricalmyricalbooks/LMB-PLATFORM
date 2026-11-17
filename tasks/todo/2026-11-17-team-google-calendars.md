# Each person's own Google Calendar (Services plan 2, B6)

- [x] Platform: `calendar.freebusy` permission (later part), person sign-in link, status, busy times, unlink; grants kept per person and given back at shop close.
- [x] Shop server: admin op `teamCalendar` (status, link with optional email, unlink); `sweepTeamCalendars` writes busy times as day items `gcal~<person>~<start>~<end>` so every free-time and booking check blocks them for that person only.
- [x] Admin: "Their Google Calendar (Beta)" in the person dialog; Coming soon when the platform part is off.
- [x] Tests: google.test.js, hosted.test.js, bookings.test.js; typecheck, lint; screenshots desktop and phone.

## Review
Busy times ride on the existing day documents, so no new rule or read path. Needs GOOGLE_LATER_EXTRAS on and Google's review of the permission before anyone can link.
