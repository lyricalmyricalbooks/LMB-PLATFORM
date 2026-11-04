// The social service (code plan 27.1-27.3) against pretend Meta, Pinterest and TikTok (fakes.js): connecting, the
// catalog, posting never twice, a lost connection, refreshing, disconnecting, the doors and the press's words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSocialConfig } from "./config.js";
import { createSocialService, SENDING_STALE_MS } from "./social.js";
import { createNetworkClients } from "./networks.js";
import { handleSocial } from "./http.js";
import { META, PINTEREST, TIKTOK } from "./endpoints.js";
import { fakeConnections, fakeSent, fakeSocialFetch, fakeStates } from "./fakes.js";
import { unseal } from "../payments/tokenSeal.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { findBanned } from "../../plain-words/words.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const START = Date.parse("2026-11-04T12:00:00Z");
const SITE = "https://moth-press.web.app";
const ENV = {
  SOCIAL_ENABLED: "true",
  META_APP_ID: "1234", META_APP_SECRET: "meta-secret",
  PINTEREST_APP_ID: "5678", PINTEREST_APP_SECRET: "pin-secret",
  TIKTOK_CLIENT_KEY: "awtiktok", TIKTOK_CLIENT_SECRET: "tt-secret",
  SOCIAL_REDIRECT_BASE: "https://social.platform.example",
  SOCIAL_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const row = (fields = {}) => ({ shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", status: "live", serviceKeyHash: hashServiceKey(KEY), ...fields });

async function setup({ env = ENV } = {}) {
  let clock = START;
  const now = () => clock;
  const config = readSocialConfig(env);
  const pretend = fakeSocialFetch({ apps: config.apps });
  const registry = fakeRegistry();
  await registry.createShop(SHOP, row());
  const auditLog = fakeAuditLog();
  const connections = fakeConnections();
  const states = fakeStates();
  const sent = fakeSent();
  const service = createSocialService({ clients: createNetworkClients({ fetch: pretend.fetch, config, now }), registry, auditLog, connections, states, sent, config, now });
  const call = (op, args = {}, { key = KEY } = {}) =>
    handleSocial({ method: "POST", path: "/shop", headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${key}` }, body: { op, args } }, { service });
  const connect = async (network, code) => {
    const link = await call("social.connectLink", { network, returnUrl: `${SITE}/admin#channels` });
    assert.equal(link.status, 200, JSON.stringify(link.body));
    const state = new URL(link.body.url).searchParams.get("state");
    return handleSocial({ method: "GET", path: `/${network}/oauth`, query: { state, code } }, { service });
  };
  const post = (placeId, fields = {}) => call("social.publish", {
    postId: "post1", placeId, imageUrl: "https://firebasestorage.example/cover.jpg", caption: "New: Night Moths", link: `${SITE}/books/night-moths?utm_source=social`, title: "Night Moths", retailerId: "nm-paperback", ...fields,
  });
  return { service, pretend, connections, sent, auditLog, registry, call, connect, post, config, tick: (ms) => { clock += ms; } };
}

test("settings: off by default, keys go in pairs, a token key and an answer address come with keys", () => {
  assert.equal(readSocialConfig({}).enabled, false);
  assert.deepEqual(Object.values(readSocialConfig({}).apps), [null, null, null]);
  assert.throws(() => readSocialConfig({ META_APP_ID: "1" }), /go together/);
  assert.throws(() => readSocialConfig({ ...ENV, SOCIAL_TOKEN_KEY: "" }), /SOCIAL_TOKEN_KEY/);
  assert.throws(() => readSocialConfig({ ...ENV, SOCIAL_REDIRECT_BASE: "http://x.example" }), /https/);
  assert.equal(readSocialConfig(ENV).redirectUrl("meta"), "https://social.platform.example/meta/oauth");
});

test("while off, status says so and nothing else runs", async () => {
  const { call } = await setup({ env: { ...ENV, SOCIAL_ENABLED: "false" } });
  const status = await call("social.status");
  assert.equal(status.status, 200);
  assert.equal(status.body.enabled, false);
  assert.ok(status.body.networks.every((n) => n.available === false && n.connected === false));
  const link = await call("social.connectLink", { network: "meta", returnUrl: `${SITE}/admin` });
  assert.equal(link.status, 409);
  assert.equal(link.body.error.code, "social_off");
});

test("a network without keys is not offered", async () => {
  const { call } = await setup({ env: { ...ENV, TIKTOK_CLIENT_KEY: "", TIKTOK_CLIENT_SECRET: "" } });
  const status = await call("social.status");
  assert.deepEqual(status.body.networks.map((n) => [n.network, n.available]), [["meta", true], ["pinterest", true], ["tiktok", false]]);
  assert.equal((await call("social.connectLink", { network: "tiktok", returnUrl: `${SITE}/admin` })).body.error.code, "network_off");
});

test("the door refuses a wrong key and an unknown call, and only knows its own paths", async () => {
  const { call, service } = await setup();
  assert.equal((await call("social.status", {}, { key: "x".repeat(40) })).status, 401);
  assert.equal((await call("social.nope")).status, 400);
  assert.equal((await handleSocial({ method: "GET", path: "/shop" }, { service })).status, 405);
  assert.equal((await handleSocial({ method: "POST", path: "/elsewhere" }, { service })).status, 404);
  assert.equal((await handleSocial({ method: "GET", path: "/myspace/oauth" }, { service })).status, 405);
});

test("connecting Facebook & Instagram: the sign-in page, the answer, Pages and Instagram found, tokens sealed", async () => {
  const { call, connect, connections, config } = await setup();
  const link = await call("social.connectLink", { network: "meta", returnUrl: `${SITE}/admin#channels` });
  const url = new URL(link.body.url);
  assert.equal(`${url.origin}${url.pathname}`, META.authorize());
  assert.equal(url.searchParams.get("client_id"), "1234");
  assert.equal(url.searchParams.get("redirect_uri"), "https://social.platform.example/meta/oauth");
  assert.equal(url.searchParams.get("scope"), META.scopes.join(","));

  const back = await connect("meta", "meta-code");
  assert.equal(back.status, 302);
  const to = new URL(back.headers.Location);
  assert.equal(to.searchParams.get("social"), "connected");
  assert.equal(to.searchParams.get("network"), "meta");

  const status = await call("social.status");
  const meta = status.body.networks.find((n) => n.network === "meta");
  assert.equal(meta.connected, true);
  assert.equal(meta.accountName, "Jo Moth");
  assert.deepEqual(meta.places.map((p) => [p.id, p.kind]), [["fb:111", "facebookPage"], ["ig:222", "instagram"], ["fb:333", "facebookPage"]]);
  assert.equal(JSON.stringify(status.body).includes("page-111"), false, "no token reaches the shop");

  const stored = await connections.get(SHOP, "meta");
  assert.equal(JSON.stringify(stored).includes("page-111"), false, "tokens are kept sealed");
  const open = unseal(config.tokenKey, `social/${SHOP}/meta`, stored.sealed);
  assert.equal(open.placeTokens["ig:222"], "page-111");
  assert.throws(() => unseal(config.tokenKey, "social/lark-press/meta", stored.sealed));
});

test("the return address must be the shop's own, and the sign-in answer is used once, in time, for its own network", async () => {
  const { call, service, tick } = await setup();
  assert.equal((await call("social.connectLink", { network: "meta", returnUrl: "https://evil.example/admin" })).status, 400);
  assert.equal((await call("social.connectLink", { network: "meta", returnUrl: `http://moth-press.web.app/admin` })).status, 400);
  const link = await call("social.connectLink", { network: "pinterest", returnUrl: `${SITE}/admin` });
  const state = new URL(link.body.url).searchParams.get("state");
  assert.equal((await handleSocial({ method: "GET", path: "/meta/oauth", query: { state, code: "meta-code" } }, { service })).status, 400, "another network's state");
  const link2 = await call("social.connectLink", { network: "pinterest", returnUrl: `${SITE}/admin` });
  const state2 = new URL(link2.body.url).searchParams.get("state");
  tick(16 * 60 * 1000);
  assert.equal((await handleSocial({ method: "GET", path: "/pinterest/oauth", query: { state: state2, code: "pin-code" } }, { service })).status, 400, "expired");
  const link3 = await call("social.connectLink", { network: "pinterest", returnUrl: `${SITE}/admin` });
  const state3 = new URL(link3.body.url).searchParams.get("state");
  const denied = await handleSocial({ method: "GET", path: "/pinterest/oauth", query: { state: state3, error: "access_denied" } }, { service });
  assert.equal(new URL(denied.headers.Location).searchParams.get("social"), "denied");
  assert.equal((await handleSocial({ method: "GET", path: "/pinterest/oauth", query: { state: state3, code: "pin-code" } }, { service })).status, 400, "used once");
  assert.equal((await call("social.status")).body.networks.find((n) => n.network === "pinterest").connected, false);
});

test("a bad sign-in code goes back to the shop as failed and connects nothing", async () => {
  const { connect, call } = await setup();
  const back = await connect("tiktok", "wrong");
  assert.equal(new URL(back.headers.Location).searchParams.get("social"), "failed");
  assert.equal((await call("social.status")).body.networks.find((n) => n.network === "tiktok").connected, false);
});

test("sending the catalog: Meta gets one catalog with a daily feed of the product file; running it again changes nothing", async () => {
  const { connect, call, pretend, auditLog } = await setup();
  await connect("meta", "meta-code");
  const feedUrl = `${SITE}/social-product-feed.csv`;
  const first = await call("social.sendCatalog", { network: "meta", feedUrl, currency: "CAD" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.changed, true);
  assert.deepEqual(pretend.world.catalogs.map((c) => c.kind), ["catalog", "feed"]);
  assert.equal(pretend.world.catalogs[0].business, "77");
  assert.deepEqual(pretend.world.catalogs[1].schedule, { interval: "DAILY", url: feedUrl, hour: 3 });
  const again = await call("social.sendCatalog", { network: "meta", feedUrl, currency: "CAD" });
  assert.equal(again.body.changed, false);
  assert.equal(pretend.world.catalogs.length, 2, "nothing doubled");
  assert.ok([...auditLog.entries.get(SHOP).values()].some((e) => e.kind === "social.catalog"));
  assert.equal((await call("social.status")).body.networks[0].catalog.feedUrl, feedUrl);
  assert.equal((await call("social.sendCatalog", { network: "meta", feedUrl: "https://evil.example/f.csv" })).status, 400);
});

test("Meta without a business portfolio gets plain words to make one", async () => {
  const { connect, call, pretend } = await setup();
  pretend.world.meta.businesses = [];
  await connect("meta", "meta-code");
  const res = await call("social.sendCatalog", { network: "meta", feedUrl: `${SITE}/social-product-feed.csv` });
  assert.equal(res.body.error.code, "no_business");
  assert.match(res.body.error.message, /business portfolio/);
});

test("Pinterest gets a CSV catalog feed in Canadian dollars; TikTok's catalog waits for TikTok Shop", async () => {
  const { connect, call, pretend } = await setup();
  await connect("pinterest", "pin-code");
  await connect("tiktok", "tt-code");
  const res = await call("social.sendCatalog", { network: "pinterest", feedUrl: `${SITE}/social-product-feed.csv`, currency: "CAD" });
  assert.equal(res.status, 200);
  const feed = pretend.world.catalogs.find((c) => c.network === "pinterest");
  assert.equal(feed.format, "CSV");
  assert.equal(feed.location, `${SITE}/social-product-feed.csv`);
  assert.equal(feed.default_currency, "CAD");
  const tt = await call("social.sendCatalog", { network: "tiktok", feedUrl: `${SITE}/social-product-feed.csv` });
  assert.equal(tt.body.error.code, "no_catalog");
});

test("posting to a Facebook Page: a photo post with the words and the link, made with that Page's own permission", async () => {
  const { connect, post, pretend } = await setup();
  await connect("meta", "meta-code");
  const res = await post("fb:111");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.state, "posted");
  const made = pretend.world.posts.at(-1);
  assert.equal(made.place, "fb:111");
  assert.equal(made.fields.url, "https://firebasestorage.example/cover.jpg");
  assert.match(made.fields.message, /New: Night Moths\n\nhttps:\/\/moth-press\.web\.app\/books\/night-moths/);
  assert.equal(made.fields.access_token, "page-111");
});

test("posting to Instagram tags the product once the catalog has it, and goes untagged before", async () => {
  const { connect, call, post, pretend } = await setup();
  await connect("meta", "meta-code");
  const untagged = await post("ig:222", { postId: "p-a" });
  assert.equal(untagged.body.tagged, false);
  assert.equal(pretend.world.posts.at(-1).fields.product_tags, undefined, "no catalog yet");
  await call("social.sendCatalog", { network: "meta", feedUrl: `${SITE}/social-product-feed.csv` });
  pretend.world.meta.products.set("nm-paperback", "4455");
  const tagged = await post("ig:222", { postId: "p-b" });
  assert.equal(tagged.body.tagged, true);
  assert.deepEqual(JSON.parse(pretend.world.posts.at(-1).fields.product_tags), [{ product_id: "4455", x: 0.5, y: 0.5 }]);
  const off = await post("ig:222", { postId: "p-c", tagProduct: false });
  assert.equal(off.body.tagged, false);
});

test("posting a pin and a TikTok photo", async () => {
  const { connect, post, pretend } = await setup();
  await connect("pinterest", "pin-code");
  await connect("tiktok", "tt-code");
  const pin = await post("pin:900");
  assert.equal(pin.status, 200, JSON.stringify(pin.body));
  const made = pretend.world.posts.at(-1).fields;
  assert.equal(made.board_id, "900");
  assert.equal(made.link, `${SITE}/books/night-moths?utm_source=social`);
  assert.deepEqual(made.media_source, { source_type: "image_url", url: "https://firebasestorage.example/cover.jpg" });
  const tt = await post("tt:open-7");
  assert.equal(tt.status, 200, JSON.stringify(tt.body));
  const init = pretend.world.posts.at(-1).fields;
  assert.equal(init.media_type, "PHOTO");
  assert.equal(init.post_mode, "DIRECT_POST");
  assert.equal(init.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
  assert.deepEqual(init.source_info, { source: "PULL_FROM_URL", photo_images: ["https://firebasestorage.example/cover.jpg"], photo_cover_index: 0 });
  assert.equal(tt.body.privateOnly, undefined);
});

test("before TikTok's audit a post is only visible to the account, and the shop is told", async () => {
  const { connect, post, pretend } = await setup();
  pretend.world.tiktok.privacy = ["SELF_ONLY"];
  await connect("tiktok", "tt-code");
  const tt = await post("tt:open-7");
  assert.equal(pretend.world.posts.at(-1).fields.post_info.privacy_level, "SELF_ONLY");
  assert.equal(tt.body.privateOnly, true);
});

test("never twice: the same post and place answers with the first post; one being sent is left alone until stale", async () => {
  const { connect, post, pretend, sent, tick } = await setup();
  await connect("meta", "meta-code");
  const first = await post("fb:111");
  const again = await post("fb:111");
  assert.equal(again.body.already, true);
  assert.equal(again.body.remoteId, first.body.remoteId);
  assert.equal(pretend.world.posts.length, 1);
  await sent.put(`${SHOP}/stuck/fb:111`, { state: "sending", at: new Date(START).toISOString() });
  assert.equal((await post("fb:111", { postId: "stuck" })).body.state, "sending");
  assert.equal(pretend.world.posts.length, 1);
  tick(SENDING_STALE_MS + 1000);
  assert.equal((await post("fb:111", { postId: "stuck" })).body.state, "posted");
  assert.equal(pretend.world.posts.length, 2);
});

test("a refused post is recorded with plain words and can be tried again", async () => {
  const { connect, post, pretend, sent } = await setup();
  await connect("pinterest", "pin-code");
  pretend.world.fail("/v5/pins", { status: 400, body: { code: 1, message: "Invalid parameters: media_source.url" } });
  const res = await post("pin:900");
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, "refused");
  assert.equal(findBanned(res.body.error.message).length, 0);
  const record = await sent.get(`${SHOP}/post1/pin:900`);
  assert.equal(record.state, "failed");
  assert.match(record.detail, /media_source/, "the network's own words are kept for the control room");
  const retry = await post("pin:900");
  assert.equal(retry.body.state, "posted");
});

test("a connection the network stopped accepting is marked lost, posting stops, and status says to connect again", async () => {
  const { connect, post, call, pretend, service, auditLog } = await setup();
  await connect("meta", "meta-code");
  pretend.world.cutOff("meta");
  const res = await post("fb:111");
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "lost");
  assert.match(res.body.error.message, /Connect it again/);
  const meta = (await call("social.status")).body.networks[0];
  assert.equal(meta.connected, false);
  assert.equal(meta.problem, "lost");
  assert.ok([...auditLog.entries.get(SHOP).values()].some((e) => e.kind === "social.lost"));
  assert.equal((await post("fb:111", { postId: "p2" })).body.error.code, "lost");
  assert.equal((await service.controlRoom(SHOP))[0].problem, "lost");
  // Connecting again clears it.
  await connect("meta", "meta-code");
  assert.equal((await call("social.status")).body.networks[0].connected, true);
});

test("Pinterest's access is refreshed shortly before it ends, and kept sealed", async () => {
  const { connect, post, pretend, tick, connections, config } = await setup();
  pretend.world.pinterest.expiresIn = 3600;
  await connect("pinterest", "pin-code");
  const before = unseal(config.tokenKey, `social/${SHOP}/pinterest`, (await connections.get(SHOP, "pinterest")).sealed);
  tick(3600 * 1000 - 60 * 1000);
  assert.equal((await post("pin:900")).body.state, "posted");
  const after = unseal(config.tokenKey, `social/${SHOP}/pinterest`, (await connections.get(SHOP, "pinterest")).sealed);
  assert.notEqual(after.accessToken, before.accessToken);
  assert.ok(pretend.world.requests.some((r) => r.url === PINTEREST.token && r.body.includes("grant_type=refresh_token")));
});

test("a place that isn't connected, an address off the shop and a missing caption are refused before any network call", async () => {
  const { connect, post, pretend } = await setup();
  await connect("meta", "meta-code");
  const calls = pretend.world.requests.length;
  assert.equal((await post("fb:999")).body.error.code, "no_place");
  assert.equal((await post("pin:900")).body.error.code, "no_place");
  assert.equal((await post("fb:111", { link: "https://evil.example/x" })).status, 400);
  assert.equal((await post("fb:111", { imageUrl: "http://x.example/a.jpg" })).status, 400);
  assert.equal((await post("fb:111", { caption: "  " })).status, 400);
  assert.equal((await post("fb:111", { caption: "x".repeat(2201) })).status, 400);
  assert.equal(pretend.world.requests.length, calls);
});

test("disconnecting gives the permission back, forgets the tokens and keeps the catalog for a reconnect", async () => {
  const { connect, call, pretend, connections } = await setup();
  await connect("meta", "meta-code");
  await call("social.sendCatalog", { network: "meta", feedUrl: `${SITE}/social-product-feed.csv` });
  const res = await call("social.disconnect", { network: "meta" });
  assert.equal(res.body.disconnected, true);
  assert.equal(pretend.world.meta.revoked, 1);
  const stored = await connections.get(SHOP, "meta");
  assert.equal(stored.sealed, null);
  assert.ok(stored.catalog.catalogId);
  assert.equal((await call("social.status")).body.networks[0].connected, false);
  await connect("meta", "meta-code");
  await call("social.sendCatalog", { network: "meta", feedUrl: `${SITE}/social-product-feed.csv` });
  assert.equal(pretend.world.catalogs.filter((c) => c.kind === "catalog").length, 1, "no second catalog");
  await connect("tiktok", "tt-code");
  await call("social.disconnect", { network: "tiktok" });
  assert.equal(pretend.world.tiktok.revoked, 1);
});

test("every message a press can see is in plain words", async () => {
  const { call, connect, pretend, post } = await setup();
  const messages = [];
  const keep = (res) => { if (res.body?.error?.message) messages.push(res.body.error.message); };
  keep(await call("social.publish", {}));
  keep(await call("social.sendCatalog", { network: "tiktok", feedUrl: `${SITE}/f.csv` }));
  await connect("meta", "meta-code");
  pretend.world.fail("/photos", { status: 500, body: { error: { message: "(#2) Service temporarily unavailable API", code: 2 } } });
  keep(await post("fb:111"));
  pretend.world.cutOff("meta");
  keep(await post("fb:111", { postId: "x2" }));
  assert.ok(messages.length >= 3);
  for (const m of messages.slice(1)) assert.deepEqual(findBanned(m), [], m);
});

test("addresses come only from endpoints.js", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["networks.js", "social.js"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(src, /https:\/\/(graph\.facebook|www\.facebook|api\.pinterest|www\.pinterest|open\.tiktokapis|www\.tiktok)/, file);
  }
  assert.ok(TIKTOK.scopes.includes("video.publish"));
});

test("a new shop address (the press's own domain) keeps the catalog and adds a feed for the new address", async () => {
  const { connect, call, pretend, registry } = await setup();
  await connect("meta", "meta-code");
  await call("social.sendCatalog", { network: "meta", feedUrl: `${SITE}/social-product-feed.csv` });
  await registry.updateShop(SHOP, { siteUrl: "https://mothpress.example" });
  const res = await call("social.sendCatalog", { network: "meta", feedUrl: "https://mothpress.example/social-product-feed.csv" });
  assert.equal(res.body.changed, true);
  assert.deepEqual(pretend.world.catalogs.map((c) => c.kind), ["catalog", "feed", "feed"]);
  assert.equal(pretend.world.catalogs[2].catalog, pretend.world.catalogs[0].id);
});
