# Services plan phase 6, part 2: website sections for services (17 November 2026)

Julian: "keep going next phase please". Plan: https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8 (phase 6: services Home,
website sections, starter websites; the starter websites wait on Julian's skeleton picks).

## Plan
- [x] Pure rules in `features/site/serviceSections.ts` (price list rows, team rows, opening hours Monday first with
      today marked, directions link, Book with link, services one person does). Tested.
- [x] `bookingInfo` also sends the shop's opening hours (`hours`), so the hours section shows the real week.
- [x] Four Studio sections (Add section › Engagement): Price list, Your team, Big Book button, Hours & where to find
      us. Registry, fields, fallbacks, thumbnails, renderers; all hide while bookings are off.
- [x] `/book?with=<person>`: the booking page starts on that person and lists only their services.
- [x] Words in Text & labels › Bookings page (French twins), a sub-section so "More words" stays short.
- [x] Release note, CLAUDE notes.

## Verification
- [x] serviceSections, bookTimeRules and bookings Function tests.
- [x] Studio browser check: adds the four sections in the fixture, checks the Book links and the seven days.
- [x] Full shop vitest, typecheck, lint, build; root `npm test`.
- [x] Screenshots of each section from the fixture preview.

## Review
Done as planned. Reviews stay with phase 7 (the existing Testimonials section covers them until then). Team members
have no photo or bio yet, so cards show an initial; adding both is a follow-up.
