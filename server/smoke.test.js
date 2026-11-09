import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./main.js";
import { TEST_ENV, fakeOutside } from "./fakes.js";
import { DEFAULT_BASE, smoke, smokeChecks } from "./smoke.js";

test("against the real server program, every check passes", async () => {
  const outside = fakeOutside();
  const { server } = buildServer({ env: { ...TEST_ENV, PLATFORM_ROLE: "api" }, fetch: outside.fetch, token: outside.token, log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const lines = [];
  try {
    const result = await smoke({ base: `http://127.0.0.1:${server.address().port}`, print: (l) => lines.push(l) });
    assert.equal(result.ok, true, lines.join("\n"));
    assert.equal(result.results.length, smokeChecks().length);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(outside.other, []);
});

test("a door that lets a stranger in, or doesn't answer, fails its check and the others still run", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(`${init.method} ${url}`);
    if (url.endsWith("/api/plans")) throw new Error("connection refused");
    if (url.endsWith("/jobs/health-checks")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: url.endsWith("/api/signup") ? 200 : url.includes("nothing-here") ? 404 : url.includes("/tips/off") ? 503 : url.includes("/api/email/shop") || url.includes("/api/control/jobs") ? 401 : 400 });
  };
  const lines = [];
  const result = await smoke({ fetch, jobsUrl: "https://platform-jobs.example", print: (l) => lines.push(l) });
  assert.equal(result.ok, false);
  const failed = result.results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.problem}`);
  assert.deepEqual(failed, [
    "the plans answer, safely and never cached: no answer (connection refused)",
    "sign-up refuses a call without a sign-in: answered 200, expected 401",
    "the jobs server refuses anyone but the scheduler: answered 200: the jobs server must be private",
  ]);
  assert.ok(seen.every((line) => line.includes(DEFAULT_BASE) || line.includes("platform-jobs.example")));
  assert.match(lines.at(-1), /3 check\(s\) failed/);
});

test("the plans check wants the safety headers and no caching", async () => {
  const [plans] = smokeChecks({ base: "https://platform.example" });
  const answer = (headers) => async () => new Response(JSON.stringify({ ok: true, plans: [{ plan: "shop" }] }), { status: 200, headers });
  assert.match(await plans.run(answer({})), /missing the/);
  assert.match(await plans.run(answer({ "x-content-type-options": "nosniff", "strict-transport-security": "max-age=1", "content-security-policy": "x" })), /may be cached/);
  assert.equal(await plans.run(answer({ "x-content-type-options": "nosniff", "strict-transport-security": "max-age=1", "content-security-policy": "x", "cache-control": "no-store" })), null);
  assert.match(await plans.run(async () => new Response("{}", { status: 200 })), /no plans/);
});
