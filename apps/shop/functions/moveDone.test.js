// Your move so far (plan 23.20): one email when the last part of the move is ticked, never again after.
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";

vi.mock("../src/app/admin/api", () => ({ adminApi: {} }));
const { moveCounts, moveDoneEmail, moveFinished, moveStallEmail, movingShop } = createRequire(import.meta.url)("./moveDone");
const shop = await import("../src/app/admin/moveProgress");
const source = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");

const bring = { at: "2026-11-01", from: "online" };
const almost = { bring, done: { "move-customers": "a", "move-giftcards": "a", "move-orders": "a" } };
const finished = { bring, done: { ...almost.done, "move-links": "b" } };
const args = { ownerEmail: "Owner@Example.com", shopName: "Moth Press", adminLink: "https://moth.example/admin" };

describe("the move-finished email", () => {
  it("goes once, on the change to all done, listing every part", () => {
    const message = moveDoneEmail({ before: almost, after: finished, ...args });
    expect(message.to).toEqual(["owner@example.com"]);
    expect(message.subject).toBe("Your move to Moth Press is done");
    for (const part of ["Books", "Customers", "Gift cards", "Past orders", "Pages and old links"]) expect(message.html).toContain(`<li>${part}</li>`);
    expect(message.html).toContain('href="https://moth.example/admin"');
    expect(moveDoneEmail({ before: finished, after: { ...finished, progress: { at: "c" } }, ...args })).toBeNull();
    expect(moveDoneEmail({ before: almost, after: almost, ...args })).toBeNull();
  });

  it("says how much came over, counted once at the end (plan 23.24)", async () => {
    const counts = { customerNotes: 4, "giftCards:source=import": 1, "orders:source=import": 0 };
    const query = (key) => ({
      where: (field, _op, value) => query(`${key}:${field}=${value}`),
      count: () => ({ get: async () => { if (!(key in counts)) throw new Error("no index"); return { data: () => ({ count: counts[key] }) }; } }),
    });
    const db = { collection: (name) => query(name) };
    const found = await moveCounts(db);
    expect(found).toEqual({ "move-customers": 4, "move-giftcards": 1, "move-orders": 0 });
    const html = moveDoneEmail({ before: almost, after: finished, ...args, counts: found }).html;
    expect(html).toContain("<li>Customers: 4</li>");
    expect(html).toContain("<li>Gift cards: 1</li>");
    // None (ticked as "We had none") or a count that couldn't be read: the part alone.
    expect(html).toContain("<li>Past orders</li>");
    delete counts.customerNotes;
    expect((await moveCounts(db))["move-customers"]).toBeNull();
  });

  it("never goes to a shop that started fresh, or without an owner address", () => {
    const fresh = { ...finished, bring: { at: "x", skipped: true } };
    expect(moveDoneEmail({ before: {}, after: fresh, ...args })).toBeNull();
    expect(moveDoneEmail({ before: almost, after: finished, ...args, ownerEmail: "" })).toBeNull();
  });

  it("counts a move done exactly as the admin's list does", () => {
    const docs = [null, {}, almost, finished, { bring: { at: "x" } }, { bring: { at: "x", from: "fairs" }, done: finished.done },
      { bring: { at: "x", from: "marketplace" }, done: finished.done }, { ...finished, done: { ...finished.done, "move-list": "z" } }];
    for (const doc of docs) {
      expect(movingShop(doc)).toBe(shop.movingShop(doc));
      expect(moveFinished(doc)).toBe(shop.movingShop(doc) && shop.moveSteps(doc).every((s) => s.done));
    }
  });

  it("is sent from the firstWeek/start trigger", () => {
    expect(source).toContain('exports.onMoveFinished = onDocumentUpdated("firstWeek/start"');
    expect(source).toContain('queue: "moveFinished"');
    // Counting reads the database, so it waits for the one change that finished the move.
    const trigger = source.slice(source.indexOf("exports.onMoveFinished"));
    expect(trigger.indexOf("if (!justFinished(before, after)) return;")).toBeLessThan(trigger.indexOf("await moveCounts(db)"));
  });
});

describe("the reminder when a move stalls (plan 23.26)", () => {
  const started = { bring: { at: "2026-11-01T10:00:00.000Z", from: "online" }, done: { "move-customers": "2026-11-02T10:00:00.000Z" } };
  const day = (n) => new Date(Date.parse("2026-11-02T10:00:00.000Z") + n * 24 * 60 * 60 * 1000);

  it("goes once a week has passed with nothing new, listing what is left", () => {
    expect(moveStallEmail({ doc: started, mark: null, now: day(6), ...args })).toBeNull();
    const stall = moveStallEmail({ doc: started, mark: null, now: day(7), ...args });
    expect(stall.message.to).toEqual(["owner@example.com"]);
    expect(stall.message.subject).toBe("Your move to Moth Press: 2 of 5 done");
    for (const part of ["Gift cards", "Past orders", "Pages and old links"]) expect(stall.message.html).toContain(`<li>${part}</li>`);
    expect(stall.message.html).not.toContain("<li>Customers</li>");
    expect(stall.message.html).toContain("Hide this list");
    expect(stall.mark).toEqual({ forLastMoved: "2026-11-02T10:00:00.000Z", sentAt: day(7).toISOString() });
    // Not again for the same stall...
    expect(moveStallEmail({ doc: started, mark: stall.mark, now: day(20), ...args })).toBeNull();
    // ...but once more after the press moves again and stops again.
    const moved = { ...started, done: { ...started.done, "move-orders": day(10).toISOString() } };
    expect(moveStallEmail({ doc: moved, mark: stall.mark, now: day(16), ...args })).toBeNull();
    expect(moveStallEmail({ doc: moved, mark: stall.mark, now: day(17), ...args }).message.subject).toBe("Your move to Moth Press: 3 of 5 done");
  });

  it("never goes once the list is put away, the move is done, it is two months old, or for a fresh shop", () => {
    expect(moveStallEmail({ doc: { ...started, done: { ...started.done, "move-list": "x" } }, mark: null, now: day(8), ...args })).toBeNull();
    expect(moveStallEmail({ doc: { ...finished, bring: started.bring }, mark: null, now: day(8), ...args })).toBeNull();
    expect(moveStallEmail({ doc: started, mark: null, now: day(61), ...args })).toBeNull();
    expect(moveStallEmail({ doc: { ...started, bring: { at: started.bring.at, skipped: true } }, mark: null, now: day(8), ...args })).toBeNull();
    expect(moveStallEmail({ doc: started, mark: null, now: day(8), ...args, ownerEmail: "" })).toBeNull();
  });

  it("runs daily, marking before it sends so a failed send never repeats", () => {
    const job = source.slice(source.indexOf("exports.moveReminder"));
    expect(job).toMatch(/schedule: "every day 10:00", name: "moveReminder"/);
    expect(job.indexOf("await markRef.set(stall.mark)")).toBeLessThan(job.indexOf('queue: "moveReminder"'));
  });
});
