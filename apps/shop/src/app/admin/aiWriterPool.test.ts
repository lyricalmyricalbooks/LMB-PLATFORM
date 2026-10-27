import { describe, expect, it } from "vitest";
import { runPool } from "./aiWriter";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Describe with AI runs photos a few at a time", () => {
  it("never runs more than the limit at once, and finishes every photo", async () => {
    let running = 0;
    let most = 0;
    const seen: number[] = [];
    const out = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await wait(5);
      seen.push(n);
      running -= 1;
    });
    expect(most).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out).toEqual({ done: 7, failed: 0, firstError: null });
  });

  it("keeps going past one failure, and stops starting new ones when told to", async () => {
    const keepGoing = await runPool([1, 2, 3, 4], 2, async (n) => { if (n === 2) throw new Error("bad photo"); });
    expect(keepGoing).toMatchObject({ done: 3, failed: 1 });
    expect((keepGoing.firstError as Error).message).toBe("bad photo");

    const started: number[] = [];
    const stopped = await runPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      await wait(2);
      if (n === 1) throw Object.assign(new Error("used up"), { status: 429 });
    }, (err: any) => err.status === 429);
    expect(started.length).toBeLessThan(6);
    expect(stopped.failed).toBe(1);
  });
});
