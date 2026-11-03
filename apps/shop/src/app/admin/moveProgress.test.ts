// Overview › Your move so far (plan 23.17).
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn() }));
vi.mock("./api", () => ({ adminApi: api }));

import { moveSteps, movingShop, recordMoveStep, showMoveProgress } from "./moveProgress";

const moving = { bring: { at: "2026-11-01T00:00:00.000Z", from: "online" as const } };

describe("your move so far", () => {
  beforeEach(() => { api.getFirstWeek.mockReset(); api.updateFirstWeek.mockReset(); });

  it("is only for a press that brought its shop with it", () => {
    expect(movingShop(moving)).toBe(true);
    expect(movingShop({ bring: { at: "x" } })).toBe(true);
    expect(movingShop({ bring: { at: "x", from: "marketplace" } })).toBe(true);
    expect(movingShop({ bring: { at: "x", skipped: true } })).toBe(false);
    expect(movingShop({ bring: { at: "x", from: "fairs" } })).toBe(false);
    expect(movingShop({})).toBe(false);
    expect(movingShop(null)).toBe(false);
  });

  it("ticks books from Get started, the rest as their windows save, and hides when all are done or put away", () => {
    expect(moveSteps(moving).map((s) => [s.id, s.done])).toEqual([
      ["move-books", true], ["move-customers", false], ["move-giftcards", false], ["move-orders", false], ["move-links", false],
    ]);
    expect(showMoveProgress(moving)).toBe(true);
    const all = { ...moving, done: { "move-customers": "a", "move-giftcards": "a", "move-orders": "a", "move-links": "a" } };
    expect(showMoveProgress(all)).toBe(false);
    expect(showMoveProgress({ ...moving, done: { "move-list": "a" } })).toBe(false);
  });

  it("records a part once, only on a shop the platform set up for moving", async () => {
    api.getFirstWeek.mockResolvedValueOnce(moving);
    await recordMoveStep("move-orders");
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { "move-orders": expect.any(String) } });

    api.getFirstWeek.mockResolvedValueOnce({ ...moving, done: { "move-orders": "a" } });
    api.getFirstWeek.mockResolvedValueOnce(null);
    await recordMoveStep("move-orders");
    await recordMoveStep("move-orders");
    expect(api.updateFirstWeek).toHaveBeenCalledTimes(1);

    api.getFirstWeek.mockRejectedValueOnce(new Error("offline"));
    await expect(recordMoveStep("move-links")).resolves.toBeUndefined();
  });
});
