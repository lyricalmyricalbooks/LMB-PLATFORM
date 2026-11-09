// The daily watch on a live web address (plan 24.4): an address that stops opening the shop is noticed, and the owner is
// emailed once it has lasted an hour (never for a blip, once per break); a domain running out is emailed 30 and 7 days
// before, each once, never late, and a renewal starts the warnings over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPIRY_WARNINGS, createDomainService, expiryDue } from "./domains.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting, fakePlatformEmail, fakeProfileFiles, fakeSellers } from "./fakes.js";
import { profileScript } from "../../profile/profile.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { sellerLookupClient } from "./sellers.js";
import { TEMPLATES } from "../email/templates.js";
import { TEMPLATES_FR } from "../email/templatesFr.js";

const SHOP = "moth-press";
const NAME = "shop.mothpress.example";
const DAY = 86_400_000;
const START = Date.parse("2026-11-03T12:00:00Z");
const PROFILE = {
  version: 1, shopId: SHOP, name: "Moth Press", functionsRegion: "northamerica-northeast1", siteUrl: `https://${SHOP}.web.app`, apps: { shop: true, stockroom: false },
  firebase: { apiKey: "AIzaSyFakeKeyForTests000000000000000000", authDomain: `${SHOP}.firebaseapp.com`, projectId: SHOP, storageBucket: `${SHOP}.firebasestorage.app`, messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123" },
};

async function world({ expiresAt = new Date(START + 90 * DAY).toISOString() } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, status: "live", pressName: "Moth Press", ownerEmail: "owner@example.com" });
  await registry.saveProfile(SHOP, PROFILE);
  const hosting = fakeHosting();
  const emails = fakePlatformEmail();
  const table = { "mothpress.example": { registrar: { name: "GoDaddy.com, LLC" }, expiresAt } };
  let at = START;
  const auditLog = fakeAuditLog();
  const service = createDomainService({
    registry, auditLog, hosting, deploy: fakeDeploy(), sellers: fakeSellers(table), platformDomain: "platform.example", now: () => at,
    envFiles: fakeEnvFiles({}), profileFiles: fakeProfileFiles({ [SHOP]: profileScript(PROFILE) }), email: emails,
  });
  await service.add(SHOP, NAME);
  hosting.set(SHOP, NAME, "live");
  await service.checkAll();
  const entry = async () => (await registry.getShop(SHOP)).domains.find((d) => d.name === NAME);
  const kinds = () => [...(auditLog.entries.get(SHOP)?.values() ?? [])].map((e) => e.kind);
  return { service, hosting, emails, table, entry, kinds, at: (ms) => (at = ms), sent: (kind) => emails.list().filter((m) => m.kind === kind) };
}

test("a live address is watched once a day, starting a day after it went live", async () => {
  const w = await world();
  assert.deepEqual(await w.service.checkAll(), [], "nothing to do the same day");
  w.at(START + DAY);
  assert.deepEqual((await w.service.checkAll()).map((r) => r.state), ["live"]);
  assert.equal((await w.entry()).expiresAt, w.table["mothpress.example"].expiresAt);
  assert.deepEqual(await w.service.checkAll(), [], "watched for today");
});

test("an address that stops opening the shop: the owner hears once, after an hour, and live again clears it", async () => {
  const w = await world();
  w.hosting.set(SHOP, NAME, "dns");
  w.at(START + DAY);
  await w.service.checkAll();
  assert.ok((await w.entry()).brokeAt);
  assert.equal(w.sent("domain-not-pointing").length, 0, "not for a blip");
  w.at(START + DAY + 10 * 60_000);
  await w.service.checkAll();
  assert.equal(w.sent("domain-not-pointing").length, 0);
  w.at(START + DAY + 61 * 60_000);
  await w.service.checkAll();
  await w.service.checkAll();
  const [mail] = w.sent("domain-not-pointing");
  assert.equal(w.sent("domain-not-pointing").length, 1);
  assert.equal(mail.to, "owner@example.com");
  assert.equal(mail.data.link, "https://moth-press.web.app/admin#settings/general", "through the address that still works");
  w.hosting.set(SHOP, NAME, "live");
  await w.service.checkAll();
  assert.equal((await w.entry()).brokeAt, null);
  assert.ok(w.kinds().includes("domains.not-pointing") && w.kinds().includes("domains.back"));
  // A second break is a new break: one more email.
  w.hosting.set(SHOP, NAME, "dns");
  w.at(START + 2 * DAY + 61 * 60_000);
  await w.service.checkAll();
  w.at(START + 2 * DAY + 3 * 3_600_000);
  await w.service.checkAll();
  assert.equal(w.sent("domain-not-pointing").length, 2);
});

test("a domain running out: 30 and 7 days before, each once; a renewal starts over", async () => {
  const expires = START + 40 * DAY;
  const w = await world({ expiresAt: new Date(expires).toISOString() });
  for (let day = 1; day <= 39; day += 1) {
    w.at(START + day * DAY);
    await w.service.checkAll();
  }
  assert.deepEqual(w.sent("domain-expiring").map((m) => m.data.daysLeft), [30, 7]);
  assert.equal(w.sent("domain-expiring")[0].data.seller, null, "no seller known without a one-step connect");
  // Renewed for a year: the date moves and nothing more is sent until 30 days before it.
  w.table["mothpress.example"].expiresAt = new Date(expires + 365 * DAY).toISOString();
  w.at(START + 40 * DAY);
  await w.service.checkAll();
  assert.equal(w.sent("domain-expiring").length, 2);
  assert.equal((await w.entry()).expiresAt, w.table["mothpress.example"].expiresAt);
});

test("the nearest warning only: a sweep that missed the 30-day one sends the 7-day one, never both", () => {
  const expiresAt = new Date(START + 5 * DAY).toISOString();
  assert.equal(expiryDue({ expiresAt }, START).before, 7);
  assert.equal(expiryDue({ expiresAt, expiryWarned: { for: expiresAt, sent: { 7: "x" } } }, START), null);
  assert.equal(expiryDue({ expiresAt, expiryWarned: { for: "an older date", sent: { 7: "x" } } }, START).before, 7, "a new date starts over");
  assert.equal(expiryDue({ expiresAt: new Date(START - DAY).toISOString() }, START), null, "already run out: the not-opening email covers it");
  assert.equal(expiryDue({ expiresAt: new Date(START + 60 * DAY).toISOString() }, START), null);
  assert.deepEqual(EXPIRY_WARNINGS, [30, 7]);
});

test("the registry's expiry date is read from the public answer", async () => {
  const fetch = async (url) => ({ ok: url.endsWith("/domain/mothpress.example"), json: async () => ({ events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-01-15T10:00:00Z" }] }) });
  const lookup = sellerLookupClient({ fetch, resolveTxt: async () => [], rdapBase: "https://rdap.example" });
  assert.equal(await lookup.expiry("shop.mothpress.example"), "2027-01-15T10:00:00.000Z");
  assert.equal(await sellerLookupClient({ fetch: async () => ({ ok: false }), resolveTxt: async () => [] }).expiry("x.example"), null);
});

test("both emails exist in English and French", () => {
  const settings = { platformName: "Colophon" };
  const expiring = { domain: "yourpress.example", daysLeft: 7, date: "December 3, 2026", seller: "GoDaddy", own: "lmb-test-shop.web.app" };
  assert.match(TEMPLATES["domain-expiring"](expiring, { settings }).text, /paid up until December 3, 2026[\s\S]*\(GoDaddy\)/);
  assert.match(TEMPLATES_FR["domain-expiring"](expiring, { settings }).text, /payée jusqu'au 3 décembre 2026/);
  const broken = { domain: "yourpress.example", own: "lmb-test-shop.web.app", link: "https://lmb-test-shop.web.app/admin#settings/general" };
  assert.match(TEMPLATES["domain-not-pointing"](broken, { settings }).subject, /isn't opening your shop/);
  assert.match(TEMPLATES_FR["domain-not-pointing"](broken, { settings }).subject, /n'ouvre plus/);
});
