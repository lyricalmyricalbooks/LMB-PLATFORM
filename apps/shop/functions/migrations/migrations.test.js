// Numbered data changes (migrations/runner.js): each runs once per shop, in order, recorded in the shop's own database.
import { describe, expect, it } from "vitest";
const { runMigrations, listProblems } = require("./runner");
const { parseArgs } = require("./run");
const list = require("./list");

// A small in-memory Firestore: doc get/set (with merge of nested maps), add, and transactions.
function fakeDb() {
  const docs = new Map();
  const merge = (into, from) => {
    const out = { ...into };
    for (const [key, value] of Object.entries(from)) {
      out[key] = value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object"
        ? merge(out[key], value) : value;
    }
    return out;
  };
  const docRef = path => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }),
    set: async (data, opts) => { docs.set(path, opts?.merge ? merge(docs.get(path) ?? {}, data) : structuredClone(data)); },
  });
  let added = 0;
  const db = {
    docs,
    collection: name => ({
      doc: id => docRef(`${name}/${id}`),
      add: async data => { docs.set(`${name}/auto-${++added}`, structuredClone(data)); },
    }),
    runTransaction: async fn => fn({ get: ref => ref.get(), set: (ref, data, opts) => ref.set(data, opts) }),
  };
  return db;
}

const clock = () => {
  let t = Date.parse("2026-10-28T12:00:00.000Z");
  return () => new Date((t += 1000));
};
const status = db => db.docs.get("systemStatus/migrations");
const audit = db => [...db.docs].filter(([path]) => path.startsWith("audit-log/")).map(([, entry]) => entry);

// Two example changes, written the way the rules ask: look before writing, safe to run twice.
const stampBooks = {
  id: "0001-stamp-books", description: "Give every book a format",
  run: async ({ db }) => {
    const ref = db.collection("books").doc("b1");
    const book = (await ref.get()).data();
    if (!book.format) await ref.set({ format: "Paperback" }, { merge: true });
    return { books: 1 };
  },
};
const addSetting = { id: "0002-add-setting", description: "Turn on the new setting", run: async ({ db }) => { await db.collection("settings").doc("website").set({ newThing: true }, { merge: true }); } };

describe("runMigrations", () => {
  it("runs each change once, in order, and records it in the shop and its audit log", async () => {
    const db = fakeDb();
    db.docs.set("books/b1", { title: "A" });
    const result = await runMigrations({ db, migrations: [stampBooks, addSetting], release: "1.4.0", runId: "r1", now: clock() });
    expect(result).toEqual({ ok: true, applied: ["0001-stamp-books", "0002-add-setting"], skipped: [] });
    expect(db.docs.get("books/b1")).toEqual({ title: "A", format: "Paperback" });
    expect(status(db).applied["0001-stamp-books"]).toMatchObject({ release: "1.4.0", runId: "r1", result: { books: 1 } });
    expect(status(db).running).toBeNull();
    expect(audit(db).map(e => [e.type, e.actor, e.migration, e.message])).toEqual([
      ["settings", "Shop updates", "0001-stamp-books", "Your shop's saved information was updated: Give every book a format."],
      ["settings", "Shop updates", "0002-add-setting", "Your shop's saved information was updated: Turn on the new setting."],
    ]);

    let ran = 0;
    const again = await runMigrations({ db, migrations: [stampBooks, { ...addSetting, run: async () => { ran++; } }], runId: "r2", now: clock() });
    expect(again).toEqual({ ok: true, applied: [], skipped: ["0001-stamp-books", "0002-add-setting"] });
    expect(ran).toBe(0);
  });

  it("a failed change stops the run there; the next run starts again at it", async () => {
    const db = fakeDb();
    db.docs.set("books/b1", { title: "A" });
    let broken = true;
    const flaky = { ...addSetting, run: async () => { if (broken) throw new Error("quota exceeded"); } };
    const after = { id: "0003-later", description: "Later", run: async () => {} };
    const first = await runMigrations({ db, migrations: [stampBooks, flaky, after], runId: "r1", now: clock() });
    expect(first).toEqual({ ok: false, applied: ["0001-stamp-books"], skipped: [], failed: "0002-add-setting", error: "quota exceeded" });
    expect(status(db).failed).toMatchObject({ id: "0002-add-setting", error: "quota exceeded" });
    expect(status(db).applied["0003-later"]).toBeUndefined();
    expect(status(db).running).toBeNull();
    expect(audit(db).at(-1)).toMatchObject({ migration: "0002-add-setting", error: "quota exceeded" });
    expect(audit(db).at(-1).message).not.toContain("quota");

    broken = false;
    const second = await runMigrations({ db, migrations: [stampBooks, flaky, after], runId: "r2", now: clock() });
    expect(second).toEqual({ ok: true, applied: ["0002-add-setting", "0003-later"], skipped: ["0001-stamp-books"] });
    expect(status(db).failed).toBeNull();
  });

  it("one run at a time; a lapsed lock is taken over", async () => {
    const db = fakeDb();
    db.docs.set("systemStatus/migrations", { running: { runId: "other", since: "2026-10-28T11:59:00.000Z", until: "2026-10-28T12:20:00.000Z" } });
    const blocked = await runMigrations({ db, migrations: [{ ...addSetting, id: "0001-add-setting" }], runId: "r1", now: clock() });
    expect(blocked).toMatchObject({ ok: false, locked: true });
    expect(status(db).running.runId).toBe("other");
    expect(db.docs.has("settings/website")).toBe(false);

    db.docs.set("systemStatus/migrations", { running: { runId: "crashed", since: "2026-10-28T10:00:00.000Z", until: "2026-10-28T10:30:00.000Z" } });
    expect((await runMigrations({ db, migrations: [{ ...addSetting, id: "0001-add-setting" }], runId: "r2", now: clock() })).ok).toBe(true);
  });

  it("a dry run lists what would run and changes nothing", async () => {
    const db = fakeDb();
    db.docs.set("systemStatus/migrations", { applied: { "0001-stamp-books": { at: "x" } } });
    const result = await runMigrations({ db, migrations: [stampBooks, addSetting], runId: "r1", dryRun: true });
    expect(result).toMatchObject({ ok: true, pending: ["0002-add-setting"], skipped: ["0001-stamp-books"] });
    expect(db.docs.has("settings/website")).toBe(false);
    expect(status(db).running).toBeUndefined();
  });

  it("refuses a list with a gap, a bad name, or a change without a description", async () => {
    expect(listProblems([stampBooks, { ...addSetting, id: "0003-skip" }])).toEqual(["0003-skip should be numbered 0002"]);
    expect(listProblems([{ ...stampBooks, id: "1-Stamp" }])).toEqual(['"1-Stamp" isn\'t named like 0001-short-name']);
    expect(listProblems([{ ...stampBooks, description: "" }])).toEqual(["0001-stamp-books has no description"]);
    await expect(runMigrations({ db: fakeDb(), migrations: [addSetting], runId: "r1" })).rejects.toThrow(/should be numbered 0001/);
  });
});

describe("the shop's list of changes", () => {
  it("is numbered without gaps", () => {
    expect(listProblems(list)).toEqual([]);
  });

  it("every change in it can run twice on an empty shop and lands in the same place", async () => {
    for (const change of list) {
      const db = fakeDb();
      await change.run({ db, log: () => {}, now: clock() });
      const once = new Map(db.docs);
      await change.run({ db, log: () => {}, now: clock() });
      expect(db.docs, change.id).toEqual(once);
    }
  });
});

describe("the command line", () => {
  it("needs a project id and knows its options", () => {
    expect(parseArgs(["--project", "lmb-test-shop", "--release", "1.4.0", "--dry-run"])).toEqual({ project: "lmb-test-shop", release: "1.4.0", dryRun: true });
    expect(() => parseArgs([])).toThrow(/isn't a Firebase project id/);
    expect(() => parseArgs(["--project", "lmb-test-shop", "--force"])).toThrow(/unknown option --force/);
  });
});
