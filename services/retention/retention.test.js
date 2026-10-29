import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BATCH, KEEP, NEVER, runRetention } from "./retention.js";

const DAY = 864e5;
const NOW = new Date("2028-06-01T12:00:00Z");
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

/** A pretend Firestore: collections of { path, data } with the three calls the job uses. */
function fakeFirestore(collections) {
  const store = new Map(Object.entries(collections).map(([name, rows]) => [name, rows.map((data, i) => ({ path: `${name}/d${i}`, data }))]));
  return {
    store, written: {}, failing: new Set(),
    async query(collection, { where, limit }) {
      if (this.failing.has(collection)) throw new Error("index missing");
      const [[field, op, value]] = where;
      assert.equal(op, "<");
      return (store.get(collection) ?? []).filter((r) => r.data[field] < value).sort((a, b) => (a.data[field] < b.data[field] ? -1 : 1)).slice(0, limit);
    },
    async remove(path) {
      const collection = path.split("/").slice(0, -1).join("/");
      const rows = store.get(collection) ?? [];
      const at = rows.findIndex((r) => r.path === path);
      if (at < 0) return false;
      rows.splice(at, 1);
      return true;
    },
    async set(path, data) { this.written[path] = data; },
  };
}
const registry = { listShops: async () => [{ shopId: "moth-press" }, { shopId: "owl-books" }] };

test("each record is kept for its time and deleted after it", async () => {
  const fs = fakeFirestore({
    controlActivity: [{ at: iso(100) }, { at: iso(364) }, { at: iso(366) }],
    recoveries: [{ askedAt: iso(729) }, { askedAt: iso(731) }],
    "shops/moth-press/events": [{ at: iso(10) }, { at: iso(800) }],
    "shops/owl-books/events": [{ at: iso(900) }],
    "shops/moth-press/steps": [{ recordedAt: iso(731) }],
  });
  const result = await runRetention({ firestore: fs, registry, now: () => NOW });
  assert.deepEqual(result.removed, { "control room activity": 1, "account recovery requests": 1, "shop history": 2, "setup step history": 1 });
  assert.equal(fs.store.get("controlActivity").length, 2);
  assert.equal(fs.store.get("shops/moth-press/events").length, 1);
  assert.deepEqual(fs.written["platformState/retention"], { at: NOW.toISOString(), removed: result.removed, ok: true });
});

test("a re-run removes nothing more, and a big backlog goes one batch a night", async () => {
  const fs = fakeFirestore({ controlActivity: Array.from({ length: BATCH + 5 }, () => ({ at: iso(400) })) });
  const first = await runRetention({ firestore: fs, registry, now: () => NOW });
  assert.equal(first.removed["control room activity"], BATCH);
  assert.equal((await runRetention({ firestore: fs, registry, now: () => NOW })).removed["control room activity"], 5);
  assert.equal((await runRetention({ firestore: fs, registry, now: () => NOW })).removed["control room activity"], 0);
});

test("one place failing is reported and the others still run", async () => {
  const fs = fakeFirestore({ controlActivity: [{ at: iso(400) }], recoveries: [{ askedAt: iso(800) }] });
  fs.failing.add("controlActivity");
  const lines = [];
  const result = await runRetention({ firestore: fs, registry, now: () => NOW, print: (l) => lines.push(l) });
  assert.equal(result.ok, false);
  assert.equal(result.removed["account recovery requests"], 1);
  assert.match(result.problems[0], /controlActivity: index missing/);
  assert.equal(fs.written["platformState/retention"].ok, false);
});

test("no rule touches orders, customers, billing or tax records, and every keep-time is written down", () => {
  for (const rule of KEEP) {
    const place = rule.collection ?? rule.perShop;
    assert.ok(!NEVER.includes(place.split("/")[0]), `${rule.name} names ${place}`);
    assert.ok(rule.days >= 365, `${rule.name} keeps less than a year`);
  }
  const doc = readFileSync(new URL("../../docs/keep-times.md", import.meta.url), "utf8");
  for (const rule of KEEP) assert.ok(doc.toLowerCase().includes(rule.name.toLowerCase()), `docs/keep-times.md doesn't mention "${rule.name}"`);
  for (const word of ["Orders", "30 days", "two years", "six years", "closing"]) assert.ok(doc.includes(word), `docs/keep-times.md misses "${word}"`);
});
