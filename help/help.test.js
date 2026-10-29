// Help articles (plan 3.4, 8.2): in plain words, never naming a rival, pointing only at pages the shop really has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES, CHECKLIST_ANSWERS, TOPICS, articlesFor, searchArticles } from "./articles.js";
import { SUPPORT, renderSupport } from "./support.js";
import { renderHelp } from "./page.js";

const words = (a) => [a.question, ...a.answer, ...(a.where || [])].join(" ");

test("each article has its own id, a topic, a question and an answer", () => {
  assert.equal(ARTICLES.length, 31);
  assert.equal(new Set(ARTICLES.map((a) => a.id)).size, ARTICLES.length);
  for (const a of ARTICLES) {
    assert.match(a.id, /^[a-z][a-z-]+$/, a.id);
    assert.ok(TOPICS.includes(a.topic), `${a.id}: topic ${a.topic}`);
    assert.ok(a.question.endsWith("?"), `${a.id}: a question`);
    assert.ok(a.answer.length >= 1 && a.answer.every((p) => p.trim()), `${a.id}: an answer`);
    for (const p of a.plans || []) assert.ok(["shop", "stockroom"].includes(p), `${a.id}: plan ${p}`);
  }
});

test("plain words: short sentences, no code or tool names, never a rival", () => {
  const jargon = /\b(firestore|firebase|cloud functions?|api|json|webhook|oauth|html|sdk|database|server|deploy|stripe|resend|shippo|square)\b/i;
  const rivals = /\b(big ?cartel|shopify|squarespace|etsy|wix|woocommerce|square online)\b/i;
  const support = [SUPPORT.title, ...SUPPORT.includes, ...SUPPORT.excludes].join(" ");
  assert.doesNotMatch(support, jargon);
  assert.doesNotMatch(support, rivals);
  for (const a of ARTICLES) {
    const text = words(a);
    assert.doesNotMatch(text, jargon, a.id);
    assert.doesNotMatch(text, rivals, a.id);
    for (const sentence of a.answer.join(" ").split(/(?<=[.?!])\s+/)) {
      assert.ok(sentence.split(/\s+/).length <= 32, `${a.id}: "${sentence}" is too long`);
    }
  }
  assert.doesNotMatch(readFileSync(new URL("./index.html", import.meta.url), "utf8"), rivals);
});

test("every place an article says to click is a real page in the shop's admin menu", () => {
  const nav = readFileSync(new URL("../apps/shop/src/app/admin/riso/nav.ts", import.meta.url), "utf8");
  const top = [...nav.matchAll(/^  \{ id: "[^"]+", label: "([^"]+)"/gm)].map((m) => m[1]);
  const settings = [...nav.matchAll(/^    \{ id: "[^"]+", label: "([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(top.includes("Books") && settings.includes("Shipping"), "read the menu");
  let checked = 0;
  for (const a of ARTICLES) {
    const paths = [...(a.where || []), ...[...a.answer.join(" ").matchAll(/\b([A-Z][a-z]+) › ([^.,]+)/g)].map((m) => `${m[1]} › ${m[2]}`)];
    for (const path of paths) {
      const [page, rest = ""] = path.split(" › ");
      assert.ok(top.includes(page), `${a.id}: "${page}" isn't in the admin menu`);
      if (page === "Settings") assert.ok(settings.some((label) => rest.startsWith(label)), `${a.id}: Settings has no "${rest}"`);
      checked += 1;
    }
  }
  assert.ok(checked > 15, `checked ${checked}`);
});

test("the stockroom answers show only to presses with the stockroom, and the shop's only to those with the shop", () => {
  assert.ok(!articlesFor("shop").some((a) => a.id === "fairs"));
  assert.ok(articlesFor("stockroom").some((a) => a.id === "fairs"));
  assert.ok(!articlesFor("stockroom").some((a) => a.id === "shipping"));
  assert.equal(articlesFor("both").length, ARTICLES.length);
  assert.ok(articlesFor("stockroom").some((a) => a.id === "stock-everywhere"));
});

test("search finds by any words in the question or answer, and an empty box shows everything", () => {
  assert.deepEqual(searchArticles("old shop links").map((a) => a.id), ["old-links"]);
  assert.ok(searchArticles("editions").some((a) => a.id === "editions"));
  assert.equal(searchArticles("").length, ARTICLES.length);
  assert.equal(searchArticles("zzzz").length, 0);
});

test("the page groups answers by topic, opens the one in the address, and points to a person when nothing matches", () => {
  const all = renderHelp();
  for (const topic of TOPICS) assert.ok(all.includes(`>${topic}</h2>`), topic);
  assert.ok(renderHelp({ openId: "trial-ends" }).includes('id="trial-ends" open'));
  assert.ok(!all.includes(" open>"));
  assert.match(renderHelp({ search: "zzzz" }), /Get help from Colophon/);
  assert.ok(!renderHelp({ search: "<script>" }).includes("<script>"));
});

test("every step of the shop's setup guide has an answer", () => {
  const source = readFileSync(new URL("../apps/shop/src/app/admin/firstWeek.ts", import.meta.url), "utf8");
  const union = source.match(/export type StepId =([^;]+);/)[1];
  const steps = [...union.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(steps.length >= 10 && steps.includes("shipping") && steps.includes("open"), `read ${steps.length} steps`);
  const ids = new Set(ARTICLES.map((a) => a.id));
  for (const step of steps) {
    assert.ok(CHECKLIST_ANSWERS[step], `the "${step}" step has no answer in CHECKLIST_ANSWERS`);
    assert.ok(ids.has(CHECKLIST_ANSWERS[step]), `${step}: no article "${CHECKLIST_ANSWERS[step]}"`);
  }
  assert.deepEqual(Object.keys(CHECKLIST_ANSWERS).sort(), [...steps].sort(), "no answer for a step that no longer exists");
});

test("what support includes and doesn't, on the help page and next to the plans on sign-up", () => {
  const excluded = SUPPORT.excludes.join(" ");
  for (const not of ["Setup calls", "Data entry", "Design work"]) assert.ok(excluded.includes(not), not);
  assert.ok(SUPPORT.includes.length >= 3);
  const block = renderSupport();
  for (const line of [...SUPPORT.includes, ...SUPPORT.excludes]) assert.ok(block.includes(line.replace(/'/g, "&#39;")), line);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /renderSupport\(\)/);
  // The sign-up page has no build step and doesn't load help/, so it carries the same lines, word for word.
  const signup = readFileSync(new URL("../signup/index.html", import.meta.url), "utf8").replace(/&#39;|&rsquo;/g, "'");
  for (const line of [SUPPORT.title, ...SUPPORT.includes, ...SUPPORT.excludes]) assert.ok(signup.includes(line), `sign-up page lacks "${line}"`);
  assert.ok(ARTICLES.some((a) => a.id === "what-help"));
});
