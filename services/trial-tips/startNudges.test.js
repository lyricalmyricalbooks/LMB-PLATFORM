import { test } from "node:test";
import assert from "node:assert/strict";
import { START_NUDGE_FIRST_DAY, START_NUDGE_LAST_DAY, START_NUDGE_WORDS, START_STAGES, nextStartStage, nudgeDayOf, nudgeSubject, stagesLeft, startNudgeDue } from "./startNudges.js";

const step = (...ids) => ids.reduce((doc, id) => ({ ...doc, [id]: id === "welcome" ? { at: "t", firstRun: true } : { at: "t" } }), { plan: "both" });
const started = step("welcome");

test("the run's stages come in order, the look first, and each is done by its marker (sign-up plan, move 4)", () => {
  assert.deepEqual(START_STAGES.map((s) => s.id), ["look", "bring", "services", "payments", "details", "shipping", "final"]);
  assert.equal(nextStartStage({ plan: "both" }), "look");
  assert.equal(nextStartStage(started, { platformCards: false }), "bring");
  assert.equal(nextStartStage(step("welcome", "bring"), {}), "details");
  assert.equal(nextStartStage(step("welcome", "bring", "details"), {}), "shipping");
  assert.deepEqual(stagesLeft(started, { platformCards: true }), ["bring", "payments", "details", "shipping", "final"]);
});

test("an older shop that chose its look before the run existed hears nothing; one part-way through the old order does", () => {
  assert.equal(nextStartStage({ plan: "both", welcome: { at: "t" } }), null);
  assert.equal(nextStartStage({ plan: "both", details: { at: "t" } }), "look");
});

test("a services shop adds its services and has no shipping stage", () => {
  const salon = { publishes: "hair", welcome: { at: "t", firstRun: true } };
  assert.deepEqual(stagesLeft(salon), ["services", "details", "final"]);
  assert.deepEqual(stagesLeft({ ...salon, sellsProducts: true }), ["bring", "details", "shipping", "final"]);
});

test("Get paid is a stage only for a press whose cards go through the platform", () => {
  const doc = step("welcome", "bring");
  assert.equal(nextStartStage(doc, { platformCards: false }), "details");
  assert.equal(nextStartStage(doc, { platformCards: true }), "payments");
});

test("a finished run, a stockroom-only plan, and an open shop have nothing to nudge", () => {
  const done = step("welcome", "bring", "details", "shipping", "finalCheck");
  assert.equal(nextStartStage(done), null);
  assert.equal(nextStartStage({ ...started, plan: "stockroom" }), null);
  assert.equal(nextStartStage(started, { open: true }), null);
});

test("nudges may go out any day from day 1 to day 10, and never on the welcome's day or in billing's last days", () => {
  assert.equal(START_NUDGE_FIRST_DAY, 1);
  assert.equal(START_NUDGE_LAST_DAY, 10);
  assert.equal(nudgeDayOf(0), null);
  assert.equal(nudgeDayOf(1), 1);
  assert.equal(nudgeDayOf(6), 6);
  assert.equal(nudgeDayOf(10), 10);
  assert.equal(nudgeDayOf(11), null);
  assert.equal(nudgeDayOf(null), null);
});

test("each stage is nudged at most once, and the next stage gets its own nudge, with how many steps are left", () => {
  const record = { startNudges: { bring: { day: 1, at: "t" } } };
  assert.deepEqual(startNudgeDue({ day: 2, doc: started, record }), { nudge: null, why: "already-sent" });
  const next = step("welcome", "bring");
  assert.deepEqual(startNudgeDue({ day: 2, doc: next, record }), { nudge: { day: 2, stage: "details", left: 3 }, why: "due" });
});

test("one nudge a day at most: a press that finishes a stage after today's nudge hears about the next one tomorrow", () => {
  const record = { startNudges: { bring: { day: 3, at: "t" } } };
  const next = step("welcome", "bring");
  assert.deepEqual(startNudgeDue({ day: 3, doc: next, record }), { nudge: null, why: "already-sent" });
  assert.equal(startNudgeDue({ day: 4, doc: next, record }).nudge.stage, "details");
});

test("the subject says how close the press is, and the one next step", () => {
  assert.equal(nudgeSubject("Add your first book", 1), "One step from open: add your first book");
  assert.equal(nudgeSubject("Add your first book", 3), "3 steps from open. Next: add your first book");
});

test("tips off, days outside the window, and a finished run send nothing", () => {
  assert.equal(startNudgeDue({ day: 2, doc: started, record: { off: true } }).why, "tips-off");
  assert.equal(startNudgeDue({ day: 0, doc: started }).why, "not-a-nudge-day");
  assert.equal(startNudgeDue({ day: 12, doc: started }).why, "not-a-nudge-day");
  assert.equal(startNudgeDue({ day: 2, doc: step("welcome", "bring", "details", "shipping", "finalCheck") }).why, "nothing-to-nudge");
});

test("every stage of the run has its nudge in plain words, naming no rival or technical term", () => {
  for (const { id } of START_STAGES) {
    const words = START_NUDGE_WORDS[id];
    assert.ok(words, `${id} has nudge words`);
    assert.ok(words.subject && words.action && words.hash, `${id} has a subject, a button and a link target`);
    assert.equal(words.paragraphs.length, 2, `${id} has two short paragraphs`);
  }
  assert.deepEqual(Object.keys(START_NUDGE_WORDS).sort(), START_STAGES.map((s) => s.id).sort());
  const text = JSON.stringify(START_NUDGE_WORDS).toLowerCase();
  for (const bad of ["shopify", "big cartel", "squarespace", "etsy", "wix", "woocommerce", "firebase", "api", "webhook", "dns", "deploy", "secret", "resend"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(text), bad);
  }
});
