// The staged update for the shared system (shared.js): the shared test project first, then the live one; each shop's
// pages drawn again after its project passes; a failed check puts the project back and stops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { SHARED_RELEASE_LOCK, firstSharedRelease, runSharedRelease, sharedProjectProfile, sharedServerEnv } from "./shared.js";

const TEST_PROJECT = "lmb-test-shop";
const LIVE_PROJECT = "press-two";
const PLATFORM = "https://platform.example";
const row = (shopId, projectId, extra = {}) => ({ shopId, projectId, shared: true, status: "live", region: "northamerica-northeast1", freeAddress: `${shopId}.shops.example`, ...extra });
const ROWS = [
  row("lmb-test-shop", TEST_PROJECT, { testShop: true, testMode: true }),
  row("moth-press", LIVE_PROJECT),
  row("other", LIVE_PROJECT),
  row("x", LIVE_PROJECT, { status: "creating" }),
  row("p", "moth-press", { shared: false }),
];

/** Pretend projects: each part's live release, a site check by address, the release check and the pages. */
function world({ on = "1.0.0", broken = {}, badPages = [] } = {}) {
  const live = new Map([TEST_PROJECT, LIVE_PROJECT].map((p) => [p, { rules: on, functions: on, "pages:shop": on }]));
  const calls = [];
  const projectOf = new Map(ROWS.map((r) => [r.freeAddress, r.projectId]));
  const fault = (version, projectId) => broken[version]?.[projectId] ?? null;
  return {
    live, calls,
    builder: { async build(version) { calls.push(["build", version]); } },
    deploy: {
      async deployed(projectId, part) { const version = live.get(projectId)?.[part]; return version ? { version } : null; },
      async rules(projectId, { version, apps }) { calls.push(["rules", projectId, version, apps.join("+")]); live.get(projectId).rules = version; },
      async functions(projectId, { version, region, envFile }) {
        calls.push(["functions", projectId, version, region, envFile]);
        if (fault(version, projectId) === "deploy") throw new Error("functions deploy exited with 2");
        live.get(projectId).functions = version;
      },
      async pages(projectId, { version, app }) { calls.push(["pages", projectId, version, app]); live.get(projectId)["pages:shop"] = version; },
      async migrate() { throw new Error("a shared release never runs per-project data changes"); },
    },
    siteCheck: {
      async get(url) {
        calls.push(["site", url]);
        const projectId = projectOf.get(new URL(url).host);
        return fault(live.get(projectId)["pages:shop"], projectId) === "pages" ? { status: 500 } : { status: 200, problems: [] };
      },
    },
    async releaseCheck(shopId, version) {
      calls.push(["release-check", shopId, version]);
      return fault(version, TEST_PROJECT) === "check" ? { ok: false, error: "5. The order reaches the stockroom: failed" } : { ok: true };
    },
    async publishShop(r, version) {
      calls.push(["publish", r.shopId, version]);
      if (badPages.includes(r.shopId)) throw new Error("the build drew no home page, so nothing was published");
    },
  };
}

async function setup(options = {}) {
  const registry = fakeRegistry();
  for (const r of ROWS) await registry.createShop(r.shopId, r);
  const w = world(options);
  const auditLog = fakeAuditLog();
  const lines = [];
  const run = (version, extra = {}) => runSharedRelease({
    version, projects: [{ projectId: TEST_PROJECT, test: true }, { projectId: LIVE_PROJECT }], registry, auditLog,
    builder: w.builder, deploy: w.deploy, siteCheck: w.siteCheck, releaseCheck: w.releaseCheck, publishShop: w.publishShop,
    platformUrl: PLATFORM, print: (line) => lines.push(line), runId: "run-1", now: () => new Date("2026-11-10T15:00:00Z"), ...extra,
  });
  return { registry, w, auditLog, lines, run };
}

const kinds = (w, kind) => w.calls.filter(([k]) => k === kind).map(([, ...rest]) => rest);

test("the shared server's settings are the platform's doors and the region, and none of a shop's own", () => {
  const env = sharedServerEnv({ platformUrl: `${PLATFORM}/`, region: "northamerica-northeast1" });
  assert.equal(env, [
    'SHOP_PAYMENT_MODE="platform"', `SHOP_PAYMENTS_SERVICE_URL="${PLATFORM}/api/payments"`, 'SHOP_FUNCTIONS_REGION="northamerica-northeast1"',
    `PLATFORM_EMAIL_URL="${PLATFORM}/api/email/shop"`, `PLATFORM_DOMAINS_URL="${PLATFORM}/api/domains"`, "",
  ].join("\n"));
  const { SHOP_KEYS } = createRequire(import.meta.url)("../../apps/shop/functions/shopConfig.js");
  for (const key of SHOP_KEYS.filter((k) => k !== "SHOP_PAYMENT_MODE")) assert.ok(!env.includes(`${key}=`), `${key} is each shop's own, in its record`);
  assert.throws(() => sharedServerEnv({ platformUrl: "http://platform.example" }), /https/);
  assert.throws(() => sharedServerEnv({ platformUrl: PLATFORM, region: "nowhere" }), /region/);
});

test("the project's own profile names both apps, the stockroom's places and the region; never a shop", () => {
  const profile = JSON.parse(/=(\{.*\});$/.exec(sharedProjectProfile(LIVE_PROJECT))[1]);
  assert.deepEqual(profile.apps, { shop: true, stockroom: true });
  assert.deepEqual(profile.stockroom, { firestoreDatabase: "stockroom", storageBucket: `${LIVE_PROJECT}-stockroom` });
  assert.equal(profile.functionsRegion, "northamerica-northeast1");
  assert.equal(profile.shopId, undefined);
  assert.throws(() => sharedProjectProfile("Bad Project"), /project id/);
});

test("the test project first, then the live one: rules, server code, site, a check, then every shop's pages", async () => {
  const { w, run, registry, auditLog } = await setup();
  const result = await run("1.1.0");
  assert.equal(result.ok, true);
  assert.deepEqual(result.projects.map((p) => [p.projectId, p.status]), [[TEST_PROJECT, "shipped"], [LIVE_PROJECT, "shipped"]]);
  const order = w.calls.filter(([k]) => ["rules", "functions", "pages", "release-check", "publish"].includes(k)).map(([k, id]) => `${k} ${id}`);
  assert.deepEqual(order, [
    `rules ${TEST_PROJECT}`, `functions ${TEST_PROJECT}`, `pages ${TEST_PROJECT}`, "release-check lmb-test-shop", "publish lmb-test-shop",
    `rules ${LIVE_PROJECT}`, `functions ${LIVE_PROJECT}`, `pages ${LIVE_PROJECT}`, "publish moth-press", "publish other",
  ]);
  assert.deepEqual(kinds(w, "rules")[0], [TEST_PROJECT, "1.1.0", "shop+stockroom"]);
  assert.equal(kinds(w, "functions")[0][2], "northamerica-northeast1");
  assert.match(kinds(w, "functions")[0][3], /PLATFORM_DOMAINS_URL="https:\/\/platform\.example\/api\/domains"/);
  // One shop answers at its own address on each project's front door, stockroom included.
  assert.deepEqual(kinds(w, "site").slice(0, 4).map(([url]) => url), [
    "https://lmb-test-shop.shops.example", "https://lmb-test-shop.shops.example/admin", "https://lmb-test-shop.shops.example/shop-profile.js", "https://lmb-test-shop.shops.example/stockroom",
  ]);
  assert.equal(kinds(w, "site")[4][0], "https://moth-press.shops.example");
  // A shop still being made, and a shop with a project of its own, are not this release's.
  assert.ok(!kinds(w, "publish").some(([id]) => id === "x" || id === "p"));
  assert.deepEqual((await registry.getShop("moth-press")).release, { version: "1.1.0", at: "2026-11-10T15:00:00.000Z", runId: "run-1" });
  assert.equal((await registry.getShop("p")).release, undefined);
  assert.equal(registry.releases.get("1.1.0-run-1").kind, "shared-release");
  assert.equal(auditLog.entries.get("moth-press").size, 1);
  assert.equal(registry.locks.has(SHARED_RELEASE_LOCK), false, "the lock is let go");
  assert.equal(kinds(w, "migrate").length, 0);
});

test("a failed test-project check puts it back and the live project is never touched", async () => {
  const { w, run } = await setup({ broken: { "1.1.0": { [TEST_PROJECT]: "check" } } });
  const result = await run("1.1.0");
  assert.equal(result.ok, false);
  assert.equal(result.projects[0].status, "rolled-back");
  assert.match(result.error, /release check failed/);
  assert.equal(w.live.get(TEST_PROJECT).rules, "1.0.0", "back on the release before");
  assert.ok(!w.calls.some(([k, id]) => k === "rules" && id === LIVE_PROJECT));
  assert.equal(kinds(w, "publish").length, 0, "no shop's pages are drawn from a refused release");
});

test("a failed live deploy rolls that project back; a project with no earlier release stops for a person", async () => {
  const one = await setup({ broken: { "1.1.0": { [LIVE_PROJECT]: "deploy" } } });
  const result = await one.run("1.1.0");
  assert.equal(result.projects[1].status, "rolled-back");
  assert.equal(one.w.live.get(LIVE_PROJECT).functions, "1.0.0");
  assert.deepEqual(kinds(one.w, "publish").map(([id]) => id), ["lmb-test-shop"]);

  const two = await setup({ on: null, broken: { "1.1.0": { [TEST_PROJECT]: "pages" } } });
  for (const parts of two.w.live.values()) for (const key of Object.keys(parts)) delete parts[key];
  const fresh = await two.run("1.1.0");
  assert.equal(fresh.projects[0].status, "failed");
  assert.match(fresh.error, /no earlier release.*a person looks at it/);
});

test("one shop's pages failing keeps its last good ones, is listed, and holds no one back", async () => {
  const { run, registry, auditLog } = await setup({ badPages: ["moth-press"] });
  const result = await run("1.1.0");
  assert.equal(result.ok, true);
  assert.deepEqual(result.projects[1].pages, { done: ["other"], failed: [{ shopId: "moth-press", error: "the build drew no home page, so nothing was published" }] });
  assert.equal((await registry.getShop("moth-press")).release, undefined);
  assert.equal([...auditLog.entries.get("moth-press").values()][0].status, "pages-failed");
});

test("a re-run leaves a project already on the release alone and only draws its shops' pages again", async () => {
  const { w, run } = await setup({ on: "1.1.0" });
  const result = await run("1.1.0");
  assert.deepEqual(result.projects.map((p) => p.status), ["already-on", "already-on"]);
  assert.equal(kinds(w, "rules").length, 0);
  assert.deepEqual(kinds(w, "publish").map(([id]) => id), ["lmb-test-shop", "moth-press", "other"]);
});

test("it refuses to start without a test shop, with data changes, while paused, or while another runs", async () => {
  const { run, registry, w } = await setup();
  assert.match((await run("1.1.0", { migrations: 1 })).error, /data change/);
  assert.match((await run("1.1.0", { projects: [{ projectId: LIVE_PROJECT, test: true }] })).error, /no live test shop/);
  await assert.rejects(run("1.1.0", { projects: [{ projectId: LIVE_PROJECT }] }), /starts with the shared test project/);
  await assert.rejects(run("not-a-version"), /release version/);
  assert.equal((await run("1.1.0", { paused: async () => ({ by: "Julian", reason: "a holiday sale" }) })).paused.by, "Julian");
  await registry.takeLock(SHARED_RELEASE_LOCK, { runId: "other-run", expiresAt: "2026-11-10T17:00:00.000Z" });
  assert.equal((await run("1.1.0")).locked, true);
  assert.equal(kinds(w, "rules").length, 0, "nothing was deployed by any of them");
  const dry = await (await setup()).run("1.1.0", { dryRun: true });
  assert.deepEqual(dry.projects, [{ projectId: TEST_PROJECT, shops: ["lmb-test-shop"] }, { projectId: LIVE_PROJECT, shops: ["moth-press", "other"] }]);
});

test("the real run releases to the test project first, and to the live one only when it is named", async () => {
  const { sharedProjects } = await import("./run-shared.js");
  assert.deepEqual(sharedProjects({}), [{ projectId: TEST_PROJECT, test: true }]);
  assert.deepEqual(sharedProjects({ SHARED_SHOPS_PROJECT: ` ${LIVE_PROJECT} ` }), [{ projectId: TEST_PROJECT, test: true }, { projectId: LIVE_PROJECT }]);
  assert.deepEqual(sharedProjects({ SHARED_SHOPS_TEST_PROJECT: "x", SHARED_SHOPS_PROJECT: "x" }), [{ projectId: "x", test: true }]);
});

test("a shared project's first release goes out once, before it has a shop, and never past one", async () => {
  const registry = fakeRegistry();
  const w = world();
  w.live.set("moth-press", {});
  const lines = [];
  const first = (extra = {}) => firstSharedRelease({
    version: "1.0.0", projectId: "moth-press", registry, builder: w.builder, deploy: w.deploy, platformUrl: PLATFORM,
    print: (line) => lines.push(line), runId: "first-1", now: () => new Date("2026-11-10T15:00:00Z"), ...extra,
  });

  // A dry run builds and sends nothing.
  assert.deepEqual(await first({ dryRun: true }), { ok: true, dryRun: true, version: "1.0.0", projectId: "moth-press" });
  assert.deepEqual(w.calls, []);

  const result = await first();
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(w.calls.map(([kind, ...rest]) => [kind, ...rest.slice(0, 2)]), [
    ["build", "1.0.0"], ["rules", "moth-press", "1.0.0"], ["functions", "moth-press", "1.0.0"], ["pages", "moth-press", "1.0.0"],
  ]);
  assert.equal(kinds(w, "functions")[0][3], sharedServerEnv({ platformUrl: PLATFORM }));
  assert.equal(kinds(w, "site").length, 0);
  const [recorded] = [...registry.releases.values()];
  assert.equal(recorded.kind, "shared-first-release");
  assert.equal(recorded.ok, true);
  assert.equal(await registry.readLock(SHARED_RELEASE_LOCK), null);

  // Once a shop there is live, its releases are the staged update's.
  await registry.createShop("other", row("other", "moth-press"));
  w.calls.length = 0;
  assert.equal((await first()).skipped, true);
  assert.deepEqual(w.calls, []);
});

test("a first release whose stamps don't come back says so", async () => {
  const registry = fakeRegistry();
  const w = world();
  w.live.set("moth-press", {});
  w.deploy.pages = async () => {};
  const result = await firstSharedRelease({ version: "1.0.0", projectId: "moth-press", registry, builder: w.builder, deploy: w.deploy, platformUrl: PLATFORM });
  assert.equal(result.ok, false);
  assert.match(result.error, /pages:shop are on nothing, not 1\.0\.0/);
  assert.equal(await registry.readLock(SHARED_RELEASE_LOCK), null);
});

test("a first release whose new database triggers aren't ready yet deploys the server once more", async () => {
  const registry = fakeRegistry();
  const w = world();
  w.live.set("moth-press", {});
  const real = w.deploy.functions;
  let tries = 0;
  w.deploy.functions = async (...args) => {
    tries += 1;
    if (tries === 1) throw new Error("Command failed: firebase deploy\n- Error Failed to create function onOrderCreated in region northamerica-northeast1");
    return real(...args);
  };
  const waits = [];
  const result = await firstSharedRelease({ version: "1.0.0", projectId: "moth-press", registry, builder: w.builder, deploy: w.deploy, platformUrl: PLATFORM, sleep: async (ms) => waits.push(ms) });
  assert.equal(result.ok, true, result.error);
  assert.equal(tries, 2);
  assert.equal(waits.length, 1);

  // Any other failure, or a second one, stops the release as before.
  const again = world();
  again.live.set("moth-press", {});
  again.deploy.functions = async () => { throw new Error("Failed to create function onOrderCreated"); };
  const failed = await firstSharedRelease({ version: "1.0.0", projectId: "moth-press", registry: fakeRegistry(), builder: again.builder, deploy: again.deploy, platformUrl: PLATFORM, sleep: async () => {} });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /Failed to create function/);
});
