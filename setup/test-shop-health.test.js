import assert from "node:assert/strict";
import { test } from "node:test";
import { healthLines } from "./test-shop-health.js";

test("the test shop report names each failing check with its cause, and the newest backup attempts", () => {
  assert.deepEqual(healthLines("test-press", null), ["test-press: no health check has run yet."]);
  assert.deepEqual(healthLines("test-press", { health: { checkedAt: "T", checks: { pages: { ok: true } } } }), ["test-press, checked T: every check passes."]);
  const lines = healthLines("test-press", { health: { checkedAt: "T", checks: { pages: { ok: true }, backup: { ok: false, detail: "the stockroom has no backup yet" } } } }, [
    { kind: "backup", database: "stockroom", at: "A", ok: false, error: "no bucket" },
    { kind: "payments", at: "B" },
    { kind: "backup", database: "(default)", at: "C", ok: true },
  ]);
  assert.deepEqual(lines, [
    "test-press, checked T: backup: the stockroom has no backup yet",
    "  backup of stockroom at A: failed: no bucket",
    "  backup of (default) at C: done",
  ]);
});
