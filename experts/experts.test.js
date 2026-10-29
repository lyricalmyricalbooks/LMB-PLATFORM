// The experts directory (plan 12.13): the list's rules, the page's markup, and that nothing here takes a booking or
// a payment. The people in these tests are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS, EXPERTS, APPLY_URL, problemsWith, expertsFor } from "./directory.js";
import { renderExperts, renderKindOptions, renderApply, EXPERT_NOTE } from "./page.js";

const maria = { id: "maria-photos", name: "Maria Example", kinds: ["photos"], about: "Product photos on a plain white background, shot in her studio.", where: "Toronto", link: "https://maria.example/hire", listedOn: "2026-10-29" };
const studio = { id: "north-studio", name: "North Studio", kinds: ["design", "writing"], about: "Logos, colours and the words on your shop's pages.", where: "Anywhere", link: "https://north.example/", listedOn: "2026-10-29" };
const list = [maria, studio];

test("the real list is valid, and each person is listed once", () => {
  for (const entry of EXPERTS) assert.deepEqual(problemsWith(entry), [], entry.id);
  assert.equal(new Set(EXPERTS.map((e) => e.id)).size, EXPERTS.length);
});

test("an entry needs an id, a name, a kind, a short note, a place, an https link and a date", () => {
  assert.deepEqual(problemsWith(maria), []);
  assert.equal(problemsWith({ ...maria, id: "Maria!" }).length, 1);
  assert.equal(problemsWith({ ...maria, name: " " }).length, 1);
  assert.equal(problemsWith({ ...maria, kinds: [] }).length, 1);
  assert.equal(problemsWith({ ...maria, kinds: ["magic"] }).length, 1);
  assert.equal(problemsWith({ ...maria, about: "x".repeat(301) }).length, 1);
  assert.equal(problemsWith({ ...maria, link: "http://maria.example" }).length, 1);
  assert.equal(problemsWith({ ...maria, link: "javascript:alert(1)" }).length, 1);
  assert.equal(problemsWith({ ...maria, listedOn: "yesterday" }).length, 1);
});

test("filtering by kind and by every search word; an invalid entry is never shown", () => {
  assert.deepEqual(expertsFor({ list }).map((e) => e.id), ["maria-photos", "north-studio"]);
  assert.deepEqual(expertsFor({ list, kind: "writing" }).map((e) => e.id), ["north-studio"]);
  assert.deepEqual(expertsFor({ list, search: "white toronto" }).map((e) => e.id), ["maria-photos"]);
  assert.deepEqual(expertsFor({ list, search: "toronto logos" }), []);
  assert.deepEqual(expertsFor({ list: [{ ...maria, link: "http://bad.example" }] }), []);
});

test("the page shows each person with a safe link, and escapes what it prints", () => {
  const html = renderExperts({ list: [{ ...maria, name: "<b>Maria</b> & Co" }] });
  assert.match(html, /&lt;b&gt;Maria&lt;\/b&gt; &amp; Co/);
  assert.doesNotMatch(html, /<b>Maria/);
  assert.match(html, /href="https:\/\/maria\.example\/hire" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Photos and product images/);
});

test("an empty list, and a search with no match, each say what to do", () => {
  assert.match(renderExperts({ list: [] }), /No one is listed yet/);
  assert.match(renderExperts({ list, search: "zzz" }), /Try fewer words/);
});

test("the filter lists every kind and selects the chosen one", () => {
  const html = renderKindOptions("photos");
  for (const label of Object.values(KINDS)) assert.ok(html.includes(label), label);
  assert.match(html, /<option value="photos" selected>/);
});

test("how to apply: a link when Julian has set one, otherwise a plain note", () => {
  assert.match(renderApply(""), /Listings open soon/);
  assert.match(renderApply("https://example.com/apply"), /href="https:\/\/example\.com\/apply"/);
  assert.equal(typeof APPLY_URL, "string");
});

test("no booking, no payment and no fee on the page, and no rival named", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<form\b|type="submit"|<textarea|checkout|\bpay now\b|\bbook now\b/i);
  const shown = [EXPERT_NOTE, renderExperts({ list }), renderApply()].join(" ");
  assert.doesNotMatch(shown, /\b(big ?cartel|shopify|squarespace|etsy|wix|woocommerce)\b/i);
  assert.match(EXPERT_NOTE, /no fee/);
  assert.match(EXPERT_NOTE, /does not handle the payment/);
});
