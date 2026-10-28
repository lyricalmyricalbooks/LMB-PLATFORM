import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { releaseBuilder, tagOf } from "./builder.js";
import { fakeFiles, fakeWorld } from "./fakes.js";
import { planRings } from "./rings.js";
import { RELEASE_LOCK, runRelease } from "./runner.js";

const FOLDER = "folders/000000000000";
const row = (shopId, extra = {}) => ({ shopId, projectId: shopId, plan: "both", status: "live", testMode: false, testShop: false, region: "northamerica-northeast1", ...extra });
const TEST = row("lmb-test-shop", { testShop: true, testMode: true });

async function setup({ rows = [TEST, row("press-bravo"), row("press-alpha", { plan: "shop" })], broken, badBuilds, on = "1.0.0", folders = {} } = {}) {
  const registry = fakeRegistry();
  for (const r of rows) await registry.createShop(r.shopId, r);
  const world = fakeWorld({ broken, badBuilds });
  for (const r of rows) if (on) world.seed(r, on);
  const auditLog = fakeAuditLog();
  const ids = rows.map((r) => r.shopId);
  const lines = [];
  const run = (version, extra = {}) => runRelease({
    version, registry, auditLog, builder: world.builder, deploy: world.deploy, siteCheck: world.siteCheck, releaseCheck: world.releaseCheck,
    envFiles: fakeFiles("env", ids), profileFiles: fakeFiles("profile", ids),
    projects: { get: async (id) => ({ projectId: id, parent: folders[id] ?? FOLDER }) },
    config: { folder: FOLDER }, print: (line) => lines.push(line), runId: "run-1", ...extra,
  });
  return { registry, world, auditLog, run, lines };
}

const shippedTo = (world, version) => [...new Set(world.calls.filter(([kind, , v]) => kind === "rules" && v === version).map(([, id]) => id))];

test("rings: the test shop alone first, then every other live shop by id; others are left out with a reason", () => {
  const { rings, skipped } = planRings([
    row("press-zulu"), TEST, row("press-alpha"), row("press-new", { status: "creating" }),
    row("press-odd", { projectId: "demo-other-project" }), row("press-held"),
  ], { exclude: ["press-held"] });
  assert.deepEqual(rings.map((ring) => ring.map((r) => r.shopId)), [["lmb-test-shop"], ["press-alpha", "press-zulu"]]);
  assert.deepEqual(skipped.map((s) => s.shopId), ["press-new", "press-odd", "press-held"]);
});

test("rings: no release without exactly one live test shop in test mode", () => {
  assert.match(planRings([row("press-alpha")]).problem, /no live test shop/);
  assert.match(planRings([TEST, row("other-test-shop", { testShop: true, testMode: true })]).problem, /2 live test shops/);
  const { problem, skipped } = planRings([row("lmb-test-shop", { testShop: true, testMode: false })]);
  assert.match(problem, /no live test shop/);
  assert.match(skipped[0].reason, /isn't in test mode/);
});

test("a good release is built once and reaches the test shop, then every other shop, each checked and recorded", async () => {
  const { run, world, registry, auditLog } = await setup();
  const result = await run("1.1.0");
  assert.equal(result.ok, true);
  assert.deepEqual(world.builds, ["1.1.0"]);
  assert.deepEqual(shippedTo(world, "1.1.0"), ["lmb-test-shop", "press-alpha", "press-bravo"]);
  assert.deepEqual(world.calls.filter(([kind]) => kind === "release-check"), [["release-check", "lmb-test-shop", "1.1.0"]], "only the test shop gets the buying check");
  // Each shop's own files go with its deploy; a shop-only plan has no stockroom.
  assert.ok(world.calls.some(([kind, id, , , env]) => kind === "functions" && id === "press-bravo" && env === "env for press-bravo"));
  assert.ok(world.calls.some(([kind, id, , app]) => kind === "pages" && id === "press-bravo" && app === "stockroom"));
  assert.ok(!world.calls.some(([kind, id, , app]) => kind === "pages" && id === "press-alpha" && app === "stockroom"));
  assert.equal((await registry.getShop("press-bravo")).release.version, "1.1.0");
  assert.equal(registry.releases.get("1.1.0-run-1").ok, true);
  assert.deepEqual(registry.releases.get("1.1.0-run-1").shops.map((s) => [s.shopId, s.ring, s.status, s.previous]), [
    ["lmb-test-shop", 1, "shipped", "1.0.0"], ["press-alpha", 2, "shipped", "1.0.0"], ["press-bravo", 2, "shipped", "1.0.0"],
  ]);
  assert.equal(auditLog.entries.get("press-alpha").size, 1);
  assert.equal(await registry.readLock(RELEASE_LOCK), null, "the release lock is given back");
});

test("a failed release check on the test shop stops everything there and puts the test shop back", async () => {
  const { run, world, registry } = await setup({ broken: { "1.1.0": { "lmb-test-shop": "check" } } });
  const result = await run("1.1.0");
  assert.equal(result.ok, false);
  assert.match(result.error, /lmb-test-shop: the release check failed: 5\. The order reaches the stockroom/);
  assert.deepEqual(shippedTo(world, "1.1.0"), ["lmb-test-shop"], "no press's shop was touched");
  assert.deepEqual(world.live.get("lmb-test-shop"), { rules: "1.0.0", functions: "1.0.0", "pages:shop": "1.0.0", "pages:stockroom": "1.0.0" });
  assert.deepEqual(world.builds, ["1.1.0", "1.0.0"]);
  assert.deepEqual(result.shops.map((s) => s.status), ["rolled-back", "not-run", "not-run"]);
  assert.equal((await registry.getShop("lmb-test-shop")).release, undefined, "the row keeps no record of a release it didn't keep");
});

test("a failure in ring 2 rolls that shop back and stops; shops already checked keep the new release", async () => {
  const { run, world, registry } = await setup({
    rows: [TEST, row("press-alpha"), row("press-bravo"), row("press-charlie")],
    broken: { "1.1.0": { "press-bravo": "pages" } },
  });
  const result = await run("1.1.0");
  assert.equal(result.ok, false);
  assert.deepEqual(result.shops.map((s) => [s.shopId, s.status]), [["lmb-test-shop", "shipped"], ["press-alpha", "shipped"], ["press-bravo", "rolled-back"], ["press-charlie", "not-run"]]);
  assert.match(result.shops[2].error, /press-bravo\.web\.app answered 500/);
  assert.equal(world.live.get("press-bravo")["pages:shop"], "1.0.0");
  assert.equal(world.live.get("press-charlie")["pages:shop"], "1.0.0");
  assert.equal((await registry.getShop("press-alpha")).release.version, "1.1.0");
});

test("a deploy that throws is rolled back too; with no earlier release a person is asked", async () => {
  const thrown = await setup({ broken: { "1.1.0": { "lmb-test-shop": "deploy" } } });
  const result = await thrown.run("1.1.0");
  assert.equal(result.shops[0].status, "rolled-back");
  assert.match(result.shops[0].error, /the deploy failed: functions deploy exited with 2/);

  const fresh = await setup({ on: null, broken: { "1.1.0": { "*": "check" } } });
  const first = await fresh.run("1.1.0");
  assert.equal(first.shops[0].status, "failed");
  assert.match(first.shops[0].error, /no earlier release to go back to, so a person looks at it/);
});

test("data changes run before the new server code; a failed one stops the release and rolls the shop back", async () => {
  const good = await setup();
  await good.run("1.1.0");
  const order = good.world.calls.filter(([kind, id]) => id === "press-bravo" && kind !== "pages").map(([kind]) => kind);
  assert.deepEqual(order, ["rules", "migrate", "functions"]);
  const stockroomOnly = await setup({ rows: [TEST, row("press-stockroom", { plan: "stockroom" })] });
  await stockroomOnly.run("1.1.0");
  assert.ok(!stockroomOnly.world.calls.some(([kind, id]) => kind === "migrate" && id === "press-stockroom"), "a stockroom-only shop has no shop data");

  const bad = await setup({ broken: { "1.1.0": { "lmb-test-shop": "migrate" } } });
  const result = await bad.run("1.1.0");
  assert.equal(result.shops[0].status, "rolled-back");
  assert.match(result.shops[0].error, /the deploy failed: data change 0003-x failed/);
  assert.ok(!bad.world.calls.some(([kind, , version]) => kind === "functions" && version === "1.1.0"), "the new server code never went out");
});

test("a rollback that fails too is said plainly", async () => {
  const { run } = await setup({ broken: { "1.1.0": { "*": "check" }, "1.0.0": { "*": "pages" } } });
  const result = await run("1.1.0");
  assert.equal(result.shops[0].status, "rollback-failed");
  assert.match(result.shops[0].error, /going back to 1\.0\.0 failed too/);
});

test("a failed build stops before any deploy", async () => {
  const { run, world, registry } = await setup({ badBuilds: ["1.1.0"] });
  const result = await run("1.1.0");
  assert.match(result.error, /the build of 1\.1\.0 failed: vite build exited with 1/);
  assert.deepEqual(world.calls, []);
  assert.equal(registry.releases.get("1.1.0-run-1").ok, false);
});

test("re-running a release leaves shops already on it alone", async () => {
  const { run, world } = await setup();
  await run("1.1.0");
  const before = world.calls.filter(([kind]) => kind !== "release-check").length;
  const again = await run("1.1.0", { runId: "run-2" });
  assert.equal(again.ok, true);
  assert.deepEqual(again.shops.map((s) => s.status), ["already-on", "already-on", "already-on"]);
  assert.equal(world.calls.filter(([kind]) => kind !== "release-check").length, before, "nothing deployed twice");
});

test("a shop whose project isn't in the platform's shops folder is never deployed to", async () => {
  const { run, world } = await setup({ folders: { "press-alpha": "folders/999" } });
  const result = await run("1.1.0");
  assert.equal(result.shops[1].status, "refused");
  assert.deepEqual(shippedTo(world, "1.1.0"), ["lmb-test-shop"]);
});

test("one release at a time; a shop the shop maker is working on is not touched", async () => {
  const busy = await setup();
  await busy.registry.takeLock(RELEASE_LOCK, { runId: "other", takenAt: "2026-10-28T00:00:00.000Z", expiresAt: "2999-01-01T00:00:00.000Z" });
  assert.equal((await busy.run("1.1.0")).locked, true);
  assert.deepEqual(busy.world.calls, []);

  const making = await setup();
  await making.registry.takeLock("press-alpha", { runId: "setup-run", takenAt: "2026-10-28T00:00:00.000Z", expiresAt: "2999-01-01T00:00:00.000Z" });
  const result = await making.run("1.1.0");
  assert.equal(result.shops[1].status, "busy");
  assert.deepEqual(shippedTo(making.world, "1.1.0"), ["lmb-test-shop"]);
});

test("dry run prints the plan and changes nothing; a bad version or missing folder is refused", async () => {
  const { run, world, registry, lines } = await setup({ rows: [TEST, row("press-alpha"), row("press-new", { status: "creating" })] });
  const result = await run("1.1.0", { dryRun: true });
  assert.deepEqual(result.rings, [["lmb-test-shop"], ["press-alpha"]]);
  assert.deepEqual(world.calls, []);
  assert.equal(registry.releases.size, 0);
  assert.ok(lines.some((line) => /Left out press-new: not live/.test(line)));
  await assert.rejects(run("latest"), /isn't a release version/);
  await assert.rejects(run("1.1.0", { config: {} }), /needs the shops folder/);
});

test("the real entry point refuses to start without its folder and build root", async () => {
  const { realRelease } = await import("./run.js");
  await assert.rejects(realRelease({ version: "1.1.0", env: {}, fetch: async () => { throw new Error("no network in tests"); } }), /RELEASE_FOLDER is not set/);
});

test("the builder builds a release's tag once and reuses it", async () => {
  const runs = [];
  const made = new Set();
  const builder = releaseBuilder({
    root: "/builds", source: "/repo",
    run: async (command, args, { cwd }) => {
      runs.push([command, ...args, cwd].join(" "));
      if (args[0] === "worktree") made.add(args[3]);
    },
    exists: (path) => made.has(path),
    writeText: async (path) => void made.add(path),
  });
  assert.equal(await builder.build("1.1.0"), "/builds/1.1.0");
  await builder.build("1.1.0");
  assert.equal(tagOf("1.1.0"), "release-1.1.0");
  assert.deepEqual(runs, [
    "git worktree add --detach /builds/1.1.0 release-1.1.0 /repo",
    "pnpm install --frozen-lockfile /builds/1.1.0/apps/shop",
    "pnpm exec vite build /builds/1.1.0/apps/shop",
    "npm ci /builds/1.1.0/apps/shop/functions",
    "npm ci /builds/1.1.0/apps/stockroom",
    "npm run build /builds/1.1.0/apps/stockroom",
  ]);
});
