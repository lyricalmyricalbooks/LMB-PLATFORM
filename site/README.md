# site/

The platform's live web site, https://lmb-platform-prod.web.app, put live by GitHub on every merge to main
(`.github/workflows/deploy.yml`, also "Run workflow" on the Actions tab).

- `build.js` builds it from the pages' own folders into `site/out`: the front page (`waitlist/`, at `/` and `/waitlist/`),
  the front door (`/join/`), sign-up, account and Plan & billing, help, terms, trust, status, the control room
  (`/control/`) and setup mode (`/app/`, `pnpm run build:setup` in `apps/shop`). Only files a page loads are copied;
  a page that reaches a server file stops the build. `--api` sends `/api/**` to the server and turns on the pages'
  plans and sign-up links; the deploy adds it only once the server (`server/`) is live.
- `check-live.js` opens every page on the live site after a deploy and fails the run if one is missing.
- `github-access.sh` lets GitHub deploy, once (below).

Check it: `npm test` (`build.test.js`). Build it yourself: `node site/build.js`, then from `site/out`,
`npx firebase-tools@15.32.1 deploy --only hosting,firestore:rules --project lmb-platform-prod`.

## What each deploy does

1. Every platform test passes, and setup mode is built.
2. When the server's six keys are in Google's safe and the repository variable `SERVER_SETTINGS` holds
   `server/env.example.yaml`'s lines with real values, the server goes live (`server/deploy.js --apply`, then the
   schedules). Until then the run's summary says what it is waiting on, and the pages go live without it.
3. The pages and the platform's database rules (`waitlist/firestore.rules`) go live.
4. `check-live.js` checks every page.

## Let GitHub deploy (once)

GitHub signs in to Google with its own short-lived identity: no key or password is stored anywhere. Only this
repository's main branch can use the `github-deploy` account, and only in `lmb-platform-prod`.

1. Open Cloud Shell for the platform project, signed in as its owner:
   https://shell.cloud.google.com/?project=lmb-platform-prod&show=terminal
2. Paste this line and press Enter:
   `curl -fsSL https://raw.githubusercontent.com/lyricalmyricalbooks/LMB-PLATFORM/main/site/github-access.sh | bash`
3. When it says Done, the next merge (or Run workflow) deploys.

The pages need no billing on the project. The server (Cloud Run, Cloud Build, Secret Manager, Cloud Scheduler) does:
without a billing account the script leaves those off and says so; add billing and run it again for the server's part.
Safe to run again. It also makes the server's two link phrases (`trial-tips-secret`, `checkup-secret`) as random values,
and gives Cloud Build the roles `server/README.md` mentions.
