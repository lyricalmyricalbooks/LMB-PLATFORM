// docs/accounting.md (code plan 7.14): every QuickBooks word it uses is explained under its "Words" heading, and every
// QuickBooks entity the service writes or reads is named there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENTITY_NAMES } from "./endpoints.js";

const doc = readFileSync(new URL("../../docs/accounting.md", import.meta.url), "utf8");
const [body, rest = ""] = doc.split(/^## Words$/m);
const words = rest.split(/^## /m)[0];
const glossed = [...words.matchAll(/^- \*\*([^*]+)\*\*(?: \(`([^`]+)`\))?:/gm)];
const terms = new Set(glossed.map((m) => m[1].toLowerCase()));
const entities = new Set(glossed.map((m) => m[2]).filter(Boolean));

// QuickBooks's own words that a press or a reader would have to look up.
const QUICKBOOKS_WORDS = [
  "access token", "account", "assessment questionnaire", "builder", "chart of accounts", "company id", "core", "coreplus",
  "deposit", "expense", "intuit app marketplace", "item", "minor version", "reconnect url", "refresh token",
  "refund receipt", "sales receipt", "sandbox", "silver", "tax code", "undeposited funds",
];

test("the doc has a Words list", () => {
  assert.ok(glossed.length >= 10, `found ${glossed.length} words`);
});

for (const word of QUICKBOOKS_WORDS) {
  test(`"${word}" is explained if the doc uses it`, () => {
    const used = new RegExp(`\\b${word.replace(/ /g, "\\s+")}s?\\b`, "i").test(body);
    if (used) assert.ok(terms.has(word), `"${word}" is used but not under Words`);
  });
}

test("every entity the service uses is named under Words, except the company's own details", () => {
  for (const name of Object.values(ENTITY_NAMES).filter((n) => n !== "CompanyInfo")) {
    assert.ok(entities.has(name), `${name} is not under Words`);
  }
  assert.ok(entities.has("TaxCode"));
});
