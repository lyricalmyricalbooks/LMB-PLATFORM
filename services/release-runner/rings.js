// Which shops a release reaches, and in what order (plan 4.1).
//
// Ring 1 is the platform's test shop alone; ring 2 is every other live shop on the platform, by shop id. The list comes
// only from the shop registry, so a shop the platform didn't make is never in it: the owner's own original shop is not
// on the platform and has no registry row. The runner checks each shop's project is in the platform's shops folder
// before it deploys anything to it, too.

/** Why a registry row is left out of the release, in plain words, or null when it is in. */
export function leftOut(row, { exclude = [] } = {}) {
  if (!row?.shopId) return "the row has no shop id";
  if (exclude.includes(row.shopId)) return "held back for this release";
  if (row.status !== "live") return `not live (${row.status ?? "no status"}); the shop maker finishes it first`;
  if (row.projectId && row.projectId !== row.shopId) return `its project ${row.projectId} isn't the shop id; a person looks at it`;
  if (row.testShop === true && row.testMode !== true) return "a test shop that isn't in test mode; a person looks at it";
  return null;
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
