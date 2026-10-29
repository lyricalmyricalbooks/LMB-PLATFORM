// The waitlist page carries the product's name, Colophon (Julian, 28 October 2026; plan 0.4), as the platform's
// settings do, and no longer calls it a working name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../services/settings.js";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const NAME = "Colophon";
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("the page and the platform's settings use the same product name", () => {
  assert.equal(DEFAULT_SETTINGS.platformName, NAME);
});

test("the name is in the tab title, the description, the header mark and the footer", () => {
  assert.match(page.match(/<title>([^<]*)<\/title>/)[1], /^Colophon\b/);
  assert.match(page.match(/<meta name="description" content="([^"]*)"/)[1], /\bColophon\b/);
  assert.match(textOf(page.match(/<div class="mark">([\s\S]*?)<\/div>/)[1]), /^Colophon\b/);
  assert.match(textOf(page.match(/<footer>([\s\S]*?)<\/footer>/)[1]), /\bColophon\b/);
});

test("the name is final: never called a working name, a placeholder or a code name", () => {
  const words = textOf(page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")).toLowerCase();
  for (const phrase of ["working name", "placeholder name", "code name", "name tbd", "name to come"]) {
    assert.ok(!words.includes(phrase), `the page says "${phrase}"`);
  }
});

test("the name is spelled one way everywhere on the page", () => {
  const spellings = new Set(page.match(/colophon/gi));
  assert.deepEqual([...spellings], [NAME]);
});

test("the waitlist says who is asking, what for, and how to stop (plan 15.8)", () => {
  const text = textOf(page);
  assert.match(text, /Colophon will email you about your place and the launch, and nothing else/);
  assert.match(text, /Reply STOP to any of our emails and we'll take you off the list at once/);
  assert.match(text, /you can stop them at any time/);
  assert.doesNotMatch(text, /We'll only email you about the launch/);
});
