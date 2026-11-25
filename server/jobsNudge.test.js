import { test } from "node:test";
import assert from "node:assert/strict";
import { jobsNudge, runUrl } from "./jobsNudge.js";

const fakeFetch = (answers) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const hit = answers.find(([pattern]) => pattern.test(url));
    if (!hit) throw new Error(`no answer for ${url}`);
    return hit[1](url, init);
  };
  return { fetch, calls };
};
const text = (body, status = 200) => ({ ok: status < 300, status, text: async () => body });

test("the address is Cloud Run's fixed form", () => {
  assert.equal(runUrl("platform-jobs", "123", "us-central1"), "https://platform-jobs-123.us-central1.run.app");
});

test("a nudge calls the jobs server with an identity token for its address", async () => {
  const { fetch, calls } = fakeFetch([
    [/numeric-project-id$/, () => text("4242\n")],
    [/identity\?audience=/, () => text("id-token")],
    [/\/jobs\/shop-maker$/, () => text("{}")],
  ]);
  const nudge = jobsNudge({ fetch, region: "northamerica-northeast1", log: () => {} });
  assert.equal(await nudge("shop-maker"), true);
  const audience = decodeURIComponent(calls[1].url.split("audience=")[1]);
  assert.equal(audience, "https://platform-jobs-4242.northamerica-northeast1.run.app");
  assert.equal(calls[1].init.headers["Metadata-Flavor"], "Google");
  assert.equal(calls[2].url, `${audience}/jobs/shop-maker`);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.headers.Authorization, "Bearer id-token");
  // The project number is looked up once.
  await nudge("shop-maker");
  assert.equal(calls.filter((c) => /numeric-project-id/.test(c.url)).length, 1);
});

test("a nudge never throws: off Google Cloud it says no and the schedule makes the shop", async () => {
  const logged = [];
  const nudge = jobsNudge({ fetch: async () => { throw new Error("getaddrinfo ENOTFOUND metadata.google.internal"); }, log: (line) => logged.push(line) });
  assert.equal(await nudge("shop-maker"), false);
  assert.match(logged[0], /schedule will/);
});

test("a jobs server still working when the wait runs out counts as started", async () => {
  const { fetch } = fakeFetch([
    [/numeric-project-id$/, () => text("1")],
    [/identity/, () => text("t")],
    [/\/jobs\//, () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }],
  ]);
  assert.equal(await jobsNudge({ fetch, log: () => {} })("shop-maker"), true);
});
