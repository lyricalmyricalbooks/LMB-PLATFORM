# Services plan phase 6, part 1: services Home (17 November 2026)

Julian: "keep going next phase please". Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 (phase 6: a services
Home with the next client, today's list, money taken and a Needs you tile; website sections; starter websites, which
wait on Julian's skeleton picks).

## Plan
- [x] Pure rules in `servicesHome.ts`: `taken` (kept + tips today), `fees` (missed visits with a chargeable fee),
      `startsIn`. Tested.
- [x] Next client tile: time, "in X", person and room, money line, Open client and Calendar chips; "All done" /
      "Free day" with the next visit.
- [x] Needs you tile: fees to charge (opens Bookings), people on the waitlist for the next week, a calm empty state.
- [x] Taken today tile; Today list adds the person and a Pack badge.
- [x] Colophon bento, tokens only; no sideways scroll on phones.
- [x] Release note, CLAUDE notes.

## Verification
- [x] servicesHome tests.
- [x] Full shop vitest, typecheck, lint, build; root `npm test`.
- [x] Screenshots: Home desktop and phone (fixture `?sells=hair&team=1`).

## Review
Done as planned, except open times this week: counting them needs a server times call for each day, which is too much
for Home; the Next 7 days tile shows booked hours instead. Rebook nudges belong to phase 7.
