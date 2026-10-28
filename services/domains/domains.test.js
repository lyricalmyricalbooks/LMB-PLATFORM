import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainService, domainState } from "./domains.js";
import { domainOrigins, domainProblem, mainAddress, normalDomain, siteUrlOf, withExtraOrigins, withSiteUrl } from "./names.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting, fakeProfileFiles } from "./fakes.js";
import { profileScript } from "../../profile/profile.js";
import { handleDomains } from "./http.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const ENV = 'SHOP_OWNER_EMAIL="owner@example.com"\nSHOP_SITE_URL="https://moth-press.web.app"\nSHOP_EXTRA_ORIGINS=""\nSHOP_PAYMENT_MODE="platform"\n';
const PROFILE = {
  version: 1, shopId: SHOP, name: "Moth Press", functionsRegion: "northamerica-northeast1", siteUrl: `https://${SHOP}.web.app`, apps: { shop: true, stockroom: false },
  firebase: { apiKey: "AIzaSyFakeKeyForTests000000000000000000", authDomain: `${SHOP}.firebaseapp.com`, projectId: SHOP, storageBucket: `${SHOP}.firebasestorage.app`, messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123" },
};

async function world({ payments = { provider: "stripe", accountId: "acct_moth", mode: "live" }, others = [], env = ENV } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, status: "live", region: "northamerica-northeast1", serviceKeyHash: hashServiceKey(KEY), payments });
  for (const row of others) await registry.createShop(row.shopId, row);
  const auditLog = fakeAuditLog();
  const hosting = fakeHosting();
  const deploy = fakeDeploy();
  const envFiles = fakeEnvFiles(env ? { [SHOP]: env } : {});
  await registry.saveProfile(SHOP, PROFILE);
  const profileFiles = fakeProfileFiles({ [SHOP]: profileScript(PROFILE) });
  const registered = [];
  const paymentsClient = { async registerPaymentDomain(shopId, domain) { registered.push([shopId, domain]); return { id: "pmd_1" }; } };
  const service = createDomainService({ registry, auditLog, hosting, envFiles, profileFiles, deploy, payments: paymentsClient, platformDomain: "platform.example", now: () => NOW });
  const call = (op, args = {}, key = KEY) => service.shopCall({ headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${key}` }, body: { op, args } });
  return { registry, auditLog, hosting, deploy, envFiles, profileFiles, registered, service, call };
}

test("addresses are checked in plain words", () => {
  assert.equal(normalDomain(" https://Shop.MothPress.example/about "), "shop.mothpress.example");
  assert.equal(domainProblem("shop.mothpress.example", { platformDomain: "platform.example" }), null);
  for (const bad of ["", "mothpress", "-bad.example", "shop..example", "moth press.example", "x.123"]) assert.ok(domainProblem(normalDomain(bad)), bad);
  for (const theirs of ["moth-press.web.app", "moth-press.firebaseapp.com", "localhost", "a.test"]) assert.match(domainProblem(theirs), /can't be used/, theirs);
  assert.match(domainProblem("moth.platform.example", { platformDomain: "platform.example" }), /belongs to the platform/);
  assert.deepEqual(domainOrigins([{ name: "b.example" }, "a.example", { name: "b.example" }, null]), ["https://a.example", "https://b.example"]);
  assert.equal(withExtraOrigins(ENV, ["https://a.example"]), ENV.replace('SHOP_EXTRA_ORIGINS=""', 'SHOP_EXTRA_ORIGINS="https://a.example"'));
  assert.match(withExtraOrigins('A="1"', ["https://a.example"]), /^A="1"\nSHOP_EXTRA_ORIGINS="https:\/\/a\.example"\n$/);
});

test("Google's state reads as the press's: DNS to change, securing, live, or taken", () => {
  assert.deepEqual(domainState(null), { state: "missing", records: [] });
  const waiting = domainState({ hostState: "HOST_UNHOSTED", requiredDnsUpdates: { desired: [{ domainName: "a.example", records: [
    { domainName: "a.example", type: "A", rdata: "199.36.158.100", requiredAction: "ADD" },
    { type: "TXT", rdata: "x", requiredAction: "NONE" },
  ] }] } });
  assert.deepEqual(waiting, { state: "waiting_dns", records: [{ action: "add", host: "a.example", type: "A", value: "199.36.158.100" }] });
  assert.equal(domainState({ hostState: "HOST_ACTIVE", cert: { state: "CERT_VALIDATING" } }).state, "securing");
  assert.equal(domainState({ hostState: "HOST_ACTIVE", cert: { state: "CERT_ACTIVE" } }).state, "live");
  assert.equal(domainState({ hostState: "HOST_CONFLICT" }).state, "conflict");
});

test("adding an address lets it call the server code first, then asks Hosting to serve it, and lists the DNS records", async () => {
  const { call, registry, hosting, deploy, envFiles, auditLog } = await world();
  const res = await call("domains.add", { domain: "Shop.MothPress.example" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.state, "waiting_dns");
  assert.deepEqual(res.body.records.map((r) => r.action), ["add", "remove"]);
  assert.deepEqual((await registry.getShop(SHOP)).domains, [{ name: "shop.mothpress.example", state: "waiting_dns", addedAt: "2026-10-28T12:00:00.000Z" }]);
  assert.match(envFiles.map.get(SHOP), /^SHOP_EXTRA_ORIGINS="https:\/\/shop\.mothpress\.example"$/m);
  // Redeployed at the version the shop runs, with the new file, before Hosting was asked.
  assert.deepEqual(deploy.shipped.map((d) => [d.version, d.region]), [["1.4.0", "northamerica-northeast1"]]);
  assert.equal(deploy.shipped[0].envFile, envFiles.map.get(SHOP));
  assert.deepEqual(hosting.calls.filter(([n]) => n === "addDomain"), [["addDomain", SHOP, "shop.mothpress.example"]]);
  assert.ok(auditLog.entries?.size !== 0);

  // Again: nothing new is saved, deployed or added twice.
  const again = await call("domains.add", { domain: "shop.mothpress.example" });
  assert.equal(again.status, 200);
  assert.equal(deploy.shipped.length, 1);
  assert.equal((await registry.getShop(SHOP)).domains.length, 1);
});

test("once live, the address is registered for Apple Pay and Google Pay, once", async () => {
  const { call, hosting, registered, registry } = await world();
  await call("domains.add", { domain: "shop.mothpress.example" });
  hosting.set(SHOP, "shop.mothpress.example", "securing");
  assert.equal((await call("domains.check", { domain: "shop.mothpress.example" })).body.state, "securing");
  assert.deepEqual(registered, []);
  hosting.set(SHOP, "shop.mothpress.example", "live");
  const live = await call("domains.check", { domain: "shop.mothpress.example" });
  assert.deepEqual([live.body.state, live.body.paymentDomain], ["live", "registered"]);
  await call("domains.check", { domain: "shop.mothpress.example" });
  assert.deepEqual(registered, [[SHOP, "shop.mothpress.example"]]);
  const saved = (await registry.getShop(SHOP)).domains[0];
  assert.equal(saved.state, "live");
  assert.equal(saved.paymentDomainAt, "2026-10-28T12:00:00.000Z");
  const listed = await call("domains.list");
  assert.deepEqual(listed.body.domains.map((d) => [d.name, d.state]), [["shop.mothpress.example", "live"]]);
});

test("a Square shop's live address needs no payment domain", async () => {
  const { call, hosting, registered } = await world({ payments: { provider: "square", mode: "test" } });
  await call("domains.add", { domain: "shop.mothpress.example" });
  hosting.set(SHOP, "shop.mothpress.example", "live");
  assert.equal((await call("domains.check", { domain: "shop.mothpress.example" })).body.state, "live");
  assert.deepEqual(registered, []);
});

test("refusals: a bad address, one another shop has, too many, an unknown one, a wrong key", async () => {
  const other = { shopId: "press-two", projectId: "press-two", domains: [{ name: "books.fern.example" }] };
  const { call, hosting, deploy } = await world({ others: [other] });
  assert.equal((await call("domains.add", { domain: "moth.platform.example" })).status, 400);
  assert.equal((await call("domains.add", { domain: `${SHOP}.web.app` })).status, 400);
  const taken = await call("domains.add", { domain: "books.fern.example" });
  assert.deepEqual([taken.status, taken.body.error.code], [409, "in_use"]);
  for (const d of ["a.moth.example", "b.moth.example", "c.moth.example"]) assert.equal((await call("domains.add", { domain: d })).status, 200, d);
  assert.equal((await call("domains.add", { domain: "d.moth.example" })).body.error.code, "too_many");
  assert.equal((await call("domains.check", { domain: "nope.example" })).status, 404);
  assert.equal((await call("domains.list", {}, "x".repeat(40))).status, 401);
  assert.equal(deploy.shipped.length, 3, "one redeploy per new address");
  // Another shop's address can't be removed or made main from this shop.
  assert.equal((await call("domains.remove", { domain: "books.fern.example" })).status, 404);
  assert.equal((await call("domains.makeMain", { domain: "books.fern.example" })).status, 404);
  assert.ok(!hosting.calls.some(([, , d]) => d === "books.fern.example"));
});

test("the door takes shop calls only, as POST /shop", async () => {
  const { service } = await world();
  const headers = { "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` };
  assert.equal((await handleDomains({ method: "GET", path: "/shop", headers }, { service })).status, 405);
  assert.equal((await handleDomains({ method: "POST", path: "/other", headers }, { service })).status, 404);
  const listed = await handleDomains({ method: "POST", path: "/shop/", headers, body: { op: "domains.list" } }, { service });
  assert.deepEqual(listed, { status: 200, body: { domains: [], own: `${SHOP}.web.app`, main: `${SHOP}.web.app`, max: 3 } });
});

test("Google failing is a plain answer, and the address is kept to try again", async () => {
  const { service, hosting, registry } = await world();
  hosting.addDomain = async () => { throw new Error("quota"); };
  const res = await service.shopCall({ headers: { "x-shop-id": SHOP, authorization: `Bearer ${KEY}` }, body: { op: "domains.add", args: { domain: "shop.mothpress.example" } } });
  assert.equal(res.status, 502);
  assert.match(res.body.error.message, /Try again/);
  assert.equal((await registry.getShop(SHOP)).domains.length, 1);
});

// Plan 5.9: remove an address, and choose the shop's main address.

async function liveShop(options) {
  const w = await world(options);
  await w.call("domains.add", { domain: "shop.mothpress.example" });
  w.hosting.set(SHOP, "shop.mothpress.example", "live");
  return w;
}

test("main address rules: the registry's choice when it is one of the shop's addresses, else its own", () => {
  const row = { shopId: SHOP, domains: [{ name: "shop.mothpress.example" }] };
  assert.equal(mainAddress(row), `${SHOP}.web.app`);
  assert.equal(mainAddress({ ...row, mainDomain: "shop.mothpress.example" }), "shop.mothpress.example");
  assert.equal(mainAddress({ ...row, mainDomain: "gone.example" }), `${SHOP}.web.app`, "a removed address is never main");
  assert.equal(siteUrlOf({ ...row, projectId: "press-two" }), "https://press-two.web.app");
  assert.equal(withSiteUrl(ENV, "https://a.example"), ENV.replace('SHOP_SITE_URL="https://moth-press.web.app"', 'SHOP_SITE_URL="https://a.example"'));
  assert.match(withSiteUrl('A="1"', "https://a.example"), /^A="1"\nSHOP_SITE_URL="https:\/\/a\.example"\n$/);
});

test("making a live address main moves emails, links, the sitemap and Apple Pay to it, once", async () => {
  const { call, registry, envFiles, profileFiles, deploy, registered } = await liveShop();
  const res = await call("domains.makeMain", { domain: "Shop.MothPress.example" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.main, "shop.mothpress.example");
  assert.deepEqual(res.body.domains.map((d) => [d.name, d.main]), [["shop.mothpress.example", true]]);
  assert.equal(res.body.paymentDomain, "registered");
  assert.deepEqual(registered, [[SHOP, "shop.mothpress.example"]]);
  assert.equal((await registry.getShop(SHOP)).mainDomain, "shop.mothpress.example");
  // Emails and order links: the server settings, redeployed at the version the shop runs.
  assert.match(envFiles.map.get(SHOP), /^SHOP_SITE_URL="https:\/\/shop\.mothpress\.example"$/m);
  assert.equal(deploy.shipped.at(-1).envFile, envFiles.map.get(SHOP));
  // Canonical links, the sitemap and the feed: the profile, shipped with the pages again.
  assert.equal((await registry.getProfile(SHOP)).siteUrl, "https://shop.mothpress.example");
  assert.match(profileFiles.map.get(SHOP), /"siteUrl": "https:\/\/shop\.mothpress\.example"/);
  assert.deepEqual(deploy.pagesShipped, [{ shopId: SHOP, version: "1.4.0", app: "shop" }]);
  const events = (await registry.readEvents?.(SHOP)) ?? [];
  if (events.length) assert.ok(events.some((e) => e.kind === "domains.main"));

  // Again: nothing is saved or deployed twice.
  const deploys = deploy.shipped.length;
  assert.equal((await call("domains.makeMain", { domain: "shop.mothpress.example" })).status, 200);
  assert.equal(deploy.shipped.length, deploys);
  assert.equal(deploy.pagesShipped.length, 1);

  // Back to the shop's own address.
  const back = await call("domains.makeMain", { domain: `${SHOP}.web.app` });
  assert.equal(back.body.main, `${SHOP}.web.app`);
  assert.equal((await registry.getShop(SHOP)).mainDomain, null);
  assert.match(envFiles.map.get(SHOP), /^SHOP_SITE_URL="https:\/\/moth-press\.web\.app"$/m);
  assert.equal((await registry.getProfile(SHOP)).siteUrl, `https://${SHOP}.web.app`);
  assert.equal(deploy.pagesShipped.length, 2);
});

test("only a working address can be main", async () => {
  const { call, hosting, registry } = await world();
  await call("domains.add", { domain: "shop.mothpress.example" });
  const waiting = await call("domains.makeMain", { domain: "shop.mothpress.example" });
  assert.deepEqual([waiting.status, waiting.body.error.code], [409, "not_live"]);
  hosting.set(SHOP, "shop.mothpress.example", "securing");
  assert.equal((await call("domains.makeMain", { domain: "shop.mothpress.example" })).status, 409);
  assert.equal((await registry.getShop(SHOP)).mainDomain, undefined);
  assert.equal((await call("domains.makeMain", { domain: "nope.example" })).status, 404);
});

test("removing an address stops Hosting serving it and the server code accepting it", async () => {
  const { call, registry, hosting, envFiles, deploy } = await liveShop();
  await call("domains.add", { domain: "books.mothpress.example" });
  const res = await call("domains.remove", { domain: "books.mothpress.example" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.removed, "books.mothpress.example");
  assert.deepEqual(res.body.domains.map((d) => d.name), ["shop.mothpress.example"]);
  assert.deepEqual(hosting.calls.filter(([n]) => n === "removeDomain"), [["removeDomain", SHOP, "books.mothpress.example"]]);
  assert.deepEqual((await registry.getShop(SHOP)).domains.map((d) => d.name), ["shop.mothpress.example"]);
  assert.match(envFiles.map.get(SHOP), /^SHOP_EXTRA_ORIGINS="https:\/\/shop\.mothpress\.example"$/m);
  assert.equal(deploy.shipped.at(-1).envFile, envFiles.map.get(SHOP));
  // Again: already gone, nothing else happens.
  const deploys = deploy.shipped.length;
  assert.equal((await call("domains.remove", { domain: "books.mothpress.example" })).status, 404);
  assert.equal(deploy.shipped.length, deploys);
  assert.equal(hosting.calls.filter(([n]) => n === "removeDomain").length, 1);
});

test("the main address and the shop's own address are never removed", async () => {
  const { call, registry, hosting } = await liveShop();
  await call("domains.makeMain", { domain: "shop.mothpress.example" });
  const main = await call("domains.remove", { domain: "shop.mothpress.example" });
  assert.deepEqual([main.status, main.body.error.code], [409, "is_main"]);
  assert.match(main.body.error.message, /Make another address main first/);
  const own = await call("domains.remove", { domain: `${SHOP}.web.app` });
  assert.deepEqual([own.status, own.body.error.code], [400, "own_address"]);
  assert.equal((await call("domains.remove", { domain: `${SHOP}.firebaseapp.com` })).status, 400);
  assert.equal(hosting.calls.filter(([n]) => n === "removeDomain").length, 0);
  assert.equal((await registry.getShop(SHOP)).domains.length, 1);
  // Once the shop's own address is main again, the old main one can go.
  await call("domains.makeMain", { domain: "" });
  assert.equal((await call("domains.remove", { domain: "shop.mothpress.example" })).status, 200);
});

test("a remove or a main change stopped by a failed deploy is finished by the next call", async () => {
  const { call, deploy, envFiles, registry } = await liveShop();
  await call("domains.add", { domain: "books.mothpress.example" });
  const realFunctions = deploy.functions;
  deploy.functions = async () => { throw new Error("deploy quota"); };
  assert.equal((await call("domains.remove", { domain: "books.mothpress.example" })).status, 502);
  // Hosting and the registry let it go; the server settings still list it, unsaved, until a deploy works.
  assert.match(envFiles.map.get(SHOP), /books\.mothpress\.example/);
  deploy.functions = realFunctions;
  assert.equal((await call("domains.remove", { domain: "books.mothpress.example" })).status, 404);
  assert.match(envFiles.map.get(SHOP), /^SHOP_EXTRA_ORIGINS="https:\/\/shop\.mothpress\.example"$/m);
  assert.equal(deploy.shipped.at(-1).envFile, envFiles.map.get(SHOP));

  const realPages = deploy.pages;
  deploy.pages = async () => { throw new Error("pages quota"); };
  assert.equal((await call("domains.makeMain", { domain: "shop.mothpress.example" })).status, 502);
  assert.equal((await registry.getProfile(SHOP)).siteUrl, `https://${SHOP}.web.app`, "not saved until the pages deploy");
  deploy.pages = realPages;
  assert.equal((await call("domains.makeMain", { domain: "shop.mothpress.example" })).status, 200);
  assert.equal((await registry.getProfile(SHOP)).siteUrl, "https://shop.mothpress.example");
  assert.equal(deploy.pagesShipped.length, 1);
});
