import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_ROLE, PROBE_FILE, googleClients } from "./google.js";
import { scriptedFetch, token } from "./fake-fetch.js";

const P = "lmb-test-shop";
const sleep = async () => {};
const clients = (script) => {
  const fetch = scriptedFetch(script);
  return { fetch, google: googleClients({ fetch, token, sleep, today: () => "2026-10-28" }) };
};
const notFound = { status: 404, json: { error: { code: 404, status: "NOT_FOUND", message: "not found" } } };
const RM = "https://cloudresourcemanager.googleapis.com/v3";
const FB = "https://firebase.googleapis.com/v1beta1";
const BUCKET = `${P}.firebasestorage.app`;
const defaultBucket = { method: "GET", url: `https://firebasestorage.googleapis.com/v1beta/projects/${P}/defaultBucket`, json: { name: `projects/${P}/defaultBucket`, location: "NORTHAMERICA-NORTHEAST1", bucket: { name: `projects/${P}/buckets/${BUCKET}` } } };
const firebaseProject = { method: "GET", url: `${FB}/projects/${P}`, json: { projectId: P, projectNumber: "123456789012" } };

test("projects: a missing project is null; create waits for Google's operation", async () => {
  const { fetch, google } = clients([
    { method: "GET", url: `${RM}/projects/${P}`, ...notFound },
    { method: "POST", url: `${RM}/projects`, body: { projectId: P, displayName: "Test Press", parent: "folders/1", labels: { "lmb-shop": P } }, json: { name: "operations/cp.1", done: false } },
    { method: "GET", url: `${RM}/operations/cp.1`, json: { name: "operations/cp.1", done: true, response: { projectId: P } } },
    { method: "GET", url: `${RM}/projects/${P}`, json: { name: "projects/1", projectId: P, state: "ACTIVE", parent: "folders/1", displayName: "x" } },
  ]);
  assert.equal(await google.projects.get(P), null);
  await google.projects.create({ projectId: P, displayName: "Test Press", parent: "folders/1", labels: { "lmb-shop": P } });
  assert.deepEqual(await google.projects.get(P), { projectId: P, state: "ACTIVE", parent: "folders/1" });
  fetch.done();
});

test("an operation that ends in error throws Google's message", async () => {
  const { google } = clients([
    { method: "POST", url: `${RM}/projects`, json: { name: "operations/cp.2", done: false } },
    { method: "GET", url: `${RM}/operations/cp.2`, json: { done: true, error: { code: 6, message: "project id already taken" } } },
  ]);
  await assert.rejects(google.projects.create({ projectId: P, displayName: "x", parent: "folders/1", labels: {} }), /already taken/);
});

test("billing: read and link", async () => {
  const URL = `https://cloudbilling.googleapis.com/v1/projects/${P}/billingInfo`;
  const { fetch, google } = clients([
    { method: "GET", url: URL, json: { name: `projects/${P}/billingInfo`, projectId: P } },
    { method: "PUT", url: URL, body: { billingAccountName: "billingAccounts/0-0-0" }, json: {} },
  ]);
  assert.deepEqual(await google.billing.get(P), { billingEnabled: false, billingAccountName: "" });
  await google.billing.link(P, "billingAccounts/0-0-0");
  fetch.done();
});

test("firebase: add, list web apps across pages, create one and read its settings", async () => {
  const { fetch, google } = clients([
    { method: "GET", url: `${FB}/projects/${P}`, ...notFound },
    { method: "POST", url: `${FB}/projects/${P}:addFirebase`, body: {}, json: { name: "operations/fb.1", done: true, response: {} } },
    { method: "GET", url: `${FB}/projects/${P}/webApps`, json: { apps: [{ appId: "1:1:web:a", displayName: "Other", name: "x" }], nextPageToken: "n" } },
    { method: "GET", url: `${FB}/projects/${P}/webApps?pageToken=n`, json: { apps: [{ appId: "1:1:web:b", displayName: "Shop" }] } },
    { method: "POST", url: `${FB}/projects/${P}/webApps`, body: { displayName: "Shop" }, json: { name: "operations/fb.2", done: false } },
    { method: "GET", url: `${FB}/operations/fb.2`, json: { done: true, response: { appId: "1:1:web:c", displayName: "Shop" } } },
    { method: "GET", url: `${FB}/projects/${P}/webApps/1:1:web:c/config`, json: { apiKey: "AIzaK", authDomain: `${P}.firebaseapp.com`, projectId: P, storageBucket: BUCKET, messagingSenderId: "1", appId: "1:1:web:c", locationId: "x" } },
  ]);
  assert.equal(await google.firebase.getProject(P), null);
  await google.firebase.addFirebase(P);
  assert.deepEqual(await google.firebase.listWebApps(P), [{ appId: "1:1:web:a", displayName: "Other" }, { appId: "1:1:web:b", displayName: "Shop" }]);
  assert.deepEqual(await google.firebase.createWebApp(P, "Shop"), { appId: "1:1:web:c" });
  assert.deepEqual(await google.firebase.getWebAppConfig(P, "1:1:web:c"), { apiKey: "AIzaK", authDomain: `${P}.firebaseapp.com`, projectId: P, storageBucket: BUCKET, messagingSenderId: "1", appId: "1:1:web:c" });
  fetch.done();
});

test("services: the enabled list, and enabling in batches of twenty", async () => {
  const U = `https://serviceusage.googleapis.com/v1/projects/${P}/services`;
  const names = Array.from({ length: 21 }, (_, i) => `s${i}.googleapis.com`);
  const { fetch, google } = clients([
    { method: "GET", url: `${U}?filter=state%3AENABLED&pageSize=200`, json: { services: [{ name: `projects/1/services/firestore.googleapis.com`, config: { name: "firestore.googleapis.com" } }] } },
    { method: "POST", url: `${U}:batchEnable`, body: { serviceIds: names.slice(0, 20) }, json: { name: "operations/su.1", done: false } },
    { method: "GET", url: "https://serviceusage.googleapis.com/v1/operations/su.1", json: { done: true, response: {} } },
    { method: "POST", url: `${U}:batchEnable`, body: { serviceIds: names.slice(20) }, json: { name: "operations/su.2", done: true, response: {} } },
  ]);
  assert.deepEqual(await google.services.listEnabled(P), ["firestore.googleapis.com"]);
  await google.services.enable(P, names);
  fetch.done();
});

test("firestore: the database is made in Montréal with delete protection", async () => {
  const D = `https://firestore.googleapis.com/v1/projects/${P}/databases`;
  const { fetch, google } = clients([
    { method: "GET", url: `${D}/(default)`, ...notFound },
    { method: "POST", url: `${D}?databaseId=%28default%29`, body: { locationId: "northamerica-northeast1", type: "FIRESTORE_NATIVE", deleteProtectionState: "DELETE_PROTECTION_ENABLED" }, json: { name: `projects/${P}/databases/(default)/operations/op1`, done: false } },
    { method: "GET", url: `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/operations/op1`, json: { done: true, response: {} } },
    { method: "GET", url: `${D}/(default)`, json: { locationId: "northamerica-northeast1", type: "FIRESTORE_NATIVE", deleteProtectionState: "DELETE_PROTECTION_ENABLED" } },
  ]);
  assert.equal(await google.firestore.getDatabase(P), null);
  await google.firestore.createDatabase(P, { locationId: "northamerica-northeast1", type: "FIRESTORE_NATIVE", deleteProtection: true });
  assert.deepEqual(await google.firestore.getDatabase(P), { locationId: "northamerica-northeast1", type: "FIRESTORE_NATIVE", deleteProtection: true });
  fetch.done();
});

test("storage: the default bucket is read and made through Firebase Storage", async () => {
  const { fetch, google } = clients([
    { method: "GET", url: defaultBucket.url, ...notFound },
    { method: "POST", url: `https://firebasestorage.googleapis.com/v1beta/projects/${P}/defaultBucket`, body: { location: "northamerica-northeast1" }, json: {} },
    defaultBucket,
  ]);
  assert.equal(await google.storage.getDefaultBucket(P), null);
  await google.storage.createDefaultBucket(P, { location: "northamerica-northeast1" });
  assert.deepEqual(await google.storage.getDefaultBucket(P), { name: BUCKET, location: "NORTHAMERICA-NORTHEAST1" });
  fetch.done();
});

test("storage: the stockroom's own bucket is ours, someone else's, or missing; made with uniform access and added to Firebase", async () => {
  const GCS = "https://storage.googleapis.com/storage/v1";
  const name = `${P}-stockroom`;
  const { fetch, google } = clients([
    { method: "GET", url: `${GCS}/b/${name}`, ...notFound },
    { method: "POST", url: `${GCS}/b?project=${P}`, body: { name, location: "northamerica-northeast1", iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }, json: { name } },
    { method: "POST", url: `https://firebasestorage.googleapis.com/v1beta/projects/${P}/buckets/${name}:addFirebase`, body: {}, json: { name: `projects/${P}/buckets/${name}` } },
    { method: "GET", url: `${GCS}/b/${name}`, json: { name, location: "NORTHAMERICA-NORTHEAST1", projectNumber: "123456789012" } },
    firebaseProject,
    { method: "GET", url: `${GCS}/b/${name}`, json: { name, location: "US", projectNumber: "999" } },
    firebaseProject,
    { method: "GET", url: `${GCS}/b/${name}`, status: 403, json: { error: { code: 403, message: "no access" } } },
  ]);
  assert.equal(await google.storage.getBucket(P, name), null);
  await google.storage.createBucket(P, { name, location: "northamerica-northeast1" });
  assert.deepEqual(await google.storage.getBucket(P, name), { name, location: "NORTHAMERICA-NORTHEAST1", project: P });
  assert.deepEqual(await google.storage.getBucket(P, name), { name, location: "US", project: null });
  assert.deepEqual(await google.storage.getBucket(P, name), { name, location: "", project: null });
  fetch.done();
});

test("realtime database: the default instance is found across locations, and made in the location asked", async () => {
  const RTDB = "https://firebasedatabase.googleapis.com/v1beta";
  const { fetch, google } = clients([
    { method: "GET", url: `${RTDB}/projects/${P}/locations/-/instances`, json: {} },
    { method: "POST", url: `${RTDB}/projects/${P}/locations/us-central1/instances?databaseId=${P}-default-rtdb`, body: { type: "DEFAULT_DATABASE" }, json: { name: `projects/123/locations/us-central1/instances/${P}-default-rtdb`, type: "DEFAULT_DATABASE" } },
    { method: "GET", url: `${RTDB}/projects/${P}/locations/-/instances`, json: { instances: [{ name: "projects/123/locations/europe-west1/instances/extra", type: "USER_DATABASE" }], nextPageToken: "n" } },
    { method: "GET", url: `${RTDB}/projects/${P}/locations/-/instances?pageToken=n`, json: { instances: [{ name: `projects/123/locations/us-central1/instances/${P}-default-rtdb`, type: "DEFAULT_DATABASE" }] } },
  ]);
  assert.equal(await google.realtimeDatabase.getInstance(P), null);
  await google.realtimeDatabase.createInstance(P, { location: "us-central1" });
  assert.deepEqual(await google.realtimeDatabase.getInstance(P), { name: `${P}-default-rtdb`, location: "us-central1" });
  fetch.done();
});

test("backups: the functions' account gets the export role once, keeping every other binding", async () => {
  const member = "serviceAccount:123456789012-compute@developer.gserviceaccount.com";
  const policy = { version: 1, etag: "e1", bindings: [{ role: "roles/owner", members: ["user:owner@example.com"] }] };
  const { fetch, google } = clients([
    firebaseProject,
    { method: "POST", url: `${RM}/projects/${P}:getIamPolicy`, body: { options: { requestedPolicyVersion: 3 } }, json: policy },
    firebaseProject,
    { method: "POST", url: `${RM}/projects/${P}:getIamPolicy`, body: { options: { requestedPolicyVersion: 3 } }, json: policy },
    { method: "POST", url: `${RM}/projects/${P}:setIamPolicy`, body: { policy: { version: 3, etag: "e1", bindings: [...policy.bindings, { role: BACKUP_ROLE, members: [member] }] }, updateMask: "bindings,etag" }, json: {} },
  ]);
  assert.equal(await google.backups.hasPermission(P), false);
  await google.backups.grantPermission(P);
  fetch.done();
});

test("backups: the latest backup day is read from the bucket, and a backup is an export into today's folder", async () => {
  const { fetch, google } = clients([
    defaultBucket,
    { method: "GET", url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=backups%2F&delimiter=%2F`, json: { prefixes: ["backups/2026-10-01/", "backups/2026-10-27/", "backups/notes/"] } },
    defaultBucket,
    { method: "POST", url: `https://firestore.googleapis.com/v1/projects/${P}/databases/(default):exportDocuments`, body: { outputUriPrefix: `gs://${BUCKET}/backups/2026-10-28/export`, collectionIds: [] }, json: { name: `projects/${P}/databases/(default)/operations/ex1`, done: true, response: {} } },
  ]);
  assert.deepEqual(await google.backups.latest(P), { name: "backups/2026-10-27/" });
  assert.deepEqual(await google.backups.run(P), { name: "backups/2026-10-28/" });
  fetch.done();
});

test("storage probe: the test file is written with the platform's token and read with none", async () => {
  const object = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(PROBE_FILE)}`;
  const { fetch, google } = clients([
    defaultBucket,
    { method: "GET", url: object, ...notFound },
    defaultBucket,
    { method: "POST", url: `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(PROBE_FILE)}` },
    defaultBucket,
    { method: "GET", url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(PROBE_FILE)}?alt=media`, auth: false, status: 403, json: { error: { code: 403, message: "Permission denied." } } },
  ]);
  assert.equal(await google.storageProbe.hasTestFile(P), false);
  await google.storageProbe.writeTestFile(P);
  assert.equal(fetch.seen[3].headers["Content-Type"], "text/plain");
  assert.match(fetch.seen[3].body, /must be refused/);
  assert.deepEqual(await google.storageProbe.readUnsigned(P), { status: 403 });
  fetch.done();
});
