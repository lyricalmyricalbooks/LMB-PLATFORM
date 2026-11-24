# Bookings plan 4, step 4.5: Product used per service (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared: `BookingService.costMinor`, kept only on a priced service and never above its price (`cleanService`).
- [x] Team pay: each visit that happened adds its service's cost to whoever did that part; commission is worked out
      on takings less product used. Column, tile line and spreadsheet column only once a cost exists.
- [x] Service dialog: Product used per visit (optional), with a plain check against the price.
- [x] Kept off the public booking page (server test).
- [x] Tests on both copies, Team pay tests (no-shows and cancels add no cost, multi-service visits), help line,
      release note, CLAUDE.md note, screenshots at 1440 and 390.
- [x] Team pay cells with a rule under the figure stack and wrap, so a long commission rule fits on a phone.

## Review
Uses each service's cost today rather than a copy on the booking: simple, and an owner changing a cost mid-month sees
the month re-worked at the new cost. If owners need history, store the cost on the booking when it is made.
