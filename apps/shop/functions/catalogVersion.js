// settings/catalogVersion: when the shop's public catalog last changed (October 2026).
//
// The storefront reads its books, settings and pages from a file the site build saves on Hosting
// (scripts/storefrontDataFile.mjs) instead of Firestore, but only while this marker is not newer than the file's
// Firestore snapshot (features/site/storefrontDataFile.ts). Every write to books/{id}, pages/{id}, settings/website or
// shipping-profiles/{id} sets `changedAt` to the server time of the marker write. That runs after the change committed, so it is always at
// or after the change, and later marker writes always carry later times, so no transaction is needed (many book
// writes at once never contend). After any change shoppers read Firestore until the next build replaces the file.
//
// The triggers can't use the platform's retry setting (deploying it needs `firebase deploy --force`, which the deploy
// workflow deliberately never passes), so a failed write is retried here a few times. If every try fails, the
// 15-minute storefront refresh still rebuilds the file, because the change also changes the published fingerprint
// (shipping profiles aren't in it: scripts/check-published-change.mjs compares the file's profiles directly).
"use strict";

const MARKER = ["settings", "catalogVersion"];

/**
 * Whether a write to books/{id} or pages/{id} can change the file, which holds only published books and pages.
 * A write where neither the old nor the new version is published (a draft or archived item, before and after)
 * leaves the file exactly as it was, so it must not mark the file out of date: nothing published changed, so the
 * 15-minute refresh would have no reason to rebuild it.
 */
function touchesCatalogFile(before, after) {
  const published = data => !!data && data.status === "published";
  return published(before) || published(after);
}
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function bumpCatalogVersion(db, FieldValue, source, { delays = RETRY_DELAYS_MS, sleep = wait } = {}) {
  const write = () => db.collection(MARKER[0]).doc(MARKER[1]).set({
    changedAt: FieldValue.serverTimestamp(),
    source: String(source || "").slice(0, 120),
  });
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }
}

module.exports = { bumpCatalogVersion, touchesCatalogFile, MARKER, RETRY_DELAYS_MS };
