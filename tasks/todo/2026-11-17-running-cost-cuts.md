# Running cost cuts 1, 2 and 4 (Julian, 17 November 2026: "okay do #1,2, #4 every 15 mins")

Plan: https://claude.ai/artifact/5c5bFc5hUa8eNDtcyw8RaB

- [x] **#4 Health checks every 15 minutes** (were every 5): services/jobs/index.js, server/schedules.js test, status page
      stale limit 40 minutes, wording in checks, run book, READMEs, control room.
- [x] **#1 Catalogue file kept fresh**: services/release-runner/pageRefresh.js + run-page-refresh.js, workflow
      .github/workflows/shop-pages.yml every 15 minutes. The file's snapshot time is a label on the file
      (setup/shopSite.js), so a check reads no file. A shop is redrawn with the version it runs; failures are listed.
- [x] **#2 Lighter backups**: a shared shop copies its folder weekly (shop `ownCopyDue`, Back up now still any time);
      the platform's nightly export of the shared database runs every night and is recorded on every shared shop's row
      (services/health/nightly.js), which the backup health check already reads. Admin says "Every week … Colophon also
      backs up every night" for shared shops. Release note added.
- [x] Verify: `npm test` (2089 pass), shop vitest on functions/stockroom/lib (2265 pass), typecheck and lint clean.

## Review
- Health alerts now come after about 30 minutes of failures instead of 10 (an alert needs two failed runs).
- The page refresh uses GitHub Actions minutes; free while the repo is public. The check step is light and the build
  only runs when a shop changed.
- Restore drill is unchanged: it already restores the shared project's export.
