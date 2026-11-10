import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP_WORDS } from "./shopMaker.js";
import { MAKING_ROWS, makingView } from "./making.js";

const states = (view) => view.rows.map((r) => r.state);

test("a queued store waits on every row", () => {
  const view = makingView({ status: "opening", shopStatus: "queued", making: { status: "queued", done: 0, total: 20 } });
  assert.deepEqual(states(view), ["waiting", "waiting", "waiting"]);
  assert.equal(view.phase, "queued");
  assert.equal(view.percent, 4);
});

test("the rows follow the shop maker's steps, one working at a time", () => {
  assert.deepEqual(states(makingView({ status: "opening", making: { status: "making", done: 3, total: 20 } })), ["working", "waiting", "waiting"]);
  assert.deepEqual(states(makingView({ status: "opening", making: { status: "making", done: 9, total: 20 } })), ["done", "working", "waiting"]);
  const late = makingView({ status: "opening", making: { status: "making", done: 17, total: 20 } });
  assert.deepEqual(states(late), ["done", "done", "working"]);
  assert.equal(late.percent, 85);
  assert.equal(late.phase, "making");
});

test("ready: every row done, the bar full and the way in", () => {
  const view = makingView({ status: "open", openUrl: "https://moth.example/admin", making: { status: "ready", done: 20, total: 20 } });
  assert.deepEqual(states(view), ["done", "done", "done"]);
  assert.equal(view.percent, 100);
  assert.equal(view.openUrl, "https://moth.example/admin");
});

test("a stop shows the shop maker's own words and Try again only when it can", () => {
  const view = makingView({ status: "opening", making: { status: "waiting", done: 5, total: 20, message: "We couldn't finish it.", canRetry: true } });
  assert.equal(view.phase, "stuck");
  assert.equal(view.message, "We couldn't finish it.");
  assert.ok(view.canRetry);
  assert.deepEqual(states(view), ["waiting", "waiting", "waiting"]);
});

test("the rows' thresholds are real shop maker steps", () => {
  assert.equal(Object.keys(STEP_WORDS).length, 20);
  for (const row of MAKING_ROWS) if (Number.isFinite(row.doneAt)) assert.ok(STEP_WORDS[row.doneAt], row.id);
  assert.match(STEP_WORDS[9], /pages online/);
});
