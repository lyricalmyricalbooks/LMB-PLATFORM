# CLAUDE.md — LMB Platform

The platform behind **Colophon**: a self-serve shop and stockroom for small presses and any shop that sells things or
services. Shops sign up as a Bookshop, a General shop or a Services shop. Every shop lives in **one shared Firebase
project, each in its own folder** (`docs/shared-system.md`, decided 10 November 2026; it replaced one project per shop).
`apps/` holds the platform's copies of the shop and stockroom (see `apps/README.md`); the folder map is in `README.md`.

## Rules

- **Never change Julian's own repos for the platform.** `LyricalmyricalWebsite` and `lyrical-inventory` must keep working in
  all circumstances. Product work happens only in `apps/`. Outside `shops/`, `apps-isolation.test.js` fails the build on a
  live Lyricalmyrical project id or key, on "lyricalmyrical" in code, on a real email address and on a Firebase project
  that isn't the test shop's, the platform's or a made-up one. Use placeholders (`owner@example.com`, `*.example`,
  `lmb-test-shop`, `yourpress.*`); extend its lists only for a company's sender address or a made-up test fixture.
- **One folder per shop (the shared system, `docs/shared-system.md`).** All shops share one Firebase project; each shop's data and files live only under `shops/<shopId>/`, and every rule sits inside `match /shops/{shopId}` and trusts a sign-in only through `signedInHere()`. Never write a path outside the shop's folder, never use a collection-group query or `{path=**}` rule, and add a two-shop check to the rules emulator script for every new rule.
- **Platform keys stay here.** The Stripe platform key lives only in `services/payments`. Email has no sending key: it
  goes out through the Gmail API from the platform's Google Workspace mailbox (`services/email`, Resend was dropped on
  10 November 2026). Never copy a platform key or sign-in into a shop's folder or into client code.
- **Every step can be re-run.** Setup steps and data changes must be safe to run twice and must record what they did, per shop, in that shop's `audit-log` and in the shop registry.
- **Prefer retry over delete.** Never delete a half-made Google Cloud project to start over: deleted projects linger 30 days and their names can't be reused.
- **Real money and real shops.** Never point tests at live keys or a paying shop. Use the test shops: Test Press
  (books, `lmb-test-shop.web.app`), Test Goods (general, `lmb-test-goods.web.app`), Test Press US
  (`lmb-test-press-us.web.app`) and Test Studio (services) (`docs/test-shop.md`).
- **Customer-facing words never name a rival** (say "Bring your shop with you").
- **Plain words.** Shop owners never read technical words (Firebase, key, webhook and the rest); `plain-words/` holds
  the list and the tests. Never show setup plumbing to a shop owner, and never suggest they hire a lawyer or accountant.
- Node 22, plain ES modules. Each folder picks its own tools when its work starts and records it in `docs/decisions.md`
  (the shop copy is React + Vite, the stockroom copy plain JavaScript, `setup/` and `signup/` have no framework).

## Design (Julian's top rule)

- **Every screen must be world-class**: the shop admin, website templates and starters, the control room, sign-up and
  emails. Clear hierarchy, excellent typography, generous spacing, polished on desktop and phone, and every state
  designed (empty, loading, error, success). Never ship "works but looks rough".
- Follow the Colophon look (one admin look: bento layout, cream, mint tile, black pills; shared styles in
  `shared/admin-look/`, `docs/admin-look-plan.md`) and Julian's mockups exactly (the newest is
  `admin-redesign/v4` in the project files).
- **Prove UI work with screenshots** at desktop and phone width, review them yourself before calling it done, and show
  the real Studio and the real admin, never a drawn mock.
- Every shop-facing feature lives in the one admin, every website template and starter is fully editable in Studio,
  and help lives only inside the shop admin. Book-only features (authors, royalties, ISBN) show only for bookshops.
  When a feature ships, give the control room a view of it.

## How to work

- **New features: plan first, then Julian's yes.** Put the plan in front of him (an artifact) before building.
- **Finish approved plans without stopping.** Once Julian approves a plan, work through every step and message him only
  when a step truly needs him (a sign-in, a 2FA code, a test card, a key from another company).
- **Do the checking yourself.** Use Claude in Chrome to try work in the control room and the test shops' admins instead
  of giving Julian click-steps. Fix failing checks and root causes without being asked.
- **How updates reach shops** (`docs/updating.md`): a merge to main puts the platform site live and updates the test
  shops by itself; real shops get it only through the "Send the update to shops" workflow.
- The guides inside `apps/shop/` and `apps/stockroom/` were copied from Julian's own repos. Their code notes still
  apply, but where they disagree with this file (check names, deploys, which project, who merges), this file wins.

## Pull requests

- Run `npm test` before pushing, plus the checks of any app copy you changed, from its folder.
- After a change, end the reply with a "Next moves" list written for the shop owner, in plain words, same format as the shop repo's CLAUDE.md.
- **Merge your own PRs automatically (owner's instruction, 27 October 2026).** Open PRs ready for review, wait for every
  check in `.github/workflows/ci.yml` to pass, then merge (merge commit, pinned to the head SHA) when GitHub reports no
  conflict. Never merge with a red, pending or missing check: fix it first.
