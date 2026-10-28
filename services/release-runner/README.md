# Release runner

Sends one release of the shop and stockroom to every shop on the platform (plan 4.1). Plain Node 22 ES modules, no
packages. Tests use pretend deploys (`fakes.js`); nothing here reaches Google from a test.

## Who gets a release

`rings.js` reads the shop registry and makes two rings:

1. **The test shop**, alone. Exactly one live row marked `testShop: true` and in test mode, or the release doesn't start.
2. **Every other live shop**, by shop id.

Rows that aren't live, whose project isn't the shop id, or that are held back (`RELEASE_HOLD_BACK`) are left out, each
with a reason printed. Before deploying to a shop, the runner checks its Google Cloud project is in the platform's
shops folder; one that isn't is refused. The owner's own original shop has no registry row and its projects are not in
that folder, so a release can never reach it.

## What a release does

`runRelease` (`runner.js`):

1. Takes the release lock in the registry. A second release stops at once.
2. **Builds once** (`builder.js`): a git worktree of the tag `release-<version>`, the shop's pages, its server code
   packages and the stockroom's pages. A failed build stops the release before anything is deployed. Only what is
   the same for every shop is built. The shop's catalogue file, sitemap and ready-made pages come from one shop's books,
   so they are left out and each shop's pages read their own books.
3. For each shop, ring by ring, holding that shop's own lock (so the shop maker can't work on it at the same time):
   - rules (stamped with the release and the shop's apps, owner filled in), then server code with the shop's own
     settings file, then pages with the shop's own profile file;
   - a check: every part's release stamp must be this release, the home page, `/admin`, `/shop-profile.js` and the
     stockroom page must answer, and on the test shop the full release check (`release-check/`) must pass;
   - on success the registry row gets `release: { version, at, runId }`.
4. **Stops at the first failure** and puts that shop back on the release it had before: its row's `release.version`,
   else the stamp read from its live rules. That release is built (or reused) and checked again. Shops after it are not
   touched. Shops before it in ring 2 passed their checks and keep the new release. A shop with no earlier release
   stops the run for a person, and so does a rollback that fails.
5. Records the run in the registry (`releases/<version>-<runId>`, each shop's status) and each shop's part in its audit
   log, pass or fail.

A shop already on the release, with its stamps and checks in order, is left alone, so a release can be re-run after a
fix. `--dry-run` prints the rings and changes nothing.

Data changes (plan 4.2) must keep working with the previous release's code, because a rollback only puts code back.

## Running it for real

Needs Julian's go-ahead and the platform project and shops folder (`docs/test-shop.md`, steps 1–2):

```
RELEASE_FOLDER=folders/<number> RELEASE_BUILD_ROOT=<folder for builds> RELEASE_INBOX=<test inbox> \
PLATFORM_SERVICE_ACCOUNT=<release check account> node services/release-runner/run.js 1.4.0 --dry-run
```

The access token comes from `gcloud auth print-access-token`; the Firebase command line uses the same signed-in
account. No key is read from a file.

## Open points

- The stockroom has no per-shop deploy settings yet (its own named database and its `<project>-stockroom` site), so
  `firebase deploy` for the stockroom needs them before a "both" or "stockroom" shop can get a release (track E).
- A stockroom-only shop's rules live in the named database, while the rules stamp is read from the default one.
  The shop maker's step 7 has the same gap.
