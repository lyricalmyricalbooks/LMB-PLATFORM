import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./main.js";
import { TEST_ENV, fakeOutside } from "./fakes.js";

async function listening(role) {
  const outside = fakeOutside();
  const { server } = buildServer({ env: { ...TEST_ENV, PLATFORM_ROLE: role }, fetch: outside.fetch, token: outside.token, log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { outside, base: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((resolve) => server.close(resolve)) };
}

test("as the api server it answers the web door over real HTTP", async () => {
  const { base, stop, outside } = await listening("api");
  try {
    const plans = await fetch(`${base}/api/plans`);
    assert.equal(plans.status, 200);
    assert.equal((await plans.json()).ok, true);
    assert.equal((await fetch(`${base}/api/signup`)).status, 401);
    assert.equal((await fetch(`${base}/jobs/health-checks`, { method: "POST" })).status, 404, "the api server runs no jobs");
    assert.deepEqual(outside.other, []);
  } finally {
    await stop();
  }
});

test("as the jobs server it runs a job and answers nothing else", async () => {
  const { base, stop } = await listening("jobs");
  try {
    const run = await fetch(`${base}/jobs/press-messages`, { method: "POST" });
    assert.equal(run.status, 200);
    assert.equal((await run.json()).run.name, "press-messages");
    assert.equal((await fetch(`${base}/api/plans`)).status, 404, "the jobs server has no web door");
  } finally {
    await stop();
  }
});

test("it says which role it needs, and the token comes from the metadata server unless given", () => {
  const outside = fakeOutside();
  assert.throws(() => buildServer({ env: { ...TEST_ENV, PLATFORM_ROLE: "" }, fetch: outside.fetch, token: outside.token }), /PLATFORM_ROLE must be/);
  assert.throws(() => buildServer({ env: { ...TEST_ENV, PLATFORM_ROLE: "both" }, fetch: outside.fetch, token: outside.token }), /PLATFORM_ROLE must be/);
  const built = buildServer({ env: { ...TEST_ENV, PLATFORM_ROLE: "api" }, fetch: outside.fetch, log: () => {} });
  assert.equal(built.role, "api");
  assert.deepEqual(outside.other, [], "nothing was fetched while building");
});
