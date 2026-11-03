// The front door's server side (code plan 18.4): code in, sign-in link out, one setup record per press, and answers
// saved only by the press's owner while it is in setup. Through the real web door (api.js), with pretend stores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "./frontDoor.js";
import { createApi } from "./api.js";
import { fakeAuth, fakeFrontDoorStores, fakeStagedFiles, fakeVerifyIdToken } from "./fakes.js";
import { TEMPLATES } from "../services/email/templates.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };
const BEN = { uid: "uid-ben", email: "ben@example.com", email_verified: true };
const SETTINGS = { platformUrl: "https://platform.example", platformName: "Colophon", trialDays: 14, currency: "CAD" };

function world() {
  const stores = fakeFrontDoorStores();
  const sent = [];
  let clock = new Date("2026-11-03T09:00:00Z").getTime();
  let n = 0;
  const files = fakeStagedFiles({ now: () => new Date(clock) });
  const door = createFrontDoor({
    ...stores,
    stagedFiles: files,
    email: { sendPlatform: async (message) => { sent.push(message); } },
    auth: fakeAuth(),
    settings: SETTINGS,
    now: () => new Date(clock),
    suffix: () => `s${(n += 1)}xyz`,
    random: () => 0.123456,
  });
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: SETTINGS,
    routes: frontDoorRoutes(door), publicRoutes: frontDoorPublicRoutes(door), live: () => ({}), log: () => {},
  });
  const ask = (method, path, body, claims) => api({ method, path, body, headers: claims ? { authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { stores, sent, door, ask, files, tick: (ms) => { clock += ms; } };
}

test("a code is emailed, and the right code answers with a sign-in link for that address, once", async () => {
  const w = world();
  const sent = await w.ask("POST", "/api/code/send", { email: " Owner@Example.com " });
  assert.equal(sent.status, 200);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].kind, "sign-in-code");
  assert.equal(w.sent[0].to, "owner@example.com");
  assert.equal(w.sent[0].data.code, "123456");
  const checked = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "123 456" });
  assert.equal(checked.status, 200);
  assert.match(checked.body.link, /^https:\/\/platform\.example\/join\/\?finish=1&oobCode=fake-owner%40example\.com$/);
  const again = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "123456" });
  assert.equal(again.status, 400, "a code works once");
  assert.equal(again.body.link, undefined);
});

test("a wrong or badly typed code gets plain words and no link", async () => {
  const w = world();
  await w.ask("POST", "/api/code/send", { email: "owner@example.com" });
  const wrong = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "654321" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /didn't match/);
  assert.equal(wrong.body.problems.code, wrong.body.message);
  const short = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "12" });
  assert.equal(short.status, 400);
  assert.match(short.body.message, /six numbers/);
  const otherAddress = await w.ask("POST", "/api/code/check", { email: "ben@example.com", code: "123456" });
  assert.equal(otherAddress.status, 400, "a code is only good for the address it was sent to");
});

test("not an email address: nothing is sent", async () => {
  const w = world();
  const answer = await w.ask("POST", "/api/code/send", { email: "not an address" });
  assert.equal(answer.status, 400);
  assert.equal(w.sent.length, 0);
});

test("too many codes in an hour answers 429 in plain words", async () => {
  const w = world();
  for (let i = 0; i < 5; i += 1) assert.equal((await w.ask("POST", "/api/code/send", { email: "owner@example.com" })).status, 200);
  const sixth = await w.ask("POST", "/api/code/send", { email: "owner@example.com" });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.message, /try again in an hour/);
});

test("the press routes need a sign-in; the code routes don't", async () => {
  const w = world();
  assert.equal((await w.ask("POST", "/api/press", {})).status, 401);
  assert.equal((await w.ask("GET", "/api/press")).status, 401);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId: "x" })).status, 401);
  assert.equal((await w.ask("POST", "/api/code/send", { email: "owner@example.com" })).status, 200);
});

test("signing in makes one setup record, and signing in again gives the same one back", async () => {
  const w = world();
  const first = await w.ask("POST", "/api/press", {}, ADA);
  assert.equal(first.status, 200);
  assert.equal(first.body.press.status, "setup");
  assert.equal(first.body.press.ownerUid, undefined, "the owner's uid is never sent back");
  const second = await w.ask("POST", "/api/press", {}, ADA);
  assert.equal(second.body.press.pressId, first.body.press.pressId);
  assert.equal(w.stores.presses.rows.size, 1);
  const unconfirmed = await w.ask("POST", "/api/press", {}, { ...BEN, email_verified: false });
  assert.equal(unconfirmed.status, 403);
});

test("the three answers are saved, each may be skipped, and only the choices on the page are taken", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const named = await w.ask("POST", "/api/press/setup", { pressId, pressName: "  Moth Press " }, ADA);
  assert.equal(named.body.press.pressName, "Moth Press");
  const skipped = await w.ask("POST", "/api/press/setup", { pressId, sells: "" }, ADA);
  assert.equal(skipped.status, 200);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, sells: "books", country: "CA" }, ADA)).body.press.country, "CA");
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, sells: "spaceships" }, ADA)).status, 400);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, country: "XX" }, ADA)).status, 400);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, pressName: "x".repeat(121) }, ADA)).status, 409);
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.pressName, row.sells, row.country], ["Moth Press", "books", "CA"]);
});

test("another person's press can't be read or changed, and reads the same as no press", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const theirs = await w.ask("POST", "/api/press/setup", { pressId, pressName: "Taken" }, BEN);
  const none = await w.ask("POST", "/api/press/setup", { pressId: "press-nothing", pressName: "Taken" }, BEN);
  assert.equal(theirs.status, 404);
  assert.deepEqual(theirs.body.message, none.body.message);
  assert.equal(w.stores.presses.rows.get(pressId).pressName, "");
  assert.deepEqual((await w.ask("GET", "/api/press", undefined, BEN)).body.presses, []);
  assert.equal((await w.ask("GET", "/api/press", undefined, ADA)).body.presses.length, 1);
});

test("once a press is opening, its setup answers are locked", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  w.stores.presses.rows.get(pressId).status = "opening";
  const locked = await w.ask("POST", "/api/press/setup", { pressId, pressName: "Late" }, ADA);
  assert.equal(locked.status, 409);
  assert.match(locked.body.message, /locked/);
});

test("only the setup fields can be written: the owner, status and import file can't be set from the page", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  await w.ask("POST", "/api/press/setup", { pressId, status: "open", ownerUid: "uid-ben", stagedImportPath: "x", pressName: "Moth" }, ADA);
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.status, row.ownerUid, row.stagedImportPath, row.pressName], ["setup", "uid-ada", "", "Moth"]);
});

test("the code email shows the code, says how long it works, and refuses anything but six numbers", () => {
  const parts = TEMPLATES["sign-in-code"]({ code: "042917" }, { settings: SETTINGS });
  assert.match(parts.subject, /^042917 is your Colophon code$/);
  assert.match(parts.text, /042917/);
  assert.match(parts.text, /10 minutes/);
  assert.throws(() => TEMPLATES["sign-in-code"]({ code: "<b>1</b>" }, { settings: SETTINGS }), /six numbers/);
});

test("two tabs signing in at once share one press, and a save never puts back an older status", async () => {
  const w = world();
  const [a, b] = await Promise.all([w.ask("POST", "/api/press", {}, ADA), w.ask("POST", "/api/press", {}, ADA)]);
  assert.equal(a.body.press.pressId, b.body.press.pressId);
  assert.equal(w.stores.presses.rows.size, 1);
  const { pressId } = a.body.press;
  // The platform moves the press on while a save is on its way: the save is refused, the status stays.
  w.stores.presses.rows.get(pressId).status = "opening";
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, pressName: "Late" }, ADA)).status, 409);
  assert.equal(w.stores.presses.rows.get(pressId).status, "opening");
});

test("the return trip lists the person's own presses oldest first, with each one's status", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const rows = w.stores.presses.rows;
  rows.get(pressId).status = "open";
  rows.set("press-later-one", { ...rows.get(pressId), pressId: "press-later-one", status: "setup", createdAt: "2099-01-01T00:00:00.000Z" });
  rows.set("press-bens-own", { ...rows.get(pressId), pressId: "press-bens-own", ownerUid: "uid-ben" });
  const listed = (await w.ask("GET", "/api/press", undefined, ADA)).body.presses;
  assert.deepEqual(listed.map((p) => [p.pressId, p.status]), [[pressId, "open"], ["press-later-one", "setup"]]);
});

test("the welcome's two looks are saved and shown back; a badly formed look is refused and changes nothing", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  // Ids the shop and the stockroom add later (such as "press-market" or "bento") are taken without a platform change.
  const saved = await w.ask("POST", "/api/press/setup", { pressId, look: "press-market", adminLook: "bento" }, ADA);
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.press.look, saved.body.press.adminLook], ["press-market", "bento"]);
  assert.deepEqual((await w.ask("GET", "/api/press", undefined, ADA)).body.presses.map((p) => [p.look, p.adminLook]), [["press-market", "bento"]]);
  for (const bad of ["Press Market", "<b>", "-riso", "riso-", "x".repeat(41), 7]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, adminLook: bad }, ADA)).status, 409, String(bad));
  }
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, look: "" }, ADA)).status, 200, "a skipped look is allowed");
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.look, row.adminLook], ["", "bento"]);
});

test("what the press wants to set up is saved as billing's plan id, and nothing else is taken", async () => {
  const w = world();
  const { pressId, plan } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  assert.equal(plan, "", "nothing is picked for the press");
  for (const choice of ["shop", "stockroom", "both"]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, plan: choice }, ADA)).body.press.plan, choice);
  }
  for (const bad of ["gold", "Both", "apps", 3]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, plan: bad }, ADA)).status, 409, String(bad));
  }
  assert.equal(w.stores.presses.rows.get(pressId).plan, "both");
});

test("the plan list says whether prices are plus tax, so the front door only says so when they are", async () => {
  const plans = (plusTax) => createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: { ...SETTINGS, prices: { shop: 2900, stockroom: 1900, both: 3900 } }, live: () => ({}), plusTax, log: () => {} })({ method: "GET", path: "/api/plans", headers: {} });
  assert.equal((await plans(undefined)).body.plusTax, false);
  assert.equal((await plans(true)).body.plusTax, true);
});

// ── The kept product file (code plan 18.7) ──

async function pressFor(w, who = ADA) {
  const made = await w.ask("POST", "/api/press", {}, who);
  return made.body.press.pressId;
}
const tokenOf = (upload) => upload.url.split("/").pop();

test("a product file is kept through a one-time upload link, and the press sees its name and count, never its path", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const csv = Buffer.from("Title,Price\nMoths,12\n");
  const started = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  assert.equal(started.status, 200);
  assert.equal(started.body.upload.method, "PUT");
  // Not kept until the file has arrived.
  const early = await w.ask("POST", "/api/press/import/kept", { pressId, name: "products.csv", rows: 1 }, ADA);
  assert.equal(early.status, 409);
  assert.equal((await w.files.put(tokenOf(started.body.upload), csv)).ok, true);
  // The link works once.
  assert.equal((await w.files.put(tokenOf(started.body.upload), csv)).ok, false);
  const kept = await w.ask("POST", "/api/press/import/kept", { pressId, name: " my\u0007 products.csv ", rows: 1 }, ADA);
  assert.equal(kept.status, 200);
  assert.deepEqual(kept.body.press.stagedImport, { name: "my products.csv", size: csv.length, rows: 1, at: "2026-11-03T09:00:00.000Z" });
  assert.equal(JSON.stringify(kept.body).includes("press-imports/"), false);
  const row = await w.stores.presses.get(pressId);
  assert.equal(row.stagedImportPath, `press-imports/${pressId}/products.csv`);
  const listed = await w.ask("GET", "/api/press", undefined, ADA);
  assert.equal(listed.body.presses[0].stagedImport.rows, 1);
});

test("a file over 5 MB is refused in plain words before any upload, and a big upload is thrown away", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const big = await w.ask("POST", "/api/press/import", { pressId, size: 26 * 1024 * 1024 }, ADA);
  assert.equal(big.status, 400);
  assert.match(big.body.message, /larger than 5 MB/);
  assert.equal(w.files.links.size, 0);
  // A file that somehow arrives bigger than the limit is removed, not kept.
  w.files.files.set(`press-imports/${pressId}/products.csv`, Buffer.alloc(5 * 1024 * 1024 + 1));
  const kept = await w.ask("POST", "/api/press/import/kept", { pressId, name: "big.csv", rows: 3 }, ADA);
  assert.equal(kept.status, 400);
  assert.equal(w.files.files.size, 0);
  for (const rows of [0, 2001, 1.5, "x"]) {
    assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows }, ADA)).status, 400);
  }
});

test("a stranger can't start, keep or remove another press's file, and the reply doesn't say the press exists", async () => {
  const w = world();
  const pressId = await pressFor(w);
  w.files.files.set(`press-imports/${pressId}/products.csv`, Buffer.from("Title\nA\n"));
  for (const path of ["/api/press/import", "/api/press/import/kept", "/api/press/import/remove"]) {
    const answer = await w.ask("POST", path, { pressId, size: 9, name: "a.csv", rows: 1 }, BEN);
    assert.equal(answer.status, 404, path);
  }
  assert.equal(w.files.links.size, 0);
  assert.equal(w.files.files.size, 1);
  assert.equal((await w.ask("POST", "/api/press/import", { pressId, size: 9 })).status, 401);
});

test("an upload link expires, the file can be removed, and nothing changes once the shop is opening", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const csv = Buffer.from("Title\nA\n");
  const late = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  w.tick(16 * 60_000);
  assert.equal((await w.files.put(tokenOf(late.body.upload), csv)).ok, false);
  const fresh = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  await w.files.put(tokenOf(fresh.body.upload), csv);
  await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA);
  const removed = await w.ask("POST", "/api/press/import/remove", { pressId }, ADA);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.press.stagedImport, null);
  assert.equal(w.files.files.size, 0);
  await w.stores.presses.set(pressId, { ...(await w.stores.presses.get(pressId)), status: "opening" });
  for (const path of ["/api/press/import", "/api/press/import/remove"]) {
    assert.equal((await w.ask("POST", path, { pressId, size: 9 }, ADA)).status, 409, path);
  }
  w.files.files.set(`press-imports/${pressId}/products.csv`, csv);
  assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA)).status, 409);
});
