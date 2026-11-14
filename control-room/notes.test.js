// Notes and tags on a shop (code plan 19.13): platform admins only; every change is in the control room's activity log
// and never in the shop's own log; tags are short and lowercase; the Shops list's search finds shops by tag. And the
// page (index.html, app.js) uses the routes of 19.10-19.13.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_NOTE, MAX_TAGS, cleanTags, createShopNotes, notesRoutes } from "./notes.js";
import { shopMatches } from "./shopSearch.js";
import { fakeShopNotes } from "./visibilityFakes.js";
import { fakeActivity } from "./fakes.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { timelineRoutes } from "./timeline.js";
import { jobsRoutes } from "./jobs.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const SHOP = "moth-press";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com" });
  await registry.createShop("paper-wasp", { shopId: "paper-wasp", pressName: "Paper Wasp", ownerEmail: "wasp@example.com" });
  const store = fakeShopNotes();
  const activity = fakeActivity();
  const auditLog = fakeAuditLog();
  let n = 0;
  const notes = createShopNotes({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), store, registry, activity, now: () => new Date(NOW + n * 1000), newId: () => `note-${(n += 1)}` });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: notesRoutes(notes), log: () => {} });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { registry, store, activity, auditLog, notes, ask };
}

test("only platform admins read or change notes and tags", async () => {
  const w = await world();
  for (const [path, body] of [["/api/control/notes", {}], ["/api/control/notes", { shopId: SHOP }], ["/api/control/notes/add", { shopId: SHOP, words: "hello" }], ["/api/control/notes/delete", { shopId: SHOP, id: "x", reason: "a good reason here" }], ["/api/control/tags", { shopId: SHOP, tags: ["poetry"], reason: "a good reason here" }]]) {
    assert.equal((await w.ask(PRESS, path, body)).status, 403, path);
    assert.equal((await w.ask({ ...ADMIN, firebase: {} }, path, body)).status, 403, `${path}: two-step sign-in`);
  }
  assert.equal(w.store.docs.size, 0);
  assert.equal(w.activity.rows.size, 0);
});

test("a note is added and deleted with a reason; each change is in the activity log, not in the shop's own log", async () => {
  const w = await world();
  assert.equal((await w.ask(ADMIN, "/api/control/notes/add", { shopId: SHOP, words: "   " })).status, 400);
  assert.equal((await w.ask(ADMIN, "/api/control/notes/add", { shopId: SHOP, words: "x".repeat(MAX_NOTE + 1) })).status, 400);
  assert.equal((await w.ask(ADMIN, "/api/control/notes/add", { shopId: "no-such-shop", words: "hello" })).status, 404);
  const added = await w.ask(ADMIN, "/api/control/notes/add", { shopId: SHOP, words: "  Asked about wholesale prices at the fair.  " });
  assert.equal(added.status, 200);
  assert.deepEqual([added.body.note.words, added.body.note.by], ["Asked about wholesale prices at the fair.", "admin@example.com"]);
  await w.ask(ADMIN, "/api/control/notes/add", { shopId: SHOP, words: "Call before the spring list." });

  const read = await w.ask(ADMIN, "/api/control/notes", { shopId: SHOP });
  assert.deepEqual(read.body.notes.map((n) => n.words), ["Call before the spring list.", "Asked about wholesale prices at the fair."], "newest first");

  const id = added.body.note.id;
  assert.equal((await w.ask(ADMIN, "/api/control/notes/delete", { shopId: SHOP, id: "nope", reason: "it was about the wrong press" })).status, 404);
  assert.equal((await w.ask(ADMIN, "/api/control/notes/delete", { shopId: SHOP, id, reason: "it was about the wrong press" })).status, 200);
  assert.equal((await w.ask(ADMIN, "/api/control/notes/delete", { shopId: SHOP, id, reason: "it was about the wrong press" })).status, 404, "already gone");
  assert.deepEqual((await w.notes.notes(ADMIN, { shopId: SHOP })).notes.map((n) => n.words), ["Call before the spring list."]);

  const log = [...w.activity.rows.values()].sort((a, b) => a.at.localeCompare(b.at));
  assert.deepEqual(log.map((e) => [e.what, e.shopId, e.by]), [["note-added", SHOP, "admin@example.com"], ["note-added", SHOP, "admin@example.com"], ["note-deleted", SHOP, "admin@example.com"]]);
  assert.equal(log[2].detail.reason, "it was about the wrong press");
  assert.ok(!JSON.stringify(log).includes("wholesale"), "the note's words aren't copied into the log");
  // Private to the platform: nothing in the shop's own audit log or the registry's events.
  assert.equal(w.auditLog.entries.size, 0);
  assert.equal(w.registry.events.size, 0);
});

test("tags: lowercase words or short phrases, at most 10 of 30 characters; the same tags again change nothing", async () => {
  assert.deepEqual(cleanTags([" Poetry ", "big   List", "poetry", ""]), ["poetry", "big list"]);
  assert.throws(() => cleanTags(["x".repeat(31)]), /30 characters/);
  assert.throws(() => cleanTags(["<b>loud</b>"]), /word or a short phrase/);
  assert.throws(() => cleanTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag ${i}`)), /up to 10 tags/);
  assert.throws(() => cleanTags("poetry"), /list/);

  const w = await world();
  const set = await w.ask(ADMIN, "/api/control/tags", { shopId: SHOP, tags: ["Poetry", "Needs Help"], reason: "sorting the presses for the spring" });
  assert.deepEqual([set.status, set.body.tags, set.body.changed], [200, ["poetry", "needs help"], true]);
  const again = await w.ask(ADMIN, "/api/control/tags", { shopId: SHOP, tags: ["poetry", "needs help"], reason: "sorting the presses for the spring" });
  assert.equal(again.body.changed, false);
  await w.ask(ADMIN, "/api/control/tags", { shopId: "paper-wasp", tags: ["zines"], reason: "sorting the presses for the spring" });
  const tagged = [...w.activity.rows.values()].filter((e) => e.what === "tags-set");
  assert.equal(tagged.length, 2, "a change is logged; the same tags again aren't");
  assert.deepEqual(tagged.find((e) => e.shopId === SHOP).detail, { tags: ["poetry", "needs help"], was: [], reason: "sorting the presses for the spring" });
  assert.deepEqual((await w.ask(ADMIN, "/api/control/notes", {})).body.tagsByShop, { [SHOP]: ["poetry", "needs help"], "paper-wasp": ["zines"] });
  // Notes and tags live side by side.
  await w.ask(ADMIN, "/api/control/notes/add", { shopId: SHOP, words: "A note" });
  assert.deepEqual((await w.notes.notes(ADMIN, { shopId: SHOP })).tags, ["poetry", "needs help"]);
});

test("the Shops list's search finds shops by tag, as well as by name, id and owner email", () => {
  const shops = [
    { shopId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com" },
    { shopId: "paper-wasp", pressName: "Paper Wasp", ownerEmail: "wasp@example.com" },
  ];
  const tags = { [SHOP]: ["poetry", "needs help"], "paper-wasp": ["zines"] };
  const find = (typed) => shops.filter((s) => shopMatches(s, typed, tags[s.shopId])).map((s) => s.shopId);
  assert.deepEqual(find("poetry"), [SHOP]);
  assert.deepEqual(find("ZINES"), ["paper-wasp"]);
  assert.deepEqual(find("needs help"), [SHOP]);
  assert.deepEqual(find("moth poetry"), [SHOP], "every word typed is found somewhere");
  assert.deepEqual(find("wasp@"), ["paper-wasp"]);
  assert.deepEqual(find(""), [SHOP, "paper-wasp"]);
  assert.deepEqual(find("cookbooks"), []);
  assert.equal(shopMatches(shops[0], "moth"), true, "a shop with no tags still matches by name");
  assert.equal(shopMatches({ pressName: "Moth Press", addresses: ["moth-press.shops.example", "mothpress.example"] }, "mothpress.example"), true, "a shop is found by its web address");
});

test("the page: the Jobs page is in the side menu, and the new routes are all used", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const path of [...Object.keys(timelineRoutes({})), ...Object.keys(jobsRoutes({})), ...Object.keys(notesRoutes({}))]) {
    assert.ok(app.includes(`"${path.split(" ")[1].replace("/api", "")}"`), path);
  }
  assert.match(page, /class="cr-tool" href="#jobs"/, "Jobs is a card on Platform");
  assert.match(page, /<section data-page="jobs"/);
  assert.match(app, /import \{ shopMatches \} from "\.\/shopSearch\.js"/);
  assert.match(app, /"Show older"/);
  assert.match(app, /"Run now"/);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
});
