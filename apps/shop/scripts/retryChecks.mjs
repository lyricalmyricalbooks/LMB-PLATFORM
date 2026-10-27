// A live check made right after a Firebase Hosting release can still meet the previous version: the CDN takes from a
// few seconds to about a minute to let it go (Deploy storefront run 804 failed 3 s after its release, on pages that
// were right moments later). retryFailing runs every check once, then only the failing ones again after each wait,
// so a deploy that is still settling passes as soon as it settles and a real problem still fails at the end.

// About 3 minutes in all before giving up.
export const LIVE_RETRY_WAITS_MS = [10_000, 20_000, 30_000, 60_000, 60_000];

const pause = ms => new Promise(done => setTimeout(done, ms));

// run(items) resolves to the failures among them as [{ item, message }]. Resolves to the failures still left.
export async function retryFailing(items, run, { waits = [], sleep = pause, onRetry = () => {} } = {}) {
  let failures = await run(items);
  for (const wait of waits) {
    if (!failures.length) break;
    onRetry(failures, wait);
    await sleep(wait);
    failures = await run(failures.map(failure => failure.item));
  }
  return failures;
}
