// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveNow, liveSlot, startLivePings } from "./liveVisitors";

describe("live visitors", () => {
  it("files a ping under the UTC day and minute of the day", () => {
    expect(liveSlot(new Date("2026-11-13T15:42:30Z"))).toEqual({ day: "2026-11-13", minute: String(15 * 60 + 42) });
    expect(liveSlot(new Date("2026-11-13T00:00:05Z")).minute).toBe("0");
  });

  it("counts the larger of the last full minute and this one", () => {
    const now = new Date("2026-11-13T10:05:10Z");
    const m = 10 * 60 + 5;
    expect(liveNow({ [String(m - 1)]: 4, [String(m)]: 1 }, now)).toBe(4);
    expect(liveNow({ [String(m)]: 6 }, now)).toBe(6);
    expect(liveNow({ [String(m - 5)]: 9 }, now)).toBe(0);
    expect(liveNow({}, now)).toBe(0);
    expect(liveNow(null, now)).toBe(0);
    expect(liveNow({ [String(m)]: "junk" }, now)).toBe(0);
  });

  describe("pings", () => {
    let stop = () => {};
    afterEach(() => { stop(); vi.useRealTimers(); });

    it("pings once per minute while on screen, never when not allowed", async () => {
      vi.useFakeTimers();
      let now = new Date("2026-11-13T10:05:00Z");
      const write = vi.fn(async () => {});
      stop = startLivePings(write, async () => true, () => now);
      await vi.advanceTimersByTimeAsync(0);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenLastCalledWith("2026-11-13", String(605));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(write).toHaveBeenCalledTimes(1); // same minute
      now = new Date("2026-11-13T10:06:01Z");
      await vi.advanceTimersByTimeAsync(15_000);
      expect(write).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenLastCalledWith("2026-11-13", String(606));
      stop();

      const quiet = vi.fn(async () => {});
      stop = startLivePings(quiet, async () => false, () => now);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(quiet).not.toHaveBeenCalled();
    });

    it("starts only once per page", async () => {
      const write = vi.fn(async () => {});
      stop = startLivePings(write, async () => true);
      const second = startLivePings(write, async () => true);
      second();
      await Promise.resolve(); await Promise.resolve();
      expect(write).toHaveBeenCalledTimes(1);
    });
  });
});
