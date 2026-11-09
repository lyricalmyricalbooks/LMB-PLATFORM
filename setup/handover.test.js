// Setup step 20 (code plan 18.9): what a press set up at the front door is handed to its new shop, once, and the
// platform's copy of the kept file is let go.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDOVER_DOC, handoverStep, partsOf } from "./handover.js";
import { fakeFrontDoorStores, fakeStagedFiles } from "../signup/fakes.js";

const SHOP = { shopId: "moth-press-k3f9q", pressId: "press-moth" };
const PATH = "press-imports/press-moth/abc.csv";

function world({ file = "Title,Price,Stock\nMoth Zine,8,20\n", path = PATH, filesConnected = true } = {}) {
  const { presses } = fakeFrontDoorStores();
  const stagedFiles = fakeStagedFiles();
  const docs = new Map();
  const shopData = {
    get: async (_project, docPath) => structuredClone(docs.get(docPath) ?? null),
    set: async (_project, docPath, data) => { docs.set(docPath, structuredClone(data)); },
  };
  presses.create("press-moth", { pressId: "press-moth", look: "press-riso", adminLook: "paper", stagedImportPath: file === null ? "" : path, stagedImport: file === null ? null : { name: "my zines.csv", size: file.length, rows: 1, at: "2026-11-03T09:00:00.000Z" } });
  if (file !== null) stagedFiles.files.set(path, Buffer.from(file));
  const step = handoverStep({ presses, stagedFiles: filesConnected ? stagedFiles : null, shopData, now: () => new Date("2026-11-04T10:00:00Z") });
  return { presses, stagedFiles, docs, step };
}

test("the look and the kept file are handed to the shop, then the platform lets its copy go", async () => {
  const w = world();
  assert.equal(await w.step.check({ shop: SHOP }), false);
  await w.step.act({ shop: SHOP });
  assert.deepEqual(w.docs.get(HANDOVER_DOC), {
    pressId: "press-moth", look: "press-riso", adminLook: "paper", at: "2026-11-04T10:00:00.000Z",
    file: { name: "my zines.csv", rows: 1, at: "2026-11-03T09:00:00.000Z", parts: 1 },
  });
  assert.equal(w.docs.get(`${HANDOVER_DOC}/parts/0`).text, "Title,Price,Stock\nMoth Zine,8,20\n");
  assert.equal((await w.presses.get("press-moth")).stagedImportPath, "");
  assert.equal(w.stagedFiles.files.size, 0);
  assert.equal(await w.step.check({ shop: SHOP }), true);
});

test("running again changes nothing: the shop keeps its copy of the file", async () => {
  const w = world();
  await w.step.act({ shop: SHOP });
  const before = structuredClone([...w.docs]);
  await w.step.act({ shop: SHOP });
  assert.deepEqual([...w.docs], before);
});

test("a press with no kept file hands over its looks only", async () => {
  const w = world({ file: null });
  await w.step.act({ shop: SHOP });
  assert.equal(w.docs.get(HANDOVER_DOC).file, null);
  assert.equal(w.docs.get(HANDOVER_DOC).look, "press-riso");
  assert.equal(await w.step.check({ shop: SHOP }), true);
});

test("without the kept files' store, the step stops in plain words and the file stays kept for the retry", async () => {
  const w = world({ filesConnected: false });
  await assert.rejects(w.step.act({ shop: SHOP }), /store isn't connected/);
  assert.equal((await w.presses.get("press-moth")).stagedImportPath, PATH);
  assert.equal(w.stagedFiles.files.size, 1);
  assert.equal(await w.step.check({ shop: SHOP }), false);
  // A press with no kept file isn't held up by it.
  const fresh = world({ file: null, filesConnected: false });
  await fresh.step.act({ shop: SHOP });
  assert.equal(await fresh.step.check({ shop: SHOP }), true);
});

test("a stockroom on its own gets the looks, and its file stays kept for the stockroom", async () => {
  const w = world();
  const shop = { ...SHOP, plan: "stockroom" };
  await w.step.act({ shop });
  assert.equal(w.docs.get(HANDOVER_DOC).file, null);
  assert.equal((await w.presses.get("press-moth")).stagedImportPath, PATH);
  assert.equal(w.stagedFiles.files.size, 1);
  assert.equal(await w.step.check({ shop }), true);
});

test("a shop from the old sign-up page has nothing to hand over", async () => {
  const w = world();
  assert.equal(await w.step.check({ shop: { shopId: "old-shop-aaaaa" } }), true);
});

test("a big file is kept in pieces that each fit in one document, counted in bytes and cut between whole characters", () => {
  const text = "x".repeat(1_800_001);
  assert.equal(partsOf(text).length, 3);
  assert.equal(partsOf(text).join(""), text);
  assert.deepEqual(partsOf(""), [""]);
  // Cyrillic is two bytes a letter, Chinese three, an emoji four: every piece stays under the limit, none splits a character.
  const wide = "Книга,书,📚\n".repeat(150_000);
  const parts = partsOf(wide);
  assert.equal(parts.join(""), wide);
  for (const part of parts) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 900_000);
    assert.doesNotMatch(part, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  }
});
