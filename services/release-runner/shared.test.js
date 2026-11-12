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
function world({ on = "1.0.0", broken = {}, badPages = [], rows = ROWS, failingCheck = null } = {}) {
  const live = new Map([TEST_PROJECT, LIVE_PROJECT].map((p) => [p, { rules: on, functions: on, "pages:shop": on }]));
  const calls = [];
  const projectOf = new Map(rows.map((r) => [r.freeAddress, r.projectId]));
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
      async copySite(projectId, { site, version }) { calls.push(["copy", projectId, site, version]); live.get(projectId)[`site:${site}`] = version; },
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
      if (failingCheck === shopId) return { ok: false, error: "2. Buy with Stripe's test card: failed" };
      const f = fault(version, TEST_PROJECT);
      if (f === "waiting") return { ok: true, waiting: "the test shop's profile has no Stripe test publishable key" };
      return f === "check" ? { ok: false, error: "5. The order reaches the stockroom: failed" } : { ok: true };
    },
    async publishShop(r, version) {
      calls.push(["publish", r.shopId, version]);
      if (badPages.includes(r.shopId)) throw new Error("the build drew no home page, so nothing was published");
    },
  };
}

async function setup(options = {}) {
  const registry = fakeRegistry();
  for (const r of options.rows ?? ROWS) await registry.createShop(r.shopId, r);
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
    `PLATFORM_EMAIL_URL="${PLATFORM}/api/email/shop"`, `PLATFORM_DOMAINS_URL="${PLATFORM}/api/domains"`,
    `PLATFORM_GOOGLE_URL="${PLATFORM}/api/google"`, `PLATFORM_APPS_URL="${PLATFORM}/api/apps"`, "",
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
    `rules ${TEST_PROJECT}`, `functions ${TEST_PROJECT}`, `pages ${TEST_PROJECT}`, "publish lmb-test-shop", "release-check lmb-test-shop",
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
  // Only the checked test shop is drawn, from each build just before its check, and it ends on the release before.
  assert.deepEqual(kinds(w, "publish"), [["lmb-test-shop", "1.1.0"], ["lmb-test-shop", "1.0.0"]]);
});

test("a merge's update of the test shop alone keeps a version whose release check failed, and says it can't go further", async () => {
  const { w, run, lines } = await setup({ broken: { "1.1.0": { [TEST_PROJECT]: "check" } } });
  const alone = [{ projectId: TEST_PROJECT, test: true }];
  const result = await run("1.1.0", { projects: alone, keepOnFailedCheck: true });
  assert.equal(result.ok, false, "the run is still red");
  assert.equal(result.projects[0].status, "kept-check-failed");
  assert.equal(w.live.get(TEST_PROJECT).rules, "1.1.0", "the test shop shows the new version, to be looked at");
  assert.deepEqual(kinds(w, "publish").map(([id]) => id), ["lmb-test-shop"]);
  assert.ok(lines.some((line) => /can't go to real shops/.test(line)));

  // A broken deploy still goes back, even on a merge.
  const broken = await setup({ broken: { "1.1.0": { [TEST_PROJECT]: "pages" } } });
  assert.equal((await broken.run("1.1.0", { projects: alone, keepOnFailedCheck: true })).projects[0].status, "rolled-back");
  assert.equal(broken.w.live.get(TEST_PROJECT).rules, "1.0.0");

  // Never with the live project in the run: real shops only get a version that passed.
  await assert.rejects((await setup()).run("1.1.0", { keepOnFailedCheck: true }), /test project alone/);
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

test("the release's outcome reads in plain words, the version to send on comes from the test shop, and a busy lock is waited for", async () => {
  const { releaseSummary, retryWhileLocked, testShopVersion } = await import("./run-shared.js");
  const alone = [{ projectId: TEST_PROJECT, test: true }];
  assert.match(releaseSummary({ ok: true, version: "1.2.3-gabc1234" }, { testShopOnly: true }), /test shop is on 1\.2\.3-gabc1234[\s\S]*can send it to real shops/);
  assert.match(releaseSummary({ ok: true, version: "1.2.3" }), /reached every shop/);
  assert.match(releaseSummary({ ok: false, version: "1.2.3", projects: [{ projectId: TEST_PROJECT, status: "kept-check-failed", error: "the release check failed: 2. Buy" }] }, { testShopOnly: true }), /can't go to real shops[\s\S]*2\. Buy/);
  const stopped = releaseSummary({ ok: false, version: "1.2.3", error: "lmb-test-shop: the release check failed", projects: [{ projectId: TEST_PROJECT, status: "rolled-back", previous: "1.2.2" }, { projectId: LIVE_PROJECT, status: "not-run" }] });
  assert.match(stopped, /went back to 1\.2\.2[\s\S]*Real shops weren't touched/);
  assert.match(releaseSummary({ ok: true, dryRun: true, version: "1.2.3", projects: [{ projectId: TEST_PROJECT, shops: ["lmb-test-shop"] }] }), /Check only[\s\S]*1 shop/);

  const deployOn = (version) => ({ deployed: async () => (version ? { version } : null) });
  assert.equal(await testShopVersion(deployOn("1.2.3-gabc1234"), alone), "1.2.3-gabc1234");
  for (const nothing of [null, "unknown", "1.2.3+1.2.4"]) assert.equal(await testShopVersion(deployOn(nothing), alone), null);

  const answers = [{ locked: true }, { locked: true }, { ok: true }];
  const waits = [];
  assert.deepEqual(await retryWhileLocked(async () => answers.shift(), { sleep: async (ms) => void waits.push(ms) }), { ok: true });
  assert.deepEqual(waits, [60_000, 60_000]);
  assert.deepEqual(await retryWhileLocked(async () => ({ locked: true }), { tries: 2, sleep: async () => {} }), { locked: true }, "gives up in the end");
});

test("while the test shop can't take a card, a merge's update passes and says so, but real shops never get that version", async () => {
  const merge = await setup({ broken: { "1.1.0": { [TEST_PROJECT]: "waiting" } } });
  const alone = [{ projectId: TEST_PROJECT, test: true }];
  const result = await merge.run("1.1.0", { projects: alone, keepOnFailedCheck: true });
  assert.equal(result.ok, true, "the merge's run is green");
  assert.equal(result.projects[0].status, "shipped");
  assert.match(result.projects[0].waiting, /publishable key/);
  assert.ok(merge.lines.some((line) => /Real shops can't get it until a purchase passes/.test(line)));
  const { releaseSummary } = await import("./run-shared.js");
  const summary = releaseSummary(result, { testShopOnly: true });
  assert.match(summary, /test purchase waits/);
  assert.match(summary, /Real shops can't get this version until a test purchase passes/);

  // Sending to shops: the same check stops it at the test project, and the live project is never touched.
  const send = await setup({ broken: { "1.1.0": { [TEST_PROJECT]: "waiting" } } });
  const sent = await send.run("1.1.0");
  assert.equal(sent.ok, false);
  assert.match(sent.error, /couldn't make a test purchase/);
  assert.ok(!send.w.calls.some(([k, id]) => k === "rules" && id === LIVE_PROJECT));
});

// The two test shops (setup/testShopPlace.js): the book shop at the project's own address, the general one at a site
// of its own, which gets a copy of the project's site.
const TWO_TEST_SHOPS = [
  row("test-press", TEST_PROJECT, { testShop: true, testMode: true, freeAddress: "lmb-test-shop.web.app" }),
  row("test-goods", TEST_PROJECT, { testShop: true, testMode: true, publishes: "other", freeAddress: "lmb-test-goods.web.app" }),
  row("moth-press", LIVE_PROJECT),
];

test("with two test shops, the site is copied to the general shop's own site and both pass the release check first", async () => {
  const { w, run } = await setup({ rows: TWO_TEST_SHOPS });
  const result = await run("1.1.0");
  assert.equal(result.ok, true);
  const order = w.calls.filter(([k]) => ["pages", "copy", "release-check", "publish"].includes(k)).map(([k, a, b]) => (k === "copy" ? `copy ${b}` : `${k} ${a}`));
  assert.deepEqual(order, [
    `pages ${TEST_PROJECT}`, "copy lmb-test-goods", "publish test-goods", "publish test-press", "release-check test-goods", "release-check test-press",
    `pages ${LIVE_PROJECT}`, "publish moth-press",
  ]);
  // Both test shops answer at their own addresses.
  const urls = kinds(w, "site").map(([url]) => url);
  for (const url of ["https://lmb-test-shop.web.app/admin", "https://lmb-test-goods.web.app/admin", "https://lmb-test-goods.web.app/stockroom"]) assert.ok(urls.includes(url), url);
});

test("a general test shop that fails its release check keeps the version from every real shop, naming the shop", async () => {
  const { w, run } = await setup({ rows: TWO_TEST_SHOPS, failingCheck: "test-goods" });
  const result = await run("1.1.0");
  assert.equal(result.ok, false);
  assert.match(result.error, /test-goods: the release check failed: 2\. Buy/);
  assert.equal(w.live.get(TEST_PROJECT).rules, "1.0.0", "back on the release before");
  assert.equal(w.live.get(TEST_PROJECT)["site:lmb-test-goods"], "1.0.0", "the general shop's site goes back too");
  assert.equal(w.live.get(LIVE_PROJECT).rules, "1.0.0", "no real shop got it");
});

test("a merge's own update keeps a version the general test shop refused on both, to look at", async () => {
  const { w, run } = await setup({ rows: TWO_TEST_SHOPS, failingCheck: "test-goods" });
  const result = await run("1.1.0", { projects: [{ projectId: TEST_PROJECT, test: true }], keepOnFailedCheck: true });
  assert.equal(result.ok, false);
  assert.equal(result.projects[0].status, "kept-check-failed");
  assert.equal(w.live.get(TEST_PROJECT)["site:lmb-test-goods"], "1.1.0");
});
