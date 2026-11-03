// Plan 17.17: Julian's account checklist for the start is one page (docs/start-real-accounts.md), every stage in plan 17.1
// has its own line on it, the Phase 15 dates it depends on are written there, and the first-press runbook (15.10) links to
// it. Adding a stage to the build without a line here fails this test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("docs/start-real-accounts.md", import.meta.url), "utf8");
const codePlan = readFileSync(new URL("docs/code-plan.md", import.meta.url), "utf8");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every stage in plan 17.1, by the name the page uses and the plan row it is built under.
const STAGES = [
  { name: "Sign-up", plan: "6.2" },
  { name: "Your press", plan: "17.2" },
  { name: "Bring your shop", plan: "17.3" },
  { name: "Sample import", plan: "17.5" },
  { name: "The look", plan: "17.8" },
  { name: "Google", plan: "17.9" },
  { name: "Get paid", plan: "17.10" },
  { name: "Shipping and your address", plan: "17.11" },
  { name: "Your stockroom", plan: "17.12" },
  { name: "Final check and open", plan: "17.13" },
];

test("every stage in plan 17.1 has its own line on the account checklist, with the plan row it is built under", () => {
  for (const { name, plan } of STAGES) {
    const line = new RegExp(`^- \\*\\*${escape(name)}\\*\\* \\(plan ${escape(plan)}\\b`, "m");
    assert.match(page, line, `"${name}" (plan ${plan}) has no line on docs/start-real-accounts.md`);
  }
});

test("the page gives the Phase 15 dates it depends on: Stripe's platform profile, Google's review and the lawyer's answer", () => {
  assert.match(page, /13 November 2026/);
  assert.match(page, /1 December 2026/);
  assert.match(page, /15\.22/);
  assert.match(page, /docs\/google-verification\.md/);
});

test("the first-press runbook (plan 15.10) links to this page", () => {
  const row = codePlan.split("\n").find((line) => line.startsWith("| 15.10 "));
  assert.ok(row, "plan 15.10 is in docs/code-plan.md");
  assert.ok(row.includes("docs/start-real-accounts.md"), "plan 15.10 links to the account checklist");
});
