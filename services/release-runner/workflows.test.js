// The update workflows' safeguards (docs/updating.md), read from the workflow files themselves: a merge only ever
// reaches the test shop, real shops only ever get an update a person started, and nothing needs a hand-made tag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");
const triggers = (text) => text.slice(text.indexOf("\non:"), text.indexOf("\npermissions:"));

test("a merge sends itself to the test shop alone, under a version that names its commit", () => {
  const text = read("update-test-shop.yml");
  assert.match(triggers(text), /push:\n\s+branches: \[main\]/);
  assert.match(text, /run-shared\.js "1\.2\.\$RUN_NUMBER-g\$\{GITHUB_SHA:0:12\}" --test-shop-only --wait-for-lock/);
  assert.doesNotMatch(text, /SHARED_SHOPS_PROJECT/, "the live shared project is never named here");
  assert.doesNotMatch(text, /git tag/);
  assert.match(text, /fetch-depth: 0/, "the version before can be built to go back");
});

test("real shops get an update only from a person pressing Run workflow, test shop first", () => {
  const text = read("send-to-shops.yml");
  assert.doesNotMatch(triggers(text), /push:|schedule:|pull_request/);
  assert.match(triggers(text), /workflow_dispatch:/);
  assert.match(text, /run-shared\.js "\$\{version:-current\}" --wait-for-lock/);
  assert.doesNotMatch(text, /--test-shop-only/, "a real-shop release never keeps a version that failed its check");
});

test("the shared-system workflow keeps only its rare jobs, and only by hand", () => {
  const text = read("shared-system.yml");
  assert.doesNotMatch(triggers(text), /push:/);
  assert.doesNotMatch(text, /run-shared\.js/);
});
