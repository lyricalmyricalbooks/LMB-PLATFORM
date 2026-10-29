// The shop's side of the spending limits (spendingGate.js, plan 13.4): checkout is never gated, the costly jobs slow down
// and then wait, and a level that cannot be read never stops a job.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { COSTLY_JOBS, paceAt, readLevel, paceOf, allowOne } = require("./spendingGate.js");
const { runImageCopies } = require("./imageCopies.js");

/** A pretend database: documents by "collection/id", with the two calls the gate uses. */
function fakeDb(docs = {}) {
  const ref = (path) => ({
    get: async () => ({ exists: path in docs, data: () => docs[path] }),
    path,
  });
  return {
    docs,
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    runTransaction: async (work) => work({ get: (r) => r.get(), set: (r, data) => { docs[r.path] = data; } }),
  };
}
const level = (value) => fakeDb(value ? { "systemStatus/spending": { level: value } } : {});

describe("the pace of a costly job", () => {
  test("a shop under its budget runs at full speed", () => {
    for (const job of Object.keys(COSTLY_JOBS)) expect(paceAt("normal", job)).toEqual({ run: true, perHour: null });
  });
  test("past the budget the jobs slow down, far past it they wait, and anything else is never touched", () => {
    expect(paceAt("slow", "ai-writing")).toMatchObject({ run: true, perHour: 10 });
    expect(paceAt("held", "ai-writing")).toMatchObject({ run: false, perHour: 0 });
    for (const job of ["checkout", "payment-events", "order-emails"]) {
      expect(paceAt("held", job)).toEqual({ run: true, perHour: null });
    }
  });
  test("a missing, odd or unreadable level means normal", async () => {
    expect(await readLevel(level(""))).toBe("normal");
    expect(await readLevel(fakeDb({ "systemStatus/spending": { level: "bananas" } }))).toBe("normal");
    expect(await readLevel({ collection: () => { throw new Error("down"); } })).toBe("normal");
    expect((await paceOf(level("held"), "import")).run).toBe(false);
  });
});

describe("AI writing, one request at a time", () => {
  test("is not counted or limited under the budget", async () => {
    const db = level("");
    for (let i = 0; i < 30; i++) expect((await allowOne(db, "ai-writing", 1000 + i)).allowed).toBe(true);
    expect(Object.keys(db.docs).filter((k) => k.startsWith("rate-limits/"))).toEqual([]);
  });
  test("past the budget it allows ten an hour for the whole shop, then explains in plain words", async () => {
    const db = level("slow");
    const t = Date.UTC(2026, 10, 3, 12);
    for (let i = 0; i < 10; i++) expect((await allowOne(db, "ai-writing", t + i)).allowed).toBe(true);
    const refused = await allowOne(db, "ai-writing", t + 11);
    expect(refused.allowed).toBe(false);
    expect(refused.words).toMatch(/more slowly until next month/);
    expect((await allowOne(db, "ai-writing", t + 61 * 60 * 1000)).allowed).toBe(true);
  });
  test("far past the budget none are allowed", async () => {
    const refused = await allowOne(level("held"), "ai-writing", 5);
    expect(refused.allowed).toBe(false);
    expect(refused.words).toMatch(/wait until next month/);
  });
  test("a counter that fails never blocks", async () => {
    const db = level("slow");
    db.runTransaction = async () => { throw new Error("busy"); };
    expect((await allowOne(db, "ai-writing")).allowed).toBe(true);
  });
});

describe("the scheduled photo passes honour a limit", () => {
  test("photo copies stop after the limit and leave the rest pending for the next run", async () => {
    const books = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, data: () => ({ photos: [{ url: `https://firebasestorage.googleapis.com/v0/b/shop.firebasestorage.app/o/p${i}.jpg?alt=media` }] }) }));
    const writes = [];
    const db = {
      collection: () => ({
        doc: () => ({ get: async () => ({ data: () => ({}) }), set: async (data) => { writes.push(data); } }),
        get: async () => ({ docs: books }),
        where: () => ({ get: async () => ({ docs: books }) }),
      }),
    };
    let touched = 0;
    const bucket = { name: "shop.firebasestorage.app", file: () => { touched += 1; throw new Error("not for this test"); } };
    const held = await runImageCopies({ db, bucket, sharp: () => { throw new Error("no sharp"); }, deadline: Date.now() + 1000, limit: 0 });
    expect([held.found, held.done, held.pending, touched]).toEqual([5, 0, 5, 0]);
    expect(writes.at(-1).pending).toBe(5);
    const free = await runImageCopies({ db, bucket, sharp: () => { throw new Error("no sharp"); }, deadline: Date.now() + 1000, limit: null });
    expect(touched).toBeGreaterThan(0);
    expect(free.found).toBe(5);
  });
});
