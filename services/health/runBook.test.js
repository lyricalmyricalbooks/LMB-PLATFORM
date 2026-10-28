// The run book (docs/run-book.md, code plan 5.14) explains every alert the health checks can send, and points only at
// files and control-room calls that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { CONFIRM_RUNS } from "./runner.js";
import { checksFor } from "./checks.js";

const root = new URL("../../", import.meta.url);
const book = readFileSync(new URL("docs/run-book.md", root), "utf8");
const here = new URL("./", import.meta.url);

/** Every check name that can go into a health alert: the five-minute checks and any `check: "<name>"` in this folder. */
function alertNames() {
  const names = new Set([...Object.keys(CONFIRM_RUNS), ...checksFor({ shopId: "s", plan: "both", payments: { accountId: "acct_1" } })]);
  for (const file of readdirSync(here).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))) {
    for (const match of readFileSync(new URL(file, here), "utf8").matchAll(/\bcheck:\s*"([a-z-]+)"/g)) names.add(match[1]);
  }
  return [...names].sort();
}

const sectionOf = (name) => {
  const start = book.indexOf(`\n### ${name}\n`);
  if (start < 0) return null;
  const next = book.slice(start + 1).search(/\n#{2,3} /);
  return next < 0 ? book.slice(start) : book.slice(start, start + 1 + next);
};

test("every health alert has its own section saying what it means and what to do", () => {
  const names = alertNames();
  assert.deepEqual(names, ["backup", "checkout", "pages", "spending", "webhook"]);
  for (const name of names) {
    const section = sectionOf(name);
    assert.ok(section, `docs/run-book.md has no "### ${name}" section`);
    assert.match(section, /\*\*What it means:\*\*/, `${name}: says what it means`);
    assert.match(section, /\*\*What to do:\*\*/, `${name}: says what to do`);
  }
  // The alert template knows each one too, so no alert goes out unexplained.
  const templates = readFileSync(new URL("services/email/templates.js", root), "utf8");
  for (const name of names) assert.match(templates, new RegExp(`\\b${name}:\\s*"`), `the health-alert template words ${name}`);
});

test("the run book covers pausing a shop, refunding a fee, restoring a backup and stopping a release", () => {
  for (const heading of ["When an alert email comes", "Pause a shop", "Refund a press's platform fee", "Restore a backup", "Stop a release"]) {
    assert.ok(book.includes(`\n## ${heading}\n`), `missing "## ${heading}"`);
  }
});

test("every file and control-room call the run book names exists", () => {
  const paths = [...book.matchAll(/`([a-z][\w./-]*\/[\w.-]*)`/g)].map((m) => m[1]).filter((p) => !p.startsWith("backups/") && !p.startsWith("emergencyLog/") && !p.startsWith("/api/"));
  assert.ok(paths.length >= 8, `found ${paths.length}`);
  for (const path of paths) assert.ok(existsSync(new URL(path, root)), `${path} doesn't exist`);

  const routes = readdirSync(new URL("control-room/", root)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(`control-room/${f}`, root), "utf8")).join("\n");
  const calls = [...book.matchAll(/`POST (\/api\/[\w/-]+)`/g)].map((m) => m[1]);
  assert.ok(calls.length >= 4, `found ${calls.length}`);
  for (const call of calls) assert.ok(routes.includes(`"POST ${call}"`), `no control-room route POST ${call}`);
  for (const name of ["rollBackShop", "RELEASE_HOLD_BACK"]) assert.ok(book.includes(name));
  assert.match(readFileSync(new URL("services/release-runner/runner.js", root), "utf8"), /export async function rollBackShop/);
  assert.match(readFileSync(new URL("services/release-runner/run.js", root), "utf8"), /RELEASE_HOLD_BACK/);
});
