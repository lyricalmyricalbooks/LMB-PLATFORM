// Press-facing words about money (code plan 15.22): Colophon never holds a press's money or sees a card number (each sale
// is a direct charge on the press's own payments account, docs/decisions.md 2026-10-29), so no customer-facing text may
// say Colophon "processes payments" until the lawyer's answer on payment service provider registration says that's safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  "terms/terms.js", "terms/index.html", "help/articles.js", "help/support.js", "help/index.html", "waitlist/index.html",
  "waitlist/pricing.js", "signup/index.html", "signup/app.js", "signup/signup.js", "services/email/templates.js", "services/billing/paymentWay.js",
];
const read = (path) => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");

test("no press-facing text says Colophon processes payments", () => {
  for (const file of FILES) {
    const text = read(file).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(text, /\bprocess(?:es|ing)?\s+(?:your\s+|their\s+|customers?['’]?s?\s+|card\s+|online\s+)?payments?\b/i, `${file} says Colophon processes payments`);
  }
});

test("the help says Colophon never holds the money or sees a card number, and the decision is on record", () => {
  assert.match(read("help/articles.js"), /never holds your money and never sees a card number/);
  const decisions = read("docs/decisions.md");
  assert.match(decisions, /payment service provider/);
  assert.match(decisions, /direct charge on the press's own payments account/);
});
