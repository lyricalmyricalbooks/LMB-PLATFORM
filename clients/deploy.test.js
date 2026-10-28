import { test } from "node:test";
import assert from "node:assert/strict";
import { deployClient, rulesStamp, siteOf } from "./deploy.js";
import { scriptedFetch, token } from "./fake-fetch.js";

const P = "lmb-test-shop";
const RULES = "https://firebaserules.googleapis.com/v1";
const FN = `https://cloudfunctions.googleapis.com/v2/projects/${P}/locations/-/functions`;
const notFound = { status: 404, json: { error: { code: 404, status: "NOT_FOUND", message: "not found" } } };

function setup(script) {
  const fetch = scriptedFetch(script);
  const runs = [];
  const written = new Map();
  const deploy = deployClient({
    fetch, token, buildDir: (version) => `/builds/${version}`,
    run: async (command, args, { cwd }) => void runs.push({ command, args, cwd }),
    writeText: async (path, text) => void written.set(path, text),
  });
  return { fetch, deploy, runs, written };
}

test("the live rules' release and apps are read from the stamp in the ruleset", async () => {
  const { fetch, deploy } = setup([
    { method: "GET", url: `${RULES}/projects/${P}/releases/cloud.firestore`, json: { name: "x", rulesetName: `projects/${P}/rulesets/r1` } },
    { method: "GET", url: `${RULES}/projects/${P}/rulesets/r1`, json: { source: { files: [{ name: "firestore.rules", content: `${rulesStamp({ version: "1.2.3", apps: ["shop", "stockroom"] })}\nrules_version = '2';` }] } } },
    { method: "GET", url: `${RULES}/projects/${P}/releases/cloud.firestore`, ...notFound },
    { method: "GET", url: `${RULES}/projects/${P}/releases/cloud.firestore`, json: { rulesetName: `projects/${P}/rulesets/r2` } },
    { method: "GET", url: `${RULES}/projects/${P}/rulesets/r2`, json: { source: { files: [{ name: "firestore.rules", content: "rules_version = '2';" }] } } },
  ]);
  assert.deepEqual(await deploy.deployed(P, "rules"), { version: "1.2.3", apps: ["shop", "stockroom"] });
  assert.equal(await deploy.deployed(P, "rules"), null);
  assert.deepEqual(await deploy.deployed(P, "rules"), { version: "unknown", apps: [] }, "rules with no stamp stop the step for a person");
  fetch.done();
});

test("the live server code's release and region come from its functions; mixed ones are shown as mixed", async () => {
  const fn = (region, version) => ({ name: `projects/${P}/locations/${region}/functions/f`, serviceConfig: { environmentVariables: { SHOP_RELEASE_VERSION: version } } });
  const { fetch, deploy } = setup([
    { method: "GET", url: FN, json: {} },
    { method: "GET", url: FN, json: { functions: [fn("northamerica-northeast1", "1.2.3")], nextPageToken: "n" } },
    { method: "GET", url: `${FN}?pageToken=n`, json: { functions: [fn("northamerica-northeast1", "1.2.3")] } },
    { method: "GET", url: FN, json: { functions: [fn("us-central1", "1.2.2"), fn("northamerica-northeast1", "1.2.3")] } },
  ]);
  assert.equal(await deploy.deployed(P, "functions"), null);
  assert.deepEqual(await deploy.deployed(P, "functions"), { version: "1.2.3", region: "northamerica-northeast1" });
  assert.deepEqual(await deploy.deployed(P, "functions"), { version: "1.2.2+1.2.3", region: "us-central1+northamerica-northeast1" });
  fetch.done();
});

test("the live pages' release comes from the latest Hosting release message", async () => {
  const H = "https://firebasehosting.googleapis.com/v1beta1/sites";
  const { fetch, deploy } = setup([
    { method: "GET", url: `${H}/${P}/releases?pageSize=1`, json: { releases: [{ message: "lmb-release 1.2.3" }] } },
    { method: "GET", url: `${H}/${P}-stockroom/releases?pageSize=1`, ...notFound },
    { method: "GET", url: `${H}/${P}/releases?pageSize=1`, json: {} },
  ]);
  assert.deepEqual(await deploy.deployed(P, "pages:shop"), { version: "1.2.3", url: `https://${P}.web.app` });
  assert.equal(await deploy.deployed(P, "pages:stockroom"), null);
  assert.equal(await deploy.deployed(P, "pages:shop"), null);
  await assert.rejects(deploy.deployed(P, "pages:other"), /unknown deploy part/);
  fetch.done();
});

test("rules deploy each plan app's rules from the release's build folder", async () => {
  const { deploy, runs } = setup([]);
  await deploy.rules(P, { version: "1.2.3", apps: ["shop", "stockroom"] });
  assert.deepEqual(runs, [
    { command: "firebase", args: ["deploy", "--only", "firestore,storage", "--project", P, "--config", "firebase.deploy.json", "--non-interactive", "--force"], cwd: "/builds/1.2.3/apps/shop" },
    { command: "firebase", args: ["deploy", "--only", "firestore,database,storage", "--project", P, "--config", "firebase.deploy.json", "--non-interactive", "--force"], cwd: "/builds/1.2.3/apps/stockroom" },
  ]);
});

test("server code is deployed with its env file and the release stamped in, then its region is checked", async () => {
  const fn = (region) => ({ functions: [{ name: `projects/${P}/locations/${region}/functions/f`, serviceConfig: { environmentVariables: { SHOP_RELEASE_VERSION: "1.2.3" } } }] });
  const { deploy, runs, written } = setup([{ method: "GET", url: FN, json: fn("northamerica-northeast1") }, { method: "GET", url: FN, json: fn("us-central1") }]);
  await deploy.functions(P, { version: "1.2.3", region: "northamerica-northeast1", envFile: 'SHOP_OWNER_EMAIL="owner@example.com"\n' });
  assert.equal(written.get(`/builds/1.2.3/apps/shop/functions/.env.${P}`), 'SHOP_OWNER_EMAIL="owner@example.com"\nSHOP_RELEASE_VERSION="1.2.3"\n');
  assert.deepEqual(runs[0].args.slice(0, 5), ["deploy", "--only", "functions", "--project", P]);
  await assert.rejects(deploy.functions(P, { version: "1.2.3", region: "northamerica-northeast1", envFile: "" }), /went to us-central1/);
});

test("pages: the stockroom gets its own site once; the deploy is stamped with the release", async () => {
  const S = `https://firebasehosting.googleapis.com/v1beta1/projects/${P}/sites`;
  const { fetch, deploy, runs } = setup([
    { method: "GET", url: `${S}/${P}-stockroom`, ...notFound },
    { method: "POST", url: `${S}?siteId=${P}-stockroom`, body: {}, json: { name: `projects/${P}/sites/${P}-stockroom` } },
    { method: "GET", url: `${S}/${P}-stockroom`, json: { name: "x" } },
  ]);
  assert.deepEqual(await deploy.pages(P, { version: "1.2.3", app: "stockroom" }), { url: `https://${P}-stockroom.web.app` });
  await deploy.pages(P, { version: "1.2.3", app: "stockroom" });
  assert.deepEqual(await deploy.pages(P, { version: "1.2.3", app: "shop" }), { url: `https://${P}.web.app` });
  assert.deepEqual(runs.map((r) => [r.cwd, r.args.at(6)]), [["/builds/1.2.3/apps/stockroom", "lmb-release 1.2.3"], ["/builds/1.2.3/apps/stockroom", "lmb-release 1.2.3"], ["/builds/1.2.3/apps/shop", "lmb-release 1.2.3"]]);
  assert.equal(siteOf(P, "shop"), P);
  fetch.done();
});
