import test from "node:test";
import assert from "node:assert/strict";
import { errorHelp, ERROR_HELP_RULES } from "./errorHelp.js";
import { ARTICLES } from "./articles.js";
import { createApi } from "../signup/api.js";

test("every error rule has a fix line and a real help answer", () => {
  const ids = new Set(ARTICLES.map((a) => a.id));
  for (const rule of ERROR_HELP_RULES) {
    assert.ok(rule.fix.length > 10, rule.fix);
    assert.ok(ids.has(rule.help), `${rule.help} is not a help answer`);
    for (const sentence of rule.fix.split(/(?<=[.!?])\s+/)) assert.ok(sentence.split(/\s+/).length <= 36, sentence);
  }
});

test("each status gets a fix and a link", () => {
  for (const status of [400, 401, 402, 403, 404, 409, 429, 500, 502]) {
    const found = errorHelp(status, "/api/x");
    assert.ok(found.fix && found.helpLink.startsWith("/help/#"), String(status));
  }
});

test("the web door adds the fix to a failed answer and to an unknown route", async () => {
  const handle = createApi({ routes: {}, signup: {}, settings: {}, verifyIdToken: async () => ({}), log() {} });
  const answer = await handle({ method: "GET", path: "/api/nowhere" });
  assert.equal(answer.status, 404);
  assert.ok(answer.body.fix);
  assert.match(answer.body.helpLink, /^\/help\/#/);
});
