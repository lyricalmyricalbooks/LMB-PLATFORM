# Bookings plan 4, step 4.4: Commission that rises in a good month (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules in `src/shared/bookingTimes.ts`: `CommissionStep`, `cleanCommissionSteps` (rising amounts, a share
      from 0.5 to 100, four at most), `commissionFor` (marginal, rounded once), `commissionStepsText`; a person keeps
      `commissionSteps` only with a commission share.
- [x] Team pay uses `commissionFor`; the Commission cell and the spreadsheet show the steps.
- [x] Person dialog › Their pay: steps editor (Over, Share, remove; Add another step), a plain-words summary, Save
      waits while a step is wrong.
- [x] Pay stays off the public booking page (server test).
- [x] Tests on both copies, a Team pay test, help line, release note, CLAUDE.md note, screenshots at 1440 and 390.

## Review
Fixture: Ana is on 40% up to $3,000 a month, then 50%. $4,000 of takings pays $1,700 ($1,200 + $500), tested on the
shop's copy and the server's. No server code changed: settings already pass through the shared cleaner.
