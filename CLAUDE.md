# CLAUDE.md — LMB Platform

The platform (Colophon) that signs up and runs every press's shop and stockroom. All shops live in one shared Firebase
project, each in its own `shops/<shopId>/` folder (`docs/shared-system.md`; this replaced one project per shop on
10 November 2026, so older docs that say "a press's Firebase copy" mean its folder). `apps/` holds the platform's copies
of the shop and stockroom (see `apps/README.md`).

## Where things are

- `README.md` › *What lives here* is the folder map (every top-level folder in one line; `repo-layout.test.js` keeps it
  honest). Read it before adding a folder, and add the new folder's line there.
- `apps/shop/CLAUDE.md` and `apps/stockroom/CLAUDE.md` are the guides for the two app copies; each area of the shop has its
  own guide next to its code.
- `docs/decisions.md` (choices made and why), `docs/shared-system.md` (one folder per shop), `docs/run-book.md` (what to do
  about each alert), `docs/updating.md` (how a release reaches shops), `docs/test-shop.md`, `docs/code-plan.md`.

## Commands

```bash
npm test                  # every platform test (node --test; the list of folders is in package.json)
npm run walkthrough       # every platform page on made-up data, no emulators (walkthrough:all also starts the demo)
npm run demo              # test shop, admin, Studio and stockroom against the Firebase emulators (docs/demo-shop.md)
cd apps/shop && pnpm install --frozen-lockfile && pnpm test && pnpm run typecheck && pnpm run lint   # shop copy
cd apps/shop/functions && npm ci                                                                     # before shop tests
cd apps/stockroom && npm ci && npm test && npm run lint && npm run typecheck                         # stockroom copy
```

Only the root `.github/workflows/ci.yml` runs (the copies' own workflows never do). Its jobs: `test` (platform),
`shop`, `shop-studio`, `shop-accessibility`, `shop-admin-phone`, `shop-speed`, `stockroom`, `stockroom-phone`, `windows`,
the rules jobs (`shop-rules`, `stockroom-rules`, `waitlist-rules`: the real rules engine via
`apps/shop/scripts/firestore-rules-emulator.mjs` and `apps/stockroom/scripts/rules-emulator.mjs`), and the browser checks
(`release-check-browser`, `walkthrough-browser`, `demo-keeps-stockroom`). Touching an app copy means running that copy's
checks from its folder, not just the root `npm test`.

## Rules

- **Never change Julian's own repos for the platform.** `LyricalmyricalWebsite` and `lyrical-inventory` must keep working in
  all circumstances. Product work happens only in `apps/`. Outside `shops/`, `apps-isolation.test.js` fails the build on a
  live Lyricalmyrical project id or key, on "lyricalmyrical" in code, on a real email address and on a Firebase project
  that isn't the test shop's, the platform's or a made-up one. Use placeholders (`owner@example.com`, `*.example`,
  `lmb-test-shop`, `yourpress.*`); extend its lists only for a company's sender address or a made-up test fixture.
- **One folder per shop (the shared system, `docs/shared-system.md`).** All shops share one Firebase project; each shop's data and files live only under `shops/<shopId>/`, and every rule sits inside `match /shops/{shopId}` and trusts a sign-in only through `signedInHere()`. Never write a path outside the shop's folder, never use a collection-group query or `{path=**}` rule, and add a two-shop check to the rules emulator script for every new rule.
- **Platform keys stay here.** The Stripe platform key and the email sender key live only in `services/payments` and `services/email`. Never copy them into a shop project or into client code.
- **Every step can be re-run.** Setup steps and data changes must be safe to run twice and must record what they did, per shop, in that shop's `audit-log` and in the shop registry.
- **Prefer retry over delete.** Never delete a half-made Google Cloud project to start over: deleted projects linger 30 days and their names can't be reused.
- **Real money and real shops.** Never point tests at live keys or a paying press's project. Use the test shop.
- **Customer-facing words never name a rival** (say "Bring your shop with you").
- Node 22, plain ES modules. No framework is chosen yet; decide per folder when its work starts, and record it in `docs/decisions.md`.

## Pull requests

- Run `npm test` before pushing, plus the checks of any app copy you touched (see Commands).
- After a change, end the reply with a "Next moves" list written for the shop owner, in plain words, same format as the shop repo's CLAUDE.md.
- **Merge your own PRs automatically (owner's instruction, 27 October 2026).** Open PRs ready for review, wait for every
  check to pass, then merge (merge commit, pinned to the head SHA) when GitHub reports no conflict. Never merge with a
  red, pending or missing check: fix it first.
