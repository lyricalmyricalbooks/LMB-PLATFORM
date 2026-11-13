// Help articles (plan 3.4, 8.2): in plain words, never naming a rival, pointing only at pages the shop really has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES, CHECKLIST_ANSWERS, RUN_ANSWERS, TOPICS, articlesFor, searchArticles } from "./articles.js";
import { SUPPORT, renderSupport } from "./support.js";
import { renderHelp, renderTopics } from "./page.js";
import { goodsWords } from "./sells.js";

const words = (a) => [a.question, ...a.answer, ...(a.where || [])].join(" ");

test("each article has its own id, a topic, a question and an answer", () => {
  assert.equal(ARTICLES.length, 42);
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

test("every stage of the Get started run has an answer (plan 17.15)", () => {
  const source = readFileSync(new URL("../apps/shop/src/app/admin/startRun.ts", import.meta.url), "utf8");
  const union = source.match(/export type RunStep = ([^;]+);/)[1];
  const stages = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(stages.length >= 6 && stages.includes("details") && stages.includes("final"), `read ${stages.length} stages`);
  const ids = new Set(ARTICLES.map((a) => a.id));
  for (const stage of stages) {
    assert.ok(RUN_ANSWERS[stage], `the "${stage}" stage has no answer in RUN_ANSWERS`);
    assert.ok(ids.has(RUN_ANSWERS[stage]), `${stage}: no article "${RUN_ANSWERS[stage]}"`);
  }
  assert.deepEqual(Object.keys(RUN_ANSWERS).sort(), [...stages].sort(), "no answer for a stage that no longer exists");
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

test("each topic sheet's questions open their own answer, and its name leads to the topic", () => {
  const html = renderTopics();
  const first = articlesFor("both").find((a) => a.topic === TOPICS[0]);
  assert.match(html, new RegExp(`<li><a href="#${first.id}">`));
  assert.match(html, /class="cp-topic-name" href="#t-getting-started"/);
  // No link inside a link: a sheet is a box, not one big link.
  assert.doesNotMatch(html, /<a[^>]*class="card cp-topic"/);
});

test("a search says how many answers it found", () => {
  assert.match(renderHelp({ search: "shipping" }), /<p class="cp-found" role="status">\d+ answers? for “shipping”<\/p>/);
  assert.doesNotMatch(renderHelp({}), /cp-found/);
});

// What the shop sells (code plan 12.18): a shop that doesn't sell books reads the answers in its own words.
const NOT_BOOKS = ["prints", "clothing", "shoes", "jewelry", "music", "other"];
const shown = (html) => html.replace(/ (?:id|href)="[^"]*"/g, ""); // ids and links stay as they are, so shared links keep working

test("a books shop, or a shop with no answer, sees every answer exactly as written", () => {
  for (const sells of [null, "books", "zines", "comics", "mix", "something-new"]) {
    assert.equal(renderHelp({ sells }), renderHelp(), String(sells));
    assert.equal(renderTopics({ sells }), renderTopics(), String(sells));
    assert.deepEqual(articlesFor("both", sells), [...ARTICLES], String(sells));
  }
});

test("a shop that doesn't sell books sees no book words in its help", () => {
  // "press" alone is the verb (press Add product); the setup step keeps its own name, Your press; Editions is the tab.
  const bookish = /\b(books?|Books?|BOOKS?|authors?|Authors?|copies|readers?|ISBN|Bookshops?|bookshops?|presses|press's|editions)\b/;
  for (const sells of NOT_BOOKS) {
    for (const html of [renderHelp({ sells }), renderTopics({ sells })]) {
      const text = shown(html).replace(/<[^>]+>/g, " ");
      const found = text.match(bookish);
      assert.equal(found, null, `${sells}: "${found && text.slice(Math.max(0, found.index - 40), found.index + 30)}"`);
    }
    assert.ok(articlesFor("both", sells).some((a) => a.question === "How do I add my first product?"), sells);
  }
});

test("only a shop with books is asked for an ISBN; a shop that sells books and other things keeps it", () => {
  for (const sells of NOT_BOOKS) assert.ok(!articlesFor("both", sells).some((a) => a.id === "isbn"), sells);
  assert.ok(articlesFor("both", "mixed").some((a) => a.id === "isbn"));
  assert.ok(articlesFor("both", "books").some((a) => a.id === "isbn"));
});

test("worded answers still point at real admin pages, named the way that shop's admin names them, in short sentences", () => {
  const nav = readFileSync(new URL("../apps/shop/src/app/admin/riso/nav.ts", import.meta.url), "utf8");
  const top = [...nav.matchAll(/^  \{ id: "[^"]+", label: "([^"]+)"/gm)].map((m) => goodsWords(m[1]));
  assert.ok(top.includes("Products"));
  for (const a of articlesFor("both", "clothing")) {
    for (const path of a.where || []) assert.ok(top.includes(path.split(" › ")[0]), `${a.id}: "${path}"`);
    for (const sentence of a.answer.join(" ").split(/(?<=[.?!])\s+/)) assert.ok(sentence.split(/\s+/).length <= 32, `${a.id}: "${sentence}"`);
  }
});

test("search finds a worded answer by the shop's own words", () => {
  const list = articlesFor("both", "clothing");
  assert.ok(searchArticles("first product", list).some((a) => a.id === "add-a-book"));
  assert.match(renderHelp({ sells: "clothing", search: "isbn" }), /No answer has all of those words/);
});

test("the help page's copy of the sells rules is the shared one, word for word, and the page reads ?sells=", () => {
  const copy = readFileSync(new URL("./sells.js", import.meta.url), "utf8");
  assert.equal(copy, readFileSync(new URL("../shared/sells/sells.js", import.meta.url), "utf8"), "copy shared/sells/sells.js to help/sells.js");
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /query\.get\("sells"\)/);
  assert.match(page, /renderHelp\(\{[^}]*sells/);
  assert.match(page, /renderTopics\(\{ plan, sells \}\)/);
});
