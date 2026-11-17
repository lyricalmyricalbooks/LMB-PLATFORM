# Classes (Beta): a minimum number to run

Part of the approved "Four more ways to sell" plan (Classes leftovers first). Owner: "go, carry out this plan completely".

## Plan
- [x] Shared rule (`src/shared/bookingTimes.ts`): `minPlaces` and `decideHours` on a service, kept only for a group at
      set times (weekly class times or a course), never above the places; `runDecisionDue`; a `closed` busy stretch
      closes that class at that start and nothing else (`placesLeft`).
- [x] Server (`functions/bookings.js`): `sweepMinimum` in the five-minute booking sweep decides each class time once
      (`bookingRuns/<serviceId>~<startMs>`, written first); too few: close the time (every course date), cancel and
      refund each confirmed sign-up in full through the shared `shopCancel` (the admin's cancel now uses it too), email
      each customer and the owner; someone still paying waits for the next sweep.
- [x] Full classes list skips a closed time (no waiting list offered for it).
- [x] Admin: "Minimum to run" and "Decide" in the class form, with the plain rule under them.
- [x] Website: Book a time shows "Runs with N+ people" (Text & labels key `bookTimeClassMinimum`, French too).
- [x] Release note, functions guide note.

## Verification
- [x] `functions/bookings.test.js` "classes: a minimum number to run" (6 tests): kept/refused, too few (refund, emails,
      closed time, other services unaffected, next week open), enough (runs, decided once), someone paying, a course
      (decided on its first date, every date closed), no minimum.
- [x] `src/shared/bookingTimes.test.ts`: decide window, closed stretch.
- [x] Full shop suite, typecheck, lint; root `npm test`.

## Review
The owner's cancel and the minimum's cancel share one path, so refunds, gift cards, packs, calendar and emails stay the
same. Not tried on a test shop yet (needs Classes on there and a test-mode payment).
