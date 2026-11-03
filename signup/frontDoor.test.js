// The front door's server side (code plan 18.4): code in, sign-in link out, one setup record per press, and answers
// saved only by the press's owner while it is in setup. Through the real web door (api.js), with pretend stores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "./frontDoor.js";
import { createApi } from "./api.js";
import { fakeAuth, fakeFrontDoorStores, fakeVerifyIdToken } from "./fakes.js";
import { TEMPLATES } from "../services/email/templates.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };
const BEN = { uid: "uid-ben", email: "ben@example.com", email_verified: true };
const SETTINGS = { platformUrl: "https://platform.example", platformName: "Colophon", trialDays: 14, currency: "CAD" };

function world() {
  const stores = fakeFrontDoorStores();
  const sent = [];
  let clock = new Date("2026-11-03T09:00:00Z").getTime();
  let n = 0;
  const door = createFrontDoor({
    ...stores,
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
  return { stores, sent, door, ask, tick: (ms) => { clock += ms; } };
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
