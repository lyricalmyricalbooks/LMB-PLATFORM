// The Google link (code plan 6.17 and 6.20) against a pretend Google, a pretend shop project, a pretend domain service
// and a pretend Resend: one sign-in connects every part once, re-runs change nothing, a "no" leaves the shop as it was,
// the teardown follows the closing timeline, and the press's own Google accounts are never deleted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readGoogleConfig, offeredExtras } from "./config.js";
import { createGoogleLink } from "./index.js";
import { createGoogleApi, GoogleError } from "./googleApi.js";
import { handleGoogle } from "./http.js";
import { deletionDue } from "./teardown.js";
import { domainsBridge, liveDomainOf } from "./domainBridge.js";
import { rawEmail } from "./gmail.js";
import { AUTHORIZE_URL, SCOPES, TOKEN_URL } from "./endpoints.js";
import { fakeConnections, fakeDomainsCall, fakeGoogle, fakeShopFirebase, fakeStates } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { hashServiceKey } from "../services/email/http.js";
import { createOwnDomainSender } from "../services/email/ownDomain.js";
import { createEmailService } from "../services/email/index.js";
import { fakeResendDomains, fakeResendFetch, fakeSentLog } from "../services/email/fakes.js";
import { unseal } from "../services/payments/tokenSeal.js";
import { createClosingSweep, DOWNLOAD_DAYS } from "../services/billing/closing.js";
import { googleClosing } from "./closing.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const START = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;
const ENV = {
  GOOGLE_CONNECT_ENABLED: "true",
  GOOGLE_CLIENT_ID: "colophon-client.apps.example",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URL: "https://google.platform.example/google/oauth",
  GOOGLE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  GOOGLE_MERCHANT_PROVIDER_ID: "1234567",
  GOOGLE_LATER_EXTRAS: "on",
};
// The launch settings: the same but with the second round of extras still off (plan 15.12).
const { GOOGLE_LATER_EXTRAS: _later, ...LAUNCH } = ENV;
const ADMIN = "https://moth-press.web.app/admin#overview";

const row = (fields = {}) => ({
  shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", status: "live",
  siteUrl: "https://moth-press.web.app", serviceKeyHash: hashServiceKey(KEY), ...fields,
});

async function setup({ env = ENV, shop = {}, google: googleOptions = {}, domainsWaiting = false } = {}) {
  let clock = START;
  const now = () => clock;
  const config = readGoogleConfig(env);
  const google = fakeGoogle(googleOptions);
  const registry = fakeRegistry();
  await registry.createShop(SHOP, row(shop));
  const auditLog = fakeAuditLog();
  const shopFirebase = fakeShopFirebase();
  const domains = fakeDomainsCall({ waiting: domainsWaiting });
  const resendDomains = fakeResendDomains();
  const notices = [];
  const ownDomain = createOwnDomainSender({
    resendDomains, registry, auditLog, domainsCall: domains.domainsCall, now,
    email: { sendPlatform: async (message) => { if (!notices.some((n) => n.idempotencyKey === message.idempotencyKey)) notices.push(message); } },
  });
  const connections = fakeConnections();
  const states = fakeStates();
  const link = createGoogleLink({ config, google, connections, states, registry, auditLog, shopFirebase, domainsCall: domains.domainsCall, ownDomain, now });
  const call = (op, args = {}, key = KEY) =>
    handleGoogle({ method: "POST", path: "/shop", headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${key}` }, body: { op, args } }, { service: link.service });
  /** Connect Google from the shop: the link, Google's Allow page (pretend), the answer back. */
  const signIn = async ({ extras = [], scopes, error } = {}) => {
    const answer = await call("google.connectLink", { returnUrl: ADMIN, extras });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const state = new URL(answer.body.url).searchParams.get("state");
    const query = error ? { state, error } : { state, code: google.allow({ scopes }) };
    return handleGoogle({ method: "GET", path: "/google/oauth", query }, { service: link.service });
  };
  const shopRow = () => registry.getShop(SHOP);
  const step = async (name) => (await shopRow()).google?.steps?.find((s) => s.step === name);
  const audit = () => [...(auditLog.entries.get(SHOP)?.values() ?? [])];
  const tick = (ms) => { clock += ms; };
  return { config, google, registry, auditLog, shopFirebase, domains, resendDomains, notices, ownDomain, connections, states, link, call, signIn, shopRow, step, audit, tick, now };
}

const changeNames = (t) => t.google.calls.map((c) => c[0]);

// ---- Connect (6.17) ----

test("one sign-in makes the Analytics property once, writes the ID to the shop once, and links search and Shopping", async () => {
  const t = await setup();
  const back = await t.signIn();
  assert.equal(back.status, 302);
  assert.equal(new URL(back.headers.Location).searchParams.get("google"), "connected");

  assert.equal(t.google.world.properties.size, 1);
  const [property] = [...t.google.world.properties.keys()];
  const shopDocs = t.shopFirebase.docs.get(SHOP);
  assert.match(shopDocs.analytics.ga4MeasurementId, /^G-MOTH\d+$/);
  assert.equal(`properties/${shopDocs.secrets.propertyId}`, property);
  assert.equal(t.shopFirebase.calls.filter((c) => c[0] === "writeAnalytics").length, 1);
  // The shop's own reporting account can read the figures, as a Viewer and nothing more.
  assert.deepEqual(t.google.world.bindings.get(property).map((b) => [b.user, b.roles]), [[`${SHOP}@appspot.gserviceaccount.com`, ["predefinedRoles/viewer"]]]);
  // Search Console: verified through a file on the shop's own pages, the shop's account an owner, the sitemap sent.
  assert.ok(t.google.world.scSites.has("https://moth-press.web.app/"));
  assert.ok(t.google.world.sitemaps.has("https://moth-press.web.app/sitemap.xml"));
  assert.ok([...shopDocs.files.keys()][0].startsWith("google"));
  assert.ok(t.google.world.webResources.get("https://moth-press.web.app/").owners.includes(`${SHOP}@appspot.gserviceaccount.com`));
  assert.equal(shopDocs.secrets.searchConsoleSite, "https://moth-press.web.app/");
  // Merchant Center: an account in the press's name, the book feed, free listings.
  const [merchant] = [...t.google.world.merchantAccounts.values()];
  assert.equal(merchant.accountName, "Moth Press");
  assert.deepEqual([...t.google.world.dataSources.values()].map((d) => d.fileUri), ["https://moth-press.web.app/google-merchant-feed.xml"]);
  assert.ok(t.google.world.freeListings.has(merchant.name));

  const g = (await t.shopRow()).google;
  assert.equal(g.accountEmail, "owner@example.com");
  assert.equal(g.connectedAt, new Date(START).toISOString());
  assert.equal(g.analytics.measurementId, shopDocs.analytics.ga4MeasurementId);
  assert.equal(g.merchantCenter.account, merchant.name);
  assert.equal(g.email.via, "colophon");
  assert.deepEqual(g.steps.map((s) => [s.step, s.state]), [
    ["firebase", "done"], ["analytics", "done"], ["domain", "waiting"], ["searchConsole", "done"], ["merchantCenter", "done"], ["email", "done"],
  ]);
  // Every step is in the shop's audit log too.
  assert.deepEqual(t.audit().filter((e) => e.source === "google-connect").map((e) => e.kind).sort(), g.steps.map((s) => `google.${s.step}`).sort());
});

test("running the connect job again, or signing in again, changes nothing", async () => {
  const t = await setup();
  await t.signIn();
  const google = t.google.calls.length;
  const shop = t.shopFirebase.calls.length;
  const audits = t.audit().length;
  const before = structuredClone((await t.shopRow()).google);
  t.tick(60_000);
  await t.link.connect.run(SHOP);
  await t.signIn();
  assert.equal(t.google.calls.length, google, JSON.stringify(t.google.calls.slice(google)));
  assert.equal(t.shopFirebase.calls.length, shop);
  assert.equal(t.audit().length, audits);
  assert.deepEqual((await t.shopRow()).google, before);
});

test("saying no on Google's page leaves the shop exactly as it was", async () => {
  const t = await setup();
  const back = await t.signIn({ error: "access_denied" });
  assert.equal(new URL(back.headers.Location).searchParams.get("google"), "denied");
  assert.equal((await t.shopRow()).google, undefined);
  assert.deepEqual(t.google.calls, []);
  assert.equal(t.shopFirebase.docs.size, 0);
  assert.equal(t.connections.map.size, 0);
  assert.equal(t.audit().length, 0);
});

test("a part left unticked waits and touches nothing; the rest still connects", async () => {
  const t = await setup();
  const scopes = [...SCOPES.identity, ...SCOPES.searchConsole, ...SCOPES.merchantCenter];
  await t.signIn({ scopes });
  assert.equal(t.google.world.properties.size, 0);
  assert.equal(t.shopFirebase.docs.get(SHOP).analytics.ga4MeasurementId, undefined);
  assert.equal((await t.step("analytics")).state, "waiting");
  assert.match((await t.step("analytics")).detail, /didn't allow Google Analytics/);
  assert.equal((await t.step("searchConsole")).state, "done");
});

test("Google refusing a part leaves the shop without it; Try again finishes it once", async () => {
  const t = await setup({ google: { failOnce: ["createProperty"] } });
  await t.signIn();
  assert.equal((await t.step("analytics")).state, "failed");
  assert.equal(t.shopFirebase.docs.get(SHOP).analytics.ga4MeasurementId, undefined);
  assert.equal((await t.step("merchantCenter")).state, "done");
  const again = await t.call("google.tryAgain", { step: "analytics" });
  assert.equal(again.status, 200);
  assert.equal(again.body.steps.find((s) => s.step === "analytics").state, "done");
  assert.equal(t.google.world.properties.size, 1);
  assert.equal(t.shopFirebase.calls.filter((c) => c[0] === "writeAnalytics").length, 1);
});

test("a press with no Analytics account yet is told what to do, in plain words", async () => {
  const t = await setup();
  t.google.world.analyticsAccounts = [];
  await t.signIn();
  const analytics = await t.step("analytics");
  assert.equal(analytics.state, "waiting");
  assert.match(analytics.detail, /accept its Analytics terms once/);
});

test("the shop's own address joins Search Console through the domain's Allow step, and email moves to it once ready", async () => {
  const t = await setup({ shop: { domains: [{ name: "shop.mothpress.example", state: "live" }] } });
  await t.signIn();
  assert.deepEqual((await t.step("domain")).state, "done");
  assert.ok(t.domains.calls.some(([op, , args]) => op === "addRecords" && args.purpose === "google" && args.records[0].type === "TXT"));
  assert.ok(t.google.world.scSites.has("sc-domain:shop.mothpress.example"));
  assert.equal(t.shopFirebase.docs.get(SHOP).secrets.searchConsoleSite, "sc-domain:shop.mothpress.example");
  // The sending records were asked for; until Resend sees them, Colophon's sender stays.
  assert.ok(t.domains.calls.some(([op, , args]) => op === "addRecords" && args.purpose === "email"));
  assert.equal((await t.step("email")).state, "waiting");
  assert.equal((await t.shopRow()).emailSender.state, "checking");
  t.resendDomains.setStatus("shop.mothpress.example", "verified");
  assert.equal((await t.link.status.runAgain(SHOP, "email")).state, "done");
  assert.equal((await t.shopRow()).google.email.address, "orders@shop.mothpress.example");
  assert.equal((await t.shopRow()).emailSender.state, "on");
});

test("while the domain's Allow step isn't built, the own address waits and nothing fails", async () => {
  const t = await setup({ shop: { domains: [{ name: "shop.mothpress.example", state: "live" }] }, domainsWaiting: true });
  await t.signIn();
  const sc = await t.step("searchConsole");
  assert.equal(sc.state, "done");
  assert.match(sc.detail, /shop\.mothpress\.example joins once/);
  assert.ok(!t.google.world.scSites.has("sc-domain:shop.mothpress.example"));
  assert.equal(t.shopFirebase.docs.get(SHOP).secrets.searchConsoleSite, "https://moth-press.web.app/");
});

test("at launch only the Drive folder is offered; the later extras wait for the second review (plan 15.12)", async () => {
  assert.deepEqual(offeredExtras(readGoogleConfig(LAUNCH)), ["drive"]);
  assert.deepEqual(offeredExtras(readGoogleConfig({ ...LAUNCH, GOOGLE_BUSINESS_PROFILE: "on", GOOGLE_ADS_ACCESS: "explorer" })), ["drive"], "their own switches do nothing until the second round is on");
  const t = await setup({ env: LAUNCH });
  const refused = await t.call("google.connectLink", { returnUrl: ADMIN, extras: ["youtube"] });
  assert.equal(refused.status, 400);
  const link = await t.call("google.connectLink", { returnUrl: ADMIN, extras: ["drive"] });
  const scope = new URL(link.body.url).searchParams.get("scope");
  for (const later of ["youtube", "calendar", "businessProfile", "ads"]) assert.ok(!scope.includes(SCOPES[later][0]), `${later} is not asked for at launch`);
});

test("extras run only when ticked; Business Profile and Ads only once the platform offers them", async () => {
  assert.deepEqual(offeredExtras(readGoogleConfig(ENV)), ["drive", "youtube", "calendar"]);
  assert.deepEqual(offeredExtras(readGoogleConfig({ ...ENV, GOOGLE_BUSINESS_PROFILE: "on", GOOGLE_ADS_ACCESS: "explorer" })), ["drive", "youtube", "calendar", "businessProfile", "ads"]);
  assert.throws(() => readGoogleConfig({ ...ENV, GOOGLE_ADS_ACCESS: "token" }), /explorer, basic or standard/);
  const t = await setup();
  const refused = await t.call("google.connectLink", { returnUrl: ADMIN, extras: ["ads"] });
  assert.equal(refused.status, 400);
  await t.signIn({ extras: ["drive", "calendar"] });
  const g = (await t.shopRow()).google;
  assert.equal(g.drive.name, "Moth Press backups from Colophon");
  assert.match(g.calendar.calendarId, /@group\.calendar\.google\.com$/);
  assert.equal(g.youtube, undefined);
  assert.equal(g.steps.some((s) => s.step === "youtube"), false);
  // The Allow page asks only for what was ticked.
  const link = await t.call("google.connectLink", { returnUrl: ADMIN, extras: ["youtube"] });
  const scope = new URL(link.body.url).searchParams.get("scope");
  assert.ok(scope.includes(SCOPES.youtube[0]));
  assert.ok(!scope.includes(SCOPES.drive[0]));
  assert.ok(!scope.includes(SCOPES.email[0]), "Gmail sending stays off until Julian switches it on");
});

test("Ads links the book feed and never spends; YouTube and Business Profile record the press's own accounts", async () => {
  const t = await setup({ env: { ...ENV, GOOGLE_BUSINESS_PROFILE: "on", GOOGLE_ADS_ACCESS: "explorer" } });
  await t.signIn({ extras: ["youtube", "businessProfile", "ads"] });
  const g = (await t.shopRow()).google;
  assert.equal(g.youtube.channelId, "UCmothpress");
  assert.equal(g.businessProfile.accountId, "accounts/555");
  assert.equal(g.ads.customerId, "1234567890");
  assert.equal(t.google.world.productLinks.size, 1);
  assert.match((await t.step("ads")).detail, /Nothing is spent/);
  assert.doesNotMatch((await t.step("businessProfile")).detail, /Maps|opening hours/, "nothing is promised that isn't written (plan 15.13)");
});

test("Google Shopping is made the way Google asks: v1 addresses, linked to Colophon's provider account (15.1, 15.14)", async () => {
  const seen = [];
  const answer = (body) => ({ ok: true, status: 200, json: async () => body });
  const google = createGoogleApi({ fetch: async (url, init) => { seen.push({ url, init }); return answer({ name: "accounts/1" }); }, app: { clientId: "id", clientSecret: "secret" }, redirectUrl: "https://google.platform.example/google/oauth" });
  await google.listMerchantAccounts("tok");
  await google.createMerchantAccount("tok", { accountName: "Moth Press", ownerEmail: "owner@example.com", timeZone: "America/Toronto", languageCode: "en", providerId: "1234567" });
  await google.listDataSources("tok", "accounts/1");
  await google.enableFreeListings("tok", "accounts/1");
  for (const { url } of seen) {
    assert.match(url, /^https:\/\/merchantapi\.googleapis\.com\/(accounts|datasources)\/v1\//);
    assert.doesNotMatch(url, /v1beta/);
  }
  const create = JSON.parse(seen[1].init.body);
  assert.equal(create.service[0].provider, "accounts/1234567");
  // Without the provider's number the shop waits instead of asking Google for something it refuses.
  const t = await setup({ env: (({ GOOGLE_MERCHANT_PROVIDER_ID: _p, ...rest }) => rest)(ENV) });
  await t.signIn();
  assert.equal((await t.step("merchantCenter")).state, "waiting");
  assert.equal(t.google.world.merchantAccounts.size, 0);
  // And the pretend Google refuses a call with no provider, as Google does.
  await assert.rejects(fakeGoogle().createMerchantAccount("tok", { accountName: "x" }), /provider/);
});

test("no Ads call asks for a developer token, which Google ended on 9 September 2026 (15.13)", async () => {
  const seen = [];
  const google = createGoogleApi({ fetch: async (url, init) => { seen.push(init); return { ok: true, status: 200, json: async () => ({ resourceNames: ["customers/1"] }) }; }, app: { clientId: "id", clientSecret: "secret" } });
  await google.listAdsCustomers("tok");
  await google.createProductLink("tok", "1", "7001");
  for (const init of seen) assert.equal(init.headers["developer-token"], undefined);
});

test("no address in this folder calls a version Google has switched off (15.1)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { VERSION_CHECKS, ADS } = await import("./endpoints.js");
  assert.ok(ADS.endsWith(`/${VERSION_CHECKS.ads.current}`));
  for (const file of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const v of VERSION_CHECKS.merchant.retired) assert.ok(!new RegExp(`merchantapi[^\\n]*\\/${v}\\b|/(accounts|datasources)/${v}\\b`).test(code), `${file} calls Merchant ${v}`);
    for (const v of VERSION_CHECKS.ads.retired) assert.ok(!new RegExp(`googleads\\.googleapis\\.com/${v}\\b`).test(code), `${file} calls Ads ${v}`);
  }
  // The check itself catches the retired Merchant address.
  assert.ok(/(accounts|datasources)\/v1beta\b/.test("${MERCHANT}/accounts/v1beta/accounts"));
});

test("with Gmail sending switched on, the shop's emails go from the press's Gmail and replies reach the press", async () => {
  const t = await setup({ env: { ...ENV, GOOGLE_GMAIL_SENDING: "on" } });
  await t.signIn();
  assert.equal((await t.shopRow()).gmailSender.on, true);
  assert.equal((await t.step("email")).detail, "Your shop's emails go from owner@example.com.");
  const resend = fakeResendFetch();
  const email = createEmailService({ env: { RESEND_API_KEY: "re_test_not_real" }, fetch: resend.fetch, registry: t.registry, sentLog: fakeSentLog(), gmailSend: t.link.gmailSend });
  await email.send(SHOP, { kind: "order-note", to: "reader@example.com", idempotencyKey: "note-1", subject: "Your order", text: "Thank you" });
  assert.equal(resend.requests.length, 0);
  const sent = Buffer.from(t.google.world.gmail[0], "base64url").toString("utf8");
  assert.match(sent, /From: "Moth Press" <owner@example.com>/);
  assert.match(sent, /Reply-To: owner@example.com/);
  // Gmail refusing falls back to the usual sender, so nothing is lost.
  t.google.world.revoked.add([...t.google.world.refreshTokens.keys()][0]);
  await email.send(SHOP, { kind: "order-note", to: "reader@example.com", idempotencyKey: "note-2", subject: "Your order", text: "Thank you" });
  assert.equal(resend.requests.length, 1);
});

test("Google ending the grant becomes 'needs reconnect': emails fall back at once, the control room lists it, signing in clears it (15.15)", async () => {
  const t = await setup({ env: { ...ENV, GOOGLE_GMAIL_SENDING: "on" } });
  await t.signIn();
  assert.equal((await t.call("google.status")).body.needsReconnect, false);
  // The press changes their Google password: the refresh token stops working and the access token has run out.
  t.google.world.revoked.add([...t.google.world.refreshTokens.keys()][0]);
  t.connections.map.set(SHOP, { ...t.connections.map.get(SHOP), accessExpiresAt: "2000-01-01T00:00:00.000Z" });
  assert.equal(await t.link.tokens.fresh(SHOP), null, "no token, and no error thrown");
  assert.ok(t.connections.map.get(SHOP).reconnectAt);
  const asked = t.google.calls.length;
  assert.equal(await t.link.tokens.fresh(SHOP), null);
  assert.equal(t.google.calls.length, asked, "Google isn't asked again until they reconnect");

  const answer = (await t.call("google.status")).body;
  assert.equal(answer.connected, true);
  assert.equal(answer.needsReconnect, true);
  const resend = fakeResendFetch();
  const email = createEmailService({ env: { RESEND_API_KEY: "re_test_not_real" }, fetch: resend.fetch, registry: t.registry, sentLog: fakeSentLog(), gmailSend: t.link.gmailSend });
  await email.send(SHOP, { kind: "order-note", to: "reader@example.com", idempotencyKey: "note-r", subject: "Your order", text: "Thank you" });
  assert.equal(resend.requests.length, 1, "the order email went from Colophon's sender");
  const control = await t.link.status.googleStatus(SHOP);
  assert.equal(control.stage, "needs reconnect");
  assert.ok(control.reconnectSince);

  // Signing in again clears it and keeps what the shop already had.
  await t.signIn();
  assert.equal((await t.call("google.status")).body.needsReconnect, false);
  assert.equal((await t.link.status.googleStatus(SHOP)).stage, "connected");
  assert.ok(await t.link.tokens.fresh(SHOP));
});

test("a Google outage while refreshing is not 'needs reconnect'", async () => {
  const t = await setup();
  await t.signIn();
  t.connections.map.set(SHOP, { ...t.connections.map.get(SHOP), accessExpiresAt: "2000-01-01T00:00:00.000Z" });
  t.google.refresh = async () => { throw new GoogleError(503, "Google is down"); };
  await assert.rejects(t.link.tokens.fresh(SHOP), /down/);
  assert.equal(t.connections.map.get(SHOP).reconnectAt ?? null, null);
});

test("tokens are kept sealed, bound to their shop", async () => {
  const t = await setup();
  await t.signIn();
  const stored = t.connections.map.get(SHOP);
  assert.ok(!JSON.stringify(stored).includes("ya29."), "no plain access token");
  assert.ok(!JSON.stringify(stored).includes("1//"), "no plain refresh token");
  assert.throws(() => unseal(t.config.tokenKey, "google/lark-press", stored.sealed));
  assert.match(unseal(t.config.tokenKey, `google/${SHOP}`, stored.sealed).refreshToken, /^1\/\//);
});

test("the door: a wrong key, an expired sign-in, a foreign return address and a switched-off link are refused", async () => {
  const t = await setup();
  assert.equal((await t.call("google.status", {}, "wrong-key-0123456789abcdef0123456789")).status, 401);
  assert.equal((await t.call("google.connectLink", { returnUrl: "https://elsewhere.example/admin" })).status, 400);
  const link = await t.call("google.connectLink", { returnUrl: ADMIN });
  const state = new URL(link.body.url).searchParams.get("state");
  t.tick(16 * 60_000);
  assert.equal((await handleGoogle({ method: "GET", path: "/google/oauth", query: { state, code: t.google.allow() } }, { service: t.link.service })).status, 400);
  const off = await setup({ env: { ...ENV, GOOGLE_CONNECT_ENABLED: "false" } });
  assert.deepEqual((await off.call("google.status")).body, { enabled: false });
  assert.equal((await off.call("google.connectLink", { returnUrl: ADMIN })).status, 409);
  assert.equal((await handleGoogle({ method: "GET", path: "/nowhere" }, { service: t.link.service })).status, 404);
});

test("the shop's status lists each part in plain words, with no technical terms", async () => {
  const t = await setup({ env: { ...ENV, GOOGLE_BUSINESS_PROFILE: "on", GOOGLE_ADS_ACCESS: "explorer" }, shop: { domains: [{ name: "shop.mothpress.example", state: "live" }] } });
  t.google.world.analyticsAccounts = [];
  await t.signIn({ extras: ["drive", "youtube", "calendar", "businessProfile", "ads"] });
  await t.link.teardown.teardownOnClose(SHOP);
  const status = (await t.call("google.status")).body;
  assert.equal(status.enabled, true);
  const words = (await t.shopRow()).google.steps.map((s) => s.detail).join(" ");
  for (const banned of [/\bAPI\b/, /OAuth/i, /\bproperty\b/i, /Firebase/, /\bkey\b/i, /\bDNS\b/, /\bTXT\b/, /webhook/i, /secret/i, /deploy/i, /scope/i, /token/i, /Google Cloud/]) {
    assert.ok(!banned.test(words), `step words mention ${banned}: ${words}`);
  }
});

// ---- Teardown (6.20) ----

async function connected(options) {
  const t = await setup({ shop: { domains: [{ name: "shop.mothpress.example", state: "live" }] }, ...options });
  await t.signIn({ extras: ["drive", "youtube", "calendar"] });
  // With Gmail sending switched on, email goes from Gmail and the own address isn't added for sending.
  if (t.resendDomains.domains.has("shop.mothpress.example")) {
    t.resendDomains.setStatus("shop.mothpress.example", "verified");
    await t.link.status.runAgain(SHOP, "email");
  }
  return t;
}

test("a pause disconnects nothing", async () => {
  const t = await connected();
  const calls = t.google.calls.length;
  const before = structuredClone(await t.shopRow());
  assert.deepEqual(await t.link.teardown.teardown(SHOP, "pause"), { stage: "pause", steps: [] });
  assert.equal(t.google.calls.length, calls);
  assert.deepEqual(await t.shopRow(), before);
});

test("closing stops the feed, the tag, Gmail and the extras, gives the access back, and deletes nothing of the press's", async () => {
  const t = await connected({ env: { ...ENV, GOOGLE_GMAIL_SENDING: "on" } });
  const property = [...t.google.world.properties.keys()][0];
  const result = await t.link.teardown.teardownOnClose(row());
  assert.deepEqual(result.steps.map((s) => [s.step, s.state]), [["stopFeed", "done"], ["stopTag", "done"], ["stopGmail", "done"], ["stopExtras", "done"], ["giveBackAccess", "done"]]);
  assert.equal(t.google.world.dataSources.size, 0);
  assert.equal(t.shopFirebase.docs.get(SHOP).analytics.ga4MeasurementId, "");
  assert.deepEqual(t.google.world.bindings.get(property), []);
  for (const resource of t.google.world.webResources.values()) assert.deepEqual(resource.owners, ["owner@example.com"]);
  assert.equal((await t.shopRow()).gmailSender.on, false);
  const g = (await t.shopRow()).google;
  for (const part of ["drive", "youtube", "calendar"]) assert.ok(g[part].stoppedAt, part);
  assert.ok(g.closedAt);
  assert.ok(t.connections.map.get(SHOP).revokedAt);
  assert.equal(t.google.world.revoked.size, 1);
  // The press's own accounts and everything in them stay.
  assert.equal(t.google.world.properties.size, 1);
  assert.equal(t.google.world.merchantAccounts.size, 1);
  assert.equal(t.google.world.folders.size, 1);
  assert.equal(t.google.world.calendars.size, 1);
  assert.equal(t.google.world.scSites.size, 2);
  assert.ok(!changeNames(t).some((name) => /deleteProperty|deleteAccount|deleteFolder|deleteCalendar|deleteSite/.test(name)));
  // Nothing on the deletion timeline happened.
  assert.equal(t.shopFirebase.docs.get(SHOP).deleted, false);
  assert.ok(!t.domains.calls.some(([op]) => op === "removeDomain"));
  // Every teardown step is in the audit log.
  assert.deepEqual(t.audit().filter((e) => e.source === "google-teardown").map((e) => e.kind), result.steps.map((s) => `google.${s.step}`));
  // Run again: nothing changes.
  const calls = t.google.calls.length;
  const audits = t.audit().length;
  await t.link.teardown.teardownOnClose(SHOP);
  assert.equal(t.google.calls.length, calls);
  assert.equal(t.audit().length, audits);
});

test("deletion waits for the closing dates and both emails, then takes the address off and deletes the shop's project once", async () => {
  const t = await connected();
  const closedAt = new Date(START).toISOString();
  const deleteAfter = new Date(START + 90 * DAY).toISOString();
  const early = await t.link.teardown.teardownBeforeDelete(SHOP);
  assert.equal(early.refused, true);
  await t.registry.updateShop(SHOP, { closing: { closedAt, deleteAfter, warned30At: new Date(START + 60 * DAY).toISOString() } });
  t.tick(91 * DAY);
  assert.equal((await t.link.teardown.teardownBeforeDelete(SHOP)).refused, true, "no 7-day email yet");
  assert.equal(t.shopFirebase.docs.get(SHOP).deleted, false);
  await assert.rejects(t.link.status.runAgain(SHOP, "deleteFirebase"), /isn't due/);
  assert.equal(deletionDue(await t.shopRow(), t.now()), false);

  await t.registry.updateShop(SHOP, { closing: { closedAt, deleteAfter, warned30At: new Date(START + 60 * DAY).toISOString(), warned7At: new Date(START + 83 * DAY).toISOString() } });
  const done = await t.link.teardown.teardownBeforeDelete(SHOP);
  // Closing hadn't run yet, so it runs first.
  assert.deepEqual(done.steps.map((s) => s.step), ["stopFeed", "stopTag", "stopGmail", "stopExtras", "giveBackAccess", "removeDomain", "deleteFirebase"]);
  assert.ok(done.steps.every((s) => s.state === "done"), JSON.stringify(done.steps));
  assert.ok(t.domains.calls.some(([op, , args]) => op === "removeDomain" && args.domain === "shop.mothpress.example" && args.deleting === true));
  assert.equal(t.resendDomains.domains.size, 0);
  assert.equal((await t.shopRow()).emailSender, null);
  assert.equal(t.shopFirebase.docs.get(SHOP).deleted, true);
  assert.ok((await t.shopRow()).google.deletedAt);
  await t.link.teardown.teardownBeforeDelete(SHOP);
  assert.equal(t.shopFirebase.calls.filter((c) => c[0] === "deleteProject").length, 1);
  assert.equal(t.google.world.properties.size, 1);
  assert.equal(t.google.world.merchantAccounts.size, 1);
});

test("the press's Disconnect runs the closing steps; connecting again brings everything back without duplicates", async () => {
  const t = await connected();
  const off = await t.call("google.disconnect");
  assert.equal(off.status, 200);
  assert.equal(off.body.connected, false);
  await t.signIn({ extras: ["drive", "youtube", "calendar"] });
  assert.equal(t.google.world.properties.size, 1);
  assert.equal(t.google.world.merchantAccounts.size, 1);
  assert.equal(t.google.world.dataSources.size, 1);
  assert.equal(t.google.world.folders.size, 1);
  assert.match(t.shopFirebase.docs.get(SHOP).analytics.ga4MeasurementId, /^G-/);
  assert.equal([...t.google.world.bindings.values()][0].length, 1);
  assert.equal((await t.shopRow()).google.closedAt, null);
});

test("the control room sees each step and can run a failed one again", async () => {
  const t = await setup({ google: { failOnce: ["createDataSource"] } });
  await t.signIn();
  let status = await t.link.status.googleStatus(SHOP);
  assert.equal(status.stage, "connected");
  const failed = status.steps.find((s) => s.step === "merchantCenter");
  assert.deepEqual([failed.state, failed.canRunAgain], ["failed", true]);
  assert.equal((await t.link.status.runAgain(SHOP, "merchantCenter")).state, "done");
  status = await t.link.status.googleStatus(SHOP);
  assert.equal(status.steps.find((s) => s.step === "merchantCenter").canRunAgain, false);
  await assert.rejects(t.link.status.runAgain(SHOP, "nothing"), /no Google step/);
  await t.link.teardown.teardownOnClose(SHOP);
  assert.equal((await t.link.status.googleStatus(SHOP)).stage, "closed");
});

// ---- The pieces ----

test("the domain bridge reads the live address and waits until the domain service can add records", async () => {
  assert.equal(liveDomainOf({ domains: [{ name: "a.example", state: "waiting_dns" }, { name: "B.example", state: "live" }] }), "b.example");
  const waiting = domainsBridge(null);
  assert.deepEqual(await waiting("addRecords", { shopId: SHOP }, {}), { waiting: true });
  const asked = [];
  const ready = domainsBridge({ applyRecords: async (shopId, args) => (asked.push([shopId, args]), { done: true }) });
  assert.deepEqual(await ready("addRecords", { shopId: SHOP }, { domain: "b.example" }), { done: true });
  assert.deepEqual(asked, [[SHOP, { domain: "b.example" }]]);
  await assert.rejects(ready("anything", { shopId: SHOP }), /no anything/);
});

test("the settings: off by default, keys go together, Gmail sending and Business Profile stay off until switched on", () => {
  const off = readGoogleConfig({});
  assert.equal(off.enabled, false);
  assert.equal(off.gmailSending, false);
  assert.equal(off.businessProfile, false);
  assert.throws(() => readGoogleConfig({ GOOGLE_CLIENT_ID: "x" }), /go together/);
  assert.throws(() => readGoogleConfig({ GOOGLE_CONNECT_ENABLED: "true" }), /needs GOOGLE_CLIENT_ID/);
  assert.throws(() => readGoogleConfig({ ...ENV, GOOGLE_GMAIL_SENDING: "yes" }), /on or off/);
  assert.throws(() => readGoogleConfig({ ...ENV, GOOGLE_TOKEN_KEY: "short" }), /32 bytes/);
});

test("the real client asks Google for lasting access and reads which permissions were given", async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ access_token: "ya29.a", refresh_token: "1//r", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/content" }) };
  };
  const api = createGoogleApi({ fetch, app: { clientId: "cid", clientSecret: "cs" }, redirectUrl: ENV.GOOGLE_REDIRECT_URL, now: () => START });
  const url = new URL(api.authorizeUrl({ state: "s", scopes: ["openid", "email"], loginHint: "owner@example.com" }));
  assert.equal(`${url.origin}${url.pathname}`, AUTHORIZE_URL);
  assert.deepEqual(["access_type", "prompt", "include_granted_scopes", "redirect_uri"].map((k) => url.searchParams.get(k)), ["offline", "consent", "true", ENV.GOOGLE_REDIRECT_URL]);
  const granted = await api.exchangeCode("the-code");
  assert.equal(requests[0].url, TOKEN_URL);
  assert.equal(new URLSearchParams(requests[0].init.body).get("grant_type"), "authorization_code");
  assert.deepEqual(granted.scopes, ["openid", "email", "https://www.googleapis.com/auth/content"]);
  assert.equal(granted.accessExpiresAt, new Date(START + 3600_000).toISOString());
  const refusing = createGoogleApi({ fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "no", status: "PERMISSION_DENIED" } }) }), app: { clientId: "c", clientSecret: "s" } });
  await assert.rejects(refusing.createProperty("t", { account: "accounts/1", displayName: "x" }), (err) => err instanceof GoogleError && err.status === 403);
});

test("a Gmail email keeps its headers on one line each", () => {
  const raw = Buffer.from(rawEmail({ from: '"Moth" <owner@example.com>', to: "a@example.com\r\nBcc: x@example.com", subject: "Hi", text: "Hello" }), "base64url").toString("utf8");
  assert.match(raw, /^To: a@example.com Bcc: x@example.com\r$/m);
  assert.ok(!/^Bcc:/m.test(raw));
});

// ---- On the closing sweep's timeline (6.8 + 6.20) ----

/** The real closing sweep (services/billing/closing.js) with the Google teardown as its hooks and project deleter. */
async function onTimeline(t) {
  const sent = [];
  const sweep = createClosingSweep({
    registry: t.registry, auditLog: t.auditLog,
    billing: { endPlan: async () => {}, publishPlan: async () => {} },
    email: { sendPlatform: async (message) => void sent.push(message) },
    ...googleClosing({ teardown: t.link.teardown, registry: t.registry, shopFirebase: t.shopFirebase }),
    settings: { platformUrl: "https://platform.example" }, now: t.now,
  });
  await t.registry.updateShop(SHOP, { billing: { access: "closed" } });
  const daily = async (days) => { for (let i = 0; i < days; i++) { t.tick(DAY); await sweep.sweep(); } };
  return { sweep, sent, daily };
}

test("the closing sweep stops Google at closing and deletes the project once, only after both warning emails", async () => {
  const t = await connected();
  const s = await onTimeline(t);
  await s.sweep.sweep();
  const closed = (await t.shopRow()).closing;
  assert.equal(closed.stage, "closed");
  assert.ok(closed.hooks.onClose);
  assert.ok((await t.shopRow()).google.closedAt, "the closing steps ran");
  assert.equal(t.shopFirebase.docs.get(SHOP).analytics.ga4MeasurementId, "");
  assert.equal(t.google.world.properties.size, 1, "the press's Analytics stays theirs");

  for (let day = 1; day < DOWNLOAD_DAYS; day++) {
    await s.daily(1);
    assert.equal(t.shopFirebase.docs.get(SHOP).deleted, false, `deleted early on day ${day}`);
    assert.ok(!t.domains.calls.some(([op]) => op === "removeDomain"), `address taken off early on day ${day}`);
  }
  await s.daily(1);
  const row = await t.shopRow();
  assert.equal(row.closing.stage, "deleted");
  assert.deepEqual(s.sent.map((m) => m.kind), ["shop-closed", "shop-deletion-warning", "shop-deletion-warning", "shop-deleted"]);
  assert.ok(t.domains.calls.some(([op, , args]) => op === "removeDomain" && args.domain === "shop.mothpress.example"));
  assert.equal(t.shopFirebase.calls.filter((c) => c[0] === "deleteProject").length, 1, "deleted once, by the teardown");
  assert.ok(row.google.firebaseDeletedAt);
  assert.equal(t.google.world.merchantAccounts.size, 1);
});

test("a closing step that fails is shown with Run again and never holds up the timeline; a failed deletion waits a day", async () => {
  const t = await setup();
  const s = await onTimeline(t);
  await s.sweep.sweep();
  // Never connected: closing has nothing of Google's to stop and still counts as done.
  assert.ok((await t.shopRow()).closing.hooks.onClose);

  const deleteProject = t.shopFirebase.deleteProject;
  t.shopFirebase.deleteProject = async () => { throw new Error("Google didn't answer (pretend error)"); };
  await s.daily(DOWNLOAD_DAYS);
  let row = await t.shopRow();
  assert.equal(row.closing.stage, "closed");
  assert.match(row.closing.problem, /beforeDelete: Google deleteFirebase/);
  assert.equal((row.google.steps ?? []).find((x) => x.step === "deleteFirebase").state, "failed");

  t.shopFirebase.deleteProject = deleteProject;
  await s.daily(1);
  row = await t.shopRow();
  assert.equal(row.closing.stage, "deleted");
  assert.equal(t.shopFirebase.docs.get(SHOP).deleted, true);
});

// ---- Google Shopping problems (plan 16.2) ----

test("the shop can read which books Google Shopping turned down, and nothing is changed in Google", async () => {
  const t = await setup();
  assert.deepEqual((await t.call("google.productProblems")).body, { available: false, problems: [] }, "not connected yet");
  await t.signIn();
  const [account] = [...t.google.world.merchantAccounts.keys()];
  assert.deepEqual((await t.call("google.productProblems")).body.problems, []);
  t.google.world.productProblems.set(account, [{ offerId: "b1", title: "Moth Book", issues: [{ severity: "DISAPPROVED", description: "Missing price", resolution: "Add a price" }] }]);
  const calls = t.google.calls.length;
  const answer = await t.call("google.productProblems");
  assert.equal(answer.status, 200);
  assert.equal(answer.body.available, true);
  assert.equal(answer.body.problems[0].title, "Moth Book");
  assert.equal(t.google.calls.length, calls, "reading changes nothing");
  assert.equal((await t.call("google.productProblems", {}, "wrong-key-wrong-key-wrong-key-0123456789")).status, 401);
});

test("without the Google Shopping permission there is nothing to read", async () => {
  const t = await setup();
  await t.signIn({ scopes: SCOPES.identity.concat(SCOPES.analytics) });
  assert.deepEqual((await t.call("google.productProblems")).body, { available: false, problems: [] });
});

test("the Google client reads product problems from Merchant API v1 and keeps only serious ones", async () => {
  const seen = [];
  const api = createGoogleApi({
    fetch: async (url) => {
      seen.push(String(url));
      return { ok: true, status: 200, json: async () => ({ products: [
        { offerId: "a", productAttributes: { title: "A" }, productStatus: { itemLevelIssues: [{ severity: "DISAPPROVED", description: "No price", detail: "Add one" }] } },
        { offerId: "b", productAttributes: { title: "B" }, productStatus: { itemLevelIssues: [{ severity: "NOT_IMPACTED", description: "Note" }] } },
      ] }) };
    },
  });
  const found = await api.listProductProblems("tok", "accounts/7001");
  assert.deepEqual(found.map((p) => p.offerId), ["a"]);
  assert.match(seen[0], /\/products\/v1\/accounts\/7001\/products\?pageSize=250/);
});

// ---- One-click Google Sheet (plan 16.1) ----

const STOCK = [["Title", "Author", "ISBN", "Price", "On hand"], ["Moth Book", "A. Writer", "9780000000000", 18, 12], ["=HYPERLINK(\"x\")", "", "", "", 0]];

test("the stock list goes into one spreadsheet in the press's own Drive, made once and rewritten after that", async () => {
  const t = await setup();
  await t.signIn({ extras: ["drive"] });
  const first = await t.call("google.sheetSync", { rows: STOCK });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.available, true);
  assert.equal(first.body.rows, 2);
  assert.equal(t.google.world.spreadsheets.size, 1);
  const [[id, sheet]] = [...t.google.world.spreadsheets];
  assert.equal(sheet.title, "Moth Press stock from Colophon");
  assert.deepEqual(sheet.values, STOCK);
  assert.equal(first.body.url, `https://docs.google.com/spreadsheets/d/${id}/edit`);
  // Again with new numbers: the same sheet is written, no second one is made.
  const second = await t.call("google.sheetSync", { rows: [STOCK[0], ["Moth Book", "A. Writer", "9780000000000", 18, 11]] });
  assert.equal(second.body.rows, 1);
  assert.equal(t.google.world.spreadsheets.size, 1);
  assert.equal(t.google.world.spreadsheets.get(id).values[1][4], 11);
  assert.equal((await t.shopRow()).google.sheet.spreadsheetId, id);
  // Nothing in the press's Drive is ever deleted by the platform.
  assert.ok(!changeNames(t).some((name) => /delete/i.test(name) && /sheet/i.test(name)));
});

test("without the Drive box ticked, or before connecting, there is no sheet and nothing is written", async () => {
  const t = await setup();
  assert.deepEqual((await t.call("google.sheetSync", { rows: STOCK })).body, { available: false });
  await t.signIn({ scopes: [...SCOPES.identity, ...SCOPES.analytics, ...SCOPES.searchConsole, ...SCOPES.merchantCenter] });
  assert.deepEqual((await t.call("google.sheetSync", { rows: STOCK })).body, { available: false });
  assert.equal(t.google.world.spreadsheets.size, 0);
});

test("a sheet the press deleted is made again on the next send, and bad cells are refused", async () => {
  const t = await setup();
  await t.signIn({ extras: ["drive"] });
  await t.call("google.sheetSync", { rows: STOCK });
  t.google.world.spreadsheets.clear();
  assert.equal((await t.call("google.sheetSync", { rows: STOCK })).body.gone, true);
  assert.equal((await t.call("google.sheetSync", { rows: STOCK })).body.available, true);
  assert.equal(t.google.world.spreadsheets.size, 1);
  for (const rows of [[], "x", [["a"], "b"], Array.from({ length: 2002 }, () => ["a"]), [Array.from({ length: 13 }, () => "a")]]) {
    assert.equal((await t.call("google.sheetSync", { rows })).status, 400);
  }
});
