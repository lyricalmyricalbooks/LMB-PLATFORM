import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createDomainService } from "./domains.js";
import { readDomainConnectConfig } from "./config.js";
import { allowLink, colophonTemplate, fitTemplate, linkSignatureValid } from "./domainConnect.js";
import { guideFor, publicLinesClient, sellerLookupClient, sellerName } from "./sellers.js";
import { handleDomains } from "./http.js";
import { fakeDeploy, fakeDomainConnectSeller, fakeEnvFiles, fakeHosting, fakePlatformEmail, fakeProfileFiles, fakePublicLines, fakeSellers } from "./fakes.js";
import { profileScript } from "../../profile/profile.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { domainsBridge } from "../../google/domainBridge.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const ENV = 'SHOP_OWNER_EMAIL="owner@example.com"\nSHOP_SITE_URL="https://moth-press.web.app"\nSHOP_EXTRA_ORIGINS=""\n';
const PROFILE = {
  version: 1, shopId: SHOP, name: "Moth Press", functionsRegion: "northamerica-northeast1", siteUrl: `https://${SHOP}.web.app`, apps: { shop: true, stockroom: false },
  firebase: { apiKey: "AIzaSyFakeKeyForTests000000000000000000", authDomain: `${SHOP}.firebaseapp.com`, projectId: SHOP, storageBucket: `${SHOP}.firebasestorage.app`, messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123" },
};
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const ENV_DC = { DOMAIN_CONNECT_PROVIDER_ID: "colophon.example", DOMAIN_CONNECT_PRIVATE_KEY: PEM.replace(/\n/g, "\\n"), DOMAIN_CONNECT_REDIRECT_URL: "https://domains.platform.example/allowed" };

async function world({ table, withConnect = true, withEmail = true } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, status: "live", pressName: "Moth Press", ownerEmail: "owner@example.com", region: "northamerica-northeast1", serviceKeyHash: hashServiceKey(KEY), payments: { provider: "square" } });
  await registry.saveProfile(SHOP, PROFILE);
  const auditLog = fakeAuditLog();
  const hosting = fakeHosting();
  const deploy = fakeDeploy();
  const publicLines = fakePublicLines();
  const emails = fakePlatformEmail();
  const sellers = fakeSellers(table ?? { "mothpress.example": { registrar: { name: "GoDaddy.com, LLC" }, domainConnect: fakeDomainConnectSeller() } });
  let n = 0;
  const service = createDomainService({
    registry, auditLog, hosting, deploy, publicLines, sellers, platformDomain: "platform.example", now: () => NOW,
    envFiles: fakeEnvFiles({ [SHOP]: ENV }), profileFiles: fakeProfileFiles({ [SHOP]: profileScript(PROFILE) }),
    domainConnect: withConnect ? readDomainConnectConfig(ENV_DC) : null, email: withEmail ? emails : null, newState: () => `state-${++n}`,
  });
  const call = (op, args = {}) => service.shopCall({ headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` }, body: { op, args } });
  return { registry, auditLog, hosting, deploy, publicLines, emails, sellers, service, call };
}

const kinds = (t) => [...(t.auditLog.entries.get(SHOP)?.values() ?? [])].map((e) => e.kind);
const queryOf = (url) => new URLSearchParams(url.split("?")[1]);
const comeBack = (t, query) => handleDomains({ method: "GET", path: "/allowed", query }, { service: t.service });

test("settings: both parts or none, a real private key, an https way back", () => {
  assert.equal(readDomainConnectConfig({}), null);
  assert.throws(() => readDomainConnectConfig({ DOMAIN_CONNECT_PROVIDER_ID: "colophon.example" }), /go together/);
  assert.throws(() => readDomainConnectConfig({ ...ENV_DC, DOMAIN_CONNECT_PRIVATE_KEY: "nope" }), /private key/);
  assert.throws(() => readDomainConnectConfig({ ...ENV_DC, DOMAIN_CONNECT_REDIRECT_URL: "http://x.example/a" }), /https/);
  const config = readDomainConnectConfig(ENV_DC);
  assert.equal(config.providerId, "colophon.example");
  assert.equal(config.serviceId, "shop");
});

test("the template link is built for the seller's window and signed with the platform's key", () => {
  const config = readDomainConnectConfig(ENV_DC);
  const fit = fitTemplate("hosting", [
    { action: "add", host: "shop.mothpress.example", type: "A", value: "199.36.158.100" },
    { action: "remove", host: "shop.mothpress.example", type: "A", value: "192.0.2.10" },
  ], "shop.mothpress.example");
  assert.deepEqual(fit, { groups: ["hosting"], vars: { ip: "199.36.158.100" } });
  const url = allowLink({ config, sync: { urlSyncUX: "https://dcc.seller.example/manage" }, zone: "mothpress.example", host: "shop", groups: fit.groups, vars: fit.vars, state: "s1", back: { shop: SHOP, domain: "shop.mothpress.example" } });
  assert.match(url, /^https:\/\/dcc\.seller\.example\/manage\/v2\/domainTemplates\/providers\/colophon\.example\/services\/shop\/apply\?/);
  const q = queryOf(url);
  assert.equal(q.get("domain"), "mothpress.example");
  assert.equal(q.get("host"), "shop");
  assert.equal(q.get("ip"), "199.36.158.100");
  assert.equal(q.get("groupId"), "hosting");
  assert.equal(q.get("state"), "s1");
  assert.equal(q.get("redirect_uri"), `https://domains.platform.example/allowed?shop=${SHOP}&domain=shop.mothpress.example`);
  assert.equal(q.get("key"), "_dck1");
  assert.ok(linkSignatureValid(url, publicKey));
  assert.ok(!linkSignatureValid(url.replace("199.36.158.100", "6.6.6.6"), publicKey));
  assert.ok(!url.includes("PRIVATE"));
  const template = colophonTemplate({ providerId: "colophon.example", syncRedirectDomain: "domains.platform.example" });
  assert.deepEqual([...new Set(template.records.map((r) => r.groupId))], ["hosting", "hosting-owner", "email", "google"]);
});

test("a domain at a seller with the template gets the Allow link, not records", async () => {
  const t = await world();
  const res = await t.call("domains.connect", { domain: "shop.mothpress.example" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.way, "allow");
  assert.equal(res.body.seller, "GoDaddy");
  assert.ok(linkSignatureValid(res.body.allowUrl, publicKey));
  assert.equal(queryOf(res.body.allowUrl).get("host"), "shop");
  assert.equal(res.body.state, "waiting_dns");
  // Asking again changes nothing: same link, one registry entry, one connect logged.
  const again = await t.call("domains.connect", { domain: "shop.mothpress.example" });
  assert.equal(again.body.allowUrl, res.body.allowUrl);
  assert.equal((await t.registry.getShop(SHOP)).domains.length, 1);
  assert.equal(kinds(t).filter((k) => k === "domains.connect").length, 1);
});

test("coming back from Allow is recorded once; a made-up state or a stranger does nothing", async () => {
  const t = await world();
  const { body } = await t.call("domains.connect", { domain: "shop.mothpress.example" });
  const state = queryOf(body.allowUrl).get("state");
  const forged = await comeBack(t, { shop: SHOP, domain: "shop.mothpress.example", state: "guess" });
  assert.equal(forged.status, 302);
  assert.ok(!kinds(t).includes("domains.allowed"));
  const good = await comeBack(t, { shop: SHOP, domain: "shop.mothpress.example", state });
  assert.equal(good.headers.Location, "https://moth-press.web.app/admin#settings/general");
  await comeBack(t, { shop: SHOP, domain: "shop.mothpress.example", state });
  assert.equal(kinds(t).filter((k) => k === "domains.allowed").length, 1);
  assert.equal((await comeBack(t, { shop: "nobody", domain: "x.example", state })).status, 404);
  assert.equal((await handleDomains({ method: "POST", path: "/allowed" }, { service: t.service })).status, 405);
});

test("no template at the seller, no key, or an unknown seller: the guide, one line per thing to add", async () => {
  for (const [label, opts] of [
    ["seller without the template", { table: { "mothpress.example": { registrar: { name: "Namecheap, Inc." }, domainConnect: fakeDomainConnectSeller({ hasTemplate: false }) } } }],
    ["seller without Domain Connect", { table: { "mothpress.example": { registrar: { name: "Namecheap, Inc." }, domainConnect: null } } }],
    ["no platform key", { withConnect: false }],
    ["unknown seller", { table: {} }],
  ]) {
    const t = await world(opts);
    const res = await t.call("domains.connect", { domain: "shop.mothpress.example" });
    assert.equal(res.body.way, "guide", label);
    assert.equal(res.body.allowUrl, undefined, label);
    const guide = res.body.guide;
    assert.ok(guide.steps.length >= 3, label);
    assert.deepEqual(guide.lines.map((l) => [l.action, l.kind, l.name, l.value]), [["add", "Address", "shop", "199.36.158.100"], ["remove", "Address", "shop", "192.0.2.10"]], label);
    assert.match(guide.message.body, /Kind: Address/, label);
  }
  const named = await world({ table: { "mothpress.example": { registrar: { name: "Namecheap, Inc." }, domainConnect: null } } });
  assert.ok((await named.call("domains.connect", { domain: "shop.mothpress.example" })).body.guide.steps[0].includes("Namecheap"));
});

test("the guide per seller uses no technical names, and a rival seller reads as 'your domain seller'", () => {
  assert.equal(sellerName("GoDaddy.com, LLC"), "GoDaddy");
  assert.equal(sellerName("Squarespace Domains II LLC"), null);
  assert.equal(sellerName("Acme Domains, Inc."), "Acme Domains");
  const records = [{ action: "add", host: "mothpress.example", type: "A", value: "199.36.158.100" }, { action: "add", host: "mothpress.example", type: "TXT", value: "hosting-site=moth-press" }, { action: "add", type: "CNAME", host: "www.mothpress.example", value: "mothpress.example" }];
  for (const seller of ["GoDaddy", "Namecheap", "Cloudflare", "Porkbun", "Hover", "Gandi", "IONOS", "Name.com", "Dynadot", null]) {
    const guide = guideFor({ seller, zone: "mothpress.example", domain: "mothpress.example", records });
    const words = [...guide.steps, guide.message.subject, guide.message.body].join(" ");
    assert.ok(!/\b(DNS|CNAME|TXT|MX|nameserver)\b/.test(words), `${seller}: ${words}`);
    assert.ok(!/shopify|squarespace|wix|etsy/i.test(words), `${seller}: ${words}`);
    assert.deepEqual(guide.lines.map((l) => [l.kind, l.name]), [["Address", "@"], ["Text", "@"], ["Alias", "www"]]);
    assert.ok(guide.steps.length >= 4 && guide.steps.some((s) => s.includes("mothpress.example")));
  }
});

test("email and Google lines wait for the press's Allow, then answer done, and can be removed twice", async () => {
  const t = await world();
  await t.call("domains.connect", { domain: "shop.mothpress.example" });
  const emailRecords = [
    { record: "SPF", name: "send", type: "MX", value: "feedback-smtp.example.amazonses.com", priority: 10 },
    { record: "SPF", name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all" },
    { record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEB" },
  ];
  const call = domainsBridge(t.service);
  const row = { shopId: SHOP };
  const ask = (records, purpose) => call("addRecords", row, { domain: "shop.mothpress.example", records, purpose });
  assert.deepEqual(await ask(emailRecords, "email"), { waiting: true });
  const checked = await t.call("domains.check", { domain: "shop.mothpress.example" });
  assert.equal(checked.body.way, "allow");
  const q = queryOf(checked.body.allowUrl);
  assert.equal(q.get("groupId"), "hosting,email");
  assert.equal(q.get("emaildkim"), "p=MIGfMA0GCSqGSIb3DQEB");
  assert.ok(linkSignatureValid(checked.body.allowUrl, publicKey));
  await comeBack(t, { shop: SHOP, domain: "shop.mothpress.example", state: q.get("state") });
  assert.deepEqual(await ask(emailRecords, "email"), { done: true });
  assert.deepEqual(await ask(emailRecords, "email"), { done: true });
  // Google's line, typed by hand and seen from outside, counts too.
  const google = [{ type: "TXT", host: "shop.mothpress.example", value: "google-site-verification=abc" }];
  assert.deepEqual(await ask(google, "google"), { waiting: true });
  t.publicLines.show({ type: "TXT", host: "shop.mothpress.example", value: "google-site-verification=abc" });
  assert.deepEqual(await ask(google, "google"), { done: true });
  const gone = () => call("removeRecords", row, { domain: "shop.mothpress.example", purpose: "email" });
  assert.deepEqual(await gone(), { done: true });
  assert.deepEqual(await gone(), { done: true });
  assert.ok(!(await t.registry.getShop(SHOP)).domains[0].extraRecords.email);
  assert.ok(kinds(t).includes("domains.records-removed"));
  await assert.rejects(call("addRecords", row, { domain: "other.example", records: google, purpose: "google" }), /isn't connected/);
  await assert.rejects(call("addRecords", row, { domain: "shop.mothpress.example", records: google, purpose: "hosting" }), /Lines are added for/);
});

test("the sweep checks every few minutes and emails the owner once when the address is live", async () => {
  const t = await world();
  await t.call("domains.connect", { domain: "shop.mothpress.example" });
  assert.deepEqual((await t.service.checkAll()).map((r) => r.state), ["waiting_dns"]);
  t.hosting.set(SHOP, "shop.mothpress.example", "securing");
  assert.deepEqual((await t.service.checkAll()).map((r) => r.state), ["securing"]);
  assert.equal(t.emails.list().length, 0);
  t.hosting.set(SHOP, "shop.mothpress.example", "live");
  assert.deepEqual((await t.service.checkAll()).map((r) => r.state), ["live"]);
  await t.service.checkAll();
  await t.call("domains.check", { domain: "shop.mothpress.example" });
  const sent = t.emails.list();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "domain-live");
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].data.domain, "shop.mothpress.example");
  assert.equal((await t.registry.getShop(SHOP)).domains[0].state, "live");
  assert.deepEqual(await t.service.checkAll(), []);
  const live = await t.call("domains.check", { domain: "shop.mothpress.example" });
  assert.equal(live.body.guide, undefined);
  assert.equal(live.body.allowUrl, undefined);
});

test("removeDomain: the main address is refused while the shop runs, and goes only with { deleting: true }", async () => {
  const t = await world();
  await t.call("domains.connect", { domain: "shop.mothpress.example" });
  await t.call("domains.connect", { domain: "books.mothpress.example" });
  for (const d of ["shop.mothpress.example", "books.mothpress.example"]) t.hosting.set(SHOP, d, "live");
  await t.call("domains.makeMain", { domain: "shop.mothpress.example" });
  const call = domainsBridge(t.service);
  const row = { shopId: SHOP };
  await assert.rejects(call("removeDomain", row, { domain: "shop.mothpress.example" }), /main address/);
  const other = await call("removeDomain", row, { domain: "books.mothpress.example" });
  assert.equal(other.removed, "books.mothpress.example");
  assert.equal(other.done, true);
  const gone = await call("removeDomain", row, { domain: "shop.mothpress.example", deleting: true });
  assert.equal(gone.removed, "shop.mothpress.example");
  const after = await t.registry.getShop(SHOP);
  assert.deepEqual(after.domains, []);
  assert.equal(after.mainDomain, null);
  assert.ok(t.hosting.calls.some(([n, , d]) => n === "removeDomain" && d === "shop.mothpress.example"));
  const calls = t.hosting.calls.length;
  assert.deepEqual(await call("removeDomain", row, { domain: "shop.mothpress.example", deleting: true }), { done: true, removed: null });
  assert.equal(t.hosting.calls.length, calls);
  assert.ok(kinds(t).includes("domains.removed-at-deletion"));
});

test("the public lookup reads the seller from the registry's answer and the zone's Domain Connect line", async () => {
  const fetch = async (url) => {
    const json = (body) => ({ ok: true, json: async () => body });
    if (url.startsWith("https://rdap.example/domain/shop.mothpress.example")) return { ok: false, json: async () => ({}) };
    if (url.startsWith("https://rdap.example/domain/mothpress.example")) return json({ entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "GoDaddy.com, LLC"]]] }] });
    if (url === "https://api.seller.example/v2/mothpress.example/settings") return json({ providerName: "GoDaddy", urlSyncUX: "https://dcc.seller.example", urlAPI: "https://api.seller.example", width: 750, height: 600 });
    if (url === "https://api.seller.example/v2/domainTemplates/providers/colophon.example/services/shop") return json({ providerId: "colophon.example" });
    return { ok: false, json: async () => ({}) };
  };
  const resolveTxt = async (host) => { if (host === "_domainconnect.mothpress.example") return [["api.seller.example"]]; throw new Error("ENODATA"); };
  const client = sellerLookupClient({ fetch, resolveTxt, config: readDomainConnectConfig(ENV_DC), rdapBase: "https://rdap.example" });
  const found = await client.lookup("shop.mothpress.example");
  assert.equal(found.zone, "mothpress.example");
  assert.equal(found.registrar.name, "GoDaddy.com, LLC");
  assert.deepEqual(found.domainConnect, { providerName: "GoDaddy", urlSyncUX: "https://dcc.seller.example", width: 750, height: 600, hasTemplate: true });
  const none = await sellerLookupClient({ fetch: async () => { throw new Error("offline"); }, resolveTxt: async () => { throw new Error("offline"); } }).lookup("a.example");
  assert.deepEqual(none, { zone: "a.example", registrar: null, domainConnect: null });
  const lines = publicLinesClient({ resolver: { resolveTxt: async () => [["v=spf1 x"]], resolveMx: async () => [], resolve4: async () => ["1.2.3.4"], resolveCname: async () => { throw new Error("none"); } } });
  assert.equal(await lines.has({ type: "TXT", host: "a.example", value: "V=SPF1 x" }), true);
  assert.equal(await lines.has({ type: "A", host: "a.example", value: "9.9.9.9" }), false);
  assert.equal(await lines.has({ type: "CNAME", host: "a.example", value: "b.example" }), false);
});
