// The two log-based metrics the usage meters read (services/usage, docs/shared-system.md), made once in the shared
// project and kept as written here. They count the shared server's usage lines (apps/shop/functions/usageLog.js) by
// shop, so Cloud Monitoring can say each shop's month of server time and web traffic in one read.
//
//   node server/setup-usage-metrics.js <shared project>            # the plan: reads Google, changes nothing
//   node server/setup-usage-metrics.js <shared project> --apply    # makes or updates them
//
// Safe to run any number of times: each metric is read first, then made, brought up to date or left alone.
import { pathToFileURL } from "node:url";
import { googleHttp, isNotFound } from "../clients/http.js";
import { USAGE_METRICS } from "../services/usage/sources.js";

const LOGGING = "https://logging.googleapis.com/v2";
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export { USAGE_METRICS };

const distribution = ({ name, description, filter, value, unit }) => ({
  name,
  description,
  filter,
  metricDescriptor: { metricKind: "DELTA", valueType: "DISTRIBUTION", unit, labels: [{ key: "shop", valueType: "STRING", description: "The shop's id" }] },
  valueExtractor: `EXTRACT(${value})`,
  labelExtractors: { shop: "EXTRACT(jsonPayload.shopUsage.shop)" },
  bucketOptions: { exponentialBuckets: { numFiniteBuckets: 64, growthFactor: 2, scale: 1 } },
});

/** The metrics, as the Logging API takes them. */
export const METRIC_DEFINITIONS = Object.freeze([
  distribution({
    name: USAGE_METRICS.work,
    description: "The shared server's time for each shop, from its usage lines (one per request, change or tick).",
    filter: 'jsonPayload.shopUsage.kind=("request" OR "event" OR "tick")',
    value: "jsonPayload.shopUsage.ms",
    unit: "ms",
  }),
  distribution({
    name: USAGE_METRICS.pages,
    description: "The front door's answers for each shop, by size.",
    filter: 'jsonPayload.shopUsage.kind="page"',
    value: "jsonPayload.shopUsage.bytes",
    unit: "By",
  }),
]);

const FIELDS = ["description", "filter", "metricDescriptor", "valueExtractor", "labelExtractors", "bucketOptions"];
const same = (want, have) => FIELDS.every((field) => JSON.stringify(pick(want[field])) === JSON.stringify(pick(have?.[field])));
// Google adds fields of its own to the descriptor (its type, name, display name); only the ones written here count.
function pick(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Array.isArray(value) ? value.map(pick) : value;
  const { type: _t, name: _n, displayName: _d, ...rest } = value;
  return Object.fromEntries(Object.keys(rest).sort().map((key) => [key, pick(rest[key])]));
}

export async function ensureUsageMetrics({ fetch, token, project, apply = false, print = console.log }) {
  if (!PROJECT.test(project ?? "")) throw new Error(`"${project}" isn't a project id`);
  const call = googleHttp({ fetch, token });
  const done = [];
  for (const want of METRIC_DEFINITIONS) {
    const url = `${LOGGING}/projects/${project}/metrics/${want.name}`;
    let have = null;
    try {
      have = await call("GET", url);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const does = !have ? "create" : same(want, have) ? "keep" : "update";
    print(`${want.name}: ${does}`);
    if (apply && does === "create") await call("POST", `${LOGGING}/projects/${project}/metrics`, { body: want });
    if (apply && does === "update") await call("PUT", url, { body: want });
    done.push({ metric: want.name, does });
  }
  return done;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { gcloudToken } = await import("../release-check/run.js");
  try {
    const project = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
    await ensureUsageMetrics({ fetch: globalThis.fetch, token: gcloudToken, project, apply: process.argv.includes("--apply") });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
