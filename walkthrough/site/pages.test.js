// The repository's GitHub Pages address only sends people to the real app (owner, 9 November 2026): no walkthrough
// pictures are published any more, and the workflow never holds a key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../../.github/workflows/pages-to-app.yml", import.meta.url), "utf8");

test("GitHub Pages publishes only the page that goes to the live app", () => {
  assert.ok(!existsSync(new URL("../../.github/workflows/walkthrough-site.yml", import.meta.url)), "the walkthrough is no longer published");
  assert.doesNotMatch(workflow, /walkthrough\/site\/build\.js/);
  assert.match(workflow, /url=https:\/\/lmb-platform-prod\.web\.app\//);
  assert.match(workflow, /upload-pages-artifact@[0-9a-f]{40} # v3[.\d]*\s+with:\s+path: pages/);
});

test("the Pages workflow uses no secrets and never runs for a pull request", () => {
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /pull_request/);
});
