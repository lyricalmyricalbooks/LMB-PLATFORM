// The domain service for a shop in the shared system (docs/shared-system.md): its addresses are entries in the front
// door's address book (`addresses/{host}`), its server settings and profile are fields of its record, and nothing is
// deployed. A shop with a project of its own is refused on the hosted server (`sharedOnly`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainService, domainState } from "./domains.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting, fakeProfileFiles } from "./fakes.js";
import { fakePlatformZone } from "./platformZone.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const SHARED = "lmb-test-shop";
const SHOP = "moth-press";
const FREE = "moth-press.shops.example";
const NOW = Date.parse("2026-11-10T12:00:00Z");
const SERVER = { SHOP_SITE_URL: `https://${FREE}`, SHOP_EXTRA_ORIGINS: "", SHOP_PAYMENT_MODE: "platform" };
const PROFILE = { version: 1, shopId: SHOP, name: "Moth Press", siteUrl: `https://${FREE}` };

/** The shared project's record and address book, kept in memory. */
function fakeSharedStores() {
  const records = new Map();
  const addresses = new Map();
  return {
    recordsMap: records,
    addressesMap: addresses,
    records: {
      get: async (shopId) => structuredClone(records.get(shopId) ?? null),
      async set(shopId, data, { fields } = {}) {
        const have = records.get(shopId) ?? {};
        records.set(shopId, fields ? { ...have, ...Object.fromEntries(fields.map((f) => [f, structuredClone(data[f])])) } : structuredClone(data));
      },
    },
    addresses: {
      get: async (host) => structuredClone(addresses.get(host) ?? null),
      async create(host, data) {
        if (addresses.has(host)) return false;
        addresses.set(host, structuredClone(data));
        return true;
      },
      async remove(host) { return addresses.delete(host); },
    },
  };
}

async function world({ others = [], sharedOnly = true } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHARED, shared: true, status: "live", region: "northamerica-northeast1", freeAddress: FREE, domains: [] });
  for (const row of others) await registry.createShop(row.shopId, row);
  await registry.saveProfile(SHOP, PROFILE);
  const shared = fakeSharedStores();
  shared.recordsMap.set(SHOP, { tenant: "moth-press-ab12", ownerEmail: "owner@example.com", status: "open", server: SERVER, profile: PROFILE });
  await shared.addresses.create(FREE, { shopId: SHOP, kind: "free" });
  const hosting = fakeHosting();
  const deploy = fakeDeploy();
  const published = [];
  const service = createDomainService({
    registry, auditLog: fakeAuditLog(), hosting, envFiles: fakeEnvFiles(), profileFiles: fakeProfileFiles(), deploy,
    platformDomain: "platform.example", freeAddress: { domain: "shops.example" }, platformZone: fakePlatformZone(),
    shared, publishSite: async (shopId) => void published.push(shopId), sharedOnly, now: () => NOW,
  });
  return { registry, shared, hosting, deploy, published, service };
}

test("an own domain goes in the address book first, then on the shared site; the server's settings are the record's", async () => {
  const { service, shared, hosting, deploy } = await world();
  await service.add(SHOP, "Shop.MothPress.example");
  assert.deepEqual(shared.addressesMap.get("shop.mothpress.example"), { shopId: SHOP, kind: "own", createdAt: new Date(NOW).toISOString() });
  assert.deepEqual(hosting.calls.find(([name]) => name === "addDomain"), ["addDomain", SHARED, "shop.mothpress.example"]);
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_EXTRA_ORIGINS, "https://shop.mothpress.example");
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_PAYMENT_MODE, "platform", "the record's other settings are kept");
  assert.deepEqual([...deploy.shipped, ...deploy.pagesShipped], [], "nothing is deployed in the shared system");

  // A repeat changes nothing and claims nothing twice.
  await service.add(SHOP, "shop.mothpress.example");
  assert.equal([...shared.addressesMap.keys()].filter((host) => host === "shop.mothpress.example").length, 1);
});

test("an address in another shop's book entry is refused, and nothing of that shop's changes", async () => {
  const { service, shared, hosting, registry } = await world();
  await shared.addresses.create("taken.example", { shopId: "press-two", kind: "own" });
  await assert.rejects(service.add(SHOP, "taken.example"), (err) => err.code === "in_use");
  assert.deepEqual(shared.addressesMap.get("taken.example"), { shopId: "press-two", kind: "own" });
  assert.ok(!hosting.calls.some(([name, , domain]) => name === "addDomain" && domain === "taken.example"));
  assert.deepEqual((await registry.getShop(SHOP)).domains, []);
});

test("making it main rewrites the record's site address and profile, draws the pages again, and back", async () => {
  const { service, shared, hosting, registry, published, deploy } = await world();
  await service.add(SHOP, "shop.mothpress.example");
  hosting.set(SHARED, "shop.mothpress.example", "live");
  await service.makeMain(SHOP, "shop.mothpress.example");
  const record = shared.recordsMap.get(SHOP);
  assert.equal(record.server.SHOP_SITE_URL, "https://shop.mothpress.example");
  assert.equal(record.profile.siteUrl, "https://shop.mothpress.example");
  assert.equal((await registry.getProfile(SHOP)).siteUrl, "https://shop.mothpress.example");
  assert.deepEqual(published, [SHOP]);
  assert.deepEqual([...deploy.shipped, ...deploy.pagesShipped], []);

  await service.makeMain(SHOP, FREE);
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_SITE_URL, `https://${FREE}`);
  assert.equal(shared.recordsMap.get(SHOP).profile.siteUrl, `https://${FREE}`);
  assert.deepEqual(published, [SHOP, SHOP]);
});

test("removing an address takes it off the shared site and out of the book, only when the book names this shop", async () => {
  const { service, shared, hosting } = await world();
  await service.add(SHOP, "shop.mothpress.example");
  await service.remove(SHOP, "shop.mothpress.example");
  assert.equal(shared.addressesMap.has("shop.mothpress.example"), false);
  assert.ok(hosting.calls.some(([name, project, domain]) => name === "removeDomain" && project === SHARED && domain === "shop.mothpress.example"));
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_EXTRA_ORIGINS, "");
  // The free address the shop came with stays, and can't be removed.
  await assert.rejects(service.remove(SHOP, FREE), (err) => err.code === "own_address");
  assert.deepEqual(shared.addressesMap.get(FREE), { shopId: SHOP, kind: "free" });
});

test("the free address the shop maker wrote is put on the shared site and becomes main once live", async () => {
  const { service, shared, hosting, registry } = await world();
  await service.connectFreeAddress(SHOP);
  assert.deepEqual(hosting.calls.find(([name]) => name === "addDomain"), ["addDomain", SHARED, FREE]);
  assert.deepEqual(shared.addressesMap.get(FREE), { shopId: SHOP, kind: "free" }, "the maker's entry is kept as it is");
  hosting.set(SHARED, FREE, "live");
  await service.check(SHOP, FREE);
  assert.equal((await registry.getShop(SHOP)).domains.find((d) => d.name === FREE).state, "live");
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_SITE_URL, `https://${FREE}`);
});

test("a new free name is claimed before the old one changes; an older name is let go", async () => {
  const { service, shared } = await world();
  await service.connectFreeAddress(SHOP);
  await service.renameFreeAddress(SHOP, "moth-books");
  assert.deepEqual(shared.addressesMap.get("moth-books.shops.example")?.shopId, SHOP);
  assert.equal(shared.addressesMap.get(FREE)?.shopId, SHOP, "the name before keeps opening the shop");
  await service.renameFreeAddress(SHOP, "moth-and-co");
  assert.equal(shared.addressesMap.has("moth-books.shops.example"), true, "the one just before stays");
  assert.equal(shared.addressesMap.has(FREE), false, "an older one is let go");

  await shared.addresses.create("grassy-press.shops.example", { shopId: "press-two", kind: "free" });
  await assert.rejects(service.renameFreeAddress(SHOP, "grassy-press"), (err) => err.code === "in_use");
});

test("on the hosted server a shop with a project of its own is refused in plain words, and the sweep passes it by", async () => {
  const { service } = await world({ others: [{ shopId: "other", projectId: "other", status: "live", domains: [{ name: "a.example", state: "connecting" }] }] });
  await assert.rejects(service.add("other", "b.example"), (err) => err.code === "not_shared" && /support/.test(err.message));
  assert.deepEqual((await service.checkAll()).filter((r) => r.shopId === "other"), []);
});

// Bringing a domain over from another website (14 November 2026): the whole path a press walks.
async function bringWorld({ rows = [], storesByProject = null } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHARED, shared: true, status: "live", region: "northamerica-northeast1", freeAddress: FREE, domains: [] });
  for (const row of rows) await registry.createShop(row.shopId, row);
  const shared = fakeSharedStores();
  shared.recordsMap.set(SHOP, { status: "open", server: SERVER, profile: PROFILE });
  const hosting = fakeHosting();
  const allowed = new Map();
  const listOf = (project) => allowed.get(project) ?? allowed.set(project, []).get(project);
  const signIn = {
    async allow(project, host) { if (listOf(project).includes(host)) return { changed: false }; listOf(project).push(host); return { changed: true }; },
    async forget(project, host) { allowed.set(project, listOf(project).filter((h) => h !== host)); return { changed: true }; },
  };
  const service = createDomainService({
    registry, auditLog: fakeAuditLog(), hosting, envFiles: fakeEnvFiles(), profileFiles: fakeProfileFiles(), deploy: fakeDeploy(),
    platformDomain: "platform.example", shared: storesByProject ? (row) => storesByProject[row.projectId] ?? null : shared, signIn, sharedOnly: true, now: () => NOW,
  });
  return { registry, shared, hosting, service, listOf };
}

test("a domain that still shows another website: the old lines to take out come first, then the new one, not 'in use elsewhere'", async () => {
  const { service, hosting } = await bringWorld();
  await service.add(SHOP, "mothpress.example");
  hosting.set(SHARED, "mothpress.example", "old-site");
  const found = await service.check(SHOP, "mothpress.example");
  assert.equal(found.state, "waiting_dns");
  assert.deepEqual(found.records, [
    { action: "remove", host: "mothpress.example", type: "A", value: "192.0.2.10" },
    { action: "add", host: "mothpress.example", type: "A", value: "199.36.158.100" },
  ]);
  assert.deepEqual(found.guide.lines.map((l) => [l.action, l.kind, l.name, l.value]), [["remove", "Address", "@", "192.0.2.10"], ["add", "Address", "@", "199.36.158.100"]]);
  // Google naming nothing to change is the only "in use elsewhere".
  assert.equal(domainState({ hostState: "HOST_CONFLICT", ownershipState: "OWNERSHIP_CONFLICT" }).state, "conflict");
});

test("the owner can sign in at the new address: it joins the project's sign-in list when connected and leaves it when removed", async () => {
  const { service, listOf } = await bringWorld();
  await service.connect(SHOP, "mothpress.example", { www: true });
  assert.deepEqual(listOf(SHARED), ["mothpress.example"], "the address that opens the shop, not the one that only sends visitors on");
  await service.remove(SHOP, "mothpress.example");
  assert.deepEqual(listOf(SHARED), []);
});

test("removing an address takes its www partner with it, so nothing is left sending visitors to a dead address", async () => {
  const { service, registry, shared, hosting } = await bringWorld();
  await service.connect(SHOP, "mothpress.example", { www: true });
  assert.deepEqual((await registry.getShop(SHOP)).domains.map((d) => [d.name, d.redirectTo ?? null]), [["mothpress.example", null], ["www.mothpress.example", "mothpress.example"]]);
  const left = await service.remove(SHOP, "mothpress.example");
  assert.deepEqual(left.domains, []);
  assert.equal(shared.addressesMap.has("www.mothpress.example"), false);
  assert.ok(hosting.calls.some(([name, , domain]) => name === "removeDomain" && domain === "www.mothpress.example"));
  assert.equal(shared.recordsMap.get(SHOP).server.SHOP_EXTRA_ORIGINS, "");
});

test("Check again repairs an address Google lost: it is asked for again, and the press sees its lines", async () => {
  const { service, hosting } = await bringWorld();
  await service.add(SHOP, "mothpress.example");
  await hosting.removeDomain(SHARED, "mothpress.example"); // an add that never reached Google, say
  const found = await service.check(SHOP, "mothpress.example");
  assert.equal(found.state, "waiting_dns");
  assert.ok(found.records.length > 0);
});

test("two shops in two shared projects: each address goes in its own project's book and site, never the other's", async () => {
  const test = fakeSharedStores();
  const live = fakeSharedStores();
  const other = { shopId: "press-two", projectId: "demo-live-shops", shared: true, status: "live", freeAddress: "press-two.shops.example", domains: [] };
  const { service, hosting, listOf } = await bringWorld({ rows: [other], storesByProject: { [SHARED]: test, "demo-live-shops": live } });
  test.recordsMap.set(SHOP, { server: SERVER, profile: PROFILE });
  live.recordsMap.set("press-two", { server: { ...SERVER, SHOP_SITE_URL: "https://press-two.shops.example" }, profile: PROFILE });
  await service.add(SHOP, "mothpress.example");
  await service.add("press-two", "presstwo.example");
  assert.deepEqual([...test.addressesMap.keys()], ["mothpress.example"]);
  assert.deepEqual([...live.addressesMap.keys()], ["presstwo.example"]);
  assert.deepEqual(hosting.calls.filter(([name]) => name === "addDomain").map(([, project, domain]) => [project, domain]), [[SHARED, "mothpress.example"], ["demo-live-shops", "presstwo.example"]]);
  assert.equal(live.recordsMap.get("press-two").server.SHOP_EXTRA_ORIGINS, "https://presstwo.example");
  assert.equal(test.recordsMap.get(SHOP).server.SHOP_EXTRA_ORIGINS, "https://mothpress.example");
  assert.deepEqual([listOf(SHARED), listOf("demo-live-shops")], [["mothpress.example"], ["presstwo.example"]]);
  // One shop can never take the other's address, whichever project holds it.
  await assert.rejects(service.add(SHOP, "presstwo.example"), (err) => err.code === "in_use");
  await assert.rejects(service.remove(SHOP, "presstwo.example"), (err) => err.code === "unknown_domain");
  assert.deepEqual([...live.addressesMap.keys()], ["presstwo.example"]);
});
