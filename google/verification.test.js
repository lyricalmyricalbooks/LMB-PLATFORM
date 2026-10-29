// The permission list Google reviews (code plan 15.3): docs/google-verification.md and the code say the same thing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LATER_PARTS, LAUNCH_PARTS, RESTRICTED_SCOPES, SCOPES } from "./endpoints.js";

const doc = readFileSync(new URL("../docs/google-verification.md", import.meta.url), "utf8");
const rows = doc.split("\n").filter((l) => /^\| `/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
const rowFor = (scope) => rows.find((r) => r[0].includes(`\`${scope}\``) || (scope === "openid" && r[0].includes("`openid`")));

test("every permission the code asks for has a row with a round and a written reason", () => {
  for (const [part, scopes] of Object.entries(SCOPES)) {
    for (const scope of scopes) {
      const row = rowFor(scope);
      assert.ok(row, `${scope} (${part}) has no row in docs/google-verification.md`);
      assert.ok(row[2].length > 10, `${scope}: say why it is needed`);
      assert.ok(row[3].length > 10, `${scope}: say why nothing narrower works`);
      const round = LAUNCH_PARTS.includes(part) ? "launch" : "later";
      assert.ok(row[1].startsWith(round), `${scope} is in the ${round} round in the code, not "${row[1]}" in the document`);
    }
  }
});

test("every row in the document is a permission the code asks for, and every part is in exactly one round", () => {
  const asked = Object.values(SCOPES).flat();
  for (const row of rows) {
    const named = [...row[0].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const scope of named) assert.ok(asked.includes(scope), `${scope} is in the document but not in SCOPES`);
  }
  assert.deepEqual([...LAUNCH_PARTS, ...LATER_PARTS].sort(), Object.keys(SCOPES).sort());
});

test("no permission Google calls restricted is ever asked for", () => {
  const asked = Object.values(SCOPES).flat();
  for (const scope of RESTRICTED_SCOPES) assert.ok(!asked.includes(scope), `${scope} is restricted: it needs a yearly outside security assessment`);
  // The check itself catches a planted one.
  assert.ok([...asked, "https://www.googleapis.com/auth/gmail.readonly"].some((s) => RESTRICTED_SCOPES.includes(s)));
});

test("the document says nothing about a yearly review for sending", () => {
  assert.doesNotMatch(doc.replace(/\(a restricted permission[^)]*\)/g, ""), /yearly security review of (the )?send/i);
});
