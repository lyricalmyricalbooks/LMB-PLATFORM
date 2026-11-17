import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PER_RUN, drawnShops, refreshShopPages, stalePages, timeKey } from "./pageRefresh.js";
import { refreshSummary } from "./run-page-refresh.js";

const row = (shopId, extra = {}) => ({ shopId, shared: true, status: "live", projectId: "lmb-test-shop", release: { version: "1.2.40-gabc1234" }, ...extra });

test("Firestore times compare at full precision, whatever their number of fraction digits", () => {
  assert.equal(timeKey("2026-11-17T01:02:03Z"), "2026-11-17T01:02:03.000000000");
  assert.equal(timeKey("2026-11-17T01:02:03.5Z"), "2026-11-17T01:02:03.500000000");
  assert.ok(timeKey("2026-11-17T01:02:03.000000002Z") > timeKey("2026-11-17T01:02:03.000000001Z"));
  assert.ok(timeKey("2026-11-17T01:02:03.1Z") > timeKey("2026-11-17T01:02:03.099999999Z"));
  for (const bad of [null, "", "yesterday", "2026-11-17T01:02:03+01:00", "2026-11-17T01:02:03.1234567890Z"]) assert.equal(timeKey(bad), null);
});

test("only live shared shops in the named projects are drawn, never one being deleted", () => {
  const rows = [
    row("b"), row("a"), row("other", { projectId: "demo-elsewhere" }), row("own", { shared: false }),
    row("paused", { status: "paused" }), row("gone", { closing: { stage: "deleted" } }), null,
  ];
  assert.deepEqual(drawnShops(rows, ["lmb-test-shop"]).map((r) => r.shopId), ["a", "b"]);
});

test("a shop is drawn again only when its catalogue changed after its file's snapshot", async () => {
  const at = (marker, labels) => stalePages(row("a"), { readMarker: async () => marker, readLabels: async () => labels });
  assert.equal(await at(null, null), null, "a shop that never changed its catalogue has nothing new to draw");
  assert.equal(await at("2026-11-17T01:00:00.5Z", { readTime: "2026-11-17T01:00:00.400000Z" }), "its catalogue changed since its pages were drawn");
  assert.equal(await at("2026-11-17T01:00:00.4Z", { readTime: "2026-11-17T01:00:00.400000Z" }), null, "a change in the snapshot itself is already in the file");
  assert.equal(await at("2026-11-17T01:00:00Z", { readTime: "2026-11-17T02:00:00Z" }), null);
  assert.equal(await at("2026-11-17T01:00:00Z", null), "it has no catalogue file yet");
  assert.equal(await at("2026-11-17T01:00:00Z", {}), "its catalogue file doesn't say when it was drawn", "a file drawn before the label was added is drawn once more");
});

function world({ rows, markers = {}, labels = {}, fail = [] }) {
  const published = [];
  return {
    published,
    args: {
      registry: { listShops: async () => rows },
      projectIds: ["lmb-test-shop"],
      readMarker: async (r) => markers[r.shopId] ?? null,
      readLabels: async (r) => labels[r.shopId] ?? null,
      publishShop: async (r, version) => {
        if (fail.includes(r.shopId)) throw new Error("the build stopped");
        published.push(`${r.shopId}@${version}`);
      },
    },
  };
}

test("the run draws the changed shops with the version each runs, and leaves the rest alone", async () => {
  const w = world({
    rows: [row("changed"), row("same"), row("new-shop"), row("never-released", { release: undefined }), row("failing")],
    markers: { changed: "2026-11-17T02:00:00Z", same: "2026-11-17T01:00:00Z", "never-released": "2026-11-17T02:00:00Z", failing: "2026-11-17T02:00:00Z" },
    labels: { changed: { readTime: "2026-11-17T01:00:00Z" }, same: { readTime: "2026-11-17T01:30:00Z" }, failing: { readTime: "2026-11-17T01:00:00Z" } },
    fail: ["failing"],
  });
  const result = await refreshShopPages(w.args);
  assert.deepEqual(w.published, ["changed@1.2.40-gabc1234"]);
  assert.deepEqual(result.drawn, ["changed"]);
  assert.deepEqual(result.stale.map((s) => s.shopId), ["changed", "failing"]);
  assert.deepEqual(result.failed, [{ shopId: "failing", error: "the build stopped" }], "a failing shop keeps its last good pages and doesn't stop the others");
  assert.equal(result.checked, 5);
});

test("a list-only run changes nothing, and a big run leaves the rest for next time", async () => {
  const rows = Array.from({ length: MAX_PER_RUN + 2 }, (_, i) => row(`s${String(i).padStart(2, "0")}`));
  const markers = Object.fromEntries(rows.map((r) => [r.shopId, "2026-11-17T02:00:00Z"]));
  const listed = world({ rows, markers });
  const list = await refreshShopPages({ ...listed.args, listOnly: true });
  assert.equal(listed.published.length, 0);
  assert.equal(list.stale.length, MAX_PER_RUN + 2);
  const drawn = world({ rows, markers });
  const result = await refreshShopPages(drawn.args);
  assert.equal(drawn.published.length, MAX_PER_RUN);
  assert.deepEqual(result.later, ["s25", "s26"]);
});

test("a shop that can't be checked is listed and the others still run", async () => {
  const w = world({ rows: [row("a"), row("b")], markers: { b: "2026-11-17T02:00:00Z" } });
  w.args.readMarker = async (r) => { if (r.shopId === "a") throw new Error("database busy"); return "2026-11-17T02:00:00Z"; };
  const result = await refreshShopPages(w.args);
  assert.deepEqual(result.drawn, ["b"]);
  assert.match(result.failed[0].error, /couldn't check it: database busy/);
});

test("the run's summary is plain words", () => {
  assert.match(refreshSummary({ checked: 3, stale: [], drawn: [], failed: [], later: [] }), /No shop changed its catalogue/);
  const text = refreshSummary({ checked: 3, stale: [{ shopId: "a" }], drawn: ["a"], failed: [{ shopId: "b", error: "the build stopped" }], later: [] });
  assert.match(text, /Drawn again: a\./);
  assert.match(text, /b keeps its last good pages: the build stopped/);
});
