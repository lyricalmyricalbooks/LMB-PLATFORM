import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainService, domainState } from "./domains.js";
import { domainOrigins, domainProblem, normalDomain, withExtraOrigins } from "./names.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const ENV = 'SHOP_OWNER_EMAIL="owner@example.com"\nSHOP_EXTRA_ORIGINS=""\nSHOP_PAYMENT_MODE="platform"\n';

async function world({ payments = { provider: "stripe", accountId: "acct_moth", mode: "live" }, others = [], env = ENV } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, status: "live", region: "northamerica-northeast1", serviceKeyHash: hashServiceKey(KEY), payments });
  for (const row of others) await registry.createShop(row.shopId, row);
  const auditLog = fakeAuditLog();
  const hosting = fakeHosting();
  const deploy = fakeDeploy();
  const envFiles = fakeEnvFiles(env ? { [SHOP]: env } : {});
  const registered = [];
  const paymentsClient = { async registerPaymentDomain(shopId, domain) { registered.push([shopId, domain]); return { id: "pmd_1" }; } };
  const service = createDomainService({ registry, auditLog, hosting, envFiles, deploy, payments: paymentsClient, platformDomain: "platform.example", now: () => NOW });
  const call = (op, args = {}, key = KEY) => service.shopCall({ headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${key}` }, body: { op, args } });
  return { registry, auditLog, hosting, deploy, envFiles, registered, service, call };
}

test("addresses are checked in plain words", () => {
  assert.equal(normalDomain(" https://Shop.MothPress.example/about "), "shop.mothpress.example");
  assert.equal(domainProblem("shop.mothpress.example", { platformDomain: "platform.example" }), null);
  for (const bad of ["", "mothpress", "-bad.example", "shop..example", "moth press.example", "x.123"]) assert.ok(domainProblem(normalDomain(bad)), bad);
  for (const theirs of ["moth.web.app", "moth.firebaseapp.com", "localhost", "a.test"]) assert.match(domainProblem(theirs), /can't be used/, theirs);
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
  const other = { shopId: "fern-press", projectId: "fern-press", domains: [{ name: "books.fern.example" }] };
  const { call, hosting, deploy } = await world({ others: [other] });
  assert.equal((await call("domains.add", { domain: "moth.platform.example" })).status, 400);
  assert.equal((await call("domains.add", { domain: `${SHOP}.web.app` })).status, 400);
  const taken = await call("domains.add", { domain: "books.fern.example" });
  assert.deepEqual([taken.status, taken.body.error.code], [409, "in_use"]);
  for (const d of ["a.moth.example", "b.moth.example", "c.moth.example"]) assert.equal((await call("domains.add", { domain: d })).status, 200, d);
  assert.equal((await call("domains.add", { domain: "d.moth.example" })).body.error.code, "too_many");
  assert.equal((await call("domains.check", { domain: "nope.example" })).status, 404);
  assert.equal((await call("domains.list", {}, "x".repeat(40))).status, 401);
  assert.equal((await call("domains.remove", { domain: "a.moth.example" })).status, 400, "nothing removes an address");
  assert.ok(!hosting.calls.some(([, , d]) => d === "books.fern.example"));
  assert.equal(deploy.shipped.length, 3, "one redeploy per new address");
});

test("Google failing is a plain answer, and the address is kept to try again", async () => {
  const { service, hosting, registry } = await world();
  hosting.addDomain = async () => { throw new Error("quota"); };
  const res = await service.shopCall({ headers: { "x-shop-id": SHOP, authorization: `Bearer ${KEY}` }, body: { op: "domains.add", args: { domain: "shop.mothpress.example" } } });
  assert.equal(res.status, 502);
  assert.match(res.body.error.message, /Try again/);
  assert.equal((await registry.getShop(SHOP)).domains.length, 1);
});
