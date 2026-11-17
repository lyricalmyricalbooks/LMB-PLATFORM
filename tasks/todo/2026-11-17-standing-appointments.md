# Standing appointments (Services plan 2, B1)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (Part B, item 1). Approved by Julian 17 November 2026, with the
recommended picks: clients and the shop both book runs, up to 12 visits, each visit its own booking with its own reminder,
the shop sets one up from New booking or a client's Book again.

- [x] Shared rules: `repeats` on a service, `cleanRun`, `runStarts` (clock changes), `runsOnline`.
- [x] Server: `bookingRunCheck`, `bookingStart` with `run`, admin `runCheck` and `create` with `run`, all-or-nothing
      (`bookRun` drops every visit when a date is lost), one email listing every date, `runVisits` on the booking page,
      cancel with `andLater` (client and shop; visits with money on them are left).
- [x] Tests: seven in bookings.test.js › standing appointments, including a real race on a later date.
- [x] Admin: service switch with a plain hint, Repeat and Visits in New booking / Book again with every date checked,
      Standing appointment line on the booking, cancel this visit or this and the later ones.
- [x] Booking page: How often and Visits with every date checked, summary row, the run's visits on the booking page,
      cancel this and later; words in Text & labels with French twins; Studio preview answers.
- [x] Notes in functions/CLAUDE.md and features/site/CLAUDE.md, release note.
- [x] Checks: shop vitest, typecheck, lint, build; root `npm test`; screenshots.

## Review

The run is booked all or nothing, so a client never ends up with half a run. Every later visit is paid at the visit at
the full price; a discount code only applies to the first. Not tried on a live shop yet.
