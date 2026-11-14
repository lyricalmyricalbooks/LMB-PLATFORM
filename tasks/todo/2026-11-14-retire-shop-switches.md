# Retire the five old shop switches (14 November 2026)

Julian: "get rid of it" (the control room's Switches page: Old stockroom sign-in, Forward an old web address, Find
receipts in Gmail, Read orders from Gmail, Orders from an old shop system). All five were off in every shop.

## Plan

- [x] Profile format: drop `switches` from the schema; an older saved profile that still names it is accepted and
      written without it (`profile/profile.js` `RETIRED_KEYS`, `currentProfile`).
- [x] Setup: no `SWITCHES`/`shopSwitches`/`switchDefaults`; step 6 / shared step 3 rewrite an older profile without them.
- [x] Control room: Switches page, tool card, find-bar entry, per-shop switch boxes, `switch.js`, the
      `switch`/`switch-all`/`new-shop-switches` routes, the missing-switch self-check and the switch publisher
      (now `sharedPublisher`) removed. Old "switch-set" history entries still read in the timeline.
- [x] Shop app: old stockroom sign-in (`legacySignIn.ts`, `legacyFirebase.ts`), old-address forwarding (GitHub Pages
      job, `pagesRedirect.mjs`, `build-pages-redirect.mjs`, `movedState.ts`) and the switch reader removed.
- [x] Stockroom: the switch reader removed; the Gmail receipt finder, Gmail order scan and old-shop tab stay off for
      every shop, even with an older profile that names them on.
- [x] Follow-up PR 1: delete the stockroom's Gmail receipt finder (tabs, pill, outbox, Apps Script service, Gmail sign-in,
      unused styles). The background receipt sweep, the Gmail add-on inbox and Paste & Upload stay; the sweep's search and
      checks moved to `src/lib/receipt-email.js`.
- [ ] Follow-up PR 2: delete the stockroom's Gmail order scan and old-shop tab code.

## Verification

- Platform `npm test`, shop `pnpm test` + typecheck + lint, stockroom `npm test` + lint + typecheck.

## Review

Behaviour for shops is unchanged (everything was already off). Kept: Receipts by email and the imports from other shops.
