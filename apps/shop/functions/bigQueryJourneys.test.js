import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  SCOPE, parseDataset, cleanBigQueryDataset, bigQueryDatasetProblem, resolveDataset, cleanJourneyRange, buildQuery, queryRequest,
  shapeJourneys, bqErrorMessage, handleBigQueryJourneys,
} = require("./bigQueryJourneys");

const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const SCHEMA = { fields: ["kind", "steps", "sessions", "purchases", "had_bag"].map(name => ({ name })) };
const row = (...v) => ({ f: v.map(x => ({ v: x === null ? null : String(x) })) });
const RESULT = {
  jobComplete: true, totalBytesProcessed: "52428800", cacheHit: false, schema: SCHEMA,
  rows: [
    row("journey", "/\n/books/salt\n/page/about\n/cart", 12, 3, 0),
    row("journey", "/\n/books/salt", 40, 5, 0),
    row("exit", "/books/salt", 30, 2, 9),
    row("exit", "/", 55, 0, 4),
    row("total", "", 140, 8, 70),
  ],
};

function deps(overrides = {}) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => { calls.push({ url, init }); return reply(200, RESULT); });
  return {
    calls,
    deps: {
      allow: async () => true,
      readSettings: async () => ({ propertyId: "123456789" }),
      credentials: async () => ({ accessToken: "tok", email: "shop@lmb-test-shop.iam.gserviceaccount.com" }),
      fetchImpl, projectId: "lmb-test-shop", now: () => Date.parse("2026-10-20T12:00:00Z"),
      ...overrides,
    },
  };
}

describe("BigQuery dataset name", () => {
  it("accepts project.dataset, project:dataset and a bare dataset", () => {
    expect(parseDataset("my-project.analytics_123456789")).toEqual({ project: "my-project", dataset: "analytics_123456789" });
    expect(cleanBigQueryDataset(" my-project:analytics_1 ")).toBe("my-project.analytics_1");
    expect(cleanBigQueryDataset("analytics_123456789")).toBe("analytics_123456789");
    expect(cleanBigQueryDataset("`my-project.ga`")).toBe("my-project.ga");
  });
  it("refuses anything that could change the SQL or isn't a BigQuery name", () => {
    for (const bad of ["a.b.c", "Proj.ds", "my-project.ds-x", "x.ds", "my-project-.ds", "ds; DROP", "ds`", "my project.ds", "1abcde.ds"]) {
      expect(cleanBigQueryDataset(bad), bad).toBe("");
      expect(bigQueryDatasetProblem(bad), bad).toMatch(/isn't a BigQuery dataset/);
    }
    expect(bigQueryDatasetProblem("")).toBe("");
  });
  it("defaults to analytics_<property id> in the Functions' project", () => {
    expect(resolveDataset({ propertyId: "properties/123456789" }, "lmb-test-shop")).toEqual({ project: "lmb-test-shop", dataset: "analytics_123456789" });
    expect(resolveDataset({ propertyId: "123456789", bigQueryDataset: "ga_export" }, "lmb-test-shop")).toEqual({ project: "lmb-test-shop", dataset: "ga_export" });
    expect(resolveDataset({ bigQueryDataset: "other-proj.ga" }, "lmb-test-shop")).toEqual({ project: "other-proj", dataset: "ga" });
    expect(resolveDataset({}, "lmb-test-shop")).toBeNull();
  });
});

describe("journey range", () => {
  it("allows up to 31 days", () => {
    expect(cleanJourneyRange({ startDate: "2026-09-20", endDate: "2026-10-20" })).toEqual({ startDate: "2026-09-20", endDate: "2026-10-20", days: 31 });
    expect(cleanJourneyRange({ startDate: "2026-09-19", endDate: "2026-10-20" })).toBeNull();
  });
  it("refuses reversed, malformed and impossible dates", () => {
    expect(cleanJourneyRange({ startDate: "2026-10-20", endDate: "2026-10-01" })).toBeNull();
    expect(cleanJourneyRange({ startDate: "2026-10-01", endDate: "20261020" })).toBeNull();
    expect(cleanJourneyRange({ startDate: "2026-02-30", endDate: "2026-03-01" })).toBeNull();
    expect(cleanJourneyRange({ startDate: "2026-10-01' OR 1=1 --", endDate: "2026-10-02" })).toBeNull();
  });
});

describe("the query", () => {
  it("reads the daily tables with parameterised dates, a byte cap and no interpolated dates", () => {
    const sql = buildQuery({ project: "lmb-test-shop", dataset: "analytics_123456789" });
    expect(sql).toContain("`lmb-test-shop.analytics_123456789.events_*`");
    expect(sql).toContain("_TABLE_SUFFIX BETWEEN @start_day AND @end_day");
    expect(sql).toMatch(/REGEXP_CONTAINS\(_TABLE_SUFFIX, r'\^\[0-9\]\{8\}\$'\)/);
    expect(sql).toContain("ga_session_id");
    expect(sql).not.toMatch(/2026/);
    const req = queryRequest(sql, { startDate: "2026-10-01", endDate: "2026-10-20" });
    expect(req.useLegacySql).toBe(false);
    expect(req.queryParameters.map(p => p.parameterValue.value)).toEqual(["20261001", "20261020"]);
    expect(Number(req.maximumBytesBilled)).toBe(2 * 1024 ** 3);
    expect(req.dryRun).toBeUndefined();
    expect(queryRequest(sql, { startDate: "2026-10-01", endDate: "2026-10-01" }, { dryRun: true }).dryRun).toBe(true);
  });
  it("strips query strings and hosts in SQL, before anything leaves BigQuery", () => {
    const sql = buildQuery({ project: "lmb-test-shop", dataset: "d" });
    expect(sql).toContain("[^?#]*");
    expect(sql).toContain("LAG(path)");
  });
  it("refuses a dataset name the checks didn't pass", () => {
    expect(() => buildQuery({ project: "lmb-test-shop", dataset: "d`; DROP" })).toThrow();
  });
  it("uses the read-only BigQuery scope", () => {
    expect(SCOPE).toBe("https://www.googleapis.com/auth/bigquery.readonly");
  });
});

describe("shaping the answer", () => {
  it("turns rows into journeys, exits and totals, biggest first", () => {
    const out = shapeJourneys(RESULT);
    expect(out.journeys).toEqual([
      { steps: ["/", "/books/salt"], sessions: 40, purchases: 5 },
      { steps: ["/", "/books/salt", "/page/about", "/cart"], sessions: 12, purchases: 3 },
    ]);
    expect(out.exits).toEqual([
      { path: "/", sessions: 55, hadBag: 4, purchases: 0 },
      { path: "/books/salt", sessions: 30, hadBag: 9, purchases: 2 },
    ]);
    expect(out.totals).toEqual({ sessions: 140, onePage: 70, purchases: 8 });
    expect(out.bytesProcessed).toBe(52428800);
  });
  it("copes with an empty answer", () => {
    expect(shapeJourneys({ schema: SCHEMA })).toMatchObject({ journeys: [], exits: [], totals: { sessions: 0, onePage: 0 } });
  });
});

describe("BigQuery errors", () => {
  const sa = "shop@x.iam.gserviceaccount.com";
  it("names the missing export", () => {
    const e = bqErrorMessage(404, { error: { message: "Not found: Dataset p:analytics_1 was not found in location US", errors: [{ reason: "notFound" }] } }, sa, "p.analytics_1");
    expect(e.code).toBe("not_linked");
    expect(e.error).toMatch(/BigQuery links/);
    expect(e.error).not.toMatch(/location US/);
  });
  it("names the service account and both roles on permission denied", () => {
    const e = bqErrorMessage(403, { error: { message: "Access Denied: User does not have bigquery.jobs.create permission", errors: [{ reason: "accessDenied" }] } }, sa);
    expect(e.code).toBe("no_access");
    expect(e.error).toContain(sa);
    expect(e.error).toMatch(/BigQuery Data Viewer/);
    expect(e.error).toMatch(/BigQuery Job User/);
    expect(e.error).not.toMatch(/jobs\.create/);
  });
  it("tells quota, a switched-off API and the byte cap apart", () => {
    expect(bqErrorMessage(403, { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } }, sa).code).toBe("quota");
    expect(bqErrorMessage(429, { error: { errors: [{ reason: "rateLimitExceeded" }] } }, sa).code).toBe("quota");
    expect(bqErrorMessage(403, { error: { message: "BigQuery API has not been used in project 1 before or it is disabled", errors: [{ reason: "accessNotConfigured" }] } }, sa).code).toBe("api_disabled");
    expect(bqErrorMessage(400, { error: { message: "Query exceeded limit for bytes billed: 2147483648.", errors: [{ reason: "bytesBilledLimitExceeded" }] } }, sa).code).toBe("too_big");
    expect(bqErrorMessage(500, null, sa).code).toBe("unavailable");
  });
});

describe("handleBigQueryJourneys", () => {
  it("runs one query in the Functions' project and returns the shaped report", async () => {
    const { deps: d, calls } = deps();
    const out = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-20" }, d);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ connected: true, dataset: "lmb-test-shop.analytics_123456789", range: { startDate: "2026-10-01", endDate: "2026-10-20" } });
    expect(out.body.journeys).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://bigquery.googleapis.com/bigquery/v2/projects/lmb-test-shop/queries");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.queryParameters[0].parameterValue.value).toBe("20261001");
    expect(sent.query).not.toContain("20261001");
  });
  it("refuses more than 31 days before asking anyone", async () => {
    const { deps: d, calls } = deps();
    const allow = vi.fn(async () => true);
    const out = await handleBigQueryJourneys({ startDate: "2026-08-01", endDate: "2026-10-20" }, { ...d, allow });
    expect(out.status).toBe(400);
    expect(allow).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
  it("is rate limited", async () => {
    const { deps: d } = deps({ allow: async () => false });
    expect((await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d)).status).toBe(429);
  });
  it("asks for the property first", async () => {
    const { deps: d, calls } = deps({ readSettings: async () => ({}) });
    const out = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d);
    expect(out.body).toMatchObject({ connected: false, code: "no_property" });
    expect(calls).toHaveLength(0);
  });
  it("explains a missing token without Google text", async () => {
    const { deps: d } = deps({ credentials: async () => { throw new Error("metadata 404 raw"); } });
    const out = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d);
    expect(out.body.code).toBe("no_token");
    expect(JSON.stringify(out.body)).not.toMatch(/raw/);
  });
  it("turns a Google refusal into a fixed sentence", async () => {
    const fetchImpl = async () => reply(403, { error: { code: 403, message: "Access Denied: Table secret-proj:x: User does not have permission", errors: [{ reason: "accessDenied" }] } });
    const { deps: d } = deps({ fetchImpl });
    const out = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d);
    expect(out.body).toMatchObject({ connected: false, code: "no_access", serviceAccount: "shop@lmb-test-shop.iam.gserviceaccount.com" });
    expect(JSON.stringify(out.body)).not.toMatch(/secret-proj/);
  });
  it("reads the saved dataset, running the job in the Functions' project", async () => {
    const { deps: d, calls } = deps({ readSettings: async () => ({ propertyId: "1", bigQueryDataset: "other-proj.ga_export" }) });
    await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d);
    expect(calls[0].url).toContain("/projects/lmb-test-shop/queries");
    expect(JSON.parse(calls[0].init.body).query).toContain("`other-proj.ga_export.events_*`");
  });
  it("waits once more for a slow query, then gives up politely", async () => {
    const answers = [
      reply(200, { jobComplete: false, jobReference: { projectId: "lmb-test-shop", jobId: "job_1", location: "US" }, totalBytesProcessed: "10" }),
      reply(200, { ...RESULT, totalBytesProcessed: undefined }),
    ];
    const urls = [];
    const fetchImpl = async (url) => { urls.push(url); return answers.shift(); };
    const { deps: d } = deps({ fetchImpl });
    const out = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, d);
    expect(urls[1]).toContain("/queries/job_1?");
    expect(urls[1]).toContain("location=US");
    expect(out.body.journeys).toHaveLength(2);
    expect(out.body.bytesProcessed).toBe(10);

    const slow = async () => reply(200, { jobComplete: false, jobReference: { jobId: "job_2" } });
    const late = await handleBigQueryJourneys({ startDate: "2026-10-01", endDate: "2026-10-02" }, deps({ fetchImpl: slow }).deps);
    expect(late.body).toMatchObject({ connected: true, code: "still_running" });
  });
  it("status dry-runs the last 7 days and reports the estimate", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { totalBytesProcessed: "2048", jobReference: {} }));
    const { deps: d } = deps({ fetchImpl });
    const out = await handleBigQueryJourneys({ op: "status" }, d);
    expect(out.body).toMatchObject({ connected: true, bytesEstimate: 2048 });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.dryRun).toBe(true);
    expect(sent.queryParameters.map(p => p.parameterValue.value)).toEqual(["20261014", "20261020"]);
  });
});
