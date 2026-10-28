# CLAUDE.md

Guidance for working in this repository.

> [!IMPORTANT]
> **Read `AGENTS.md` at the start of every task, before doing anything else.**
> `AGENTS.md` is the companion operating guide: it defines your role, priorities,
> and — most importantly — the **skills/playbooks** you should pick up and apply
> while working in this repo. Re-read it each session (it may have changed) and
> **use the relevant skills from it whenever they apply** to the task at hand.
> Treat its skills as active tools, not background reading. If anything in
> `AGENTS.md` conflicts with this file, follow `CLAUDE.md` for repo facts and
> `AGENTS.md` for how to work, and call out the conflict.

## What this is

An e-commerce storefront + admin for **Your Press**, a publisher.
It's a single-page React app (the public bookstore and the admin dashboard are
the same SPA), backed by **Firebase** (Firestore, Auth, Storage) and a set of
**Cloud Functions** that handle payments, email, and fulfillment. The UI was
originally generated from a Figma design ("Artsy Website for Publisher").

> Note: `README.md` still documents an older Express `backend/server.js` with a
> password-protected admin. That backend no longer exists — payments,
> fulfillment, and admin auth have all moved to Firebase (see below). Trust this
> file and the actual code over the README's "Backend API + Admin" section.

## Tech stack

- **React 19 + TypeScript**, built with **Vite 8**.
- **React Router 7** (`react-router`) — client-side routing in `src/app/App.tsx`.
- **Tailwind CSS v4** (via `@tailwindcss/vite`) for styling; **shadcn/ui** +
  **Radix UI** primitives in `src/app/components/ui/`.
- **motion** (Framer Motion successor) for animations (MUI/Emotion were removed in October 2026: nothing imported them).
- **Firebase 11** client SDK (`src/lib/firebaseApp.ts` app + App Check; `src/lib/firebase.ts` full Firestore + Auth;
  `src/lib/firestoreLite.ts` shopper Firestore Lite — see *Storefront bundle* below, project
  `lmb-test-shop`). The inventory app's project (`lmb-test-stockroom`) is reached only by
  Cloud Functions for the inventory app link (see *Inventory app link* below); `src/lib/legacyFirebase.ts`
  is a leftover admin sign-in to it, no longer used for stock, and runs only when the shop profile's
  `switches.legacyStockroomSignIn` is `true` (`admin/legacySignIn.ts`). **Shop switches (plan 1.17):** one press's
  one-offs are off unless the profile turns them on: `legacyStockroomSignIn`, `githubPagesForwarding` (the old-address
  forwarding pages and `movedState.ts`) and `gmailReceiptFinder` (the stockroom). `switchOn()` in `src/lib/shopProfile.ts`;
  the deploy reads them with `node scripts/shopProfile.mjs switch <name>` (`src/lib/shopSwitches.test.ts`).
- **Stripe** for checkout, **Resend** for transactional email, **Shippo** for
  address verification / shipping labels — all wired through Cloud Functions.
- **Vitest** for tests.

## Layout

```
src/
  main.tsx                  App entry
  app/
    App.tsx                 Routes + top-level providers (Theme, Currency, Cart)
    CartContext.tsx         Cart state
    CurrencyContext.tsx     Multi-currency state
    Checkout.tsx            Checkout flow (calls Stripe via Cloud Functions)
    admin/                  Admin dashboard (route /admin/*) — catalog, orders,
                            discounts, reviews moderation, pages, theme editor,
                            analytics, shop settings. `api.ts` = Firestore calls.
                            `Dashboard.tsx` owns the default Reso admin shell;
                            shared cross-page styling lives under `.admin-reso`
                            in `src/styles/theme.css`.
    components/             MainSite, CartDrawer, shared components, ui/ (shadcn)
    features/site/          Storefront pages: BookDetail, CollectionPage,
                            Wishlist, Account, OrderTracking, Search, Reviews,
                            plus constants.ts / storeCopy.ts / types.ts
    lib/                    seo, wishlist, recentlyViewed, functionsBase helpers
  lib/                      firebase.ts, legacyFirebase.ts
  styles/                   Tailwind/global CSS, fonts
functions/                  Firebase Cloud Functions (Node 22, separate package)
  index.js                  All functions (Stripe, webhook, emails, sweeps)
  shared/                   Generated copies of src/shared rules (shipping, discounts, categories, promotions, addresses, pickup, pre-orders)
scripts/                    generate-sitemap, check-readability, verify-admin
firestore.rules / .indexes  Firestore security rules + indexes
storage.rules               Storage security rules
firebase.json / .firebaserc Firebase deploy config (project lmb-test-shop)
```

### Routes (`src/app/App.tsx`)
`/` storefront · `/books/:slug` · `/collections/:slug` · `/wishlist` ·
`/account/*` · `/page/:slug` · `/admin/*` · `/checkout` · `/track`

Pages are lazy-loaded via `React.lazy` + `Suspense`.

### Firestore collections
`books`, `authors`, `orders`, `discounts`, `reviews`, `pages`, `newsletter`,
`analytics`, plus a settings doc and audit log. Always check `firestore.rules`
before changing read/write shapes — rules are enforced server-side.

## Where the rest lives

This file holds the repo-wide facts and rules. Each area keeps its own guide next to its code, and Claude Code loads it
when you work there. **Before changing an area, read its guide** (Grep across `**/CLAUDE.md` finds any topic).
Add new notes to the guide of the area you changed, not here (`scripts/claudeGuides.test.ts` keeps this file under
32 KB and checks the list below).

- **`functions/CLAUDE.md`**: Cloud Functions, payments, email and server rules. Sections: Cloud Functions · Shipping engine · Discount codes: start date and one-use-per-customer · Customer bug sweep · Bug sweep #2 · Paid-but-unpaid recovery + Riso order tracking · Stripe ↔ shop payment sync hardening · Payments & shipping panel repair · reCAPTCHA / App Check · Bug sweep #3 — ready for sales · Email abuse budget and proof of owner · Anonymous-abuse hardening · Bug sweep #4 · Readiness fixes from the 5-agent audit · Commerce access, navigation and merchandising · Cart estimates, returns and catalog review · Bug sweep #5 · Bug sweep #6 + shop filters · Bug sweep #7 · Pre-orders · Gift cards, box sets, automatic discounts, add-ons and scheduled sales · Shop errors · Payment-integrity audit fixes · Round-2 payment fixes · Orders, returns and Shippo labels · Privacy and newsletter · Round-2 security: private book fields, public endpoints, rules · Round-2 digital downloads · Payments module · Email module · Data changes · Platform support visits.
- **`src/app/admin/CLAUDE.md`**: Admin dashboard. Sections: Inventory app link · Riso Press admin design system · Publisher fulfillment desk · Fulfillment workspace UX repair · Admin improvement pass · Reports, analytics and performance · Overview analytics 2.0 + Google Analytics · Overview analytics 3.0 + your own visits · Round-2 catalog and settings · AI writing assistant · URL redirects · Bring your shop with you · Set up your shop.
- **`src/app/admin/studio/CLAUDE.md`**: Studio (the theme editor). Sections: Theme editor · Studio organization · Public designer coverage · Responsive public element editing.
- **`.github/CLAUDE.md`**: Deployment and CI workflows. Sections: Deployment.
- **`src/shared/CLAUDE.md`**: Rules shared by the shop and the server (one TypeScript source, a generated copy in `functions/shared/`).
- **`src/app/features/site/CLAUDE.md`**: Storefront (shop pages, checkout, SEO, photos). Sections: Public storefront readiness repairs · Checkout order slip · Checkout carrier delivery estimates · Storefront bundle · Prerendered page hand-over · Storefront loading performance · Stripe checkout payment section · Book SEO pane · Crawlable public HTML · Collection indexing · Automatic SEO refresh and catalog search controls · Coming soon books · Search drawer · Pickup availability on book pages · Free-shipping line on book pages · Second photo on hover · Formats on shop cards · Author line on shop cards · Shipping & returns tab on book pages · Ships-by line on book pages · Back to top button · Footer currency picker · Header hides on scroll down · Sale countdown on book pages · Added-to-bag notice · Discount code box in the bag · Order note in the bag · Terms checkbox in the bag · Save for later in the bag · Announcement countdown · Checkout experience + stock-hold tuning · Checkout address finder · High-quality photos · Storage bandwidth · Catalog file on Hosting · Book videos · Page translation · Ask a question on book pages · Pop-up trigger · Sold-out books last · Books load as shoppers scroll · Zoom follows the mouse on book photos · Already in your bag on book pages · Sale savings in the bag · Suggestions in an empty bag · Tab reminder · Release countdown on pre-orders · Announcement bar close button · Tax & shipping note on book pages · Star ratings on shop cards · Shop filters in the address · Read more for long descriptions · Ships-by line in the bag · More by this artist on book pages · Payment icons on book pages · Shop profile read at page open.

Cross-cutting rules that live in those guides and apply everywhere:
- Everything shopper-facing must be editable in Studio, with words in Text & labels and no hard-coded colours
  (`src/app/admin/studio/CLAUDE.md` › Theme editor; enforced by the designer coverage tests).
- After every theme-editor change, end the reply with a plain-English click path in the admin (same file).
- Deploy order: Firestore rules, indexes and Functions go live before the frontend that needs them (`.github/CLAUDE.md`).
- Payment, stock and webhook authority stay on the server (`functions/CLAUDE.md`).

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (localhost:5173)
npm run build        # vite build + generate sitemap -> dist/
npm run preview      # preview the production build
npm test             # vitest run
npm run build:sitemap
npm run check:readability
```

Cloud Functions are a separate package:
```bash
cd functions && npm install
npm run serve        # firebase emulators (functions only)
npm run deploy       # firebase deploy --only functions
npm run logs
```

## Auth & admin access

- Admin login is **Google sign-in**: the owner's address (`SHOP_OWNER_EMAIL`, `functions/shopConfig.js`) or a Team
  role (`functions/roles.js`). There is no password-based admin anymore. The page never holds the owner's address:
  `refreshMyRole` tells it to the owner and staff after sign-in (`src/app/lib/ownerDevice.ts` `rememberShopOwner`;
  only the owner's own browser keeps it). The rules get it filled in at deploy (`scripts/deployConfig.mjs`).
- **Per shop (plan 1.15):** site address and functions region come from `public/shop-profile.js` (`siteUrl`,
  `functionsRegion`) for the pages and build scripts (`scripts/shopProfile.mjs`), and from `SITE_URL`/`SHOP_SITE_URL`
  and `SHOP_FUNCTIONS_REGION` for the Cloud Functions (the deploy writes them from the profile). Never write a
  `cloudfunctions.net` or `web.app` address by hand (`functionLink` in `shopConfig.js`).
- Cloud Functions verify the Firebase ID token and require a verified admin
  email for privileged endpoints.

## Verification

- **CI** (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm run typecheck`, `vite build`, the Studio browser
  checks (`pnpm run test:studio`) and the Studio control check (`pnpm run test:studio-controls`) on every PR.
  **Faster checks (20 October 2026):** the two Studio suites (~15 min each on one machine) run split across machines
  (`STUDIO_SHARD=k/3` in `studio-e2e.mjs`: every third check; `AUDIT_SHARD=k/4` in `studio-control-audit.mjs`: every
  fourth control, section fields one device per shard), and jobs `studio-browser` / `studio-controls` report the shards
  under the old check names. They run on pull requests only (a push to main runs `test`), and a PR touching only
  `functions/`, `docs/`, release notes, rules or root `*.md` passes them at once (`changes` job). Every check must stay
  independent (its own page); a new check is placed on a shard by its position, so nothing to update.
  **Faster merging (22 October 2026):** browser jobs set up Chromium with `.github/actions/chromium` (cached browser; apt
  packages only when `ldd` finds one missing — `--with-deps` sometimes hung 10 min). Section fields are dealt across all
  control shards. The control baseline is one file per control in `scripts/studio-control-baseline/` (`~` for `:`), read
  and written only through `scripts/studioControlBaseline.mjs`, so parallel PRs adding controls never conflict. A branch that still edits the old `.json`: merge main, run
  `node scripts/studioControlBaseline.mjs scripts/studio-control-baseline.json`, then delete the `.json`.
- **Shopper click-through:** CI job `storefront-smoke` (same pull requests as the Studio checks) serves `vite build` and runs
  `pnpm run test:storefront` (`scripts/storefront-smoke.mjs`): home, book page, add to bag, checkout (filled in up to Pay: name, a Toronto address, a delivery choice), collection, wishlist,
  tracking, account, admin sign-in, 404, search and phone against the live published catalog. It fails on a page error,
  on the error panel and on a caught section/page crash ("failed to render" / "Storefront render error"), never writes
  (cookies rejected, no email typed, nothing paid). `CHROMIUM_PATH` reuses a local browser; `SMOKE_URL` checks a running site.
- **Demo shop (28 October 2026):** LMB-PLATFORM's `npm run demo` (`demo/`, `docs/demo-shop.md`) runs this shop, the stockroom and
  the Functions on the Firebase emulators (project `demo-colophon-test`). `src/lib/emulators.ts` switches Firestore, Firestore Lite,
  Auth, Storage and the Functions address to the emulators only when the build has `VITE_FIREBASE_EMULATORS=true` **and** the
  profile's project starts with `demo-`; App Check is then skipped. Off for every real build (`emulators.test.ts`).
- **Accessibility (plan 8.8):** root CI job `shop-accessibility` runs `pnpm run test:a11y` (`scripts/a11y-check.mjs`):
  axe-core 4.14.0 (WCAG 2.1 A/AA) in Chromium over every `THEME_LIBRARY` theme and the starting look, on home, a book
  page and checkout, through `a11y-fixture.html` (sample books, shop data never answered). Known problems sit in
  `scripts/a11y-baseline.json` (`<theme> <page> <rule>`: nodes); more fails, `--update` only lowers it. Fix, never raise.
- **Studio fixture:** `pnpm dev` then open `/studio-fixture.html` — the real Studio with in-memory data
  (`studio/fixture/fakeStudioApi.ts`; writes are recorded in `window.__studioFixture.calls`, nothing reaches
  Firestore). `pnpm run test:studio` drives it in Chromium (`CHROMIUM_PATH` to reuse an installed browser,
  `STUDIO_SHOTS=dir` for screenshots). Extend `scripts/studio-e2e.mjs` when Studio behaviour changes.
  `pnpm run typecheck` (`scripts/typecheck-ratchet.mjs`) fails when any file gains type errors over
  `scripts/typecheck-baseline.json`; after fixing errors run it with `--update` to lower the baseline.
- `npm test` (vitest, node env): includes the registry/renderer parity test, nav,
  discount-state, order-status/CSV, cart-quantity and the **theme draft/publish
  separation** test (Firestore mocked) — a draft/discard must never write `design`.
- `tsconfig.json` (`strict: true` since 25 October 2026, `noEmit`) exists for type-checking only; Vite does not use it.
  The 70 errors strict mode found in older files were all fixed on 27 October 2026, so `scripts/typecheck-baseline.json` is
  empty and any type error now fails CI; keep new code strict-clean.
- **Lint:** `pnpm run lint` (`scripts/lint-ratchet.mjs`, CI step in `test`) runs oxlint with `.oxlintrc.json` (correctness
  rules, `react-hooks/rules-of-hooks`, unused variables; `_`-prefixed names are allowed) over `src`, `functions`, `scripts`
  and fails when a file gains problems over `scripts/lint-baseline.json`; run with `--update` after fixing some. The baseline has been empty since 27 October 2026 (all 94 old unused names removed), so any new
  problem fails CI. React
  Compiler rules and `exhaustive-deps` are off on purpose (fixing them changes behaviour). Functions named `use…` are hooks
  to the linter: don't name a plain helper that way.
- Use `pnpm install` (the lockfile pins `react`/`react-dom` 18.3.1, which are optional peer deps —
  a plain `npm install` leaves them out). Vitest also runs `functions/*.test.js`, so run
  `npm ci` in `functions/` first.
- Older page-level visual checks used a throwaway harness that mounts a page with mocked
  `adminApi` data (not committed). Screenshots: `docs/screenshots/riso/`.

## Security notes

- **Secret keys live only in admin-only `adminSecrets/*`** (`stripe`: `secretKey`/`testSecretKey`,
  `resend`: `apiKey`, `gmail`: `appPassword`). `admin/privateKeys.ts` strips them from every
  `settings/website` / `settings/notifications` write (`adminApi.updateSettings`, `saveNotificationSettings`);
  the UI only sees `*Stored` flags. Opening Settings moves any legacy public copy automatically.
  Functions read `adminSecrets` first (`withPrivateStripeKeys`, `readAdminSecret`), then legacy settings, then
  Functions secrets. Keys ever entered before this change were public — rotate them.

## Conventions & gotchas

- Path alias `@` → `src/` (see `vite.config.ts`).
- `package.json` `pnpm.overrides` pins `@grpc/grpc-js` ≥1.14.6 and `protobufjs` ≥7.6.5: every `firebase` release (to 13.1)
  still asks for `@grpc/grpc-js ~1.9`, which has a high advisory. Only Firestore's Node build loads it, never the browser.
  Keep the override until `@firebase/firestore` moves on. Functions run on firebase-admin 14, which has no
  `admin.firestore()` / `admin.auth()` namespace API: `functions/adminSdk.js` rebuilds that shape from the modular
  entry points (index.js, inventoryLinkStore.js and the restore/migration scripts get `admin` through it; the handler
  tests' fakes pass through unchanged). CI's "Cloud Functions load like the deploy" step requires `functions/index.js`
  on every PR, so a package update that breaks loading fails before merge instead of in Deploy Firebase.
- React is 19 (react-router 8 needs ≥19.2.7): `inert` takes a boolean (`inert={true}`; an empty string now means off — see `inertWhen` in `StudioEditor.tsx`).
- **Dependency majors (21 October 2026):** Vite 8 (Rolldown) names shared chunks after any module in them, so find a
  chunk by `moduleIds` (see `preloadShopChrome` in `vite.config.ts`), never by name. Storefront *and admin* animate with
  `m.*` from `motion/react` under App's `LazyMotion`: one `motion.*` anywhere puts motion's layout/drag engine into the
  shop's first load. TypeScript 7 is the native compiler with no JS API: scripts/tests that parse code import
  `@typescript/typescript6`. react-resizable-panels 4 reads bare-number sizes as pixels (use `"24%"`). lucide-react 1
  has no brand icons (footer ones are in `features/site/socialIcons.ts`). Vitest 5 benchmarks use the test context's
  `bench`. React 19's `renderToStaticMarkup` adds `<link rel="preload">` before images (tests that scan markup strip it).
- `figma:asset/...` imports resolve to `src/assets/` via a custom Vite plugin;
  `ImageWithFallback` in `components/figma/` handles broken images.
- The site lives at the root of its Firebase Hosting address, but builds can still use a sub-path (`SITE_BASE`) — be
  careful with absolute paths/links; prefer router-relative navigation and `import.meta.env.BASE_URL`.
- Money/checkout logic is security-sensitive: never trust client-computed totals
  for the authoritative charge — the Stripe session/webhook path is the source
  of truth.
- shadcn/ui components in `src/app/components/ui/` are generated primitives;
  prefer composing them over hand-rolling new UI.
- Tests live next to source as `*.test.ts` (e.g. `features/site/*.test.ts`).

## Your job after every change
After completing any code enhancement, end your turn with a short "Next moves" list: 5 genuinely high-value suggestions for improving the app, ranked best-first.

Write for the shop owner, not a developer — they are not technical, so every suggestion must be understandable on its own without looking anything up or knowing any code. Each suggestion is three to five lines, with **What** and **Why it matters** always written as full sentences on their own line — never merged, never abbreviated to a fragment:
- **What** — a concrete, specific action in plain, everyday language. Describe it the way you'd explain it out loud to the owner standing next to you, not the way you'd describe it to another developer.
- **Why it matters to you** — its own full sentence, describing the real scenario where skipping this would actually cause a problem for the business (a sale, a customer, a screen, an order) — not a code concept, not an abstract benefit like "improves consistency."
- **Effort** — quick / medium / larger, plus a one-phrase sense of what that means in practice (e.g. "quick — a same-day fix" / "larger — a multi-day feature").

**Hard rule — never let code leak into the main sentence.** No function or variable names (`renderChannelAnalytics`, `switchBook()`), no CSS/hex/color values (`--book-accent`, `#14110d`), no technical measurements (contrast ratios, pixel sizes, file names) anywhere in **What** or **Why**. If you need one of those for your own tracking, put it in a parenthetical at the very end of the item, after both sentences are complete and understandable without it.

Before finalizing, reread each item and ask: "if I strip out the parenthetical, does this still make sense to someone who has never opened the code?" If not, rewrite it — don't just add more jargon in parentheses.

**Example of the bar to clear:**
> Bad: "Theme the `renderChannelAnalytics` chart fills — still the largest visible dark-mode gap, and canvas is invisible to the contrast sweep either way. Effort: medium."
> Good: "**Fix the sales chart's colors in night mode.** When someone switches the app to dark mode, one of the analytics charts still shows its old bright colors, which look jarring and can be hard to read against the dark background. Effort: medium — a few hours of design work. (`renderChannelAnalytics`)"

Then offer to do the top one right away, and briefly say why it's ranked first in plain terms.

Suggestions must be tied to what just changed or was just discussed — lead with any edge case, risk to a sale, a save or a payment, or obvious next step the edit opened, explained in plain language. Regenerate from scratch each turn (never repeat a prior turn's list or anything already declined this session). Skip generic best-practice advice. If nothing is genuinely worth doing, say "nothing pressing" and stop.

Angles worth scanning each time: bug/edge case the change introduced · the next logical feature · draft/publish & save robustness · Firestore data integrity · the speed of a slow screen · keeping catalog and ledger consistent.

### Constraints every suggestion must respect
> [!IMPORTANT]
> - **Stack:** React 19 + TypeScript + Vite single-page app; no new frameworks or servers.
> - **Serverless Backend:** Firebase (Firestore, Auth, Storage, Cloud Functions) and static hosting on Firebase Hosting (GitHub Pages only forwards the old address). No server or secret keys in client code.
> - **Shopper safety:** never weaken checkout, payment, inventory or webhook authority.

## Pull Requests
- When asked for "a new pull request", "new PR", or similar: **create it immediately** from the current branch.
- Do NOT investigate merge status, git history, or ask clarifying questions.
- Action: Push branch with `git push -u origin <branch>` then create PR via GitHub MCP.
- Use a descriptive PR title based on the feature/fix being implemented.
- **After a PR is merged, start the next change on a brand-new branch and open a new PR** — never push commits onto a merged branch to revive it.
- **Merge your own PRs automatically (owner's standing instruction, 12 October 2026).** Open the PR ready for review (not
  draft), wait for its checks (`test`, `studio-browser`, `studio-controls`, `storefront-smoke`, `release-note`) to finish, and merge it yourself (merge commit,
  pinned to the head SHA) once every check is green and GitHub reports no merge conflict. Never merge with a red, pending
  or missing check; fix the failure first (bring `main` in, re-run the tests) and push. Merging to `main` deploys the live
  shop. GitHub's own "Allow auto-merge" is off in the repository settings, so the agent does the merge.

## General Principles
- Prefer action over investigation when intent is clear.
- If the user asks for something, assume they know what they want.
- Only ask clarifying questions if the request is genuinely ambiguous.

Live carrier choices show up to five distinct Canada Post methods, cheapest first, using the lowest quote for each service. Server quote selection sorts prices before resolving duplicate service names.

## App release notes
Every PR must add one release-note file, `src/app/admin/updates/YYYY-MM-DD-NN-<id>.ts` (`export default { … } satisfies AppUpdate`; NN = the next number for that day, so the newest note of a day sorts first; `appUpdates.ts` collects the files with `import.meta.glob`, newest first, and `app-release-notes.yml` fails a PR that adds none). Never edit another PR's note file — separate files are why parallel PRs no longer conflict. A branch started before this change that still prepends to `appUpdates.ts` fails `appUpdates.test.ts` and conflicts with `main`: keep `main`'s `appUpdates.ts` (the collector) and run `node scripts/split-app-updates.mjs <your copy of the old file>` (or with no argument on the working tree) to move your note into its own file. Each note has a stable unique ID, date (YYYY-MM-DD), plain-language title and summary, and shortcuts to the affected admin screens (`tab`, optional `settingsTab`, using IDs from `riso/nav.ts`). Explain user-visible benefits honestly; do not claim a backend deployment or live provider verification from local checks. For maintenance-only PRs, say what reliability changed and link to its relevant workspace. Keep older entries for View all updates. The admin sidebar's What's new box shows the newest entry bundled with the deployed frontend; it is not a live GitHub feed.

Checkout country dropdowns pair option backgrounds and text with Studio's Checkout field colours, including Stripe's Windows dropdown; highlighted Stripe options use contrasting text on the checkout accent.
Stripe payment fields retain Studio colours when readable and choose contrasting black/white text for insufficient-contrast pairs; labels follow the surrounding checkout text.

Custom-page navigation resolves published bodies from useSiteData's shared snapshot, including Studio preview updates. Avoid separate slug fetches that clear the header/content on each link; cold custom-page loading retains the shared header.
Grouped footer navigation defaults to Explore and Participate & connect, with policies in a wrapping row above copyright. Studio > Style > Footer & social links selects grouped/classic layout and group/location/heading visibility; Text & labels > Footer owns headings. Menus > Footer menu can customize automatic links, assign groups, edit destinations/labels, reorder and hide links, preserving sub-links. Contact pages suppress the duplicate automatic email link. Preview click-to-edit and inline copy hooks remain available.
**Footer layout (12 October 2026):** `StoreFooter` puts every band in one padded column (dividers line up with the text), link groups on the right by default (Style › Footer & social links › **Where the link groups sit**), and a bottom-bar **Admin** link (`showFooterAdminLink`, words Text & labels › Footer › `footerAdmin`). Spacing/text/colour/divider controls (`footerPaddingY*`, `footerColumnGap`, `footerLinkGap`, `footerTextSize`, `footer*Color`, `showFooterDividers`) become CSS in `features/site/footerStyle.ts`; the bands are regions `footerBrand`/`footerLinks`/`footerLegal`/`footerBottom`/`footerAdmin` for per-device element styling.
