// The clock for a press that has not opened (code plan 18.11): emails 30 and 7 days before its setup is cleared, each
// once; clears only after the 7-day one, never with less than 7 days' notice; a visit restarts it; an opened press is never
// touched; a cleared record keeps its dates and loses what the press typed and its kept file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAST_NOTICE_DAYS, createSetupClock, setupClockDue } from "./setupClock.js";
import { SETUP_EXPIRY_DAYS, newPressRecord } from "./pressRecord.js";
import { createFrontDoor } from "./frontDoor.js";
import { fakeFrontDoorStores } from "./fakes.js";
import { TEMPLATES_FR } from "../services/email/templatesFr.js";
import { TEMPLATES } from "../services/email/templates.js";

const DAY = 86_400_000;
const SEEN = Date.parse("2026-11-01T12:00:00Z");
const day = (n) => SEEN + n * DAY;

const record = (fields = {}) => ({
  ...newPressRecord({ pressId: "press-moth-one", ownerUid: "uid-moth", email: "moth@example.com", now: new Date(SEEN) }),
  pressName: "Moth Press", country: "CA", look: "index", stagedImportPath: "press-imports/press-moth-one/a.csv", stagedImport: { name: "books.csv", size: 10, rows: 3, at: new Date(SEEN).toISOString() },
  ...fields,
});

function world(start = record()) {
  const { presses } = fakeFrontDoorStores();
  presses.rows.set(start.pressId, structuredClone(start));
  const sent = [];
  const removed = [];
  let at = SEEN;
  const clock = createSetupClock({
    presses, stagedFiles: { remove: async (path) => void removed.push(path) },
    email: { sendPlatform: async (message) => void sent.push(message) },
    settings: { platformUrl: "https://platform.example" }, now: () => new Date(at),
  });
  return { presses, sent, removed, clock, at: (ms) => (at = ms), row: () => presses.rows.get(start.pressId) };
}

test("nothing is due before 30 days are left", () => {
  assert.equal(setupClockDue(record(), day(SETUP_EXPIRY_DAYS - 31)), null);
  assert.equal(setupClockDue(record({ status: "opening" }), day(400)), null, "an opening press is never touched");
  assert.equal(setupClockDue(record({ status: "open" }), day(400)), null);
});

test("a last visit that can't be read counts from when the record was made, so the clock still runs", () => {
  const bad = record({ lastSeenAt: "not a date", createdAt: new Date(SEEN).toISOString() });
  assert.equal(setupClockDue(bad, day(SETUP_EXPIRY_DAYS - 31)), null);
  assert.equal(setupClockDue(bad, day(SETUP_EXPIRY_DAYS - 30))?.action, "warn");
});

test("two warnings, each once, then the setup is cleared with its kept file", async () => {
  const w = world();
  w.at(day(SETUP_EXPIRY_DAYS - 30));
  assert.equal((await w.clock.sweep()).warned, 1);
  assert.equal((await w.clock.sweep()).warned, 0, "a second run sends nothing");
  assert.equal(w.sent[0].kind, "setup-ending");
  assert.equal(w.sent[0].data.daysLeft, 30);
  assert.equal(w.sent[0].data.link, "https://platform.example/join/");
  w.at(day(SETUP_EXPIRY_DAYS - 7));
  await w.clock.sweep();
  assert.deepEqual(w.sent.map((m) => m.data.daysLeft), [30, 7]);
  w.at(day(SETUP_EXPIRY_DAYS) - 1000);
  assert.equal((await w.clock.sweep()).cleared, 0, "not before the 60 days are up");
  w.at(day(SETUP_EXPIRY_DAYS) + 1000);
  assert.equal((await w.clock.sweep()).cleared, 1);
  const row = w.row();
  assert.equal(row.status, "expired");
  assert.deepEqual([row.pressName, row.look, row.stagedImport, row.stagedImportPath], ["", "", null, ""]);
  assert.equal(row.ownerEmail, "moth@example.com", "the owner and dates stay, so the record says what happened");
  assert.ok(row.expiredAt);
  assert.deepEqual(w.removed, ["press-imports/press-moth-one/a.csv"]);
  assert.equal((await w.clock.sweep()).cleared, 0, "a cleared record stays cleared");
  assert.equal(w.sent.length, 2, "no email at clearing");
});

test("a missed sweep sends one warning, and a late last warning still gives 7 days", async () => {
  const w = world();
  w.at(day(SETUP_EXPIRY_DAYS - 2));
  await w.clock.sweep();
  assert.deepEqual(w.sent.map((m) => m.data.daysLeft), [7], "only the nearest warning");
  assert.equal(w.sent[0].data.on, new Date(day(SETUP_EXPIRY_DAYS - 2) + LAST_NOTICE_DAYS * DAY).toISOString(), "the date in the email is a week away");
    w.at(day(SETUP_EXPIRY_DAYS + 1));
  await w.clock.sweep();
  assert.equal(w.row().status, "setup", "kept until the week is up");
  assert.equal(w.sent.length, 1, "the missed 30-day email is never sent late");
  w.at(day(SETUP_EXPIRY_DAYS + 5) + 1000);
  await w.clock.sweep();
  assert.equal(w.row().status, "expired");
  assert.equal(w.sent.length, 1);
});

test("a visit restarts the clock: earlier warnings no longer count", async () => {
  const w = world();
  w.at(day(SETUP_EXPIRY_DAYS - 7));
  await w.clock.sweep();
  assert.equal(w.sent.length, 1);
  // The press comes back.
  const back = new Date(day(SETUP_EXPIRY_DAYS - 5)).toISOString();
  w.presses.rows.set("press-moth-one", { ...w.row(), lastSeenAt: back });
  w.at(day(SETUP_EXPIRY_DAYS + 10));
  assert.equal((await w.clock.sweep()).warned, 0, "45 days since the visit: nothing yet");
  assert.equal(w.row().status, "setup");
  assert.equal(setupClockDue(w.row(), Date.parse(back) + 30 * DAY)?.before, 30, "the first warning again, 30 days before the new date");
});

test("opening setup counts as a visit, at most once an hour", async () => {
  const stores = fakeFrontDoorStores();
  stores.presses.rows.set("press-moth-one", record());
  let at = day(20);
  const door = createFrontDoor({ ...stores, email: {}, auth: {}, settings: {}, stagedFiles: {}, now: () => new Date(at) });
  await door.myPresses({ uid: "uid-moth" });
  assert.equal(stores.presses.rows.get("press-moth-one").lastSeenAt, new Date(day(20)).toISOString());
  at = day(20) + 10 * 60_000;
  await door.myPresses({ uid: "uid-moth" });
  assert.equal(stores.presses.rows.get("press-moth-one").lastSeenAt, new Date(day(20)).toISOString(), "not again within the hour");
  await door.myPresses({ uid: "uid-someone-else" });
});

test("one press's trouble doesn't stop the others, and the run says so", async () => {
  const w = world();
  w.presses.rows.set("press-wasp-two", { ...record(), pressId: "press-wasp-two", ownerEmail: "wasp@example.com" });
  let calls = 0;
  const clock = createSetupClock({
    presses: w.presses, stagedFiles: { remove: async () => {} },
    email: { sendPlatform: async (message) => { calls += 1; if (message.to === "moth@example.com") throw new Error("mail is down"); } },
    settings: { platformUrl: "https://platform.example" }, now: () => new Date(day(SETUP_EXPIRY_DAYS - 30)),
  });
  await assert.rejects(clock.sweep(), /1 warned, 0 cleared, 1 failed: press-moth-one \(mail is down\)/);
  assert.equal(calls, 2);
});

test("the warning email exists in English and French, with the date and the way back", () => {
  const data = { pressName: "Moth Press", daysLeft: 7, date: "December 3, 2026", link: "https://platform.example/join/" };
  const settings = { platformName: "Colophon" };
  const en = TEMPLATES["setup-ending"](data, { settings });
  assert.match(en.text, /7 more days, until December 3, 2026/);
  assert.match(en.text, /https:\/\/platform\.example\/join\//);
  const fr = TEMPLATES_FR["setup-ending"](data, { settings });
  assert.match(fr.text, /encore 7 jours, jusqu'au 3 décembre 2026/);
});
