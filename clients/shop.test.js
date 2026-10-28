import { test } from "node:test";
import assert from "node:assert/strict";
import { firestoreClient } from "./firestore.js";
import { inventoryLinkClient, registryFiles, shopDataClient, siteCheckClient, stockroomClient } from "./shop.js";
import { firestoreAccounts, firestoreBreaches, firestoreDevices, firestoreRecoveries, firestoreRepairs, firestoreSentLog, firestoreSupport } from "./stores.js";
import { scriptedFetch, token } from "./fake-fetch.js";

const P = "lmb-test-shop";
const DB = `https://firestore.googleapis.com/v1/projects/${P}/databases/stockroom`;
const DOCS = `${DB}/documents`;
const notFound = { status: 404, json: { error: { code: 404, status: "NOT_FOUND", message: "Document not found" } } };
const str = (s) => ({ stringValue: s });

test("the stockroom's catalogue is read from its named database", async () => {
  const fetch = scriptedFetch([
    { method: "GET", url: `${DOCS}/settings/catalog`, json: { fields: { data: str(JSON.stringify({ a: { id: "a", title: "A" }, _meta: {} })) } } },
    { method: "GET", url: `${DOCS}/settings/catalog`, ...notFound },
  ]);
  const stockroom = stockroomClient((projectId) => firestoreClient({ fetch, token, projectId, database: "stockroom" }));
  assert.deepEqual(await stockroom.books(P), { a: { id: "a", title: "A" } });
  assert.deepEqual(await stockroom.books(P), {});
  fetch.done();
});

test("adding books keeps the catalogue's other books, turns on the newer storage and writes everything in one commit", async () => {
  const name = (path) => `projects/${P}/databases/stockroom/documents/${path}`;
  const catalog = { kept: { id: "kept", title: "Press book" }, "test-book-one": { id: "test-book-one", title: "Renamed" } };
  const books = [{ id: "test-book-one", title: "Test Book One" }, { id: "test-book-two", title: "Test Book Two" }];
  const expected = { ...catalog, "test-book-two": books[1] };
  const fetch = scriptedFetch([
    { method: "POST", url: `${DB}/documents:beginTransaction`, body: {}, json: { transaction: "T" } },
    { method: "GET", url: `${DOCS}/settings/catalog?transaction=T`, json: { fields: { data: str(JSON.stringify(catalog)) } } },
    { method: "GET", url: `${DOCS}/settings/modeFlags?transaction=T`, json: { fields: { fs_mode_kept: { booleanValue: true } } } },
    { method: "GET", url: `${DOCS}/books/test-book-two/data/metadata?transaction=T`, ...notFound },
    { method: "POST", url: `${DB}/documents:commit`, body: { transaction: "T", writes: [
      { update: { name: name("books/test-book-two/data/metadata"), fields: { data: str("{}"), ts: { integerValue: "1000" } } }, currentDocument: { exists: false } },
      { update: { name: name("settings/catalog"), fields: { data: str(JSON.stringify(expected)), ts: { integerValue: "1000" } } } },
      { update: { name: name("settings/modeFlags"), fields: { fs_mode_kept: { booleanValue: true }, "fs_mode_test-book-two": { booleanValue: true }, fs_mode_global: { booleanValue: true } } } },
    ] }, json: {} },
  ]);
  const stockroom = stockroomClient((projectId) => firestoreClient({ fetch, token, projectId, database: "stockroom" }), { now: () => new Date(1000) });
  await stockroom.addBooks(P, books);
  fetch.done();
});

test("the shop's link is asked as the test owner, through the shop's own admin call", async () => {
  const URL = "https://northamerica-northeast1-lmb-test-shop.cloudfunctions.net/createStripeCheckoutSession";
  const seen = [];
  const answers = [
    { status: 200, body: { state: { links: { a: { _: "a" } } } } },
    { status: 200, body: { connection: { ok: false, problem: "not-granted" } } },
    { status: 200, body: { links: { a: { _: "a" } }, errors: [{ bookId: "b", reason: "x" }] } },
    { status: 409, body: { error: "Check the connection to the inventory app first." } },
  ];
  const fetch = async (url, init) => {
    seen.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    const { status, body } = answers.shift();
    return { ok: status === 200, status, json: async () => body };
  };
  const link = inventoryLinkClient({ fetch, functionsBase: async () => "https://northamerica-northeast1-lmb-test-shop.cloudfunctions.net", idToken: async () => "owner-id-token" });
  assert.deepEqual(await link.state(P), { links: { a: { _: "a" } } });
  assert.deepEqual(await link.check(P), { ok: false, problem: "not-granted" });
  assert.deepEqual(await link.saveLinks(P, { a: { _: "a" } }), { links: { a: { _: "a" } }, errors: [{ bookId: "b", reason: "x" }] });
  await assert.rejects(link.startSales(P, { startDay: "2026-10-28" }), /Check the connection/);
  assert.ok(seen.every((s) => s.url === URL && s.init.headers.Authorization === "Bearer owner-id-token"));
  assert.deepEqual(seen.map((s) => s.init.body), [
    { action: "inventoryLink", op: "status" }, { action: "inventoryLink", op: "check" },
    { action: "inventoryLink", op: "saveLinks", links: { a: { _: "a" } } }, { action: "inventoryLink", op: "startSales", startDay: "2026-10-28" },
  ]);
});

test("shop data creates only missing documents; per-shop files live in the registry", async () => {
  const S = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const fetch = scriptedFetch([
    { method: "POST", url: `${S}/settings?documentId=website`, body: { fields: { shopName: str("Test Press") } }, json: {} },
    { method: "POST", url: `${S}/settings?documentId=website`, status: 409, json: { error: { status: "ALREADY_EXISTS" } } },
    { method: "PATCH", url: `${R}/shops/${P}/files/functions.env`, body: { fields: { text: str("A=1\n") } }, json: {} },
    { method: "GET", url: `${R}/shops/${P}/files/functions.env`, json: { fields: { text: str("A=1\n") } } },
  ]);
  const shopData = shopDataClient((projectId) => firestoreClient({ fetch, token, projectId }));
  await shopData.create(P, "settings/website", { shopName: "Test Press" });
  await assert.rejects(shopData.create(P, "settings/website", { shopName: "x" }), /already exists/);
  const files = registryFiles(firestoreClient({ fetch, token, projectId: "lmb-platform-prod" }), "functions.env");
  await files.write(P, "A=1\n");
  assert.equal(await files.read(P), "A=1\n");
  fetch.done();
});

test("shop data lists a collection's documents and removes one (the accounts team sync)", async () => {
  const S = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
  const fetch = scriptedFetch([
    { method: "POST", url: `${S}:runQuery`, body: { structuredQuery: { from: [{ collectionId: "members" }] } },
      json: [{ document: { name: `projects/${P}/databases/(default)/documents/members/bea%40example.com`, fields: { role: str("staff") } } }, { readTime: "t" }] },
    { method: "DELETE", url: `${S}/members/bea%40example.com?currentDocument.exists=true`, json: {} },
  ]);
  const shopData = shopDataClient((projectId) => firestoreClient({ fetch, token, projectId }));
  assert.deepEqual(await shopData.list(P, "members"), [{ id: "bea@example.com", data: { role: "staff" } }]);
  assert.equal(await shopData.remove(P, "members/bea@example.com"), true);
  fetch.done();
});

test("the site check reports the status, an empty page and no answer", async () => {
  const answers = [{ status: 200, text: "<html>" }, { status: 200, text: "  " }, { status: 500, text: "x" }, "down"];
  const fetch = async () => {
    const next = answers.shift();
    if (next === "down") throw new Error("ECONNREFUSED");
    return { status: next.status, text: async () => next.text };
  };
  const check = siteCheckClient({ fetch });
  assert.deepEqual(await check.get("https://x.example"), { status: 200, problems: [] });
  assert.deepEqual(await check.get("https://x.example"), { status: 200, problems: ["the page is empty"] });
  assert.deepEqual(await check.get("https://x.example"), { status: 500, problems: [] });
  assert.deepEqual(await check.get("https://x.example"), { status: 0, problems: ["no answer (ECONNREFUSED)"] });
});

test("the email sent log and the payment account record keep their fakes' shape", async () => {
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const fetch = scriptedFetch([
    { method: "PATCH", url: `${R}/emailSent/s1%3Aowner-welcome`, body: { fields: { shopId: str("s1"), kind: str("owner-welcome"), status: str("sent"), at: str("t") } }, json: {} },
    { method: "POST", url: `${R}:runQuery`, json: [{ document: { name: "projects/lmb-platform-prod/databases/(default)/documents/emailSent/k", fields: { status: str("sent") } } }] },
    { method: "GET", url: `${R}/paymentAccounts/s1`, json: { fields: { accountId: str("acct_1") } } },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-platform-prod" });
  await firestoreSentLog(db).put("s1:owner-welcome", { shopId: "s1", kind: "owner-welcome", status: "sent", at: "t" });
  assert.deepEqual(await firestoreSentLog(db).findSent("s1", "owner-welcome"), { status: "sent" });
  assert.deepEqual(await firestoreAccounts(db).get("s1"), { accountId: "acct_1" });
  fetch.done();
});

test("the support store filters by status or email and sorts and counts here", async () => {
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const doc = (id, fields) => ({ document: { name: `projects/lmb-platform-prod/databases/(default)/documents/support/${id}`, fields } });
  const query = (field, value) => ({ structuredQuery: { from: [{ collectionId: "support" }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: str(value) } }, limit: field === "status" ? 200 : 500 } });
  const mine = [doc("a", { updatedAt: str("1"), openedAt: str("2026-10-27") }), doc("b", { updatedAt: str("2"), openedAt: str("2026-10-28") })];
  const fetch = scriptedFetch([
    { method: "POST", url: `${R}:runQuery`, body: query("status", "open"), json: [doc("a", { status: str("open") })] },
    { method: "POST", url: `${R}:runQuery`, body: query("email", "ada@moth.example"), json: mine },
    { method: "POST", url: `${R}:runQuery`, body: query("email", "ada@moth.example"), json: mine },
  ]);
  const support = firestoreSupport(firestoreClient({ fetch, token, projectId: "lmb-platform-prod" }));
  assert.deepEqual(await support.list({ status: "open" }), [{ status: "open" }]);
  assert.deepEqual((await support.listByEmail("ada@moth.example")).map((t) => t.updatedAt), ["2", "1"]);
  assert.equal(await support.countSince("ada@moth.example", "2026-10-28"), 1);
  fetch.done();
});

test("the repair store lists by shop and status with equality filters only", async () => {
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const doc = (id, fields) => ({ document: { name: `projects/lmb-platform-prod/databases/(default)/documents/repairs/${id}`, fields } });
  const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: str(value) } });
  const fetch = scriptedFetch([
    { method: "POST", url: `${R}:runQuery`, body: { structuredQuery: { from: [{ collectionId: "repairs" }], where: { compositeFilter: { op: "AND", filters: [eq("shopId", "moth-press"), eq("status", "open")] } }, limit: 1000 } }, json: [doc("a", { status: str("open") })] },
    { method: "POST", url: `${R}:runQuery`, body: { structuredQuery: { from: [{ collectionId: "repairs" }], where: eq("status", "fixed"), limit: 1000 } }, json: [] },
  ]);
  const repairs = firestoreRepairs(firestoreClient({ fetch, token, projectId: "lmb-platform-prod" }));
  assert.deepEqual(await repairs.list({ shopId: "moth-press", status: "open" }), [{ status: "open" }]);
  assert.deepEqual(await repairs.list({ status: "fixed" }), []);
  fetch.done();
});

test("the breach register's store reads every entry and writes one by id", async () => {
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const fetch = scriptedFetch([
    { method: "POST", url: `${R}:runQuery`, body: { structuredQuery: { from: [{ collectionId: "breaches" }], limit: 5000 } }, json: [{ document: { name: `projects/lmb-platform-prod/databases/(default)/documents/breaches/b1`, fields: { foundOn: str("2026-10-28") } } }] },
    { method: "PATCH", url: `${R}/breaches/b1`, body: { fields: { foundOn: str("2026-10-28") } }, json: {} },
  ]);
  const breaches = firestoreBreaches(firestoreClient({ fetch, token, projectId: "lmb-platform-prod" }));
  assert.deepEqual(await breaches.list(), [{ foundOn: "2026-10-28" }]);
  await breaches.set("b1", { foundOn: "2026-10-28" });
  assert.equal(breaches.delete, undefined, "nothing here deletes an entry");
  fetch.done();
});

test("the device and recovery stores keep their fakes' shape", async () => {
  const R = "https://firestore.googleapis.com/v1/projects/lmb-platform-prod/databases/(default)/documents";
  const doc = (id, fields) => ({ document: { name: `projects/lmb-platform-prod/databases/(default)/documents/recoveries/${id}`, fields } });
  const query = (field, value) => ({ structuredQuery: { from: [{ collectionId: "recoveries" }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: str(value) } }, limit: 200 } });
  const asked = [doc("a", { askedAt: str("2026-10-20") }), doc("b", { askedAt: str("2026-10-28") })];
  const fetch = scriptedFetch([
    { method: "GET", url: `${R}/devices/uid-ada`, ...notFound },
    { method: "PATCH", url: `${R}/devices/uid-ada`, body: { fields: { known: { mapValue: { fields: {} } } } }, json: {} },
    { method: "GET", url: `${R}/recoveries/abc123`, json: { fields: { status: str("waiting") } } },
    { method: "POST", url: `${R}:runQuery`, body: query("status", "waiting"), json: [doc("a", { status: str("waiting") })] },
    { method: "POST", url: `${R}:runQuery`, body: query("requesterEmail", "ada@moth.example"), json: asked },
    { method: "POST", url: `${R}:runQuery`, body: query("oldEmail", "old@moth.example"), json: asked },
    { method: "POST", url: `${R}:runQuery`, body: query("requesterEmail", "ada@moth.example"), json: asked },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-platform-prod" });
  const devices = firestoreDevices(db);
  assert.equal(await devices.get("uid-ada"), null);
  await devices.set("uid-ada", { known: {} });
  const recoveries = firestoreRecoveries(db);
  assert.deepEqual(await recoveries.get("abc123"), { status: "waiting" });
  assert.deepEqual(await recoveries.list({ status: "waiting" }), [{ status: "waiting" }]);
  assert.deepEqual((await recoveries.listByRequester("ada@moth.example")).map((r) => r.askedAt), ["2026-10-28", "2026-10-20"]);
  assert.deepEqual((await recoveries.listByOld("old@moth.example")).map((r) => r.askedAt), ["2026-10-28", "2026-10-20"]);
  assert.equal(await recoveries.countSince("ada@moth.example", "2026-10-25"), 1);
  fetch.done();
});
