import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safetyHeaders } from "./headers.js";

// Each hosting file against the shared list. A rule applies to a page when its glob is "**" or its regex matches.
const FILES = [
  { file: "apps/shop/firebase.json", options: { camera: false, policy: false } },
  { file: "apps/stockroom/firebase.json", options: { camera: true } },
  { file: "waitlist/firebase.json", options: { framing: "DENY" } },
  { file: "status/firebase.json", options: { framing: "DENY" } },
];

const headersFor = (hosting, path) => hosting.headers
  .filter((rule) => rule.source === "**" || (rule.regex && new RegExp(rule.regex).test(path)))
  .flatMap((rule) => rule.headers);

test("every hosting file sends the safety headers on every page", () => {
  for (const { file, options } of FILES) {
    const { hosting } = JSON.parse(readFileSync(file, "utf8"));
    for (const path of ["/", "/admin", "/books/a-book", "/assets/x.js"]) {
      const sent = headersFor(hosting, path);
      for (const { key, value } of safetyHeaders(options)) {
        const got = sent.filter((h) => h.key === key).map((h) => h.value);
        assert.ok(got.includes(value), `${file} ${path}: ${key} should be "${value}", got ${JSON.stringify(got)}`);
      }
    }
  }
});

test("the shop sends no content policy, because Studio's custom code, embeds and Stripe would break", () => {
  const { hosting } = JSON.parse(readFileSync("apps/shop/firebase.json", "utf8"));
  assert.equal(headersFor(hosting, "/").some((h) => h.key === "Content-Security-Policy"), false);
});

test("the policy never blocks scripts, styles, images, fonts or payments", () => {
  const policy = safetyHeaders()[4].value;
  assert.doesNotMatch(policy, /default-src|script-src|style-src|img-src|font-src|connect-src|frame-src|form-action/);
  assert.doesNotMatch(safetyHeaders()[5].value, /payment/);
});

test("the security contact file is shipped and still current", () => {
  const text = readFileSync("waitlist/.well-known/security.txt", "utf8");
  assert.match(text, /^Contact: mailto:\S+@\S+$/m);
  const expires = /^Expires: (\S+)$/m.exec(text)?.[1];
  assert.ok(Date.parse(expires) > Date.now() + 30 * 86400000, "security.txt expires within 30 days: renew it");
  const { hosting } = JSON.parse(readFileSync("waitlist/firebase.json", "utf8"));
  assert.ok(!hosting.ignore.some((pattern) => /^\*\*\/\.\*$/.test(pattern)), "the ignore list must let .well-known through");
  assert.ok(hosting.ignore.some((pattern) => pattern.startsWith("**/.[!w]")), "other dot files stay out");
});
