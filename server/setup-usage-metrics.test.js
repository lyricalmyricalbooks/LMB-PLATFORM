import assert from "node:assert/strict";
import { test } from "node:test";
import { METRIC_DEFINITIONS, USAGE_METRICS, ensureUsageMetrics } from "./setup-usage-metrics.js";

// A fake Logging API holding metrics by name; every call is recorded.
function fakeLogging(start = {}) {
  const metrics = { ...start };
  const calls = [];
  const fetch = async (url, { method, body }) => {
    const path = new URL(url).pathname;
    calls.push({ method, path });
    const name = path.split("/").at(-1);
    const answer = (status, value) => ({ ok: status < 300, status, text: async () => JSON.stringify(value) });
    if (method === "GET") return metrics[name] ? answer(200, metrics[name]) : answer(404, { error: { message: "not found", status: "NOT_FOUND" } });
    const sent = JSON.parse(body);
    // Google adds its own fields to what it keeps.
    metrics[sent.name] = { ...sent, metricDescriptor: { ...sent.metricDescriptor, type: `logging.googleapis.com/user/${sent.name}`, name: "x", displayName: "" } };
    return answer(200, metrics[sent.name]);
  };
  return { fetch, calls, metrics };
}

const token = async () => "t";

test("the plan reads only, then --apply makes both metrics, then a re-run changes nothing", async () => {
  const google = fakeLogging();
  const plan = await ensureUsageMetrics({ fetch: google.fetch, token, project: "lmb-test-shop", print: () => {} });
  assert.deepEqual(plan.map((row) => row.does), ["create", "create"]);
  assert.ok(google.calls.every((call) => call.method === "GET"), "the plan changes nothing");

  await ensureUsageMetrics({ fetch: google.fetch, token, project: "lmb-test-shop", apply: true, print: () => {} });
  assert.deepEqual(Object.keys(google.metrics).sort(), [USAGE_METRICS.pages, USAGE_METRICS.work].sort());
  assert.ok(google.calls.some((call) => call.method === "POST" && call.path === "/v2/projects/lmb-test-shop/metrics"));

  google.calls.length = 0;
  const again = await ensureUsageMetrics({ fetch: google.fetch, token, project: "lmb-test-shop", apply: true, print: () => {} });
  assert.deepEqual(again.map((row) => row.does), ["keep", "keep"]);
  assert.ok(google.calls.every((call) => call.method === "GET"));
});

test("a metric changed by hand is put back as written", async () => {
  const [work] = METRIC_DEFINITIONS;
  const google = fakeLogging({ [work.name]: { ...work, filter: 'jsonPayload.shopUsage.kind="request"' } });
  const done = await ensureUsageMetrics({ fetch: google.fetch, token, project: "lmb-test-shop", apply: true, print: () => {} });
  assert.equal(done.find((row) => row.metric === work.name).does, "update");
  assert.ok(google.calls.some((call) => call.method === "PUT" && call.path.endsWith(`/metrics/${work.name}`)));
  assert.equal(google.metrics[work.name].filter, work.filter);
});

test("each metric counts by shop and a bad project id is refused", async () => {
  for (const metric of METRIC_DEFINITIONS) {
    assert.equal(metric.labelExtractors.shop, "EXTRACT(jsonPayload.shopUsage.shop)");
    assert.equal(metric.metricDescriptor.metricKind, "DELTA");
  }
  await assert.rejects(ensureUsageMetrics({ fetch: fakeLogging().fetch, token, project: "Not A Project" }), /isn't a project id/);
});
