// The control room never asks for a reason (Julian, 14 November 2026): no browser prompt or confirm, no "Why?" field
// and no minimum length. Who did what and when is still logged by the server; careful actions ask a styled yes or no.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./app.js", import.meta.url), "utf8");
const html = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("the control room page uses no browser prompt or confirm", () => {
  assert.doesNotMatch(page, /window\.(prompt|confirm)\(/);
});

test("nothing in the control room asks why for the log, or wants a reason of a set length", () => {
  for (const [name, text] of [["app.js", page], ["index.html", html]]) {
    assert.doesNotMatch(text, /at least 10 characters/i, name);
    assert.doesNotMatch(text, /goes in the (shop's|activity) log\)/i, name);
    assert.doesNotMatch(text, /name="reason"|name: "reason"/, name);
    assert.doesNotMatch(text, /Why\? \(/, name);
  }
});
