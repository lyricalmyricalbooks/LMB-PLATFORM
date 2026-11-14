// Prints what the platform's health checks last said about each test shop, and each one's last backup attempts, from
// the shop registry. "Make the test shop" runs it last (.github/workflows/test-shop.yml), so a red line in the control
// room can be read, with its cause, in the run's log. Only reads.
//
//   node setup/test-shop-health.js
import { pathToFileURL } from "node:url";
import { TEST_SHOPS } from "./testShopPlace.js";

/** The lines for one shop: its failing checks (or "all passing") and its newest backup attempts. */
export function healthLines(shopId, row, events = []) {
  const checks = row?.health?.checks;
  if (!checks) return [`${shopId}: no health check has run yet.`];
  const failing = Object.entries(checks).filter(([, state]) => state && state.ok === false);
  const lines = [failing.length
    ? `${shopId}, checked ${row.health.checkedAt ?? "?"}: ${failing.map(([name, state]) => `${name}: ${state.detail ?? "failing"}`).join(" | ")}`
    : `${shopId}, checked ${row.health.checkedAt ?? "?"}: every check passes.`];
  for (const event of events.filter((e) => e.kind === "backup").slice(0, 4)) {
    lines.push(`  backup of ${event.database} at ${event.at}: ${event.ok ? "done" : `failed: ${event.error}`}`);
  }
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { firestoreClient } = await import("../clients/firestore.js");
  const { gcloudToken } = await import("../release-check/run.js");
  const { PLATFORM_PROJECT } = await import("./real.js");
  const platform = firestoreClient({ fetch: globalThis.fetch, token: gcloudToken, projectId: PLATFORM_PROJECT });
  for (const { shopId } of TEST_SHOPS) {
    const row = await platform.get(`shops/${shopId}`);
    const events = (await platform.query(`shops/${shopId}/events`, { orderBy: [["at", "desc"]], limit: 30 })).map((found) => found.data);
    for (const line of healthLines(shopId, row, events)) console.log(line);
  }
}
