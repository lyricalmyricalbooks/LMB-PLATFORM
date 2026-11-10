// Which shops a release reaches, and in what order (plan 4.1).
//
// Ring 1 is the platform's test shop alone; ring 2 is every other live shop on the platform, by shop id. The list comes
// only from the shop registry, so a shop the platform didn't make is never in it: the owner's own original shop is not
// on the platform and has no registry row. The runner checks each shop's project is in the platform's shops folder
// before it deploys anything to it, too.

/**
 * Why a registry row isn't a live shop the platform looks after (health checks, backups, team sync), in plain words, or
 * null when it is one. A shop in the shared system (`shared: true`, docs/shared-system.md) lives in the shared
 * project, so its project id is that project's, not its shop id.
 */
export function notLive(row, { exclude = [] } = {}) {
  if (!row?.shopId) return "the row has no shop id";
  if (exclude.includes(row.shopId)) return "held back for this release";
  if (row.status !== "live") return `not live (${row.status ?? "no status"}); the shop maker finishes it first`;
  // Its row stays "live" after the closing sweep deletes the project (services/billing/closing.js): a deploy there
  // fails, and would stop the release for every shop after it. A closed shop still gets releases: it can open again.
  if (row.closing?.stage === "deleted") return "deleted when its plan ended; there is nothing left to send to";
  if (row.shared !== true && row.projectId && row.projectId !== row.shopId) return `its project ${row.projectId} isn't the shop id; a person looks at it`;
  if (row.testShop === true && row.testMode !== true) return "a test shop that isn't in test mode; a person looks at it";
  return null;
}

/**
 * Why a registry row is left out of a per-project release, in plain words, or null when it is in. A shop in the shared
 * system has no project of its own to deploy to: it gets the shared project's release.
 */
export function leftOut(row, options = {}) {
  return notLive(row, options) ?? (row.shared === true ? "in the shared system: it gets the shared project's release" : null);
}

/**
 * `planRings(rows, { exclude })` -> `{ rings: [[testShop], [others…]], skipped: [{ shopId, reason }], problem? }`.
 * With no live test shop, or more than one, `problem` says why the release can't start.
 */
export function planRings(rows, { exclude = [] } = {}) {
  const skipped = [];
  const live = [];
  for (const row of rows) {
    const reason = leftOut(row, { exclude });
    if (reason) skipped.push({ shopId: row?.shopId ?? null, reason });
    else live.push(row);
  }
  const tests = live.filter((row) => row.testShop === true);
  const others = live.filter((row) => row.testShop !== true).sort((a, b) => a.shopId.localeCompare(b.shopId));
  if (tests.length !== 1) {
    const problem = tests.length
      ? `the registry has ${tests.length} live test shops (${tests.map((row) => row.shopId).join(", ")}); a release needs exactly one`
      : "the registry has no live test shop, so the release has nowhere to be tried first";
    return { rings: [], skipped, problem };
  }
  return { rings: [tests, others], skipped };
}
