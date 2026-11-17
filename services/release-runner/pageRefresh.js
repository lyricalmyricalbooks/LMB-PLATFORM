// Each shared shop's pages drawn again soon after its catalogue changes (Julian, 17 November 2026: running cost cut 1).
//
// Shoppers' pages read a shop's whole catalogue from one file, storefront-data.json in its site folder
// (apps/shop/src/app/features/site/storefrontDataFile.ts), but only while the shop's marker settings/catalogVersion
// (stamped by the shared server after every change to a published book, page, the website settings or a shipping
// profile) is not newer than the file's snapshot (`readTime`). After any change every shopper's page reads each book from
// the database instead, one record at a time, until the file is drawn again. A release draws every shop again; this
// draws again only the shops that changed since, every 15 minutes (.github/workflows/shop-pages.yml), so the file is
// stale for minutes, not until the next release. The pages search engines see, the sitemap and the feeds come along.
//
// `stalePages(row, { readMarker, readLabels })`: why one shop needs drawing again, or null. The file's snapshot time is
// a label on the file (setup/shopSite.js publishShopSite), read without fetching the file.
// `refreshShopPages(...)`: the shops that changed, drawn again with the version each one runs, one at a time. A shop
// whose pages fail keeps its last good ones and is listed; it is tried again next time. Safe to run any number of times.

/** At most this many shops are drawn in one run; the rest wait for the next run, so one run never takes too long. */
export const MAX_PER_RUN = 25;

/**
 * A Firestore time as text that sorts: "2026-11-17T01:02:03.123456789". Takes an RFC 3339 UTC time with any number of
 * fraction digits up to nine (the marker as Firestore's REST API gives it, or the file's readTime); null otherwise.
 */
export function timeKey(value) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(String(value ?? ""));
  return m ? `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}` : null;
}

/** The shops whose pages the platform draws: live shared shops in the given projects, never one being deleted. */
export function drawnShops(rows, projectIds) {
  const projects = new Set(projectIds);
  return (rows ?? [])
    .filter((row) => row?.shared === true && row.status === "live" && row.closing?.stage !== "deleted" && projects.has(row.projectId))
    .sort((a, b) => a.shopId.localeCompare(b.shopId));
}

/**
 * Why the shop's pages need drawing again, or null when they are up to date.
 * - `readMarker(row)`: the shop's settings/catalogVersion `changedAt`, or null when the shop never changed its catalogue.
 * - `readLabels(row)`: the labels on the shop's published catalogue file, or null when it has no file yet.
 */
export async function stalePages(row, { readMarker, readLabels }) {
  const marker = timeKey(await readMarker(row));
  // Never changed (a brand-new shop): there is nothing newer to draw, as before.
  if (!marker) return null;
  const labels = await readLabels(row);
  if (!labels) return "it has no catalogue file yet";
  const drawn = timeKey(labels.readTime);
  if (!drawn) return "its catalogue file doesn't say when it was drawn";
  return marker > drawn ? "its catalogue changed since its pages were drawn" : null;
}

/**
 * The run. `registry.listShops()`; `projectIds` the shared projects whose shops it looks at; `publishShop(row, version)`
 * draws one shop with the build of `version` (setup/shopSite.js buildAndPublish). A shop is drawn with the version its
 * pages last had (`row.release.version`); one that never had a release is left to its first one.
 * `listOnly` changes nothing and answers which shops would be drawn. Returns { checked, stale: [{ shopId, why }],
 * drawn: [shopId], failed: [{ shopId, error }], later: [shopId] }.
 */
export async function refreshShopPages({ registry, projectIds, readMarker, readLabels, publishShop, listOnly = false, max = MAX_PER_RUN, print = () => {} }) {
  const rows = drawnShops(await registry.listShops(), projectIds);
  const stale = [];
  const failed = [];
  for (const row of rows) {
    try {
      const why = await stalePages(row, { readMarker, readLabels });
      if (why && !row.release?.version) print(`${row.shopId}: ${why}, but it has had no release yet; its first one draws it.`);
      else if (why) stale.push({ row, why });
    } catch (error) {
      failed.push({ shopId: row.shopId, error: `couldn't check it: ${message(error)}` });
    }
  }
  const now = stale.slice(0, max);
  const later = stale.slice(max).map(({ row }) => row.shopId);
  const drawn = [];
  if (!listOnly) {
    for (const { row, why } of now) {
      print(`${row.shopId}: ${why}; drawing its pages again (${row.release.version}).`);
      try {
        await publishShop(row, row.release.version);
        drawn.push(row.shopId);
      } catch (error) {
        print(`${row.shopId}: its pages weren't drawn again (${message(error)}); its last good pages stay.`);
        failed.push({ shopId: row.shopId, error: message(error) });
      }
    }
  }
  if (later.length) print(`${later.length} more shop(s) wait for the next run.`);
  return { checked: rows.length, stale: stale.map(({ row, why }) => ({ shopId: row.shopId, why })), drawn, failed, later };
}

const message = (error) => (error instanceof Error ? error.message : String(error));
