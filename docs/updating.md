# Updating the platform

How a change reaches the test shop and then real shops, in three steps. Nothing needs a tag, a version number or a
command typed by hand.

## 1. Merge

A pull request is checked (every test, the shop and stockroom in a real browser, on Linux and Windows) and merged when
all checks pass. Merging puts the platform's own pages live (`deploy.yml`, "Deploy the platform").

## 2. The test shop updates itself

Every merge goes to the test shop, https://lmb-test-shop.web.app, by itself ("Update the test shop",
`update-test-shop.yml`). It takes about 10 minutes. The run's summary page says, in plain words, which version the test
shop now runs and whether it passed the release check: a test purchase, the stockroom, the admin and a refund.

- A merge that only changes docs is skipped.
- Several merges close together: only the newest one is sent.
- A broken update (a part didn't update, a page doesn't answer) puts the test shop back on the version before, by itself.
- When only the release check fails, the test shop keeps the new version so it can be looked at, the run is red, and
  that version can't go to real shops.

Each version names its commit (`1.2.<run>-g<commit>`), so any version can be built again or gone back to.

## 3. Send the update to shops

On GitHub: Actions, "Send the update to shops", Run workflow, Run workflow. Leave the box empty: it sends the version the
test shop runs now. The test shop goes first and must pass the release check again; only then do real shops get it. If
a real project's check fails, it goes back to the version it had by itself, and the run says so.

Tick "Only say what it would do" for a look first, which changes nothing.

## Going back

- **Test shop:** revert the pull request on GitHub (its Revert button, then merge the revert). The test shop updates
  itself to the reverted main.
- **Real shops:** run "Send the update to shops" with an earlier version typed in the box (copy it from that merge's
  "Update the test shop" run). It goes through the same checks, test shop first.
- **Stop everything:** the control room's Pause releases stops any update before its next step.

## Safeguards

- Real shops only ever get a version that passed the release check on the test shop in the same run.
- One update at a time (a lock); a second one waits up to an hour for the first to finish.
- Only this repository's main branch can sign in to Google to deploy; there is no key anywhere in the repository.
- The rare jobs (readying a new shared project, the restore drill) stay in "Shared system"; "Make the test shop" makes
  the test shop from nothing once.
