// The real stores against their fakes: each scenario runs on the fake and on the real store (over clients/firestore.js
// and a pretend Firestore behind fetch), and both must answer the same. A few tests pin the exact requests too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firestoreClient } from "./firestore.js";
import { fakeFirestore } from "./fake-firestore.js";
import { scriptedFetch, token } from "./fake-fetch.js";
import {
  firestoreAccessRequests, firestoreAccountStores, firestoreBillingStores, firestoreDataExports, firestoreEventClaims, firestoreFeeLedger,
  firestoreFrontDoorStores, firestorePressMessages, firestoreShopRecords, firestoreSignupStores, firestoreThrottle,
} from "./platformStores.js";
import { signInLinks } from "./signInLinks.js";
import { stockroomDataClient } from "./shop.js";
import { fakeFrontDoorStores, fakeSignupStores, fakeThrottle } from "../signup/fakes.js";
import { fakeBillingStores } from "../services/billing/fakes.js";
import { fakeFeeLedgerStore } from "../services/payments/feeLedgerFakes.js";
import { fakeAccountStores } from "../accounts/fakes.js";
import { fakeAccessRequestStore } from "../control-room/fakes.js";
import { fakePressMessages } from "../control-room/messagesFakes.js";
import { fakeExportStore } from "../services/export/fakes.js";
import { fakeTipStore } from "../services/trial-tips/fakes.js";
import { fakeStockroomData } from "../services/billing/closingFakes.js";

const PROJECT = "lmb-platform-prod";
const realDb = () => {
  const fs = fakeFirestore();
  return { fs, db: firestoreClient({ fetch: fs.fetch, token, projectId: PROJECT }) };
};
const byId = (rows, key) => [...rows].sort((a, b) => (a[key] < b[key] ? -1 : 1));

/** Runs `scenario(store)` on the fake and on the real store; both must give the same list of answers. */
async function sameAnswers(makeFake, makeReal, scenario) {
  const fake = await scenario(makeFake());
  const { db, fs } = realDb();
  const real = await scenario(makeReal(db), fs);
  assert.deepEqual(real, fake);
  return real;
}

const errorOf = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.message;
  }
};

test("sign-up's accounts and sign-ups answer like the fakes", async () => {
  const out = await sameAnswers(fakeSignupStores, (db) => firestoreSignupStores(db), async (stores) => [
    await stores.accounts.get("uid-1"),
    await stores.accounts.set("uid-1", { accountId: "uid-1", email: "owner@example.com", shops: { "moth-press": "owner" } }),
    await stores.accounts.get("uid-1"),
    await stores.signups.get("moth-press"),
    await stores.signups.set("moth-press", { shopId: "moth-press", accountId: "uid-1", status: "queued" }),
    await stores.signups.set("press-two", { shopId: "press-two", accountId: "uid-2", status: "queued" }),
    await stores.signups.set("moth-press", { shopId: "moth-press", accountId: "uid-1", status: "making" }),
    await stores.signups.listByAccount("uid-1"),
    byId(await stores.signups.list(), "shopId"),
  ]);
  assert.equal(out[7][0].status, "making");
});

test("the real accounts store finds an account by its email, for account recovery", async () => {
  const { db } = realDb();
  const stores = firestoreSignupStores(db);
  await stores.accounts.set("uid-1", { accountId: "uid-1", email: "owner@example.com" });
  assert.deepEqual(await stores.accounts.findByEmail("Owner@Example.com"), { accountId: "uid-1", email: "owner@example.com" });
  assert.equal(await stores.accounts.findByEmail("nobody@example.com"), null);
});

test("the throttle counts hits since a time like the fake, and keeps no key in the clear", async () => {
  await sameAnswers(fakeThrottle, (db) => firestoreThrottle(db), async (throttle, fs) => {
    const answers = [await throttle.count("signin/abc", "2026-11-02T00:00:00.000Z")];
    for (const at of ["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:30.000Z", "2026-11-02T10:01:10.000Z"]) await throttle.add("signin/abc", at);
    await throttle.add("signin/other", "2026-11-02T10:00:40.000Z");
    answers.push(await throttle.count("signin/abc", "2026-11-02T10:00:10.000Z"), await throttle.count("signin/abc", "2026-11-02T09:00:00.000Z"));
    if (fs) assert.ok(fs.paths(PROJECT, "throttle/").every((path) => /^throttle\/[0-9a-f]{40}$/.test(path)));
    return answers;
  });
});

test("the throttle drops hits older than a day and keeps at most its cap", async () => {
  const { db, fs } = realDb();
  const throttle = firestoreThrottle(db, { cap: 3 });
  await throttle.add("k", "2026-11-01T00:00:00.000Z");
  for (const at of ["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:01.000Z", "2026-11-02T10:00:02.000Z", "2026-11-02T10:00:03.000Z"]) await throttle.add("k", at);
  const [path] = fs.paths(PROJECT, "throttle/");
  assert.deepEqual(fs.get(PROJECT, path).hits, ["2026-11-02T10:00:01.000Z", "2026-11-02T10:00:02.000Z", "2026-11-02T10:00:03.000Z"]);
});

test("billing's customers, subscriptions and event claims answer like the fakes", async () => {
  await sameAnswers(fakeBillingStores, (db) => firestoreBillingStores(db), async ({ customers, subscriptions, events }) => [
    await customers.get("uid-1"),
    await customers.set("uid-1", { customerId: "cus_1", email: "owner@example.com" }),
    await customers.get("uid-1"),
    await subscriptions.set("moth-press", { shopId: "moth-press", subscriptionId: "sub_1", status: "trialing" }),
    await subscriptions.set("press-two", { shopId: "press-two", subscriptionId: "sub_2", status: "active" }),
    await subscriptions.get("moth-press"),
    await subscriptions.findBySubscriptionId("sub_2"),
    await subscriptions.findBySubscriptionId("sub_9"),
    byId(await subscriptions.list(), "shopId"),
    await events.claim("evt_1", { at: "2026-11-02T10:00:00.000Z", holdMs: 300_000 }),
    await events.claim("evt_1", { at: "2026-11-02T10:01:00.000Z", holdMs: 300_000 }),
    await events.seen("evt_1"),
    await events.release("evt_1"),
    await events.claim("evt_1", { at: "2026-11-02T10:02:00.000Z", holdMs: 300_000 }),
    // A claim older than the hold is taken over.
    await events.claim("evt_1", { at: "2026-11-02T10:08:00.000Z", holdMs: 300_000 }),
    await events.mark("evt_1", { type: "invoice.paid", at: "2026-11-02T10:08:01.000Z" }),
    await events.seen("evt_1"),
    await events.claim("evt_1", { at: "2026-11-02T11:00:00.000Z", holdMs: 300_000 }),
    await events.release("evt_1"),
    await events.seen("evt_1"),
  ]);
});

test("of two deliveries of one event claimed at the same moment, exactly one wins", async () => {
  const { db, fs } = realDb();
  const events = firestoreEventClaims(db);
  const wins = await Promise.all([1, 2, 3].map(() => events.claim("evt_race", { at: "2026-11-02T10:00:00.000Z", holdMs: 300_000 })));
  assert.deepEqual(wins.filter(Boolean).length, 1);
  assert.ok(fs.aborted >= 1, "the pretend Firestore turned a losing transaction away");
});

test("a claim is one transaction: read the event, then write the claim", async () => {
  const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;
  const fetch = scriptedFetch([
    { method: "POST", url: `${DB}/documents:beginTransaction`, body: {}, json: { transaction: "t1" } },
    { method: "GET", url: `${DB}/documents/billingEvents/evt_1?transaction=t1`, status: 404, json: { error: { status: "NOT_FOUND", message: "Document not found" } } },
    {
      method: "POST", url: `${DB}/documents:commit`, json: {},
      body: { transaction: "t1", writes: [{ update: { name: `projects/${PROJECT}/databases/(default)/documents/billingEvents/evt_1`, fields: { state: { stringValue: "claimed" }, claimedAt: { stringValue: "2026-11-02T10:00:00.000Z" } } } }] },
    },
  ]);
  const events = firestoreEventClaims(firestoreClient({ fetch, token, projectId: PROJECT }));
  assert.equal(await events.claim("evt_1", { at: "2026-11-02T10:00:00.000Z", holdMs: 300_000 }), true);
  fetch.done();
});

test("the pay-as-you-sell ledger answers like the fake", async () => {
  await sameAnswers(fakeFeeLedgerStore, (db) => firestoreFeeLedger(db), async (ledger) => [
    await ledger.get("moth-press", "2026-11"),
    await ledger.update("moth-press", "2026-11", (row) => ({ ...(row ?? { cents: 0 }), cents: (row?.cents ?? 0) + 120 })),
    await ledger.update("moth-press", "2026-11", (row) => ({ ...row, cents: row.cents + 80 })),
    await ledger.update("moth-press", "2026-11", () => null),
    await ledger.get("moth-press", "2026-11"),
    await ledger.link("moth-press", "pi_1", { month: "2026-11", cents: 120 }),
    await ledger.find("moth-press", "pi_1"),
    await ledger.find("moth-press", "pi_2"),
  ]);
});

test("two ledger changes at the same moment both count", async () => {
  const { db } = realDb();
  const ledger = firestoreFeeLedger(db);
  await Promise.all([40, 60].map((cents) => ledger.update("moth-press", "2026-11", (row) => ({ cents: (row?.cents ?? 0) + cents }))));
  assert.deepEqual(await ledger.get("moth-press", "2026-11"), { cents: 100 });
});

test("team memberships and team invites answer like the fakes", async () => {
  await sameAnswers(fakeAccountStores, (db) => firestoreAccountStores(db), async ({ memberships, invites }) => [
    await memberships.get("moth-press", "owner@example.com"),
    await memberships.set("moth-press", "owner@example.com", { shopId: "moth-press", email: "owner@example.com", role: "owner" }),
    await memberships.set("moth-press", "helper@example.com", { shopId: "moth-press", email: "helper@example.com", role: "staff" }),
    await memberships.set("press-two", "owner@example.com", { shopId: "press-two", email: "owner@example.com", role: "staff" }),
    await memberships.get("moth-press", "owner@example.com"),
    byId(await memberships.listByShop("moth-press"), "email"),
    byId(await memberships.listByEmail("owner@example.com"), "shopId"),
    await memberships.remove("moth-press", "helper@example.com"),
    await memberships.remove("moth-press", "helper@example.com"),
    await memberships.listByShop("moth-press"),
    await invites.get("inv1"),
    await invites.set("inv1", { id: "inv1", shopId: "moth-press", email: "new@example.com", role: "staff" }),
    await invites.get("inv1"),
    await invites.listByShop("moth-press"),
    await invites.listByShop("press-two"),
  ]);
});

test("team invites never mix with the waitlist's invites", async () => {
  const { db, fs } = realDb();
  await db.set("invites/abc", { email: "waiting@example.com", shopId: "moth-press", usedAt: "2026-11-01T00:00:00Z" });
  const { invites } = firestoreAccountStores(db);
  assert.deepEqual(await invites.listByShop("moth-press"), []);
  await invites.set("t1", { shopId: "moth-press" });
  assert.deepEqual(fs.paths(PROJECT, "teamInvites/"), ["teamInvites/t1"]);
});

test("support-access requests answer like the fake: create once, change atomically", async () => {
  await sameAnswers(fakeAccessRequestStore, (db) => firestoreAccessRequests(db), async (store) => [
    await store.get("r1"),
    await store.create("r1", { id: "r1", shopId: "moth-press", status: "asked" }),
    await errorOf(store.create("r1", { id: "r1", shopId: "moth-press", status: "asked" })),
    await store.create("r2", { id: "r2", shopId: "press-two", status: "asked" }),
    await store.update("r1", (row) => ({ ...row, status: "allowed" })),
    await store.update("r1", () => null),
    await store.update("r9", (row) => row),
    await store.get("r1"),
    await store.listByShop("moth-press"),
  ]);
});

test("of two uses of one request at the same moment, only one finds it unused", async () => {
  const { db } = realDb();
  const store = firestoreAccessRequests(db);
  await store.create("r1", { id: "r1", uses: 0 });
  const results = await Promise.all([1, 2].map(() => store.update("r1", (row) => (row.uses === 0 ? { ...row, uses: 1 } : null))));
  assert.equal(results.filter(Boolean).length, 1);
});

test("messages to presses, data exports and the per-shop records answer like the fakes", async () => {
  await sameAnswers(fakePressMessages, (db) => firestorePressMessages(db), async (store) => [
    await store.get("m1"),
    await store.set("m1", { id: "m1", text: "Hello", endsAt: null }),
    await store.get("m1"),
    await store.list(),
  ]);
  await sameAnswers(fakeExportStore, (db) => firestoreDataExports(db), async (store) => [
    await store.set("e1", { id: "e1", shopId: "moth-press", status: "making" }),
    await store.set("e2", { id: "e2", shopId: "press-two", status: "ready" }),
    await store.get("e1"),
    await store.list({ shopId: "moth-press" }),
    byId(await store.list(), "id"),
    await store.update("owner-lock-moth-press", (lock) => (lock ? null : { id: "owner-lock-moth-press", status: "making" })),
    await store.update("owner-lock-moth-press", (lock) => (lock ? null : { id: "owner-lock-moth-press", status: "making" })),
    await store.get("owner-lock-moth-press"),
  ]);
  for (const collection of ["trialTips", "checkups"]) {
    await sameAnswers(fakeTipStore, (db) => firestoreShopRecords(db, collection), async (store) => [
      await store.get("moth-press"),
      await store.set("moth-press", { sent: { 2: { step: "logo", at: "2026-11-02T00:00:00Z" } }, lastAt: "2026-11-02T00:00:00Z" }),
      await store.get("moth-press"),
    ]);
  }
  assert.throws(() => firestoreShopRecords(realDb().db, "anything"), /no shop record/);
});

test("the stockroom's database answers like the fake, and isn't ready before it exists", async () => {
  const fs = fakeFirestore();
  const client = stockroomDataClient((projectId) => firestoreClient({ fetch: fs.fetch, token, projectId, database: "stockroom" }));
  fs.noDatabase.add("moth-press stockroom");
  assert.equal(await client.ready("moth-press"), false);
  fs.noDatabase.clear();
  assert.equal(await client.ready("moth-press"), true);
  const fake = fakeStockroomData();
  for (const store of [client, fake]) await store.set("moth-press", "platform/plan", { plan: "both" });
  assert.deepEqual(await client.get("moth-press", "platform/plan"), await fake.get("moth-press", "platform/plan"));
  assert.deepEqual(fs.get("moth-press", "platform/plan", "stockroom"), { plan: "both" });
  assert.equal(await client.get("moth-press", "platform/none"), null);
});

test("a sign-in link comes from Google's Identity Toolkit and is handed back, not emailed by Google", async () => {
  const fetch = scriptedFetch([{
    method: "POST", url: `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:sendOobCode`,
    body: { requestType: "EMAIL_SIGNIN", email: "owner@example.com", continueUrl: "https://platform.example/signup/?finish=1", canHandleCodeInApp: true, returnOobLink: true },
    json: { email: "owner@example.com", oobLink: "https://lmb-platform-prod.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc" },
  }]);
  const auth = signInLinks({ fetch, token, projectId: PROJECT });
  assert.match(await auth.signInLink("owner@example.com", { url: "https://platform.example/signup/?finish=1" }), /oobCode=abc/);
  fetch.done();
  const empty = signInLinks({ fetch: scriptedFetch([{ method: "POST", url: `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:sendOobCode`, json: {} }]), token, projectId: PROJECT });
  await assert.rejects(empty.signInLink("owner@example.com", { url: "https://platform.example/signup/" }), /didn't give back/);
  assert.throws(() => signInLinks({ fetch, token, projectId: "" }), /project id/);
});

test("the front door's presses and sign-in codes answer like the fakes, and create never overwrites", async () => {
  const ada = { pressId: "press-abcde", ownerUid: "uid-ada", ownerEmail: "owner@example.com", status: "setup", pressName: "", createdAt: "2026-11-03T09:00:00.000Z" };
  await sameAnswers(fakeFrontDoorStores, (db) => firestoreFrontDoorStores(db), async ({ presses, codes }) => [
    await presses.get("press-abcde"),
    await presses.create("press-abcde", ada),
    await presses.create("press-abcde", { ...ada, ownerUid: "uid-someone-else" }),
    (await presses.get("press-abcde")).ownerUid,
    await presses.set("press-abcde", { ...ada, pressName: "Moth Press" }),
    (await presses.listByOwner("uid-ada")).map((p) => p.pressName),
    await presses.listByOwner("uid-nobody"),
    await codes.get("k1"),
    await codes.set("k1", { hash: "ab", salt: "cd", tries: 0, sentAt: [1, 2] }),
    await codes.get("k1"),
  ]);
});
