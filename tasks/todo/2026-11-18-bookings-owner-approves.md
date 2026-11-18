# Bookings plan 4, 2.5: owner approves bookings first

- [x] Shared: `approval` on a service, kept only for one-to-one services that are free or paid at the shop with no card kept; `APPROVAL_HOURS` 48
- [x] Server: a request holds the time with `answerBy`; accept and decline admin actions; emails for requested, accepted and declined; the sweep declines unanswered requests
- [x] Booking page: request tag on the service, request note and button, requested and declined views, withdraw
- [x] Admin: Requests box, Accept and Decline (optional reason) in the booking drawer, Request tag in the week and team views, service switch
- [x] Words in Text & labels, English and French; help line; release note
- [x] Tests: shared, admin view, server (request, accept, decline, withdraw, sweep, paid service)
- [x] Screenshots at 1440 and 390

## Review
Approval and standing appointments don't mix (a run would need one answer per visit), so the standing switch hides while approval is on.
Found while testing: the time left read "1 minutes" in its last minute; fixed.
