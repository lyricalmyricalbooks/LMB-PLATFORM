// The front page (design handoff "Colophon front page", 9 November 2026): the email pill joins the waitlist until
// sign-up opens, then starts a free trial by handing the email to the front door (join/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HANDOFF_KEY, frontPageWords, handOff, showFrontPage, takeHandOff } from "./frontPage.js";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const join = readFileSync(new URL("../join/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../shared/admin-look/platform-pages.css", import.meta.url), "utf8");

function memoryStorage() {
  const map = new Map();
  return { map, setItem: (k, v) => map.set(k, String(v)), getItem: (k) => map.get(k) ?? null, removeItem: (k) => map.delete(k) };
}

function fakeDocument() {
  const ids = new Map(["cta", "cta-long", "cta-short", "start-submit", "start-note", "start-consent", "founding-go"].map((id) => [id, { textContent: "", href: "", hidden: false }]));
  return { ids, getElementById: (id) => ids.get(id) };
}

test("closed (today): every button joins the waitlist, and the page says who emails and how to stop", () => {
  const words = frontPageWords();
  assert.equal(words.submit, "Join the waitlist");
  assert.equal(words.consent, true);
  assert.match(words.note, /we're starting in Canada/);
  assert.deepEqual(words.founding, { label: "Join the waitlist", href: "#start" });
  // The page as served is the closed state, so it reads right before any script runs.
  assert.match(page, /id="start-submit">Join the waitlist</);
  assert.match(page, /id="start-note">Free setup · no card · we're starting in Canada</);
  assert.match(page, /id="founding-go" href="#start">Join the waitlist</);
  assert.match(page, /id="cta" href="#start">/);
});

test("open: Start free trial everywhere, the trial length only from the plans answer, See plans goes to the plans", () => {
  const words = frontPageWords({ open: true, trialDays: 14 });
  assert.equal(words.note, "Free setup · no card · 14 days free once you open");
  assert.equal(frontPageWords({ open: true, trialDays: null }).note, "Free setup · no card");
  assert.equal(frontPageWords({ open: true, trialDays: 0 }).note, "Free setup · no card");
  const doc = fakeDocument();
  showFrontPage(doc, words, { signupUrl: "/join/" });
  assert.equal(doc.ids.get("cta").href, "/join/");
  assert.equal(doc.ids.get("cta-long").textContent, "Start free trial");
  assert.equal(doc.ids.get("cta-short").textContent, "Start trial");
  assert.equal(doc.ids.get("start-submit").textContent, "Start free trial");
  assert.equal(doc.ids.get("start-consent").hidden, true, "no waitlist emails once the trial starts at the front door");
  assert.equal(doc.ids.get("founding-go").textContent, "See plans");
  assert.equal(doc.ids.get("founding-go").href, "/pricing");
  assert.doesNotMatch(page, /\b\d+ days free\b/, "no trial length typed into the page");
});

test("the email goes to the front door once, through session storage, never in the address", () => {
  const storage = memoryStorage();
  handOff(storage, "ada@moth.example");
  assert.equal(storage.map.get(HANDOFF_KEY), "ada@moth.example");
  assert.equal(takeHandOff(storage), "ada@moth.example");
  assert.equal(takeHandOff(storage), "", "used once");
  handOff(storage, "not an email");
  assert.equal(takeHandOff(storage), "");
  const blocked = { setItem() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.doesNotThrow(() => handOff(blocked, "ada@moth.example"));
  assert.equal(takeHandOff(blocked), "");
  assert.equal(takeHandOff(null), "");
  assert.doesNotMatch(page, /\?email=/);
  assert.match(page, /handOff\(storage, email\);\s*location\.assign\(signupUrl\)/);
  assert.match(join, /takeHandOff\(/);
});

test("the email box has a label, an error line people hear, and the bot trap", () => {
  assert.match(page, /<label class="rp-sr-only" for="start-email">Your email<\/label>/);
  assert.match(page, /<p class="error" id="start-error" role="alert" hidden><\/p>/);
  assert.match(page, /<input name="website" tabindex="-1"/);
  assert.match(page, /\^\[\^\\s@\]\+@|EMAIL\.test\(email\)/);
});

/** A selector list split on its own commas, not those inside :is(…). */
function topLevel(selector) {
  const parts = [""];
  let depth = 0;
  for (const ch of selector) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += ch;
  }
  return parts;
}

test("the front page's styles stay under .cp-front and name no colour", () => {
  const block = css.slice(css.indexOf("/* ── Front page"));
  assert.ok(block.length > 100);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  for (const rule of block.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g)) {
    const selector = rule.trim();
    if (selector.startsWith("@media")) continue;
    for (const part of topLevel(selector)) assert.match(part.trim(), /^\.cp-(front|fp-|short|long)/, part.trim());
  }
  assert.match(page, /<body class="cp cp-front">/);
});
