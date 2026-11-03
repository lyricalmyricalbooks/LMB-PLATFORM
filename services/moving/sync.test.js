import { test } from "node:test";
import assert from "node:assert/strict";
import { stale } from "./sync.mjs";

test("the shop's server has the same old-shop reader as the platform", () => {
  assert.deepEqual(stale(), [], "run: node services/moving/sync.mjs");
});
