import { test } from "node:test";
import assert from "node:assert/strict";
import { firestoreClient, fromFields, toFields } from "./firestore.js";
import { firestoreAuditLog, firestoreRegistry } from "./registry.js";
import { scriptedFetch, token } from "./fake-fetch.js";

const DOCS = "https://firestore.googleapis.com/v1/projects/lmb-test-shop/databases/(default)/documents";
const STOCKROOM = "https://firestore.googleapis.com/v1/projects/lmb-test-shop/databases/stockroom/documents";

test("values go to Firestore's shape and back", () => {
  const data = { title: "A", stock: 5, price: 20.5, on: true, none: null, list: [1, "two"], empty: [], map: { deep: { x: 1 } } };
  const fields = toFields(data);
  assert.deepEqual(fields.stock, { integerValue: "5" });
  assert.deepEqual(fields.price, { doubleValue: 20.5 });
  assert.deepEqual(fields.empty, { arrayValue: {} });
  assert.deepEqual(fromFields(fields), data);
  assert.deepEqual(fromFields({ at: { timestampValue: "2026-10-28T00:00:00Z" } }), { at: "2026-10-28T00:00:00Z" });
  assert.throws(() => toFields({ bad: Number.NaN }), /can't store NaN/);
});

test("get reads one document, and a missing one is null; a missing database is an error", async () => {
  const fetch = scriptedFetch([
    { method: "GET", url: `${DOCS}/books/test-book-one`, json: { name: "x", fields: { stockLevel: { integerValue: "5" } } } },
    { method: "GET", url: `${DOCS}/books/nope`, status: 404, json: { error: { code: 404, status: "NOT_FOUND", message: "Document not found" } } },
    { method: "GET", url: `${DOCS}/members/owner%40example.com`, status: 404, json: { error: { status: "NOT_FOUND", message: "The database (default) does not exist for project lmb-test-shop" } } },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop" });
  assert.deepEqual(await db.get("books/test-book-one"), { stockLevel: 5 });
  assert.equal(await db.get("books/nope"), null);
  await assert.rejects(db.get("members/owner@example.com"), /does not exist/);
  fetch.done();
});

test("create makes a document by id and says false when it is already there", async () => {
  const fetch = scriptedFetch([
    { method: "POST", url: `${DOCS}/books?documentId=test-book-one`, body: { fields: { title: { stringValue: "One" } } }, json: {} },
    { method: "POST", url: `${DOCS}/books/test-book-one/notes?documentId=n1`, body: { fields: { a: { integerValue: "1" } } }, status: 409, json: { error: { status: "ALREADY_EXISTS" } } },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop" });
  assert.equal(await db.create("books/test-book-one", { title: "One" }), true);
  assert.equal(await db.create("books/test-book-one/notes/n1", { a: 1 }), false);
  fetch.done();
});

test("set with fields sends an update mask; remove asks for an existing document", async () => {
  const fetch = scriptedFetch([
    { method: "PATCH", url: `${DOCS}/shops/s1?updateMask.fieldPaths=status&updateMask.fieldPaths=liveAt`, body: { fields: { status: { stringValue: "live" }, liveAt: { stringValue: "t" } } }, json: {} },
    { method: "DELETE", url: `${DOCS}/orders/o1?currentDocument.exists=true`, json: {} },
    { method: "DELETE", url: `${DOCS}/orders/o2?currentDocument.exists=true`, status: 404, json: { error: { status: "NOT_FOUND", message: "No document to update" } } },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop" });
  await db.set("shops/s1", { status: "live", liveAt: "t" }, { fields: ["status", "liveAt"] });
  assert.equal(await db.remove("orders/o1"), true);
  assert.equal(await db.remove("orders/o2"), false);
  fetch.done();
});

test("query sends a structured query and reads the documents back", async () => {
  const fetch = scriptedFetch([{
    method: "POST",
    url: `${DOCS}:runQuery`,
    body: { structuredQuery: { from: [{ collectionId: "emailLog" }], where: { fieldFilter: { field: { fieldPath: "orderId" }, op: "EQUAL", value: { stringValue: "o1" } } }, limit: 20 } },
    json: [{ document: { name: "projects/lmb-test-shop/databases/(default)/documents/emailLog/e1", fields: { status: { stringValue: "sent" } } } }, { readTime: "t" }],
  }, {
    method: "POST",
    url: `${DOCS}/shops/s1:runQuery`,
    body: { structuredQuery: { from: [{ collectionId: "steps" }], where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "a" }, op: "GREATER_THAN", value: { integerValue: "1" } } },
      { fieldFilter: { field: { fieldPath: "b" }, op: "EQUAL", value: { booleanValue: true } } },
    ] } }, orderBy: [{ field: { fieldPath: "recordedAt" }, direction: "ASCENDING" }] } },
    json: [],
  }]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop" });
  assert.deepEqual(await db.query("emailLog", { where: [["orderId", "==", "o1"]], limit: 20 }), [{ id: "e1", path: "emailLog/e1", data: { status: "sent" } }]);
  assert.deepEqual(await db.query("shops/s1/steps", { where: [["a", ">", 1], ["b", "==", true]], orderBy: [["recordedAt"]] }), []);
  fetch.done();
});

test("a named database (the stockroom's) is addressed by name", async () => {
  const fetch = scriptedFetch([{ method: "GET", url: `${STOCKROOM}/websiteStockFeed/test-book-one`, json: { fields: { onHand: { integerValue: "4" } } } }]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop", database: "stockroom" });
  assert.deepEqual(await db.get("websiteStockFeed/test-book-one"), { onHand: 4 });
  fetch.done();
});

test("a transaction reads inside it and commits its writes together, trying again when Firestore aborts it", async () => {
  const DB = "https://firestore.googleapis.com/v1/projects/lmb-test-shop/databases/(default)";
  const write = { update: { name: "projects/lmb-test-shop/databases/(default)/documents/shopLocks/s1", fields: { runId: { stringValue: "r1" } } } };
  const fetch = scriptedFetch([
    { method: "POST", url: `${DB}/documents:beginTransaction`, body: {}, json: { transaction: "T1" } },
    { method: "GET", url: `${DOCS}/shopLocks/s1?transaction=T1`, status: 404, json: { error: { status: "NOT_FOUND", message: "missing" } } },
    { method: "POST", url: `${DB}/documents:commit`, body: { writes: [write], transaction: "T1" }, status: 409, json: { error: { status: "ABORTED", message: "contention" } } },
    { method: "POST", url: `${DB}/documents:beginTransaction`, body: {}, json: { transaction: "T2" } },
    { method: "GET", url: `${DOCS}/shopLocks/s1?transaction=T2`, status: 404, json: { error: { status: "NOT_FOUND", message: "missing" } } },
    { method: "POST", url: `${DB}/documents:commit`, body: { writes: [write], transaction: "T2" }, json: {} },
  ]);
  const db = firestoreClient({ fetch, token, projectId: "lmb-test-shop" });
  const registry = firestoreRegistry(db);
  assert.deepEqual(await registry.takeLock("s1", { runId: "r1" }), { taken: true });
  fetch.done();
});

test("paths must name a document or a collection, and the project id must look like one", async () => {
  const db = firestoreClient({ fetch: async () => {}, token, projectId: "lmb-test-shop" });
  await assert.rejects(db.get("books"), /not a document path/);
  await assert.rejects(db.query("books/one"), /not a collection path/);
  assert.throws(() => firestoreClient({ fetch: async () => {}, token, projectId: "x" }), /project id/);
});

test("the registry keeps steps in the order they were recorded", async () => {
  const fetch = scriptedFetch([
    { method: "POST", url: `${DOCS}/shops/s1/steps?documentId=20261028T120000000Z000000-1`, body: { fields: { step: { integerValue: "1" }, status: { stringValue: "done" }, recordedAt: { stringValue: "2026-10-28T12:00:00.000Z#000000" } } }, json: {} },
    { method: "POST", url: `${DOCS}/shops/s1:runQuery`, body: { structuredQuery: { from: [{ collectionId: "steps" }], orderBy: [{ field: { fieldPath: "recordedAt" }, direction: "ASCENDING" }] } },
      json: [{ document: { name: "projects/lmb-test-shop/databases/(default)/documents/shops/s1/steps/x", fields: { step: { integerValue: "1" }, status: { stringValue: "done" }, recordedAt: { stringValue: "t" } } } }] },
  ]);
  const registry = firestoreRegistry(firestoreClient({ fetch, token, projectId: "lmb-test-shop" }), { now: () => new Date("2026-10-28T12:00:00Z") });
  await registry.recordStep("s1", { step: 1, status: "done" });
  assert.deepEqual(await registry.readSteps("s1"), [{ step: 1, status: "done" }]);
  fetch.done();
});

test("the audit log isn't ready before the shop's project or database exists", async () => {
  const fetch = scriptedFetch([
    { method: "GET", url: `${DOCS}/audit-log/_ready`, status: 403, json: { error: { status: "PERMISSION_DENIED", message: "project not found" } } },
    { method: "GET", url: `${DOCS}/audit-log/_ready`, status: 404, json: { error: { status: "NOT_FOUND", message: "The database (default) does not exist for project lmb-test-shop" } } },
    { method: "GET", url: `${DOCS}/audit-log/_ready`, status: 404, json: { error: { status: "NOT_FOUND", message: "Document not found" } } },
    { method: "PATCH", url: `${DOCS}/audit-log/a_b`, body: { fields: { step: { integerValue: "1" } } }, json: {} },
  ]);
  const log = firestoreAuditLog(() => firestoreClient({ fetch, token, projectId: "lmb-test-shop" }));
  assert.equal(await log.ready("lmb-test-shop"), false);
  assert.equal(await log.ready("lmb-test-shop"), false);
  assert.equal(await log.ready("lmb-test-shop"), true);
  await log.write("lmb-test-shop", "a/b", { step: 1 });
  fetch.done();
});
