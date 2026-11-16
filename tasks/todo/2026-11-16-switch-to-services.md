# Switch a shop into Services from Settings (Services plan, phase 1 gap)

A product shop couldn't become a services shop after sign-up: the rules allowed a service answer only in a shop that
already was one. Now a shop the platform has turned Bookings on for may switch either way from Settings › General.

## Plan
- [x] Rules: a service answer is allowed when the shop is a services one already or `platform/features.bookings` is on.
- [x] Emulator checks: refused before Bookings; with Bookings on, to services and back; a shop without Bookings stays shut.
- [x] What you sell card: both groups when the shop may switch (`sellsGroupsFor`), a confirm on a change of kind
      (`kindSwitchQuestion`), the label follows the picked answer, Sell products too appears once services.
- [x] Tests, release note, guide note.

## Verify
- Rules emulator script (all checks), shop vitest, typecheck, lint, root tests. Fixture screenshot of the card.

## Review
- Built as planned. One `get` of `platform/features`, read only when a service answer is written by a shop that isn't one
  yet, so other saves cost nothing extra.
- Verified: rules emulator (341 checks, the four new ones included), shop vitest, typecheck, lint, root tests; fixture
  screenshots on desktop and phone: the grouped choice, the confirm, then the menu turning into Calendar and Clients
  at once with Sell products too shown, no sideways scroll, no page errors.
- Not here: sample staff and clients on Test Studio (next PR).
