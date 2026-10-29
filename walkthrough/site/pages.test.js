// The walkthrough web site's workflow may publish only what build.js wrote, and never holds a key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../../.github/workflows/walkthrough-site.yml", import.meta.url), "utf8");

test("the site workflow publishes only the folder build.js wrote", () => {
  assert.match(workflow, /node walkthrough\/site\/build\.js site/);
  assert.match(workflow, /upload-pages-artifact@v3\s+with:\s+path: site/);
});

test("the site workflow uses no secrets and deploys only off pull requests", () => {
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
});
