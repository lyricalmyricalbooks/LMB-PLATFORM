# Deployment and CI workflows

How the storefront and Firebase deploy, their order, and the CI rules. Workflow changes only verify on their first real run. The repo-wide rules are in the root `CLAUDE.md`.

## Deployment

- **Which project (plan 1.19).** Both deploy workflows name no project. A **Firebase project** step picks it: the
  `project` input of a run started by hand, else the repository variable `FIREBASE_PROJECT_ID`, else the shop profile's
  `firebase.projectId` (`public/shop-profile.js`). `scripts/deployProject.mjs` refuses a malformed id and any project
  other than the profile's (the pages built here call that one), before a key is used, then sets `FIREBASE_PROJECT`;
  every `--project`, `functions/.env.<project>` and `GCLOUD_PROJECT` uses it (`scripts/deployProject.test.ts`).
- **Frontend** → **Firebase Hosting** (the profile's `https://<project>.web.app`, site at the root `/`) via
  `.github/workflows/deploy-pages.yml` (display name "Deploy storefront"; file name kept for `keep-refresh-alive.yml`) on push
  to `main` and every 15 minutes when published content changed. The cutover from GitHub Pages happened in October 2026
  (`docs/FIREBASE_HOSTING.md`). Jobs: `build-hosting` (no secrets; **Site address** step = repository variable `SITE_URL` or
  the web.app default, must be `https://host` with no folder and never github.io; build, `carry-previous-assets`, emulator smoke
  test, `dist` artifact; `scripts/siteAddressCheck.mjs` refuses a `SITE_URL` missing from `ALLOWED_ORIGINS` and a custom one that
  doesn't serve the shop yet) → `deploy-hosting` (downloads `dist`, `firebase deploy --only hosting` with the pinned CLI and
  `FIREBASE_HOSTING_SERVICE_ACCOUNT` (Firebase Hosting Admin only), else `FIREBASE_SERVICE_ACCOUNT`; fails without either; live
  smoke test) → `redirect-old-address` (push/manual only: `scripts/build-pages-redirect.mjs` publishes forwarding pages to GitHub
  Pages). Both Hosting jobs run only on `main` and while the repository variable `FIREBASE_HOSTING_ENABLED` is `true` (keep it
  true; it is the emergency stop). Vite `base` defaults to `/` and `SPA_FALLBACK` to `shell`; every `SITE_URL` default (build
  scripts, `vite.config.ts`, `build-pages-redirect.mjs`, `functions/index.js` email links), the workflow fallback and
  `index.html`'s address must agree (`scripts/siteAddress.test.ts`). Still use `import.meta.env.BASE_URL` for links.
- **The old address forwards** only for a shop whose profile turns `switches.githubPagesForwarding` on (plan 1.17; off
  for every new shop, so `redirect-old-address` is skipped and the shop ignores `#lm-move=`). GitHub Pages (`…github.io/shop/…`) serves only forwarding pages
  (`scripts/pagesRedirect.mjs`, inlined with `toString()`): `index.html`, `404.html` and one page per prerendered route (200 +
  canonical to the new page, `<noscript>` refresh, `no-referrer`). `movedUrl` keeps path, query and `#hash` (emails already sent:
  `/track?orderId&key`, unsubscribe, `/checkout?cartId=`, `/admin#orders/<id>`) and decodes the old `?/…~and~` form. It also
  hands over, in `#lm-move=<base64url JSON>`, the old origin's bag and wishlist (once per browser, `lm:moved`; gift-card lines
  stay behind), on `/checkout?order_id=X` that order's `order-access:X` key (plus `attempt` when it was the tab's
  `fm_last_checkout_order`, so a retry still meets "earlier attempt already paid"; an oversized bag never drops the key), and
  the referrer's host (`from`; the forwarding page sends `no-referrer`). `features/site/movedState.ts` (`takeMovedState`, first
  thing in `main.tsx`) strips the hash, fills only an **empty** bag through `sanitizeCart` and **refuses gift-card lines** (a
  crafted link could otherwise name who receives a paid card's code), merges the wishlist, restores the key/attempt only for the
  matching `order_id`, and sets `referral_source` (`lib/referralSource.ts`, shared with App.tsx) only with analytics consent. The forwarding pages are replaced only after the Hosting deploy and its
  live check succeeded. Never point `SITE_URL` back at github.io.
- **Firebase** (Firestore rules/indexes, Storage rules, Functions) →
  `.github/workflows/deploy-firebase.yml` (needs `FIREBASE_SERVICE_ACCOUNT`
  secret and `SHOP_OWNER_EMAIL` variable), or manually: `SHOP_OWNER_EMAIL=… node scripts/deployConfig.mjs --project <id>`
  then `npx firebase-tools deploy --config firebase.deploy.json --project <id> --only
  firestore:rules,firestore:indexes,storage,functions`. Never deploy the rules straight from `firebase.json`: the rules
  hold the slot `"__SHOP_OWNER_EMAIL__"` (plan 1.14b), which `deployConfig.mjs` fills with the owner's address into
  `.deploy/` (git-ignored); unfilled, the owner address is locked out and only the Team owner role gets in. It never
  deploys Hosting. It appends `SITE_URL` (repository variable,
  validated) and `SHOP_OWNER_EMAIL` to `functions/.env.<project>` and, before deploying, checks that the email-link address answers with its
  64-hex `seo-published-fingerprint.txt` (so emails never point at a dead address; manual runs can pass `skip_site_check`
  during a hosting outage).
- **Firebase Hosting config** (`firebase.json` `hosting`): `cleanUrls` (prerendered `books/<slug>.html` answers at `/books/<slug>`),
  `trailingSlash: false` (301s to the slash-less canonical), one anchored **regex** rewrite of app routes to `spa.html`, **no
  catch-all** (unknown URLs get `404.html` = the app shell, a real 404 that still renders the editable missing page),
  `/assets/**` immutable, pages and root xml/txt `no-cache`, nosniff, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` (Studio
  frames the shop; no CSP/COOP), `X-Robots-Tag: noindex` only on `/spa` and `/404`. Use `regex` sources and never give one path
  two values for a header (`scripts/hostingConfig.test.ts`, which also checks every `App.tsx` route is rewritten). A new
  top-level route needs the rewrite regex too. `vite.config.ts` `spaFallbackBase` writes `spa.html` (clean shell, before the
  prerender replaces `index.html`) and `404.html` as the shell (`scripts/spaFallback.mjs` `fallbackFiles`; `SPA_FALLBACK=redirect`
  rebuilds the old Pages redirect until the cleanup step); its `canonicalHost` plugin inlines `scripts/canonicalHost.mjs` after
  `<meta charset>` so `*.firebaseapp.com`/`*.web.app` visitors move to `SITE_URL`'s host. `scripts/hosting-smoke.mjs` checks
  statuses, redirects, bodies and headers in the Hosting emulator (CI and `build-hosting`) and on the live site after each
  deploy; live runs try failing checks again for about 3 minutes (`scripts/retryChecks.mjs`, `LIVE_RETRY_WAITS_MS`) because
  the CDN can serve the previous release for a while (run 804 failed 3 s after release); the emulator run never retries. `ALLOWED_ORIGINS` includes web.app (not firebaseapp.com) and, for tabs opened before the move, github.io (remove in the
  cleanup step); it already lists yourpress.example/www for the shop's own domain later (`docs/FIREBASE_HOSTING.md`).
- **Old Big Cartel addresses (15 October 2026):** `firebase.json` `redirects` lists each old `/product/<name>`, `/category/<name>`
  and page address as an exact 301 to an absolute `https://yourpress.example/...` page (one hop). No `/product/**` or
  `/category/**` catch-all: an unknown old address answers 404 (Google reads a redirect to a listing as a soft 404; Hosting can't
  send 410 without a function). Add a book's old address when one turns up. `/cart` is an app route (shop with the bag open,
  `CartRoute` in `App.tsx`) with `X-Robots-Tag: noindex`, and robots.txt must not disallow it. `scripts/seo-url-check.mjs` checks
  sitemap URLs (200 + self canonical), old addresses and /cart on the live site after each deploy (report only).
  Collection pages' single `<h1>` is the category name, with an intro from the category description or Text & labels ›
  Collection & wishlist pages › `collectionIntro*` (`features/site/collectionIntro.ts`).
- **Own domain (`docs/CUSTOM_DOMAIN.md`, ready, not switched):** the switch is Firebase Hosting › Add custom domain
  (apex `yourpress.example`, www redirecting to it) + repository variable `SITE_URL=https://yourpress.example`
  + Deploy Firebase, then Deploy storefront. Both workflows lower-case `SITE_URL` first. `moveToCanonicalHost` also moves
  the www/bare twin of SITE_URL's host; `stampSiteAddress` (in the `canonicalHost` Vite plugin) rewrites index.html's
  built-in web.app address (`DEFAULT_SITE_URL`) to SITE_URL; after the switch `hosting-smoke.mjs` checks web.app and
  firebaseapp.com still forward and warns when the www twin doesn't.

**No cancelled runs (12 October 2026).** Merging PRs in quick succession used to cancel the earlier runs (red marks on `main`).
`ci.yml` now cancels only superseded *pull request* runs (group per PR number / commit on main). `deploy-pages.yml` uses one group
per run and never cancels; `firebase-first` checks whether the run's commit is still the head of `main` and, if not, finishes green
as "superseded" without building (that check is now its own `newest` job); `deploy-hosting` re-checks right before `firebase deploy` and `redirect-old-address` only runs
when it deployed. `scripts/hostingConfig.test.ts` forbids `cancel-in-progress: true`. Only the workflows' first real run proves this.
**Deploy ordering contract (October 2026).** Rules, indexes and Functions go live before the frontend that needs them.
`deploy-pages.yml`'s `firebase-first` job, on a push to `main`, lists the changed files (GitHub compare API) and, when any
path watched by `deploy-firebase.yml` changed (keep its regex identical to that workflow's `on.push.paths`), waits for the
`deploy-firebase.yml` run of the same commit and fails unless it succeeded. `build-hosting` runs alongside it (building
publishes nothing) and only `deploy-hosting` `needs` it, with `needs.firebase-first.result == 'success'` (October 2026:
saves the ~2 min backend wait on backend pushes). `build-hosting` caches Chromium and the npx firebase-tools download
(`actions/cache`); `deploy-hosting`, which holds the key, restores no cache (editing `firebase.json`, including its `hosting` block, therefore also redeploys the backend first). A failed Firebase
deploy therefore stops the frontend; fix the backend and re-run, or start the storefront by hand (`workflow_dispatch` and the schedule
skip the wait). A later push that changes no backend file is not held back by an earlier push's Firebase deploy.
`deploy-firebase.yml` pins `firebase-tools` (`FIREBASE_TOOLS_VERSION`) and no longer passes `--force`, so it never deletes
console-made indexes or functions missing from the repo (delete deliberately: edit `firestore.indexes.json`, or
`firebase functions:delete`). The one thing `--force` used to do for CI, the Artifact Registry cleanup policy, is a separate
best-effort step (`functions:artifacts:setpolicy`). **Scheduled refresh keep-alive:** GitHub disables scheduled workflows in
a public repo after 60 days without repository activity, and Studio/admin edits are not repo activity.
`keep-refresh-alive.yml` runs monthly and calls `PUT /actions/workflows/{id}/enable` (needs `actions: write`) for
`deploy-pages.yml` and itself, warning when it finds one disabled. Prerender: a book/page slug that cannot be a file name
(`scripts/routeSafety.mjs`) is skipped with a warning and left out of the sitemap instead of failing the build. The
published-content fingerprint (`publicStorefrontData.mjs`) also covers Toronto-date sale/pre-order state and approved
reviews. Workflow changes can only be verified by their first real run.
**Stale-asset safety (October 2026):** Firebase Hosting (like Pages before it) replaces the whole site per deploy, so HTML cached from the previous deploy
pointed at deleted hashed CSS/JS and rendered unstyled. `scripts/carry-previous-assets.mjs` (workflow step after the build)
writes `dist/asset-manifest.txt` (this build's `assets/` only) and copies back the files the live list names, keeping one
older generation; it only warns on failure, and refuses HTML answers (a host's 404 page) as an asset or list. The
`check-published-change.mjs` marker must be a 64-hex digest (`isFingerprint`), so an HTML page means "rebuild". `index.html`'s first inline script reloads once (per minute, sessionStorage
`lm:stale-asset-reload`) when the site's own stylesheet/script or a lazy chunk (`vite:preloadError`) fails to load.

### Release banner (removed)

The admin Overview no longer shows a "System status & recent release" card, so there is
nothing to update after a deploy. Don't re-add it unless asked.
