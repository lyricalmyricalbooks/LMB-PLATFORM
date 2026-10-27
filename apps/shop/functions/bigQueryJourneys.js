// Visitor journeys for the admin Overview (createStripeCheckoutSession `action: "bigQueryJourneys"`, admin only), read
// from Google Analytics 4's free daily BigQuery export (GA › Admin › Product links › BigQuery links). The Functions' own
// service account runs ONE read-only query, like Google Analytics and Search Console (functions/googleAnalytics.js,
// functions/searchConsole.js): no key is stored. The owner gives that service account two roles once: BigQuery Data
// Viewer (read the export) and BigQuery Job User (run a query). The dataset is `analytics_<GA4 property id>` in this
// Firebase project unless admin-only adminSecrets/googleAnalytics.bigQueryDataset names `project.dataset` (or `dataset`).
// Nothing here writes to Firestore or BigQuery.
const { cleanPropertyId, fetchJson } = require("./googleAnalytics");

// jobs.query (and jobs.getQueryResults) accept the read-only BigQuery scope for a SELECT: it is the narrowest scope that
// works (jobs.insert would need `bigquery` or `cloud-platform`). The metadata server issues it to the default account.
const SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";
const API = "https://bigquery.googleapis.com/bigquery/v2/projects/";
const MAX_DAYS = 31;
/** Hard cost cap: BigQuery refuses (and bills nothing) rather than scan more. A month of a small shop's export is MBs. */
const MAX_BYTES_BILLED = String(2 * 1024 ** 3);
const QUERY_TIMEOUT_MS = 20000;
const POLL_TIMEOUT_MS = 15000;
const TOP_JOURNEYS = 25;
const TOP_EXITS = 25;
const STEPS = 4;
const DAY = 86_400_000;

// ------------------------------------------------------------------------------------------------- dataset name

// BigQuery naming rules: project ids are 6–30 lower-case letters, digits and hyphens, starting with a letter and not
// ending with a hyphen; dataset ids are letters, digits and underscores (max 1,024). Mirrored in
// src/app/admin/bigQueryJourneys.ts (src/app/admin/bigQueryJourneys.test.ts). The name is written into the SQL (BigQuery
// can't take a table name as a parameter), so this check is also what keeps the query safe.
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;

/** "project.dataset", "dataset" or "project:dataset" → { project, dataset } (project "" = this one); null when it isn't one. */
function parseDataset(value) {
  const s = String(value ?? "").trim().replace(/^`([^`]*)`$/, "$1");
  if (!s) return null;
  const parts = s.split(/[.:]/);
  if (parts.length === 1) return DATASET_RE.test(parts[0]) ? { project: "", dataset: parts[0] } : null;
  if (parts.length === 2 && PROJECT_RE.test(parts[0]) && DATASET_RE.test(parts[1])) return { project: parts[0], dataset: parts[1] };
  return null;
}

/** The saved form ("project.dataset" or "dataset"), or "" when it isn't a valid name. */
function cleanBigQueryDataset(value) {
  const p = parseDataset(value);
  return p ? (p.project ? `${p.project}.${p.dataset}` : p.dataset) : "";
}

/** Plain-English refusal for the settings box, or "" (empty is fine: the automatic name is used). */
function bigQueryDatasetProblem(value) {
  if (!String(value ?? "").trim()) return "";
  return cleanBigQueryDataset(value) ? "" : "That isn't a BigQuery dataset name. Write project.dataset (for example my-project.analytics_123456789) or just the dataset (letters, numbers and _).";
}

/** Which dataset to read: the saved one, else `analytics_<property id>`, in `fallbackProject` unless the saved one names a project. */
function resolveDataset(saved, fallbackProject) {
  const own = parseDataset(saved?.bigQueryDataset);
  const project = own?.project || String(fallbackProject || "");
  if (!PROJECT_RE.test(project)) return null;
  if (own) return { project, dataset: own.dataset };
  const propertyId = cleanPropertyId(saved?.propertyId);
  return propertyId ? { project, dataset: `analytics_${propertyId}` } : null;
}

// ------------------------------------------------------------------------------------------------- dates

const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** `{ startDate, endDate }` checked (YYYY-MM-DD, start ≤ end, at most 31 days); null when it isn't usable. */
function cleanJourneyRange(input) {
  const r = input && typeof input === "object" ? input : {};
  if (!isDay(r.startDate) || !isDay(r.endDate) || r.startDate > r.endDate) return null;
  const days = Math.round((Date.parse(`${r.endDate}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / DAY) + 1;
  if (days > MAX_DAYS) return null;
  return { startDate: r.startDate, endDate: r.endDate, days };
}

const suffixOf = day => day.replace(/-/g, "");

// ------------------------------------------------------------------------------------------------- the query

/**
 * One standard-SQL query over the export's daily tables (`events_YYYYMMDD`; the intraday tables are left out). Visits
 * are keyed by user_pseudo_id + ga_session_id. Page paths come from page_location with the scheme, host, query string
 * and fragment cut off in SQL (no email addresses or order keys from emailed links ever leave BigQuery), trailing
 * slashes dropped, and a page reloaded straight after itself counted once. Returns rows of `kind`:
 *  - "journey": `steps` = the visit's first 4 pages joined by "\n" (2+ pages), with visits and purchases;
 *  - "exit": the last page of each visit, with visits and how many put something in the bag;
 *  - "total": all visits, and one-page visits in `had_bag`'s place (`one_page`).
 */
function buildQuery({ project, dataset }) {
  if (!PROJECT_RE.test(project) || !DATASET_RE.test(dataset)) throw new Error("Bad dataset");
  const table = `\`${project}.${dataset}.events_*\``;
  const path = `CASE WHEN loc IS NULL THEN '(not set)' ELSE SUBSTR(COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(
      REGEXP_EXTRACT(loc, r'(?i)^[a-z][a-z0-9+.-]*://[^/?#]*([^?#]*)'), REGEXP_EXTRACT(loc, r'^([^?#]*)'), ''),
      r'(.)/+$', r'\\1'), ''), '/'), 1, 300) END`;
  return `
WITH raw AS (
  SELECT user_pseudo_id AS uid,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sid,
    event_name, event_timestamp AS ts,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS loc
  FROM ${table}
  WHERE _TABLE_SUFFIX BETWEEN @start_day AND @end_day
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND event_name IN ('page_view', 'add_to_cart', 'purchase')
),
views AS (
  SELECT uid, sid, ts, ${path} AS path
  FROM raw WHERE event_name = 'page_view' AND uid IS NOT NULL AND sid IS NOT NULL
),
deduped AS (
  SELECT uid, sid, ts, path FROM (
    SELECT *, LAG(path) OVER (PARTITION BY uid, sid ORDER BY ts) AS prev FROM views
  ) WHERE prev IS NULL OR prev != path
),
visits AS (
  SELECT uid, sid, ARRAY_AGG(path ORDER BY ts) AS pages FROM deduped GROUP BY uid, sid
),
flags AS (
  SELECT uid, sid, LOGICAL_OR(event_name = 'purchase') AS bought, LOGICAL_OR(event_name = 'add_to_cart') AS bagged
  FROM raw WHERE uid IS NOT NULL AND sid IS NOT NULL GROUP BY uid, sid
),
joined AS (
  SELECT v.pages, ARRAY_LENGTH(v.pages) AS n, COALESCE(f.bought, FALSE) AS bought, COALESCE(f.bagged, FALSE) AS bagged
  FROM visits v LEFT JOIN flags f USING (uid, sid)
  WHERE ARRAY_LENGTH(v.pages) > 0
)
(SELECT 'journey' AS kind, steps, COUNT(*) AS sessions, COUNTIF(bought) AS purchases, 0 AS had_bag
  FROM (
    SELECT ARRAY_TO_STRING(ARRAY(SELECT p FROM UNNEST(pages) AS p WITH OFFSET o WHERE o < ${STEPS} ORDER BY o), '\\n') AS steps, bought
    FROM joined WHERE n >= 2
  ) GROUP BY steps ORDER BY sessions DESC, steps LIMIT ${TOP_JOURNEYS})
UNION ALL
(SELECT 'exit' AS kind, steps, COUNT(*) AS sessions, COUNTIF(bought) AS purchases, COUNTIF(bagged) AS had_bag
  FROM (SELECT pages[ORDINAL(n)] AS steps, bought, bagged FROM joined)
  GROUP BY steps ORDER BY sessions DESC, steps LIMIT ${TOP_EXITS})
UNION ALL
(SELECT 'total' AS kind, '' AS steps, COUNT(*) AS sessions, COUNTIF(bought) AS purchases, COUNTIF(n = 1) AS had_bag FROM joined)
`;
}

/** The jobs.query request body: parameterised dates (never written into the SQL), capped bytes, read only. */
function queryRequest(sql, range, { dryRun = false } = {}) {
  return {
    query: sql,
    useLegacySql: false,
    parameterMode: "NAMED",
    queryParameters: [
      { name: "start_day", parameterType: { type: "STRING" }, parameterValue: { value: suffixOf(range.startDate) } },
      { name: "end_day", parameterType: { type: "STRING" }, parameterValue: { value: suffixOf(range.endDate) } },
    ],
    timeoutMs: QUERY_TIMEOUT_MS,
    maximumBytesBilled: MAX_BYTES_BILLED,
    useQueryCache: true,
    ...(dryRun ? { dryRun: true } : {}),
  };
}

// ------------------------------------------------------------------------------------------------- the answer

const int = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };

/** BigQuery's `{ schema, rows: [{ f: [{ v }] }] }` → plain objects keyed by column name. */
function rowsOf(body) {
  const names = (body?.schema?.fields || []).map(f => String(f.name));
  return (Array.isArray(body?.rows) ? body.rows : []).map(row => {
    const out = {};
    names.forEach((n, i) => { out[n] = row?.f?.[i]?.v ?? null; });
    return out;
  });
}

/** Query rows → what the Overview draws. */
function shapeJourneys(body) {
  const rows = rowsOf(body);
  const journeys = rows.filter(r => r.kind === "journey" && r.steps)
    .map(r => ({ steps: String(r.steps).split("\n").filter(Boolean), sessions: int(r.sessions), purchases: int(r.purchases) }))
    .filter(j => j.steps.length >= 2 && j.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const exits = rows.filter(r => r.kind === "exit" && r.steps)
    .map(r => ({ path: String(r.steps), sessions: int(r.sessions), hadBag: int(r.had_bag), purchases: int(r.purchases) }))
    .filter(e => e.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const total = rows.find(r => r.kind === "total");
  return {
    journeys, exits,
    totals: { sessions: int(total?.sessions), onePage: int(total?.had_bag), purchases: int(total?.purchases) },
    bytesProcessed: int(body?.totalBytesProcessed),
    cacheHit: body?.cacheHit === true,
  };
}

/** A BigQuery error → a fixed sentence for the owner (Google's own text never reaches the browser). */
function bqErrorMessage(status, body, serviceAccount, where) {
  const msg = String(body?.error?.message || "");
  const reasons = (body?.error?.errors || []).map(e => String(e?.reason || ""));
  const all = `${msg} ${reasons.join(" ")} ${JSON.stringify(body?.error?.details || "")}`;
  const who = serviceAccount || "the shop's service account";
  if (/SERVICE_DISABLED|has not been used in project|accessNotConfigured|is disabled/i.test(all)) {
    return { code: "api_disabled", error: "The BigQuery API is switched off for this Firebase project. Open the link below, press Enable, wait a minute and check again." };
  }
  if (reasons.includes("bytesBilledLimitExceeded") || /bytes billed/i.test(msg)) {
    return { code: "too_big", error: "This period would read more of the BigQuery export than the shop allows (2 GB), so nothing was read or charged. Pick a shorter period." };
  }
  if (status === 404 || reasons.includes("notFound") || /does not match any table|not found/i.test(msg)) {
    return { code: "not_linked", error: `No Google Analytics export was found in BigQuery${where ? ` (${where})` : ""}. Link BigQuery in Google Analytics › Admin › Product links › BigQuery links with a daily export; the first day's tables appear about a day later. If the export lives in another dataset, name it in Settings › General › Google Analytics.` };
  }
  if (status === 403 && (reasons.some(r => /quota|rateLimit/i.test(r)) || /quota|rate limit/i.test(msg))) {
    return { code: "quota", error: "BigQuery is busy (quota reached). Try again in an hour." };
  }
  if (status === 403 || reasons.includes("accessDenied") || /permission|denied/i.test(msg)) {
    return { code: "no_access", error: `BigQuery hasn't given the shop access yet. In Google Cloud › IAM, give ${who} the roles BigQuery Data Viewer and BigQuery Job User.` };
  }
  if (status === 429 || reasons.some(r => /quota|rateLimit/i.test(r))) return { code: "quota", error: "BigQuery is busy (quota reached). Try again in an hour." };
  if (status === 400) return { code: "bad_request", error: "BigQuery refused the request. Check the dataset name in Settings › General › Google Analytics." };
  return { code: "unavailable", error: "BigQuery couldn't be reached just now. Try again in a minute." };
}

/**
 * The admin action. deps: `readSettings()` → { propertyId, bigQueryDataset }, `allow()` → rate limit, `credentials()` →
 * { accessToken, email }, `fetchImpl`, `projectId` (where the query job runs and, by default, the dataset lives).
 * op "status" dry-runs the query over the last 7 days (costs nothing) to check the link and the roles; op "report"
 * (default) needs `{ startDate, endDate }` spanning at most 31 days.
 */
async function handleBigQueryJourneys(body, deps) {
  const op = body?.op === "status" ? "status" : "report";
  let range;
  if (op === "report") {
    range = cleanJourneyRange(body);
    if (!range) return { status: 400, body: { error: `Pick a period of at most ${MAX_DAYS} days.` } };
  } else {
    const end = new Date(deps.now ? deps.now() : Date.now()).toISOString().slice(0, 10);
    range = { startDate: new Date(Date.parse(`${end}T00:00:00Z`) - 6 * DAY).toISOString().slice(0, 10), endDate: end, days: 7 };
  }
  if (!(await deps.allow())) return { status: 429, body: { error: "Too many BigQuery requests. Wait a few minutes." } };
  const saved = (await deps.readSettings()) || {};
  const jobProject = String(deps.projectId || "");
  const target = resolveDataset(saved, jobProject);
  const enableApiUrl = `https://console.cloud.google.com/apis/library/bigquery.googleapis.com?project=${encodeURIComponent(jobProject)}`;
  if (!target) {
    return { status: 200, body: { connected: false, enableApiUrl, code: "no_property", error: "Add your GA4 property ID (or the BigQuery export dataset) in Settings › General › Google Analytics first." } };
  }
  const where = `${target.project}.${target.dataset}`;
  let creds = { accessToken: "", email: "" };
  try { creds = await deps.credentials(); } catch {
    return { status: 200, body: { connected: false, dataset: where, enableApiUrl, code: "no_token", error: "The shop's server couldn't get a Google sign-in. This works only on the deployed Functions, not locally." } };
  }
  const base = { serviceAccount: creds.email, dataset: where, enableApiUrl };
  const headers = { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" };
  const fail = res => ({ status: 200, body: { ...base, connected: false, ...bqErrorMessage(res.status, res.body, creds.email, where) } });
  const unreachable = { ok: false, status: 0, body: null };

  const sql = buildQuery(target);
  const url = `${API}${encodeURIComponent(jobProject)}/queries`;
  const first = await fetchJson(deps.fetchImpl, url, { method: "POST", headers, body: JSON.stringify(queryRequest(sql, range, { dryRun: op === "status" })) })
    .catch(() => unreachable);
  if (!first.ok) return fail(first);
  if (op === "status") {
    return { status: 200, body: { ...base, connected: true, bytesEstimate: int(first.body?.totalBytesProcessed) } };
  }

  let answer = first.body || {};
  if (answer.jobComplete === false && answer.jobReference?.jobId) {
    // Still running after the first wait: ask once more for the finished results, then give up politely.
    const ref = answer.jobReference;
    const params = new URLSearchParams({ timeoutMs: String(POLL_TIMEOUT_MS), ...(ref.location ? { location: String(ref.location) } : {}) });
    const poll = await fetchJson(deps.fetchImpl, `${API}${encodeURIComponent(ref.projectId || jobProject)}/queries/${encodeURIComponent(ref.jobId)}?${params}`, { headers })
      .catch(() => unreachable);
    if (!poll.ok) return fail(poll);
    answer = { ...poll.body, totalBytesProcessed: poll.body?.totalBytesProcessed ?? answer.totalBytesProcessed, cacheHit: answer.cacheHit };
    if (answer.jobComplete === false) {
      return { status: 200, body: { ...base, connected: true, code: "still_running", error: "BigQuery is still working on this period. Try again in a minute." } };
    }
  }
  return { status: 200, body: { ...base, connected: true, range: { startDate: range.startDate, endDate: range.endDate }, ...shapeJourneys(answer) } };
}

module.exports = {
  SCOPE, MAX_DAYS, MAX_BYTES_BILLED, parseDataset, cleanBigQueryDataset, bigQueryDatasetProblem, resolveDataset, cleanJourneyRange,
  buildQuery, queryRequest, rowsOf, shapeJourneys, bqErrorMessage, handleBigQueryJourneys,
};
