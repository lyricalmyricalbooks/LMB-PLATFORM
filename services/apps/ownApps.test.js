// Colophon's own apps (code plan 26.11-26.13): they put themselves on the store with no setup step, and each one works
// from end to end through the real app store plumbing: found on the store, added with the owner's permission, connected,
// told about a paid order, answering back through the app connection, and forgetting the shop when it's removed.
// Only the outside companies (Chit Chats, Mailchimp) and the shop's own database are pretend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeAppAlertStores, fakeAppInstallStores, fakeAppStore, fakeChitChatsStores, fakeMailchimpStores } from "./fakes.js";
import { createAppMakers } from "./makers.js";
import { createAppInstalls } from "./installs.js";
import { createAppAlerts } from "./alerts.js";
import { createAppConnection, optOutId as optOut } from "./connection.js";
import { createOwnApps, ownAppId, ownAppSecret } from "./ownApps.js";
import { createChitChatsApp } from "../chitchats/app.js";
import { createMailchimpApp } from "../mailchimp/app.js";
import { memberHash } from "../mailchimp/client.js";

const ROOT = "a-link-phrase-of-plenty-length";
const URL_ = "https://platform.example";
const OWNER = { uid: "uid-ada", email: "ada@moth.example", email_verified: true };
const ADMIN = { uid: "uid-team", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };

test("own apps list themselves once, keep their secret, and stay off the store when an admin takes them off", async () => {
  const store = fakeAppStore();
  const own = createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example", available: { mailchimp: false } });
  const makers = createAppMakers({ store, admins: [ADMIN.email], ensureOwnApps: () => own.ensure() });

  const { apps } = await makers.storeList();
  assert.deepEqual(apps.map((a) => a.name), ["Chit Chats"], "on the store with nothing registered by hand; Mailchimp waits for its sign-up");
  const appId = ownAppId("chitchats");
  assert.equal(apps[0].appId, appId);
  assert.ok(await makers.verifyClient(appId, ownAppSecret(ROOT, "chitchats")), "the secret made from the link phrase is the app's");
  assert.equal(await makers.verifyClient(appId, ownAppSecret("another-phrase-altogether", "chitchats")), null);
  assert.equal(own.appOf("chitchats").appId, appId);
  assert.equal(own.sealKeyOf("chitchats").length, 32);

  // A second process (another server, the next deploy) changes nothing.
  const again = createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example", available: { mailchimp: false } });
  assert.deepEqual((await again.ensure()).listed, [{ appId, changed: false }, { appId: ownAppId("mailchimp"), changed: false, waiting: true }]);

  // Once Mailchimp's sign-up is there it lists itself with its logo, and comes off again if it goes away.
  const withMailchimp = createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example" });
  await withMailchimp.ensure();
  const mailchimp = (await makers.storeList()).apps.find((a) => a.name === "Mailchimp");
  assert.equal(mailchimp.brand, "mailchimp");
  await createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example", available: { mailchimp: false } }).ensure();
  assert.equal((await store.get(ownAppId("mailchimp"))).onStore, false);
  await createOwnApps({ store, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example" }).ensure();
  assert.equal((await store.get(ownAppId("mailchimp"))).onStore, true, "back once it can connect again");

  // The team's own choices stand: a logo from the review card, and taking it off the store.
  await makers.setBrand(ADMIN, { appId, brand: "mailchimp" });
  await makers.unlist(ADMIN, { appId, reason: "Paused while Chit Chats changes its address." });
  const later = createOwnApps({ store, root: ROOT, platformUrl: "https://new.platform.example", supportEmail: "support@platform.example", available: { mailchimp: false } });
  await later.ensure();
  const kept = await store.get(appId);
  assert.equal(kept.onStore, false, "an app taken off the store isn't put back");
  assert.equal(kept.listing.details.brand, "mailchimp", "a logo set by the team stays");
  assert.equal(kept.listing.details.installAddress, "https://new.platform.example/account/chitchats.html", "details follow the platform");

  assert.deepEqual((await createOwnApps({ store, root: "short", platformUrl: URL_, supportEmail: "x@platform.example" }).ensure()).listed, [], "no secret, nothing listed");
});

/** Pretend Chit Chats: client 12345 with token tok-good-123. */
function chitChats() {
  const shipments = new Map();
  let n = 0;
  const reply = (status, body) => new Response(body ? JSON.stringify(body) : "", { status, headers: { "content-type": "application/json" } });
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    if (!pathname.startsWith("/api/v1/clients/12345/") || init.headers?.Authorization !== "tok-good-123") return reply(401, { error: { message: "Unauthorized" } });
    if (init.method === "GET" && searchParams.get("limit") === "1") return reply(200, []);
    if (init.method === "POST") {
      const id = `CC${(n += 1)}`;
      shipments.set(id, { id, status: "unpaid", ...JSON.parse(init.body) });
      return reply(201, { shipment: shipments.get(id) });
    }
    const one = /\/shipments\/([A-Z0-9]+)$/.exec(pathname);
    return one && shipments.has(one[1]) ? reply(200, { shipment: shipments.get(one[1]) }) : reply(404, null);
  };
  return { fetch, shipments };
}

/** Pretend Mailchimp: one account on server us21, code "mc-code" gives token "mc-token", two audiences. */
function mailchimpServer(now) {
  const members = new Map(); // `${list}/${hash}` -> { email, status, tags, last_changed }
  const calls = [];
  const reply = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url, init = {}) => {
    const { host, pathname, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    calls.push(`${method} ${host}${pathname}`);
    if (host === "login.mailchimp.com" && pathname === "/oauth2/token") {
      const form = new URLSearchParams(init.body);
      const good = form.get("code") === "mc-code" && form.get("client_secret") === "mc-secret" && form.get("redirect_uri") === `${URL_}/account/mailchimp.html`;
      return good ? reply(200, { access_token: "mc-token", expires_in: 0, scope: null }) : reply(400, { error: "invalid_grant" });
    }
    if (host === "login.mailchimp.com" && pathname === "/oauth2/metadata") return init.headers?.Authorization === "OAuth mc-token" ? reply(200, { dc: "us21" }) : reply(401, {});
    if (host !== "us21.api.mailchimp.com" || init.headers?.Authorization !== "Bearer mc-token") return reply(401, { title: "API Key Invalid", status: 401 });
    const path = pathname.replace("/3.0", "");
    if (path === "/lists") return reply(200, { lists: [{ id: "list1", name: "Moth readers", stats: { member_count: 3 } }, { id: "list2", name: "Events", stats: { member_count: 0 } }] });
    const one = /^\/lists\/(list[12])\/members\/([a-f0-9]{32})(\/tags)?$/.exec(path);
    if (one && method === "PUT") {
      const body = JSON.parse(init.body);
      const key = `${one[1]}/${one[2]}`;
      const had = members.get(key);
      members.set(key, { email: body.email_address, status: had?.status ?? body.status_if_new, tags: [...new Set([...(had?.tags ?? []), ...(body.tags ?? [])])], last_changed: had?.last_changed ?? now().toISOString() });
      return reply(200, { id: one[2] });
    }
    if (one && one[3] && method === "POST") {
      const had = members.get(`${one[1]}/${one[2]}`);
      if (!had) return reply(404, { title: "Resource Not Found", status: 404 });
      had.tags = [...new Set([...had.tags, ...JSON.parse(init.body).tags.map((t) => t.name)])];
      return reply(204);
    }
    if (one && method === "PATCH") {
      const had = members.get(`${one[1]}/${one[2]}`);
      if (!had) return reply(404, { title: "Resource Not Found", status: 404 });
      Object.assign(had, { status: JSON.parse(init.body).status, last_changed: now().toISOString() });
      return reply(200, {});
    }
    const all = /^\/lists\/(list[12])\/members$/.exec(path);
    if (all && method === "GET") {
      const since = searchParams.get("since_last_changed") ?? "";
      const out = [...members].filter(([k, m]) => k.startsWith(`${all[1]}/`) && m.status === searchParams.get("status") && m.last_changed >= since).map(([, m]) => ({ email_address: m.email, last_changed: m.last_changed }));
      const offset = Number(searchParams.get("offset") ?? 0);
      return reply(200, { members: out.slice(offset, offset + Number(searchParams.get("count"))), total_items: out.length });
    }
    return reply(404, { title: "Resource Not Found", status: 404 });
  };
  /** Someone leaves from a Mailchimp email's unsubscribe link. */
  const leave = (list, email) => Object.assign(members.get(`${list}/${memberHash(email)}`), { status: "unsubscribed", last_changed: now().toISOString() });
  return { fetch, members, calls, leave, of: (list, email) => members.get(`${list}/${memberHash(email)}`) ?? null };
}

/** The whole platform side, as server/world.js wires it, with the shop's database in memory. */
function platform() {
  let clock = Date.parse("2026-11-11T12:00:00Z");
  const now = () => new Date(clock);
  const docs = new Map();
  const shopData = {
    get: async (shopId, path) => structuredClone(docs.get(`${shopId}/${path}`) ?? null),
    create: async (shopId, path, data) => {
      if (docs.has(`${shopId}/${path}`)) throw new Error("exists");
      docs.set(`${shopId}/${path}`, structuredClone(data));
    },
    list: async (shopId, collection) => [...docs].filter(([k]) => k.startsWith(`${shopId}/${collection}/`)).map(([k, data]) => ({ id: k.split("/").pop(), data: structuredClone(data) })),
    find: async (shopId, collection, { where }) => {
      const [[field, , value]] = where;
      return (await shopData.list(shopId, collection)).filter((row) => String(row.data[field] ?? "") >= value);
    },
  };
  const roles = { "ada@moth.example moth-press": "owner" };
  const roleIn = async (person, shopId) => roles[`${person.email} ${shopId}`] ?? null;
  const registry = fakeRegistry();
  registry.shops?.set?.("moth-press", { shopId: "moth-press", pressName: "Moth Press" });
  const apps = fakeAppStore();
  const { installs: installStore, codes } = fakeAppInstallStores();
  const alertStores = fakeAppAlertStores();
  const own = createOwnApps({ store: apps, root: ROOT, platformUrl: URL_, supportEmail: "support@platform.example", now });
  const makers = createAppMakers({ store: apps, admins: [ADMIN.email], now, ensureOwnApps: () => own.ensure() });
  const courier = chitChats();
  const delivered = [];
  // Alerts leave by the internet; here each address is answered by the app behind it.
  const alertFetch = async (url, init) => {
    const headers = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    delivered.push(JSON.parse(init.body).topic);
    const app = { [`${URL_}/api/chitchats/alerts`]: chitchats, [`${URL_}/api/mailchimp/alerts`]: mailchimp }[url];
    if (!app) return new Response("", { status: 404 });
    try {
      return new Response(JSON.stringify(await app.alert({ headers, rawBody: init.body })), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ message: error.message }), { status: error.status ?? 500 });
    }
  };
  const alerts = createAppAlerts({ apps, installs: installStore, outbox: alertStores.outbox, state: alertStores.state, shopData, fetch: alertFetch, now });
  const installs = createAppInstalls({ apps, makers, installs: installStore, codes, registry, auditLog: fakeAuditLog(), now, roleIn, onRemoved: (install) => alerts.removed(install) });
  // The shop answers app requests with its own rules (apps/shop/functions/appRequests.js); here it says yes.
  const sleep = async () => {
    for (const [k, data] of docs) {
      if (!k.includes("/appRequests/") || data.status) continue;
      if (data.op === "newsletter.unsubscribe") {
        const shopId = k.split("/")[0];
        docs.set(`${shopId}/marketing-optout/${optOut(data.input.email)}`, { at: now().toISOString(), source: `app:${data.appId}` });
        docs.delete(`${shopId}/newsletter/${data.input.email}`);
        docs.set(k, { ...data, status: "done", result: "unsubscribed", reason: "" });
      } else docs.set(k, { ...data, status: "done", result: "dispatched", reason: "Marked sent." });
    }
  };
  const connection = createAppConnection({ installs, shopData, registry, outbox: alertStores.outbox, now, sleep, waitMs: 1000 });
  const chitchatsSaved = fakeChitChatsStores();
  const keys = own.appOf("chitchats");
  const chitchats = createChitChatsApp({
    appId: keys.appId, appSecret: keys.appSecret, sealKey: own.sealKeyOf("chitchats"), connections: chitchatsSaved.connections, shipments: chitchatsSaved.shipments,
    exchange: (args) => installs.exchange(args), appCall: (request) => connection(request), roleIn, fetch: courier.fetch, base: "https://staging.chitchats.example",
    returnAddress: `${URL_}/account/chitchats.html`, now,
  });
  const mailchimpSaved = fakeMailchimpStores();
  const audience = mailchimpServer(now);
  const mcKeys = own.appOf("mailchimp");
  const mailchimp = createMailchimpApp({
    appId: mcKeys.appId, appSecret: mcKeys.appSecret, clientId: "mc-client", clientSecret: "mc-secret", sealKey: own.sealKeyOf("mailchimp"),
    connections: mailchimpSaved.connections, members: mailchimpSaved.members, exchange: (args) => installs.exchange(args),
    appCall: (request) => connection(request), roleIn, fetch: audience.fetch, returnAddress: `${URL_}/account/mailchimp.html`, now,
  });
  return { docs, makers, installs, alerts, chitchats, chitchatsSaved, mailchimp, mailchimpSaved, audience, courier, delivered, tick: (m) => { clock += m * 60_000; }, iso: () => now().toISOString() };
}

test("Chit Chats from the store to a sent order and back off the shop, through the real plumbing", async () => {
  const p = platform();
  const listed = (await p.makers.storeList()).apps.find((a) => a.name === "Chit Chats");
  assert.ok(listed, "the shop's store shows Chit Chats");
  const back = listed.installAddress;

  // The permission page, then the connect page with the code it hands back.
  const preview = await p.installs.preview(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back });
  assert.equal(preview.canApprove, true);
  assert.deepEqual(preview.permissions.map((x) => x.scope), ["write_orders"]);
  const { redirect } = await p.installs.approve(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back, state: "s1" });
  const code = new URL(redirect).searchParams.get("code");
  const connected = await p.chitchats.connect(OWNER, { shopId: "moth-press", code, clientId: "12345", accessToken: "tok-good-123" });
  assert.equal(connected.connected, true);

  // An order is paid in the shop: the alert reaches the app and a Chit Chats shipment is made, once.
  p.tick(1);
  p.docs.set("moth-press/orders/o1", {
    orderId: "1001", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", deliveryMethod: "shipping", currency: "CAD", updatedAt: p.iso(),
    items: [{ bookId: "b1", title: "Moth Songs", quantity: 2, price: 24 }], subtotal: 48,
    customer: { name: "Bea Reader", email: "bea@example.com", address: { line1: "1 Main St", city: "Toronto", state: "ON", postalCode: "M6G 1A1", country: "CA" } },
  });
  await p.alerts.sweep();
  assert.deepEqual(p.delivered, ["orders/paid"]);
  assert.equal(p.courier.shipments.size, 1, "the paid order is in Chit Chats");
  const [shipment] = p.courier.shipments.values();
  assert.equal(shipment.postage_type, "unknown", "no postage is bought");
  assert.equal(shipment.line_items[0].quantity, 2);
  await p.alerts.sweep();
  assert.equal(p.courier.shipments.size, 1, "a second look makes no second shipment");

  // Chit Chats has a tracking number: the app marks the order sent through the app connection, as any app would.
  shipment.status = "in_transit";
  shipment.carrier = "Canada Post";
  shipment.carrier_tracking_code = "7023210039414604";
  await p.chitchats.sweep();
  const requests = [...p.docs].filter(([k]) => k.startsWith("moth-press/appRequests/")).map(([, d]) => d);
  assert.equal(requests.length, 1, "one request to the shop");
  assert.equal(requests[0].op, "order.dispatch");
  assert.equal(requests[0].input.orderId, "o1");
  assert.equal(requests[0].input.trackingNumber, "7023210039414604");
  assert.equal(requests[0].appId, listed.appId);

  // The owner removes the app in Settings › Apps: the key stops at once and the goodbye alert makes the app forget.
  await p.installs.removeForShop("moth-press", listed.appId, OWNER.email);
  await p.alerts.sweep();
  assert.ok(p.delivered.includes("app/uninstalled"));
  assert.equal(p.chitchatsSaved.shops.size, 0, "the Chit Chats details are forgotten");
});

test("Mailchimp from the store to readers in an audience, unsubscribes both ways, and back off the shop", async () => {
  const p = platform();
  const newsletter = (email, at, status = "subscribed") => p.docs.set(`moth-press/newsletter/${email}`, { email, status, subscribedAt: at, source: "footer" });
  newsletter("ann@example.com", "2026-11-01T10:00:00Z");
  newsletter("bea@example.com", "2026-11-02T10:00:00Z");
  newsletter("cal@example.com", "2026-11-03T10:00:00Z", "pending"); // never confirmed: never sent
  newsletter("dee@example.com", "2026-11-04T10:00:00Z");
  p.docs.set(`moth-press/marketing-optout/${optOut("dee@example.com")}`, { at: "2026-11-05T10:00:00Z", source: "email" }); // left before

  const listed = (await p.makers.storeList()).apps.find((a) => a.name === "Mailchimp");
  assert.ok(listed, "the shop's store shows Mailchimp");
  assert.equal(listed.brand, "mailchimp");
  const back = listed.installAddress;
  const preview = await p.installs.preview(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back });
  assert.deepEqual(preview.permissions.map((x) => x.scope).sort(), ["read_orders", "write_customers"]);
  const { redirect } = await p.installs.approve(OWNER, { appId: listed.appId, shopId: "moth-press", returnAddress: back, state: "s1" });
  const code = new URL(redirect).searchParams.get("code");

  // The connect page: swap the code, go to Mailchimp's own page, come back, pick an audience.
  await assert.rejects(p.mailchimp.begin({ uid: "uid-bob", email: "bob@moth.example", email_verified: true }, { shopId: "moth-press", code }), /team/);
  const { url } = await p.mailchimp.begin(OWNER, { shopId: "moth-press", code });
  const allow = new URL(url);
  assert.equal(allow.origin + allow.pathname, "https://login.mailchimp.com/oauth2/authorize");
  assert.equal(allow.searchParams.get("redirect_uri"), back);
  await assert.rejects(p.mailchimp.finish(OWNER, { shopId: "moth-press", code: "wrong" }), /didn't finish connecting/);
  const choose = await p.mailchimp.finish(OWNER, { shopId: "moth-press", code: "mc-code" });
  assert.equal(choose.stage, "choose");
  assert.deepEqual(choose.lists.map((l) => l.name), ["Moth readers", "Events"]);
  await assert.rejects(p.mailchimp.pickAudience(OWNER, { shopId: "moth-press", listId: "list9" }), /Pick one/);
  const connected = await p.mailchimp.pickAudience(OWNER, { shopId: "moth-press", listId: "list1" });
  assert.equal(connected.connected, true);
  assert.equal(connected.audience.name, "Moth readers");
  assert.ok(!JSON.stringify(p.mailchimpSaved.shops.get("moth-press")).includes("mc-token"), "Mailchimp's token is kept sealed");

  // The first sync: only confirmed readers who never left, tagged.
  p.tick(1);
  assert.deepEqual(await p.mailchimp.sweep(), { shops: 1, added: 2, problems: 0 });
  assert.deepEqual([...p.audience.members.values()].map((m) => m.email).sort(), ["ann@example.com", "bea@example.com"]);
  assert.deepEqual(p.audience.of("list1", "ann@example.com").tags, ["Shop newsletter"]);
  assert.ok(![...p.mailchimpSaved.people.values()].some((row) => JSON.stringify(row).includes("@")), "no addresses kept, only fingerprints");
  const putsBefore = p.audience.calls.filter((c) => c.startsWith("PUT")).length;
  p.tick(15);
  assert.equal((await p.mailchimp.sweep()).added, 0);
  assert.equal(p.audience.calls.filter((c) => c.startsWith("PUT")).length, putsBefore, "nobody is sent twice");

  // A new reader joins; Bea buys a book; a buyer who never signed up stays out of Mailchimp.
  p.tick(1);
  newsletter("eve@example.com", p.iso());
  p.docs.set("moth-press/orders/o1", { orderId: "1001", paymentStatus: "paid", currency: "CAD", updatedAt: p.iso(), items: [{ bookId: "b1", title: "Moth Songs", quantity: 1, price: 24 }], customer: { name: "Bea", email: "bea@example.com" } });
  p.docs.set("moth-press/orders/o2", { orderId: "1002", paymentStatus: "paid", currency: "CAD", updatedAt: p.iso(), items: [{ bookId: "b1", title: "Moth Songs", quantity: 1, price: 24 }], customer: { name: "Zed", email: "zed@example.com" } });
  await p.alerts.sweep();
  assert.deepEqual(p.audience.of("list1", "bea@example.com").tags, ["Shop newsletter", "Customer", "Bought: Moth Songs"]);
  assert.equal(p.audience.of("list1", "zed@example.com"), null, "a buyer not on the newsletter is never added");
  assert.ok(!p.audience.calls.some((c) => c.includes(memberHash("zed@example.com"))), "nor even looked up");
  p.tick(15);
  assert.equal((await p.mailchimp.sweep()).added, 1);
  assert.ok(p.audience.of("list1", "eve@example.com"));

  // Ann leaves in Mailchimp: the shop stops emailing her. Bea leaves from the shop's email: she's unsubscribed in Mailchimp.
  p.tick(1);
  p.audience.leave("list1", "ann@example.com");
  p.docs.set(`moth-press/marketing-optout/${optOut("bea@example.com")}`, { at: p.iso(), source: "email" });
  p.docs.delete("moth-press/newsletter/bea@example.com");
  p.tick(15);
  await p.mailchimp.sweep();
  assert.ok(p.docs.has(`moth-press/marketing-optout/${optOut("ann@example.com")}`), "Ann's opt-out is in the shop");
  assert.equal(p.docs.has("moth-press/newsletter/ann@example.com"), false);
  const request = [...p.docs].find(([k, d]) => k.startsWith("moth-press/appRequests/") && d.op === "newsletter.unsubscribe")[1];
  assert.equal(request.appId, listed.appId);
  assert.equal(p.audience.of("list1", "bea@example.com").status, "unsubscribed", "Bea is unsubscribed in Mailchimp");
  p.tick(15);
  await p.mailchimp.sweep();
  assert.equal([...p.docs].filter(([k, d]) => k.startsWith("moth-press/appRequests/") && d.op === "newsletter.unsubscribe").length, 1, "asked once");
  const status = await p.mailchimp.status(OWNER, { shopId: "moth-press" });
  assert.equal(status.added, 3);
  assert.equal(status.lastProblem, null);

  // The owner removes the app: the goodbye alert makes it forget the shop and every fingerprint.
  await p.installs.removeForShop("moth-press", listed.appId, OWNER.email);
  await p.alerts.sweep();
  assert.equal(p.mailchimpSaved.shops.size, 0);
  assert.equal(p.mailchimpSaved.people.size, 0);
  assert.equal((await p.mailchimp.status(OWNER, { shopId: "moth-press" })).stage, "none");
});
