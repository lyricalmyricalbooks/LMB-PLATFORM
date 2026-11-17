# Services plan phase 7, part 1: rebook reminders (17 November 2026)

Approved plan https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8, phase 7 ("Rebook nudges: it's been six weeks, book your
next cut, timed per service"). Packages, gift cards for services and Google Meet links are already built.

## Plan
- [x] Service setting `rebookWeeks` (0–52) in the shared rules, and pure `rebookDue`. Tested.
- [x] `sweepRebook` in the five-minute booking sweep: one email per visit, skipped when the client booked again or
      unsubscribed, with Book again (same service and person) and a signed unsubscribe link.
- [x] Bookings › edit service: Remind them to come back (Off, 2 weeks … a year); a line on the service card.
- [x] Release note, CLAUDE notes.

## Verification
- [x] Shared rule tests; bookings Function tests (sent once, booked again, unsubscribed, no-show, off, old visits).
- [x] Full shop vitest, typecheck, lint, build; root `npm test`.

## Review
Done as planned. Home's Needs you tile doesn't list clients due a rebook because the email goes by itself; a count of
reminders sent could go there later.
