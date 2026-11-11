import { test } from "node:test";
import assert from "node:assert/strict";
import { START_NUDGE_DAYS, START_NUDGE_WORDS, START_STAGES, nextStartStage, nudgeDayOf, startNudgeDue } from "./startNudges.js";

const step = (...ids) => ids.reduce((doc, id) => ({ ...doc, [id]: { at: "t" } }), { plan: "both" });
const started = { details: { at: "t" } };

test("the run's stages come in order, and each is done by its marker", () => {
  assert.deepEqual(START_STAGES.map((s) => s.id), ["details", "bring", "look", "payments", "shipping", "final"]);
  assert.equal(nextStartStage({ plan: "both" }), null, "no details: an older shop, no run");
  assert.equal(nextStartStage(started, { platformCards: false }), "bring");
  assert.equal(nextStartStage(step("details", "bring", "welcome"), {}), "shipping");
});

test("Get paid is a stage only for a press whose cards go through the platform", () => {
  const doc = step("details", "bring", "welcome", "shipping");
  assert.equal(nextStartStage(doc, { platformCards: false }), "final");
  assert.equal(nextStartStage(doc, { platformCards: true }), "payments");
});

test("a finished run, a stockroom-only plan, and an open shop have nothing to nudge", () => {
  const done = step("details", "bring", "welcome", "shipping", "finalCheck");
  assert.equal(nextStartStage(done), null);
  assert.equal(nextStartStage({ ...started, plan: "stockroom" }), null);
  assert.equal(nextStartStage(started, { open: true }), null);
});

test("nudges fall on days 2 and 4, and a missed run may send the day after, never later", () => {
  assert.deepEqual(START_NUDGE_DAYS, [2, 4]);
  assert.equal(nudgeDayOf(1), null);
  assert.equal(nudgeDayOf(2), 2);
  assert.equal(nudgeDayOf(3), 2);
  assert.equal(nudgeDayOf(4), 4);
  assert.equal(nudgeDayOf(5), 4);
  assert.equal(nudgeDayOf(6), null);
  assert.equal(nudgeDayOf(null), null);
});

test("each stage is nudged at most once, and the next stage gets its own nudge", () => {
  const record = { startNudges: { bring: { at: "t" } } };
  assert.deepEqual(startNudgeDue({ day: 2, doc: started, record }), { nudge: null, why: "already-sent" });
  assert.deepEqual(startNudgeDue({ day: 4, doc: started, record }), { nudge: null, why: "already-sent" });
  const next = step("details", "bring");
  assert.deepEqual(startNudgeDue({ day: 4, doc: next, record }), { nudge: { day: 4, stage: "look" }, why: "due" });
});

test("one nudge per nudge day: a press that finishes a stage after day 2's nudge hears nothing more until day 4", () => {
  const record = { startNudges: { bring: { day: 2, at: "t" } } };
  const next = step("details", "bring");
  assert.deepEqual(startNudgeDue({ day: 3, doc: next, record }), { nudge: null, why: "already-sent" });
  assert.deepEqual(startNudgeDue({ day: 4, doc: next, record }), { nudge: { day: 4, stage: "look" }, why: "due" });
});

test("tips off, days between, and a finished run send nothing", () => {
  assert.equal(startNudgeDue({ day: 2, doc: started, record: { off: true } }).why, "tips-off");
  assert.equal(startNudgeDue({ day: 3, doc: started, record: { off: true } }).why, "tips-off");
  assert.equal(startNudgeDue({ day: 1, doc: started }).why, "not-a-nudge-day");
  assert.equal(startNudgeDue({ day: 2, doc: step("details", "bring", "welcome", "shipping", "finalCheck") }).why, "nothing-to-nudge");
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
