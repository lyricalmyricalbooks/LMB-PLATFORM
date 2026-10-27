import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { latestByStep, runSteps, stepProblems } from "./runner.js";
import { REGION, SERVICES, firstSteps, projectDisplayName, shopProblems, shopProfile } from "./steps.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry } from "./fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "./test-shop.js";
import { dryRun } from "./dry-run.js";
import { profileProblems } from "../profile/profile.js";

function setup({ failOnce = [], shop = TEST_SHOP } = {}) {
  const google = fakeGoogle({ failOnce });
  const registry = fakeRegistry();
  const profileFiles = fakeProfileFiles();
  // The shop's audit log exists once its database does.
  const auditLog = fakeAuditLog({ isReady: (shopId) => google.world.databases.has(shopId) });
  const steps = firstSteps({ google, registry, profileFiles, config: TEST_CONFIG });
  const run = (options = {}) => runSteps({ shop, steps, registry, auditLog, ...options });
  return { google, registry, profileFiles, auditLog, steps, run };
}

test("steps 1–6 are numbered and complete", () => {
  const { steps } = setup();
  assert.deepEqual(stepProblems(steps), []);
  assert.equal(steps.length, 6);
});

test("a full run makes the test shop in Montréal, with its profile in the registry and the served file", async () => {
  const { google, registry, profileFiles, auditLog, run } = setup();
  const result = await run();
  assert.equal(result.ok, true, result.error);

  const row = await registry.getShop("lmb-test-shop");
  assert.equal(row.status, "creating");
  assert.equal(row.ownerEmail, "owner@example.com");
  assert.equal(row.region, REGION);

  const project = google.world.projects.get("lmb-test-shop");
  assert.equal(project.parent, TEST_CONFIG.folder);
  assert.equal(project.displayName, "Test Press");
  assert.deepEqual(google.world.billing.get("lmb-test-shop"), { billingEnabled: true, billingAccountName: TEST_CONFIG.billingAccount });
  assert.deepEqual([...google.world.services.get("lmb-test-shop")].sort(), [...SERVICES].sort());
  assert.equal(google.world.databases.get("lmb-test-shop").locationId, "northamerica-northeast1");
  assert.equal(google.world.buckets.get("lmb-test-shop").location.toLowerCase(), "northamerica-northeast1");

  const profile = await registry.getProfile("lmb-test-shop");
  assert.deepEqual(profileProblems(profile), []);
  assert.equal(profile.functionsRegion, "northamerica-northeast1");
  assert.equal(profile.siteUrl, "https://lmb-test-shop.web.app");
  assert.deepEqual(profile.apps, { shop: true, stockroom: true });
  const window = {};
  vm.runInNewContext(await profileFiles.read("lmb-test-shop"), { window });
  assert.deepEqual(JSON.parse(JSON.stringify(window.__SHOP_PROFILE__)), profile);

  // The audit log only exists from step 5, and still holds steps 1–6.
  assert.deepEqual([...auditLog.entries.get("lmb-test-shop").values()].map((e) => e.step).sort(), [1, 2, 3, 4, 5, 6]);
});

test("running again changes nothing at Google", async () => {
  const { google, registry, profileFiles, auditLog, steps } = setup();
  await runSteps({ shop: TEST_SHOP, steps, registry, auditLog });
  const changes = google.calls.length;
  // A registry that forgets its step history makes every step check again; every check finds its work done.
  const forgetful = { ...registry, readSteps: async () => [], recordStep: async () => {} };
  const second = await runSteps({ shop: TEST_SHOP, steps, registry: forgetful, auditLog });
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(second.ran.map((r) => r.status), Array(6).fill("already-done"));
  assert.equal(google.calls.length, changes);
  assert.ok(await profileFiles.read("lmb-test-shop"));
});

test("a Google error stops the run, and the next run picks up at that step without making a second project", async () => {
  const { google, registry, run } = setup({ failOnce: ["firestore.createDatabase"] });
  const first = await run();
  assert.equal(first.failedStep, 5);
  assert.match(first.error, /pretend Google error/);
  assert.equal(latestByStep(await registry.readSteps("lmb-test-shop"))[5].status, "failed");

  const second = await run();
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(second.ran.map((r) => r.status), ["done-before", "done-before", "done-before", "done-before", "done", "done"]);
  assert.equal(google.calls.filter(([name]) => name === "projects.create").length, 1);
});

test("a project created but not yet billed is finished on the retry, not made again", async () => {
  const { google, run } = setup({ failOnce: ["billing.link"] });
  assert.equal((await run()).failedStep, 2);
  assert.ok(google.world.projects.has("lmb-test-shop"));
  assert.equal((await run()).ok, true);
  assert.equal(google.calls.filter(([name]) => name === "projects.create").length, 1);
  assert.equal(google.calls.filter(([name]) => name === "billing.link").length, 2);
});

test("only the missing services are turned on", async () => {
  const { google, run } = setup();
  google.world.projects.set("lmb-test-shop", { projectId: "lmb-test-shop", parent: TEST_CONFIG.folder, state: "ACTIVE" });
  google.world.services.set("lmb-test-shop", new Set(SERVICES.slice(0, 10)));
  await run();
  assert.deepEqual(google.calls.find(([name]) => name === "services.enable"), ["services.enable", "lmb-test-shop", SERVICES.length - 10]);
});

test("a shop id that belongs to another press is refused at step 1", async () => {
  const { registry, google, run } = setup();
  await registry.createShop("lmb-test-shop", { shopId: "lmb-test-shop", ownerEmail: "someone-else@example.com" });
  const result = await run();
  assert.equal(result.failedStep, 1);
  assert.match(result.error, /belongs to another press/);
  assert.deepEqual(google.calls, []);
});

test("a project outside the shops folder, or marked for deletion, stops the run and is left alone", async () => {
  for (const [project, reason] of [
    [{ parent: "folders/999999999999", state: "ACTIVE" }, /outside the shops folder/],
    [{ parent: TEST_CONFIG.folder, state: "DELETE_REQUESTED" }, /marked for deletion/],
  ]) {
    const { google, run } = setup();
    google.world.projects.set("lmb-test-shop", { projectId: "lmb-test-shop", ...project });
    const result = await run();
    assert.equal(result.failedStep, 2);
    assert.match(result.error, reason);
    assert.deepEqual(google.calls, [], "nothing at Google was changed");
  }
});

test("a database in another region stops the run instead of being replaced", async () => {
  const { google, run } = setup();
  google.world.databases.set("lmb-test-shop", { locationId: "us-central1" });
  google.world.projects.set("lmb-test-shop", { projectId: "lmb-test-shop", parent: TEST_CONFIG.folder, state: "ACTIVE" });
  const result = await run();
  assert.equal(result.failedStep, 5);
  assert.match(result.error, /us-central1, not northamerica-northeast1/);
  assert.ok(!google.calls.some(([name]) => name.startsWith("firestore.")));
});

test("a profile that drifted from the web app is written again", async () => {
  const { registry, profileFiles, run, steps } = setup();
  await run();
  await profileFiles.write("lmb-test-shop", "// edited by hand\n");
  assert.equal(await steps[5].check({ shop: TEST_SHOP }), false);
  const profile = await registry.getProfile("lmb-test-shop");
  await steps[5].act({ shop: TEST_SHOP });
  assert.equal(await steps[5].check({ shop: TEST_SHOP }), true);
  assert.deepEqual(await registry.getProfile("lmb-test-shop"), profile);
});

test("the dry run for the test shop prints all six steps and changes nothing", async () => {
  const google = fakeGoogle();
  const registry = fakeRegistry();
  const profileFiles = fakeProfileFiles();
  const lines = [];
  const result = await dryRun({ google, registry, profileFiles, print: (line) => lines.push(line) });
  assert.equal(result.ok, true);
  assert.equal(lines.length, 7);
  assert.match(lines[0], /Dry run for lmb-test-shop/);
  assert.deepEqual(result.ran.map((r) => r.status), Array(6).fill("would-run"));
  assert.deepEqual(google.calls, []);
  assert.equal(registry.shops.size + registry.profiles.size + profileFiles.files.size, 0);
});

test("bad sign-up details are refused before Google is asked anything", async () => {
  assert.deepEqual(shopProblems(TEST_SHOP), []);
  assert.equal(shopProblems({ ...TEST_SHOP, shopId: "Moth Press" }).length, 1);
  assert.equal(shopProblems({ ...TEST_SHOP, shopId: "short" }).length, 1);
  assert.equal(shopProblems({ ...TEST_SHOP, shopId: "ends-with-hyphen-" }).length, 1);
  assert.equal(shopProblems({ ...TEST_SHOP, plan: "everything" }).length, 1);
  assert.equal(shopProblems({ ...TEST_SHOP, ownerEmail: "nobody" }).length, 1);
  const { google, run } = setup({ shop: { ...TEST_SHOP, country: "Canada" } });
  const result = await run();
  assert.equal(result.failedStep, 1);
  assert.match(result.error, /two-letter code/);
  assert.deepEqual(google.calls, []);
});

test("the profile follows the plan, and the project name fits Google's rules", () => {
  const settings = { apiKey: "k", authDomain: "a", projectId: "lmb-test-shop", storageBucket: "b", messagingSenderId: "1", appId: "x" };
  assert.deepEqual(shopProfile({ ...TEST_SHOP, plan: "shop" }, settings).apps, { shop: true, stockroom: false });
  assert.deepEqual(shopProfile({ ...TEST_SHOP, plan: "stockroom" }, settings).apps, { shop: false, stockroom: true });
  assert.equal(projectDisplayName({ ...TEST_SHOP, pressName: "Éditions du Lièvre & Co. — Montréal, Québec" }), "ditions du Livre Co Montral Qu");
  assert.equal(projectDisplayName({ ...TEST_SHOP, pressName: "鳥" }), "lmb-test-shop");
});

test("missing platform settings are refused", () => {
  const args = { google: fakeGoogle(), registry: fakeRegistry(), profileFiles: fakeProfileFiles() };
  assert.throws(() => firstSteps({ ...args, config: { ...TEST_CONFIG, folder: "" } }), /shops folder/);
  assert.throws(() => firstSteps({ ...args, config: { ...TEST_CONFIG, billingAccount: "x" } }), /billingAccounts/);
});

// Built from parts so this file doesn't name them itself.
const LIVE = [["lyricalmyrical", "web-v2"].join("-"), ["lyricalmyrical", "37c46"].join("-"), ["lyrical", "inventory"].join("-")];

test("setup/ names no live Lyricalmyrical project and calls nothing over the network", () => {
  for (const name of readdirSync(new URL(".", import.meta.url))) {
    if (!name.endsWith(".js") || name === "steps.test.js") continue;
    const text = readFileSync(new URL(name, import.meta.url), "utf8");
    for (const id of LIVE) assert.ok(!text.includes(id), `${name} names ${id}`);
    assert.doesNotMatch(text, /\bfetch\(|https:\/\/[a-z.]*googleapis\.com|node:https?\b/, name);
  }
});
