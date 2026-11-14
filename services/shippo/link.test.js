import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createShippoLink, shippoLinkConfig, TOKEN_URL } from "./link.js";
import { createAppShopDoor } from "../apps/shopDoor.js";

const SHOP = { shopId: "moth-press", projectId: "moth-press", siteUrl: "https://mothpress.example", status: "live" };
const OTHER = { shopId: "press-two", projectId: "press-two-shop", status: "live" };

function fakeStates() {
  const rows = new Map();
  return { rows, put: async (id, r) => void rows.set(id, { ...r }), take: async (id) => { const r = rows.get(id) ?? null; rows.delete(id); return r; } };
}

function setup({ clientId = "client-1", clientSecret = "secret-1", answer = { access_token: "oauth.abc123", token_type: "bearer" }, status = 200 } = {}) {
  const states = fakeStates();
  const calls = [];
  let clock = 1_800_000_000_000;
  const link = createShippoLink({
    clientId, clientSecret, utmSource: "colophon", redirectUri: "https://platform.example/api/shippo/oauth", states,
    registry: { getShop: async (id) => ({ [SHOP.shopId]: SHOP, [OTHER.shopId]: OTHER })[id] ?? null },
    fetch: async (url, init) => { calls.push({ url, init }); return { ok: status < 400, json: async () => answer }; },
    now: () => clock,
  });
  return { link, states, calls, tick: (ms) => { clock += ms; } };
}

const returnUrl = "https://mothpress.example/admin/#settings/shipping";

async function throughShippo(link, shop = SHOP) {
  const { url } = await link.op(shop, "shippo.connectLink", { returnUrl });
  const state = new URL(url).searchParams.get("state");
  const back = await link.oauthCallback({ code: "code-from-shippo", state });
  return { url, back, ticket: back.headers ? new URL(back.headers.Location).searchParams.get("shippoTicket") : null };
}

describe("Connect Shippo on the platform", () => {
  it("is not available until both codes are in", async () => {
    const { link } = setup({ clientSecret: null });
    assert.deepEqual(await link.op(SHOP, "shippo.status"), { available: false });
    await assert.rejects(link.op(SHOP, "shippo.connectLink", { returnUrl }), { status: 409 });
  });

  it("sends the press to Shippo with a state, and back to its own shop with a ticket", async () => {
    const { link } = setup();
    const { url, back, ticket } = await throughShippo(link);
    const authorize = new URL(url);
    assert.equal(authorize.origin + authorize.pathname, "https://goshippo.com/oauth/authorize");
    assert.equal(authorize.searchParams.get("client_id"), "client-1");
    assert.equal(authorize.searchParams.get("redirect_uri"), "https://platform.example/api/shippo/oauth");
    assert.equal(authorize.searchParams.get("utm_source"), "colophon");
    assert.equal(back.status, 302);
    const location = new URL(back.headers.Location);
    assert.equal(location.host, "mothpress.example");
    assert.equal(location.hash, "#settings/shipping");
    assert.equal(location.searchParams.get("shippo"), "ok");
    assert.match(ticket, /^[0-9a-f]{48}$/);
  });

  it("refuses a return address that isn't the shop's own", async () => {
    const { link } = setup();
    await assert.rejects(link.op(SHOP, "shippo.connectLink", { returnUrl: "https://evil.example/admin/" }), { status: 400 });
    await assert.rejects(link.op(SHOP, "shippo.connectLink", { returnUrl: "http://mothpress.example/admin/" }), { status: 400 });
  });

  it("swaps the ticket for the token once, for that shop only, and keeps nothing", async () => {
    const { link, states, calls } = setup();
    const { ticket } = await throughShippo(link);
    await assert.rejects(link.op(OTHER, "shippo.claim", { ticket }), { status: 410 });
    // The wrong shop's try spent it: the press presses Connect again. A fresh one works for the right shop.
    const again = await throughShippo(link);
    assert.deepEqual(await link.op(SHOP, "shippo.claim", { ticket: again.ticket }), { accessToken: "oauth.abc123" });
    assert.equal(calls[0].url, TOKEN_URL);
    const form = new URLSearchParams(calls[0].init.body);
    assert.deepEqual(Object.fromEntries(form), { client_id: "client-1", client_secret: "secret-1", code: "code-from-shippo", grant_type: "authorization_code" });
    await assert.rejects(link.op(SHOP, "shippo.claim", { ticket: again.ticket }), { status: 410 });
    assert.equal(states.rows.size, 0);
  });

  it("lets a ticket run out, and an old state too", async () => {
    const { link, tick } = setup();
    const { ticket } = await throughShippo(link);
    tick(11 * 60_000);
    await assert.rejects(link.op(SHOP, "shippo.claim", { ticket }), { status: 410 });
    const { url } = await link.op(SHOP, "shippo.connectLink", { returnUrl });
    tick(31 * 60_000);
    const late = await link.oauthCallback({ code: "x", state: new URL(url).searchParams.get("state") });
    assert.equal(late.status, 400);
  });

  it("goes back saying no when the press said no on Shippo, and never takes a state twice", async () => {
    const { link } = setup();
    const { url } = await link.op(SHOP, "shippo.connectLink", { returnUrl });
    const state = new URL(url).searchParams.get("state");
    const back = await link.oauthCallback({ error: "access_denied", state });
    assert.equal(new URL(back.headers.Location).searchParams.get("shippo"), "denied");
    assert.equal((await link.oauthCallback({ code: "c", state })).status, 400);
  });

  it("a state can't be claimed as a ticket", async () => {
    const { link } = setup();
    const { url } = await link.op(SHOP, "shippo.connectLink", { returnUrl });
    await assert.rejects(link.op(SHOP, "shippo.claim", { ticket: new URL(url).searchParams.get("state") }), { status: 410 });
  });

  it("says Shippo refused when the token swap fails", async () => {
    const { link } = setup({ status: 400, answer: { error: "invalid_grant" } });
    const { ticket } = await throughShippo(link);
    await assert.rejects(link.op(SHOP, "shippo.claim", { ticket }), { status: 502 });
  });

  it("is reached through the app store door with the shop's key", async () => {
    const { link } = setup();
    const registry = { getShop: async (id) => (id === "moth-press" ? { ...SHOP, serviceKeyHash: "nope" } : null) };
    const door = createAppShopDoor({ registry, installs: {}, makers: {}, shippo: link });
    await assert.rejects(door.shopCall({ headers: { "x-shop-id": "moth-press", authorization: "Bearer wrong" }, body: { op: "shippo.status" } }), { status: 401 });
  });

  it("reads its settings from the server's env", () => {
    assert.deepEqual(shippoLinkConfig({ SHIPPO_CLIENT_ID: " id ", SHIPPO_CLIENT_SECRET: "s" }, "https://platform.example/"), {
      clientId: "id", clientSecret: "s", utmSource: "", redirectUri: "https://platform.example/api/shippo/oauth",
    });
    assert.equal(shippoLinkConfig({}, "https://platform.example").clientId, null);
  });
});
