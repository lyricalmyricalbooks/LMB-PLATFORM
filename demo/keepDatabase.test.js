// Plan 5.0e: the demo keeps the stockroom's own Firestore database between runs (keepDatabase.js), proven against the
// pretend emulator. The real emulators are proven by the `demo-keeps-stockroom` CI job (keep-check.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeEmulators } from "./fakeEmulators.js";
import { dumpDatabase, keepDatabase, readSaved, restoreDatabase } from "./keepDatabase.js";
import { DEMO_PROJECT, PORTS, STOCKROOM_DATABASE, url } from "./config.js";

const base = url(PORTS.firestore);
const where = { base, projectId: DEMO_PROJECT, database: STOCKROOM_DATABASE };
const key = (path, database = STOCKROOM_DATABASE) => `${database}/documents/${path}`;
const str = (value) => ({ stringValue: value });

function stocked() {
  const emulators = fakeEmulators();
  emulators.docs.set(key("settings/catalog"), { data: str('{"bk":{}}'), ts: { integerValue: "5" } });
  // books/bk itself doesn't exist: only its subcollection does, as the stockroom writes it.
  emulators.docs.set(key("books/bk/data/metadata"), { data: str("{}") });
  for (let i = 0; i < 320; i++) emulators.docs.set(key(`many/d${String(i).padStart(3, "0")}`), { i: { integerValue: String(i) } });
  emulators.docs.set("(default)/documents/books/shop-book", { title: str("not the stockroom's") });
  return emulators;
}

const folder = () => mkdtempSync(join(tmpdir(), "keep-db-"));

test("a dump reads every document of the stockroom's database, across pages and below missing parents", async () => {
  const { fetch } = stocked();
  const docs = await dumpDatabase({ fetch, ...where });
  assert.equal(docs.length, 322);
  assert.deepEqual(docs.filter(({ path }) => !path.startsWith("many/")).map(({ path }) => path), ["books/bk/data/metadata", "settings/catalog"]);
  assert.ok(!docs.some(({ path }) => path === "books/bk"), "a parent that only holds a subcollection is not a document");
  assert.ok(!docs.some(({ path }) => path.includes("shop-book")), "the shop's database is not read");
});

test("a restore writes every document back, fields exactly as they were", async () => {
  const before = stocked();
  const docs = await dumpDatabase({ fetch: before.fetch, ...where });
  const after = fakeEmulators();
  assert.equal(await restoreDatabase({ fetch: after.fetch, ...where, documents: docs }), docs.length);
  const commits = after.requests.filter(({ url: u }) => u.endsWith(":commit"));
  assert.equal(commits.length, 1, "322 writes fit one commit");
  for (const { body } of commits) assert.ok(JSON.parse(body).writes.length <= 500);
  assert.deepEqual(await dumpDatabase({ fetch: after.fetch, ...where }), docs);
  assert.deepEqual(after.docs.get(key("settings/catalog")), { data: str('{"bk":{}}'), ts: { integerValue: "5" } });
});

test("a change made while the demo runs survives a stop and a fresh start", async () => {
  const file = join(folder(), "stockroom-data.json");
  const first = stocked();
  const keeper = keepDatabase({ fetch: first.fetch, ...where, file });
  assert.equal(await keeper.restore(), 0, "nothing saved yet");
  first.docs.set(key("books/bk/data/metadata"), { data: str('{"onHand":4}') });
  assert.equal(await keeper.save(), true);

  // Next run: the emulators start empty (their export left the stockroom out).
  const second = fakeEmulators();
  const again = keepDatabase({ fetch: second.fetch, ...where, file });
  assert.equal(await again.restore(), 322);
  assert.deepEqual(second.docs.get(key("books/bk/data/metadata")), { data: str('{"onHand":4}') });
});

test("a save that can't read the emulators keeps the last good copy", async () => {
  const file = join(folder(), "stockroom-data.json");
  const { fetch } = stocked();
  let down = false;
  const flaky = (target, init) => (down ? Promise.reject(new Error("connection refused")) : fetch(target, init));
  const keeper = keepDatabase({ fetch: flaky, ...where, file });
  assert.equal(await keeper.save(), true);
  const good = readFileSync(file, "utf8");
  down = true;
  assert.equal(await keeper.save(), false);
  assert.equal(readFileSync(file, "utf8"), good);
  assert.ok(!existsSync(`${file}.saving`));
});

test("saves run one after another, never overlapping", async () => {
  const file = join(folder(), "stockroom-data.json");
  const { fetch } = stocked();
  let reading = 0;
  let most = 0;
  const counted = async (target, init) => {
    reading += 1;
    most = Math.max(most, reading);
    try {
      return await fetch(target, init);
    } finally {
      reading -= 1;
    }
  };
  const keeper = keepDatabase({ fetch: counted, ...where, file });
  assert.deepEqual(await Promise.all([keeper.save(), keeper.save(), keeper.save()]), [true, true, true]);
  assert.equal(most, 1);
});

test("an unreadable or another database's copy is not restored", async () => {
  const dir = folder();
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{ not json");
  assert.equal(readSaved(broken), null);
  assert.equal(readSaved(join(dir, "missing.json")), null);
  const other = join(dir, "other.json");
  writeFileSync(other, JSON.stringify({ database: "elsewhere", documents: [{ path: "a/b", fields: {} }] }));
  const empty = fakeEmulators();
  assert.equal(await keepDatabase({ fetch: empty.fetch, ...where, file: other }).restore(), 0);
  assert.equal(empty.docs.size, 0);
});

test("run.js restores before seeding, saves at Ctrl+C before stopping the emulators, and --fresh forgets the copy", () => {
  const run = readFileSync(new URL("./run.js", import.meta.url), "utf8");
  const main = run.slice(run.indexOf("async function main()"));
  assert.ok(main.indexOf("keeper.restore()") > 0 && main.indexOf("keeper.restore()") < main.indexOf("seedDemo("));
  assert.match(main, /rmSync\(STOCKROOM_SAVE/);
  const stop = run.slice(run.indexOf("function stopAll("), run.indexOf("function stopChildren("));
  assert.match(stop, /stockroomKeeper\.save\(\)[\s\S]*\.then\(\(\) => stopChildren/);
  // The sample press keeps nothing.
  const sample = run.slice(run.indexOf("async function sampleMain("), run.indexOf("async function main()"));
  assert.ok(!sample.includes("keepDatabase"));
});
