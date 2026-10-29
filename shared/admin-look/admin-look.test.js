import { test } from "node:test";
import assert from "node:assert/strict";
import { stale, COPIES } from "./sync.mjs";

test("both apps' copies of the admin look match the shared source", () => {
  assert.deepEqual(stale(), [], "run: node shared/admin-look/sync.mjs");
});

test("the shop and the stockroom each get every shared file", () => {
  for (const { to } of COPIES) {
    assert.ok(to.some((t) => t.startsWith("apps/shop/")));
    assert.ok(to.some((t) => t.startsWith("apps/stockroom/")));
  }
});
