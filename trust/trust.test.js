// The trust page (plan 14.2): every promise is kept somewhere in the repository, every company is named with what it
// handles, and the words stay plain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { COMPANIES, PROMISES } from "./trust.js";
import { renderTrust } from "./page.js";

const root = new URL("..", import.meta.url);

test("every promise names a place in the repository that keeps it, and the words are still there", () => {
  assert.ok(PROMISES.length >= 6);
  for (const { id, proof } of PROMISES) {
    const file = new URL(proof.file, root);
    assert.ok(existsSync(file), `${id}: ${proof.file} is gone`);
    assert.ok(readFileSync(file, "utf8").includes(proof.pattern), `${id}: "${proof.pattern}" is no longer in ${proof.file}`);
  }
  assert.equal(new Set(PROMISES.map((p) => p.id)).size, PROMISES.length);
});

test("the page shows every promise, every company and a way to ask", () => {
  const page = renderTrust();
  for (const p of PROMISES) assert.ok(page.includes(`id="${p.id}"`), p.id);
  for (const c of COMPANIES) assert.ok(page.includes(c.name.replace(/&/g, "&amp;")), c.name);
  assert.match(page, /mailto:/);
  assert.doesNotMatch(page, /DRAFT|lawyer/);
});

test("every company says what it handles", () => {
  for (const c of COMPANIES) assert.ok(c.handles.length > 20, c.name);
});

test("plain words, short sentences, no rival's name", () => {
  const text = [...PROMISES.flatMap((p) => [p.title, p.words]), ...COMPANIES.map((c) => c.handles)].join(". ");
  assert.doesNotMatch(text, /(firestore|firebase|api|json|webhook|server|database)/i);
  assert.doesNotMatch(text + readFileSync(new URL("./index.html", import.meta.url), "utf8"), /\b(big ?cartel|shopify|squarespace|etsy|wix|woocommerce)\b/i);
  for (const sentence of text.split(/(?<=[.?!;])\s+/)) assert.ok(sentence.split(/\s+/).length <= 36, `"${sentence}" is too long`);
});
