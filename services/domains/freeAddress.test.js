// Every shop's free address on the platform's shop domain (freeAddress.js, platformZone.js, domains.js
// connectFreeAddress): a clean name from the press's name, the next number when it's taken, lines written in the
// platform's own zone, main once live, and the press's own domain taking over from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainService } from "./domains.js";
import { FALLBACK_HANDLE, baseHandle, cleanHandle, freeAddressPreview, handleCandidates, handleProblem, pickFreeAddress, readFreeAddressConfig } from "./freeAddress.js";
import { fakePlatformZone, platformZoneClient } from "./platformZone.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting, fakeProfileFiles, fakeSellers } from "./fakes.js";
import { profileScript } from "../../profile/profile.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";

const ENV = { SHOP_ADDRESS_DOMAIN: "shops.example", SHOP_ADDRESS_ZONE: "shops", SHOP_ADDRESS_ZONE_PROJECT: "lmb-platform-test" };
const CONFIG = readFreeAddressConfig(ENV, { platformDomain: "platform.example" });

test("settings: all three or none, and never the platform's own domain or one under it", () => {
  assert.equal(readFreeAddressConfig({}), null);
  assert.deepEqual(CONFIG, { domain: "shops.example", zone: "shops", project: "lmb-platform-test" });
  assert.throws(() => readFreeAddressConfig({ SHOP_ADDRESS_DOMAIN: "shops.example" }), /go together/);
  assert.throws(() => readFreeAddressConfig({ ...ENV, SHOP_ADDRESS_DOMAIN: "shops.platform.example" }, { platformDomain: "platform.example" }), /of its own/);
  assert.throws(() => readFreeAddressConfig({ ...ENV, SHOP_ADDRESS_DOMAIN: "platform.example" }, { platformDomain: "platform.example" }), /of its own/);
  assert.throws(() => readFreeAddressConfig({ ...ENV, SHOP_ADDRESS_DOMAIN: "not a domain" }), /domain like/);
});

test("names come from the press's name, then numbers; the preview shows the plain one", async () => {
  assert.deepEqual(handleCandidates("Moth Press & Co.").slice(0, 3), ["moth-press-and-co", "moth-press-and-co-2", "moth-press-and-co-3"]);
  assert.equal(freeAddressPreview("Moth Press", "shops.example"), "moth-press.shops.example");
  assert.equal(freeAddressPreview("Moth Press", ""), "");
  const taken = new Set(["moth-press.shops.example", "moth-press-2.shops.example"]);
  assert.equal(await pickFreeAddress("Moth Press", "shops.example", async (n) => taken.has(n)), "moth-press-3.shops.example");
  assert.equal(await pickFreeAddress("Moth Press", "shops.example", async () => true), null);
});

test("a name the press picks is cleaned and checked: no platform names, big brands or rude words", () => {
  assert.equal(cleanHandle("  Moth Books! "), "moth-books");
  assert.equal(cleanHandle("Éditions Café"), "editions-cafe");
  assert.equal(handleProblem("moth-books"), "");
  assert.match(handleProblem("ab"), /three/);
  assert.match(handleProblem("admin"), /kept for the platform/);
  assert.match(handleProblem("www"), /kept for the platform/);
  assert.match(handleProblem("amazon-books"), /can't be used/);
  assert.match(handleProblem("shit-press"), /can't be used/);
  assert.equal(handleProblem("grassy-press"), "", "whole words only: a rude word inside another word is fine");
  assert.match(handleProblem("xn--abc"), /letters, numbers and dashes/);
  assert.match(handleProblem("9lives"), /starting with a letter/);
  // The pick wins when it can be used; a press name that can't be an address gets the plain fallback.
  assert.equal(baseHandle("Moth Press", { handle: "moth-books" }), "moth-books");
  assert.equal(baseHandle("Moth Press", { handle: "admin" }), "moth-press");
  assert.equal(baseHandle("Amazon Books"), FALLBACK_HANDLE);
  assert.equal(freeAddressPreview("Moth Press", "shops.example", "moth-books"), "moth-books.shops.example");
  assert.equal(handleCandidates("Moth Press", { handle: "moth-books" })[1], "moth-books-2");
});

async function world({ email = null } = {}) {
  const registry = fakeRegistry();
  const PROFILE = { version: 1, shopId: "moth-press", name: "Moth Press", functionsRegion: "northamerica-northeast1", siteUrl: "https://moth-press.web.app", apps: { shop: true, stockroom: false },
    firebase: { apiKey: "AIzaSyFakeKeyForTests000000000000000000", authDomain: "moth-press.firebaseapp.com", projectId: "moth-press", storageBucket: "x", messagingSenderId: "1", appId: "1:1:web:a" } };
  for (const [shopId, pressName] of [["moth-press", "Moth Press"], ["press-two", "Moth Press"]]) {
    await registry.createShop(shopId, { shopId, projectId: shopId, pressName, ownerEmail: "owner@example.com", status: "live", region: "northamerica-northeast1" });
    await registry.saveProfile(shopId, { ...PROFILE, shopId });
  }
  const hosting = fakeHosting();
  const zone = fakePlatformZone();
  const deploy = fakeDeploy();
  const env = 'SHOP_SITE_URL="https://moth-press.web.app"\nSHOP_EXTRA_ORIGINS=""\n';
  const service = createDomainService({
    registry, auditLog: fakeAuditLog(), hosting, deploy, platformDomain: "platform.example", sellers: fakeSellers({}),
    envFiles: fakeEnvFiles({ "moth-press": env, "press-two": env }),
    profileFiles: fakeProfileFiles({ "moth-press": profileScript(PROFILE), "press-two": profileScript(PROFILE) }),
    freeAddress: CONFIG, platformZone: zone, email, now: () => Date.parse("2026-11-04T12:00:00Z"),
  });
  return { registry, hosting, zone, deploy, service };
}

test("a shop gets its clean free address, the next one gets a number, lines go in the platform's zone, and it becomes main once live", async () => {
  const t = await world();
  const first = await t.service.connectFreeAddress("moth-press");
  assert.equal(first.name, "moth-press.shops.example");
  const second = await t.service.connectFreeAddress("press-two");
  assert.equal(second.name, "moth-press-2.shops.example", "two presses with one name: the second gets a number");
  assert.ok(t.zone.lines.has("moth-press.shops.example A"), "the address's lines are written by the platform");
  assert.equal(t.zone.lines.get("moth-press.shops.example A").includes("192.0.2.10"), false, "lines Hosting wants gone are taken out");
  // Again changes nothing: same name, one entry.
  await t.service.connectFreeAddress("moth-press");
  let row = await t.registry.getShop("moth-press");
  assert.equal(row.freeAddress, "moth-press.shops.example");
  assert.equal(row.domains.length, 1);
  t.hosting.set("moth-press", "moth-press.shops.example", "live");
  await t.service.checkAll();
  row = await t.registry.getShop("moth-press");
  assert.equal(row.mainDomain, "moth-press.shops.example");
  // The press can't remove it, nor add a name on the shop domain, and it doesn't use up one of its three.
  await assert.rejects(() => t.service.remove("moth-press", "moth-press.shops.example"), (e) => e.code === "own_address" || e.code === "is_main");
  await assert.rejects(() => t.service.add("moth-press", "other.shops.example"), (e) => e.code === "bad_domain");
  for (const d of ["a.example", "b.example", "c.example"]) await t.service.add("moth-press", d);
  assert.equal((await t.registry.getShop("moth-press")).domains.length, 4);
});

test("the press's own domain from setup takes over from the free address once it is live", async () => {
  const t = await world();
  await t.service.connectFreeAddress("moth-press");
  t.hosting.set("moth-press", "moth-press.shops.example", "live");
  await t.service.checkAll();
  await t.service.connect("moth-press", "mothpress.example", { main: true });
  assert.equal((await t.registry.getShop("moth-press")).mainDomain, "moth-press.shops.example");
  t.hosting.set("moth-press", "mothpress.example", "live");
  await t.service.checkAll();
  assert.equal((await t.registry.getShop("moth-press")).mainDomain, "mothpress.example");
});

test("the name picked in setup is used, and the owner hears once when the free address works", async () => {
  const sent = [];
  const t = await world({ email: { sendPlatform: async (m) => void sent.push(m) } });
  assert.equal((await t.service.connectFreeAddress("moth-press", { handle: "moth-books" })).name, "moth-books.shops.example");
  assert.equal(sent.length, 0, "not before it works");
  t.hosting.set("moth-press", "moth-books.shops.example", "live");
  await t.service.checkAll();
  await t.service.checkAll();
  assert.deepEqual(sent.map((m) => [m.kind, m.data.domain, m.to]), [["free-address-live", "moth-books.shops.example", "owner@example.com"]]);
});

test("a new name for the free address: the one before keeps working and stays main until the new one is live", async () => {
  const t = await world();
  await t.service.connectFreeAddress("moth-press");
  t.hosting.set("moth-press", "moth-press.shops.example", "live");
  await t.service.checkAll();
  await t.service.connectFreeAddress("press-two");
  await assert.rejects(() => t.service.renameFreeAddress("moth-press", "admin"), (e) => e.code === "bad_name" && /kept for the platform/.test(e.message));
  const renamed = await t.service.renameFreeAddress("moth-press", "Moth Books");
  assert.deepEqual(renamed.domains.map((d) => [d.name, d.main, Boolean(d.former)]), [["moth-press.shops.example", true, true], ["moth-books.shops.example", false, false]]);
  let row = await t.registry.getShop("moth-press");
  assert.equal(row.freeAddress, "moth-books.shops.example");
  t.hosting.set("moth-press", "moth-books.shops.example", "live");
  await t.service.checkAll();
  row = await t.registry.getShop("moth-press");
  assert.equal(row.mainDomain, "moth-books.shops.example", "the new one takes over once it works");
  // And the one before now sends visitors on to it, so the address bar shows the new name.
  assert.ok(t.hosting.calls.some(([op, , d, to]) => op === "redirectDomain" && d === "moth-press.shops.example" && to === "moth-books.shops.example"));
  assert.equal((await t.service.list("moth-press")).domains.find((d) => d.name === "moth-press.shops.example").sendsTo, "moth-books.shops.example");
  // The one before can now be taken off by the press; the current one never.
  await assert.rejects(() => t.service.remove("moth-press", "moth-books.shops.example"), (e) => e.code === "own_address" || e.code === "is_main");
  // Another shop's name is refused in plain words. And only one name before is kept: renaming again takes off the oldest.
  await assert.rejects(() => t.service.renameFreeAddress("moth-press", "moth-press-2"), (e) => e.code === "taken" && /Another shop already has moth-press-2/.test(e.message));
  const again = await t.service.renameFreeAddress("moth-press", "moth-press-3");
  assert.deepEqual(again.domains.map((d) => d.name).sort(), ["moth-books.shops.example", "moth-press-3.shops.example"]);
  assert.ok(t.hosting.calls.some(([op, , d]) => op === "removeDomain" && d === "moth-press.shops.example"));
  assert.equal([...t.zone.lines.keys()].some((k) => k.startsWith("moth-press.shops.example ")), false, "its lines are taken out of the zone");
  // Taking back a name that sends visitors on: it serves the shop again.
  t.hosting.set("moth-press", "moth-press-3.shops.example", "live");
  await t.service.checkAll();
  const back = await t.service.renameFreeAddress("moth-press", "moth-books");
  assert.equal(back.domains.find((d) => d.name === "moth-books.shops.example").sendsTo, undefined);
  assert.ok(t.hosting.calls.some(([op, , d]) => op === "removeDomain" && d === "moth-books.shops.example"));
  await t.service.renameFreeAddress("moth-press", "moth-press-3");
  // Same name again changes nothing.
  const calls = t.hosting.calls.length;
  await t.service.renameFreeAddress("moth-press", "moth-press-3");
  assert.ok(t.hosting.calls.slice(calls).every(([op]) => op === "getDomain"));
});

test("two renames before the first is live: the newest still takes over and both older names send visitors on", async () => {
  const t = await world();
  await t.service.connectFreeAddress("moth-press");
  t.hosting.set("moth-press", "moth-press.shops.example", "live");
  await t.service.checkAll();
  await t.service.renameFreeAddress("moth-press", "moth-books");
  await t.service.renameFreeAddress("moth-press", "moth-paper");
  t.hosting.set("moth-press", "moth-paper.shops.example", "live");
  await t.service.checkAll();
  assert.equal((await t.registry.getShop("moth-press")).mainDomain, "moth-paper.shops.example");
  assert.ok(t.hosting.calls.some(([op, , d, to]) => op === "redirectDomain" && d === "moth-press.shops.example" && to === "moth-paper.shops.example"));
});

test("two shops made at the same moment with one press name never get the same free address", async () => {
  const t = await world();
  const [a, b] = await Promise.all([t.service.connectFreeAddress("moth-press"), t.service.connectFreeAddress("press-two")]);
  assert.notEqual(a.name, b.name);
  assert.equal(a.name, "moth-press.shops.example");
  assert.equal((await t.registry.getShop("press-two")).freeAddress, b.name);
  assert.equal((await t.registry.getShop("press-two")).domains.filter((d) => d.name === a.name).length, 0);
});

test("a deleted shop gives its free name back for the next press", async () => {
  const t = await world();
  await t.service.connectFreeAddress("moth-press");
  await t.service.removeDomain("moth-press", { domain: "moth-press.shops.example", deleting: true });
  assert.equal((await t.registry.getShop("moth-press")).freeAddress, null);
  assert.equal((await t.service.connectFreeAddress("press-two")).name, "moth-press.shops.example");
});

test("no shop domain: nothing is picked and shops keep their web.app address", async () => {
  const registry = fakeRegistry();
  await registry.createShop("s", { shopId: "s", pressName: "S" });
  const service = createDomainService({ registry, auditLog: fakeAuditLog(), hosting: fakeHosting(), deploy: fakeDeploy(), platformDomain: "platform.example", envFiles: fakeEnvFiles(), profileFiles: fakeProfileFiles() });
  assert.deepEqual(await service.connectFreeAddress("s"), { skipped: true });
});

test("the zone client writes only names under the shop domain, quoting text lines and keeping other values", async () => {
  const calls = [];
  const sets = new Map([["moth-press.shops.example./TXT", { name: "moth-press.shops.example.", type: "TXT", ttl: 300, rrdatas: ["\"other\""] }]]);
  const fetch = async (url, init = {}) => {
    calls.push([init.method ?? "GET", url, init.body ? JSON.parse(init.body) : null]);
    const key = decodeURIComponent(url.split("/rrsets/")[1] ?? "");
    if ((init.method ?? "GET") === "GET") {
      const found = sets.get(key);
      return found ? new Response(JSON.stringify(found), { status: 200 }) : new Response(JSON.stringify({ error: { code: 404, message: "not found", status: "NOT_FOUND" } }), { status: 404 });
    }
    return new Response("{}", { status: 200 });
  };
  const client = platformZoneClient({ fetch, token: async () => "t", project: "lmb-platform-test", zone: "shops", shopDomain: "shops.example" });
  await client.apply([
    { action: "add", host: "moth-press.shops.example", type: "A", value: "199.36.158.100" },
    { action: "add", host: "moth-press.shops.example", type: "TXT", value: "hosting-site=moth-press" },
    { action: "add", host: "evil.example", type: "A", value: "6.6.6.6" },
  ]);
  const writes = calls.filter(([m]) => m !== "GET");
  assert.deepEqual(writes.map(([m, , b]) => [m, b.name, b.type, b.rrdatas]), [
    ["POST", "moth-press.shops.example.", "A", ["199.36.158.100"]],
    ["PATCH", "moth-press.shops.example.", "TXT", ["\"other\"", "\"hosting-site=moth-press\""]],
  ]);
  assert.ok(!calls.some(([, url]) => url.includes("evil")));
});
