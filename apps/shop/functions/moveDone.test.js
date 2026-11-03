// Your move so far (plan 23.20): one email when the last part of the move is ticked, never again after.
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";

vi.mock("../src/app/admin/api", () => ({ adminApi: {} }));
const { moveDoneEmail, moveFinished, movingShop } = createRequire(import.meta.url)("./moveDone");
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
  });
});
