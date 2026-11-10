// One line per piece of work the shared server does for a shop (LMB-PLATFORM docs/shared-system.md, the per-shop cost
// meters). Cloud Logging reads a JSON line on stdout as a structured entry; the platform's log-based metrics
// (LMB-PLATFORM server/setup-usage-metrics.js) count these lines by shop, so each shop's month of server time and web traffic
// is known without a database write per request.
//
//   { shopUsage: { shop, kind: "request" | "event" | "tick", ms } }   server work, timed
//   { shopUsage: { shop, kind: "page", bytes } }                       a front door answer, by size
//
// No shopper's details go in a line: only the shop's id, what kind of work it was and how much.

const USAGE_KEY = "shopUsage";

/** Writes one usage line. `out` is the line writer (console.log; tests pass their own). */
function usageLine(entry, out = console.log) {
  out(JSON.stringify({ severity: "INFO", message: "shop usage", [USAGE_KEY]: entry }));
}

/** Runs fn, then writes how long it took for the shop, whether it worked or threw. */
async function timed(shopId, kind, fn, { usage = usageLine, now = () => Date.now() } = {}) {
  const start = now();
  try {
    return await fn();
  } finally {
    try { usage({ shop: shopId, kind, ms: Math.max(0, now() - start) }); } catch { /* a usage line never breaks the work */ }
  }
}

module.exports = { USAGE_KEY, usageLine, timed };
