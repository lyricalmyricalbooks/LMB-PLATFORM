# Ways to sell (beta): the switches (17 November 2026)

Julian approved the plan (https://claude.ai/artifact/AEohjazbR2c6yG42PibWhK) on 14 November: six more things any shop
can sell (events and tickets, classes, digital goods, donations, memberships, rentals), as switches and not as new
kinds of shop, every one marked Beta until he says otherwise. Services is built, so the build starts here. This is the
first step: the switches themselves. No way's own pages are built yet.

## Plan

- [x] One list of the six ways for the platform (`shared/ways/ways.js`) and a copy for the shop
      (`apps/shop/src/shared/waysToSell.ts`), kept in step by a test. Each way has a `built` flag, false today.
- [x] Two switches decide a way: the platform's (`platform/features` › `ways`, beside Bookings' switch, written only
      by the control room) and the owner's (`firstWeek/start` › `ways`). A way is on only while both are (`waysOn`).
- [x] Control room desk `control-room/waysBeta.js`: one shop's six ways, turn one on or off, and an overview of every
      shop. Refuses to turn on a way that isn't built, so no shop is shown a switch that does nothing. Safe to repeat;
      logged in the registry, the shop's audit log and the activity log (`ways-set`).
- [x] Control room pages: "Ways to sell (Beta)" in a shop's record and Shops › Ways to sell (beta), with a Ctrl K entry.
- [x] Shop admin: Settings › General › Ways to sell, one switch per way the platform turned on, each with a Beta
      label. Hidden while the platform has turned nothing on.
- [x] Shop rules: `firstWeek/start` accepts `ways` (the six ids, true or false only), with emulator checks including
      the two-shop one. `platform/features` stays platform-only.
- [x] Release note.
- [ ] Next, its own pull request: the optional sign-up question "Anything else you'll sell?".
- [ ] Then Events E1 (pages and tickets), which sets `events` to built and adds its menu, pages and control room use.

## Verify

- `npm test` at the root (the desk, the list, the shop copy and the rules list in step).
- In `apps/shop`: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `vite build`, the rules emulator script.
- Screenshots, desktop and phone: the shop's Settings section (admin fixture, `?ways=events,classes,giving`).

## Review

- Root `npm test`: 2119 pass. Shop: admin and script tests pass (3529), type-check and lint clean, `vite build` fine.
- Rules emulator (same packages as CI): all checks pass, including the seven new ones (shape of `ways`, the owner
  can't allow itself a way, another shop's owner can't switch one on here).
- Looked at on desktop and phone: the shop's Settings section (admin fixture `?ways=events,classes,giving`, switch
  pressed, toast shown), the control room's Shops › Ways to sell (beta) page and the section in a shop's record
  (walkthrough). The record section started as a table; inside the record's side panel on a phone the table's cards
  ran off the edge, so it is one wrapping line per way instead.
- Nothing is switchable yet on purpose: every way is `built: false`, the desk refuses to turn one on, and a shop with
  nothing turned on sees no Ways to sell section. Tests try the desk with two ways built.
- Not done here: the sign-up question (next pull request), and each way's own pages.
